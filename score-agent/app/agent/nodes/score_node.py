from __future__ import annotations
import logging
from langchain_core.messages import HumanMessage, SystemMessage

from app.agent.model_factory import ModelFactory
from app.agent.score_interfaces import WinnerDecision
from app.agent.score_state import ScoreState
from app.agent.score_templates import ARBITER_SYSTEM, ARBITER_PROMPT
from app.configs.settings import settings
from app.contracts.experiment_interface import (
    CandidateScore,
    ExperimentEvent,
    JudgeScoreSheet,
    Message,
    NodeName,
    ScoreResponse,
)
from app.services.experiment_manager import ExperimentManager


class ScoreNode:
    """Sums judge score sheets deterministically, then asks an arbiter LLM to
    declare the winner (mandatory even on tied totals) with a justification."""

    def __init__(self, manager: ExperimentManager, logger: logging.Logger, model_factory: ModelFactory):
        self._manager = manager
        self._logger = logger
        self._model_factory = model_factory

    async def __call__(self, state: ScoreState) -> dict:
        event = state["event"]
        cache = await self._manager.load(event.experimentId)
        messages = cache.messages if cache else event.messages

        actor = "ScoreKeeper"
        await self._manager.append_thinking(event.experimentId, NodeName.score, actor)

        score_response = await self._score(event, messages)

        await self._manager.complete_message(event.experimentId, actor, score_response, final=True)
        self._logger.info(
            "ScoreNode: scores recorded",
            extra={
                "experimentId": event.experimentId,
                "winner": score_response.winner,
                "score": score_response.score,
                "tie": score_response.tie,
            },
        )
        return {}

    async def _score(self, event: ExperimentEvent, messages: list[Message]) -> ScoreResponse:
        totals, candidate_scores = self._compute_totals(event, messages)
        tie = totals[1] == totals[2]

        decision = await self._decide(event, messages, totals, tie)

        winner_number = 1 if decision.winner == "Candidate 1" else 2
        return ScoreResponse(
            candidateScores=candidate_scores,
            winner=decision.winner,
            score=totals[winner_number],
            comment=decision.comment,
            tie=tie,
        )

    def _compute_totals(
        self, event: ExperimentEvent, messages: list[Message]
    ) -> tuple[dict[int, int], list[CandidateScore]]:
        totals: dict[int, int] = {1: 0, 2: 0}

        for message in messages:
            if message.node != NodeName.judge or not isinstance(message.response, list):
                continue
            for sheet in message.response:
                if not isinstance(sheet, JudgeScoreSheet):
                    continue
                totals[sheet.candidateNumber] = totals.get(sheet.candidateNumber, 0) + sum(
                    card.point for card in sheet.cards
                )

        candidate_scores = [
            CandidateScore(
                candidateNumber=cfg.candidateNumber,
                provider=cfg.provider,
                model=cfg.model,
                score=totals.get(cfg.candidateNumber, 0),
            )
            for cfg in event.candidateConfigs
        ]
        return totals, candidate_scores

    async def _decide(
        self, event: ExperimentEvent, messages: list[Message], totals: dict[int, int], tie: bool
    ) -> WinnerDecision:
        prompt = ARBITER_PROMPT.format(
            category=event.category,
            topic=event.topic,
            candidates="\n".join(
                f"- Candidate {cfg.candidateNumber}: {cfg.provider}/{cfg.model}"
                for cfg in event.candidateConfigs
            ),
            totals="\n".join(f"- Candidate {n}: {totals[n]} points" for n in (1, 2)),
            sheets=self._format_sheets(messages),
        )

        try:
            llm = (
                self._model_factory.build(settings.score_provider, settings.score_model, temperature=0)
                .with_structured_output(WinnerDecision, method="json_schema")
                .with_retry(stop_after_attempt=3)
            )
            self._logger.info(
                "ScoreNode._decide: calling arbiter LLM",
                extra={
                    "experimentId": event.experimentId,
                    "model": f"{settings.score_provider}/{settings.score_model}",
                    "tie": tie,
                },
            )
            return await llm.ainvoke([
                SystemMessage(content=ARBITER_SYSTEM),
                HumanMessage(content=prompt),
            ])
        except Exception as e:
            # Fall back to the point totals so the pipeline still completes.
            self._logger.exception(
                "ScoreNode._decide: arbiter LLM failed, falling back to totals",
                extra={"experimentId": event.experimentId, "error": str(e)},
            )
            winner_number = 1 if totals[1] >= totals[2] else 2
            return WinnerDecision(
                winner=f"Candidate {winner_number}",
                comment=(
                    "Arbiter LLM was unavailable; winner determined by total points"
                    + (" (tie broken in favor of Candidate 1 by default)." if tie else ".")
                ),
            )

    @staticmethod
    def _format_sheets(messages: list[Message]) -> str:
        lines: list[str] = []
        for message in messages:
            if message.node != NodeName.judge or not isinstance(message.response, list):
                continue
            lines.append(f"{message.actor}:")
            for sheet in message.response:
                if not isinstance(sheet, JudgeScoreSheet):
                    continue
                subtotal = sum(card.point for card in sheet.cards)
                lines.append(f"  Candidate {sheet.candidateNumber} ({subtotal} points):")
                for card in sheet.cards:
                    lines.append(f"    - {card.cardName}: {card.point} — {card.comment}")
        return "\n".join(lines) if lines else "(no judge score sheets found)"

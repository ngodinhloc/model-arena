from __future__ import annotations
import logging
from langchain_core.messages import HumanMessage, SystemMessage

from app.agent.judge_interfaces import JudgeVerdict
from app.agent.judge_state import JudgeState
from app.agent.model_factory import ModelFactory
from app.agent.judge_templates import JUDGE_SYSTEM, JUDGE_PROMPT
from app.contracts.experiment_interface import CandidateResponse, Message, NodeName
from app.services.experiment_manager import ExperimentManager


class JudgeNode:
    def __init__(
        self,
        judge_number: int,
        manager: ExperimentManager,
        logger: logging.Logger,
        model_factory: ModelFactory,
    ):
        self._number = judge_number
        self._manager = manager
        self._logger = logger
        self._model_factory = model_factory

    async def __call__(self, state: JudgeState) -> dict:
        event = state["event"]
        cfg = next(j for j in event.judgeConfigs if j.judgeNumber == self._number)
        actor = f"Judge {self._number} ({cfg.provider}/{cfg.model})"
        max_point = event.scoreCards[0].maxPoint if event.scoreCards else 20

        await self._manager.append_thinking(event.experimentId, NodeName.judge, actor)

        llm = (
            self._model_factory.build(cfg.provider, cfg.model, cfg.temperature)
            .with_structured_output(JudgeVerdict, method="json_schema")
            .with_retry(stop_after_attempt=3)
        )
        self._logger.info(
            "JudgeNode: calling LLM", extra={"experimentId": event.experimentId, "actor": actor}
        )
        verdict: JudgeVerdict = await llm.ainvoke([
            SystemMessage(content=JUDGE_SYSTEM.format(
                judge_number=self._number, persona=cfg.persona, max_point=max_point,
            )),
            HumanMessage(content=JUDGE_PROMPT.format(
                category=event.category,
                topic=event.topic,
                max_point=max_point,
                score_cards="\n".join(f"- {c.cardName}" for c in event.scoreCards),
                candidate_1=self._format_candidate(self._find_candidate_response(event.messages, 1)),
                candidate_2=self._format_candidate(self._find_candidate_response(event.messages, 2)),
            )),
        ])

        await self._manager.set_reply(event.experimentId, actor, verdict.scoreSheets)
        return {}

    @staticmethod
    def _find_candidate_response(messages: list[Message], candidate_number: int) -> CandidateResponse | None:
        # Multiple rounds produce one CandidateResponse per candidate per round; judge the final round.
        latest: CandidateResponse | None = None
        for message in messages:
            if message.node == NodeName.candidate and f"Candidate {candidate_number} " in message.actor:
                if isinstance(message.response, CandidateResponse):
                    latest = message.response
        return latest

    @staticmethod
    def _format_candidate(response: CandidateResponse | None) -> str:
        if response is None:
            return "(no response)"
        args = "\n".join(f"- {a}" for a in response.arguments)
        return f"{response.header}\n{args}"

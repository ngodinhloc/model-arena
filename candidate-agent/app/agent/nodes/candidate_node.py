from __future__ import annotations
import logging
from langchain_core.messages import BaseMessage, HumanMessage, SystemMessage

from app.agent.candidate_state import CandidateState
from app.agent.errors import ModelRefusalError
from app.agent.model_factory import ModelFactory
from app.agent.candidate_templates import CANDIDATE_SYSTEM, CANDIDATE_PROMPT, STANCES
from app.contracts.experiment_interface import CandidateResponse, Message, NodeName
from app.services.experiment_manager import ExperimentManager

MAX_LLM_ATTEMPTS = 3


class CandidateNode:
    def __init__(
        self,
        candidate_number: int,
        manager: ExperimentManager,
        logger: logging.Logger,
        model_factory: ModelFactory,
    ):
        self._number = candidate_number
        self._manager = manager
        self._logger = logger
        self._model_factory = model_factory

    async def __call__(self, state: CandidateState) -> dict:
        event = state["event"]
        round_number = state["round"]
        config = next(c for c in event.candidateConfigs if c.candidateNumber == self._number)
        actor = f"Candidate {self._number} ({config.provider}/{config.model})"
        stance = STANCES[self._number]

        await self._manager.append_thinking(event.experimentId, NodeName.candidate, actor)

        cache = await self._manager.load(event.experimentId)
        transcript = self._format_transcript(cache.messages if cache else [])

        llm = self._model_factory.build(config.provider, config.model, config.temperature).with_structured_output(
            CandidateResponse, method="json_schema", include_raw=True,
        )
        self._logger.info(
            "CandidateNode: calling LLM",
            extra={"experimentId": event.experimentId, "actor": actor, "stance": stance, "round": round_number},
        )
        messages: list[BaseMessage] = [
            SystemMessage(content=CANDIDATE_SYSTEM.format(
                candidate_number=self._number, persona=config.persona, stance=stance,
            )),
            HumanMessage(content=CANDIDATE_PROMPT.format(
                category=event.category,
                topic=event.topic,
                stance=stance,
                round_number=round_number,
                total_rounds=event.rounds,
                transcript=transcript,
            )),
        ]
        response = await self._invoke_with_refusal_guard(llm, messages, actor)

        await self._manager.set_reply(event.experimentId, actor, response)
        return {}

    async def _invoke_with_refusal_guard(
        self, llm, messages: list[BaseMessage], actor: str,
    ) -> CandidateResponse:
        # include_raw=True instead of .with_retry(): a provider refusal (stop_reason ==
        # "refusal") is deterministic for a given prompt, so retrying it would just waste
        # attempts on a call that can never succeed. Only genuine parse failures get retried.
        last_error: Exception | None = None
        for attempt in range(1, MAX_LLM_ATTEMPTS + 1):
            result = await llm.ainvoke(messages)
            raw = result["raw"]
            if raw.response_metadata.get("stop_reason") == "refusal":
                raise ModelRefusalError(actor)
            if result["parsing_error"] is None:
                return result["parsed"]
            last_error = result["parsing_error"]
            self._logger.warning(
                "CandidateNode: structured output parse failed, retrying",
                extra={"actor": actor, "attempt": attempt, "error": str(last_error)},
            )
        raise last_error

    @staticmethod
    def _label(actor: str) -> str:
        return "Candidate 1" if actor.startswith("Candidate 1") else "Candidate 2"

    @classmethod
    def _format_transcript(cls, messages: list[Message]) -> str:
        turns = []
        for message in messages:
            if message.node != NodeName.candidate or not isinstance(message.response, CandidateResponse):
                continue
            arguments = "\n".join(f"- {a}" for a in message.response.arguments)
            turns.append(f"{cls._label(message.actor)}: {message.response.header}\n{arguments}")
        return "\n\n".join(turns) if turns else "(none yet — you are opening the debate)"

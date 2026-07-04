from __future__ import annotations
import logging
from typing import TypedDict
from langchain_core.messages import HumanMessage, SystemMessage
from langgraph.graph import StateGraph, START, END
from langgraph.graph.state import CompiledStateGraph
from pydantic import BaseModel

from app.agent.llm_factory import build_llm
from app.agent.templates import JUDGE_SYSTEM, JUDGE_PROMPT
from app.configs.event_configs import PUBLISH_EVENT_NAME
from app.contracts.experiment_interface import (
    CandidateResponse,
    ExperimentEvent,
    JudgeScoreSheet,
    Message,
    NodeName,
)
from app.events.rabbitmq_publisher import RabbitMQPublisher
from app.services.experiment_manager import ExperimentManager


class JudgeVerdict(BaseModel):
    """Structured output: one score sheet per candidate."""

    scoreSheets: list[JudgeScoreSheet]


class JudgeState(TypedDict):
    event: ExperimentEvent


def _find_candidate_response(messages: list[Message], candidate_number: int) -> CandidateResponse | None:
    # Multiple rounds produce one CandidateResponse per candidate per round; judge the final round.
    latest: CandidateResponse | None = None
    for message in messages:
        if message.node == NodeName.candidate and f"Candidate {candidate_number} " in message.actor:
            if isinstance(message.response, CandidateResponse):
                latest = message.response
    return latest


def _format_candidate(response: CandidateResponse | None) -> str:
    if response is None:
        return "(no response)"
    args = "\n".join(f"- {a}" for a in response.arguments)
    return f"{response.header}\n{args}"


class JudgeNode:
    def __init__(self, judge_number: int, manager: ExperimentManager, logger: logging.Logger):
        self._number = judge_number
        self._manager = manager
        self._logger = logger

    async def __call__(self, state: JudgeState) -> dict:
        event = state["event"]
        cfg = next(j for j in event.judgeConfigs if j.judgeNumber == self._number)
        actor = f"Judge {self._number} ({cfg.provider}/{cfg.model})"
        max_point = event.scoreCards[0].maxPoint if event.scoreCards else 20

        await self._manager.append_thinking(event.experimentId, NodeName.judge, actor)

        llm = (
            build_llm(cfg.provider, cfg.model, cfg.temperature)
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
                candidate_1=_format_candidate(_find_candidate_response(event.messages, 1)),
                candidate_2=_format_candidate(_find_candidate_response(event.messages, 2)),
            )),
        ])

        await self._manager.complete_message(event.experimentId, actor, verdict.scoreSheets)
        return {}


class PublishNode:
    def __init__(self, manager: ExperimentManager, publisher: RabbitMQPublisher, logger: logging.Logger):
        self._manager = manager
        self._publisher = publisher
        self._logger = logger

    async def __call__(self, state: JudgeState) -> dict:
        event = state["event"]
        cache = await self._manager.load(event.experimentId)
        messages = cache.messages if cache else event.messages

        payload = event.model_copy(update={
            "eventName": PUBLISH_EVENT_NAME,
            "messages": messages,
        })
        await self._publisher.publish(PUBLISH_EVENT_NAME, payload.model_dump(mode="json"))
        self._logger.info(
            "PublishNode: judges responded",
            extra={"experimentId": event.experimentId, "messageCount": len(messages)},
        )
        return {}


class JudgeGraph:
    def __init__(self, manager: ExperimentManager, publisher: RabbitMQPublisher, logger: logging.Logger):
        self._manager = manager
        self._publisher = publisher
        self._logger = logger

    def build(self) -> CompiledStateGraph:
        graph = StateGraph(JudgeState)
        graph.add_node("judge_1", JudgeNode(1, self._manager, self._logger))
        graph.add_node("judge_2", JudgeNode(2, self._manager, self._logger))
        graph.add_node("publish", PublishNode(self._manager, self._publisher, self._logger))
        graph.add_edge(START, "judge_1")
        graph.add_edge("judge_1", "judge_2")
        graph.add_edge("judge_2", "publish")
        graph.add_edge("publish", END)
        return graph.compile()

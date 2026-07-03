from __future__ import annotations
import logging
from typing import TypedDict
from langchain_core.messages import HumanMessage, SystemMessage
from langgraph.graph import StateGraph, START, END
from langgraph.graph.state import CompiledStateGraph

from app.agent.llm_factory import build_llm
from app.agent.templates import CANDIDATE_SYSTEM, CANDIDATE_PROMPT, STANCES
from app.configs.event_configs import PUBLISH_EVENT_NAME
from app.contracts.experiment_interface import CandidateResponse, ExperimentEvent, NodeName
from app.events.rabbitmq_publisher import RabbitMQPublisher
from app.services.experiment_manager import ExperimentManager


class CandidateState(TypedDict):
    event: ExperimentEvent


class CandidateNode:
    def __init__(self, candidate_number: int, manager: ExperimentManager, logger: logging.Logger):
        self._number = candidate_number
        self._manager = manager
        self._logger = logger

    async def __call__(self, state: CandidateState) -> dict:
        event = state["event"]
        cfg = next(c for c in event.candidateConfigs if c.candidateNumber == self._number)
        actor = f"Candidate {self._number} ({cfg.provider}/{cfg.model})"
        stance = STANCES[self._number]

        await self._manager.append_thinking(event.experimentId, NodeName.candidate, actor)

        llm = build_llm(cfg.provider, cfg.model, cfg.temperature).with_structured_output(CandidateResponse)
        self._logger.info(
            "CandidateNode: calling LLM",
            extra={"experimentId": event.experimentId, "actor": actor, "stance": stance},
        )
        response: CandidateResponse = await llm.ainvoke([
            SystemMessage(content=CANDIDATE_SYSTEM.format(
                candidate_number=self._number, persona=cfg.persona, stance=stance,
            )),
            HumanMessage(content=CANDIDATE_PROMPT.format(
                category=event.category, topic=event.topic, stance=stance,
            )),
        ])

        await self._manager.complete_message(event.experimentId, actor, response)
        return {}


class PublishNode:
    def __init__(self, manager: ExperimentManager, publisher: RabbitMQPublisher, logger: logging.Logger):
        self._manager = manager
        self._publisher = publisher
        self._logger = logger

    async def __call__(self, state: CandidateState) -> dict:
        event = state["event"]
        cache = await self._manager.load(event.experimentId)
        messages = cache.messages if cache else []

        payload = event.model_copy(update={
            "eventName": PUBLISH_EVENT_NAME,
            "messages": messages,
        })
        await self._publisher.publish(PUBLISH_EVENT_NAME, payload.model_dump(mode="json"))
        self._logger.info(
            "PublishNode: candidates responded",
            extra={"experimentId": event.experimentId, "messageCount": len(messages)},
        )
        return {}


class CandidateGraph:
    def __init__(self, manager: ExperimentManager, publisher: RabbitMQPublisher, logger: logging.Logger):
        self._manager = manager
        self._publisher = publisher
        self._logger = logger

    def build(self) -> CompiledStateGraph:
        graph = StateGraph(CandidateState)
        graph.add_node("candidate_1", CandidateNode(1, self._manager, self._logger))
        graph.add_node("candidate_2", CandidateNode(2, self._manager, self._logger))
        graph.add_node("publish", PublishNode(self._manager, self._publisher, self._logger))
        graph.add_edge(START, "candidate_1")
        graph.add_edge("candidate_1", "candidate_2")
        graph.add_edge("candidate_2", "publish")
        graph.add_edge("publish", END)
        return graph.compile()

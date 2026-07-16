from __future__ import annotations

import logging

from langgraph.graph import END, START, StateGraph
from langgraph.graph.state import CompiledStateGraph

from app.agent.judge_state import JudgeState
from app.agent.model_factory import ModelFactory
from app.agent.nodes.judge_node import JudgeNode
from app.agent.nodes.publish_node import PublishNode
from app.events.rabbitmq_publisher import RabbitMQPublisher
from app.services.experiment_manager import ExperimentManager


class JudgeGraph:
    def __init__(
        self,
        manager: ExperimentManager,
        publisher: RabbitMQPublisher,
        logger: logging.Logger,
        model_factory: ModelFactory,
    ):
        self._manager = manager
        self._publisher = publisher
        self._logger = logger
        self._model_factory = model_factory

    def build(self) -> CompiledStateGraph:
        graph = StateGraph(JudgeState)
        graph.add_node("judge_1", JudgeNode(1, self._manager, self._logger, self._model_factory))
        graph.add_node("judge_2", JudgeNode(2, self._manager, self._logger, self._model_factory))
        graph.add_node("publish", PublishNode(self._manager, self._publisher, self._logger))
        graph.add_edge(START, "judge_1")
        graph.add_edge("judge_1", "judge_2")
        graph.add_edge("judge_2", "publish")
        graph.add_edge("publish", END)
        return graph.compile()

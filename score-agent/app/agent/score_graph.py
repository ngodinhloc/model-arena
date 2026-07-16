from __future__ import annotations

import logging

from langgraph.graph import END, START, StateGraph
from langgraph.graph.state import CompiledStateGraph

from app.agent.model_factory import ModelFactory
from app.agent.nodes.publish_node import PublishNode
from app.agent.nodes.score_node import ScoreNode
from app.agent.score_state import ScoreState
from app.events.rabbitmq_publisher import RabbitMQPublisher
from app.services.experiment_manager import ExperimentManager


class ScoreGraph:
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
        graph = StateGraph(ScoreState)
        graph.add_node("score", ScoreNode(self._manager, self._logger, self._model_factory))
        graph.add_node("publish", PublishNode(self._manager, self._publisher, self._logger))
        graph.add_edge(START, "score")
        graph.add_edge("score", "publish")
        graph.add_edge("publish", END)
        return graph.compile()

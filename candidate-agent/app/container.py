import logging
from functools import cached_property
from langgraph.graph.state import CompiledStateGraph
from app.agent.candidate_graph import CandidateGraph
from app.agent.model_factory import ModelFactory
from app.agent.nodes.advance_round_node import AdvanceRoundNode
from app.agent.nodes.publish_node import PublishNode
from app.configs.event_configs import CONSUME_ROUTING_KEY
from app.configs.settings import settings
from app.events.handlers.experiment_event_handler import ExperimentEventHandler
from app.events.message_processor import MessageProcessor
from app.events.rabbitmq_consumer import RabbitMQConsumer
from app.events.rabbitmq_publisher import RabbitMQPublisher
from app.services.experiment_manager import ExperimentManager
from app.services.redis_client import RedisClient


class Container:
    def logger(self, name: str) -> logging.Logger:
        return logging.getLogger(name)

    @cached_property
    def rabbitmq_publisher(self) -> RabbitMQPublisher:
        return RabbitMQPublisher(settings.rabbitmq_url, self.logger("rabbitmq_publisher"))

    @cached_property
    def redis_client(self):
        return RedisClient().get()

    @cached_property
    def experiment_manager(self) -> ExperimentManager:
        return ExperimentManager(self.redis_client, self.logger("experiment_manager"))

    @cached_property
    def model_factory(self) -> ModelFactory:
        return ModelFactory()

    @cached_property
    def advance_round_node(self) -> AdvanceRoundNode:
        return AdvanceRoundNode()

    @cached_property
    def publish_node(self) -> PublishNode:
        return PublishNode(self.experiment_manager, self.rabbitmq_publisher, self.logger("publish_node"))

    @cached_property
    def agent_graph(self) -> CompiledStateGraph:
        return CandidateGraph(
            self.experiment_manager,
            self.logger("candidate_graph"),
            self.model_factory,
            self.advance_round_node,
            self.publish_node,
        ).build()

    @cached_property
    def experiment_event_handler(self) -> ExperimentEventHandler:
        return ExperimentEventHandler(
            self.agent_graph, self.experiment_manager, self.logger("experiment_event_handler"),
        )

    @cached_property
    def event_handler_map(self) -> dict:
        return {CONSUME_ROUTING_KEY: self.experiment_event_handler}

    @cached_property
    def message_processor(self) -> MessageProcessor:
        return MessageProcessor(self.event_handler_map, self.logger("message_processor"))

    @cached_property
    def rabbitmq_consumer(self) -> RabbitMQConsumer:
        return RabbitMQConsumer(
            rabbitmq_url=settings.rabbitmq_url,
            message_processor=self.message_processor,
            logger=self.logger("rabbitmq_consumer"),
        )


container = Container()

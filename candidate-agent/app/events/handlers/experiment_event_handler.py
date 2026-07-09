import logging
from langgraph.graph.state import CompiledStateGraph
from app.agent.errors import ModelRefusalError
from app.contracts.experiment_interface import ExperimentEvent
from app.services.experiment_manager import ExperimentManager


class ExperimentEventHandler:
    def __init__(self, agent_graph: CompiledStateGraph, manager: ExperimentManager, logger: logging.Logger):
        self._agent_graph = agent_graph
        self._manager = manager
        self._logger = logger

    async def handle(self, event: ExperimentEvent) -> None:
        self._logger.info(
            "ExperimentEventHandler.handle: Received event",
            extra={"experimentId": event.experimentId, "eventName": event.eventName, "topic": event.topic},
        )
        try:
            await self._agent_graph.ainvoke({"event": event, "round": 1})
        except ModelRefusalError as e:
            self._logger.error(
                "ExperimentEventHandler.handle: model refused to respond, marking unrecoverable",
                extra={"experimentId": event.experimentId, "actor": e.actor},
            )
            await self._manager.mark_unrecoverable(event.experimentId)

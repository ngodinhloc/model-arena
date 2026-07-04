import logging
from langgraph.graph.state import CompiledStateGraph
from app.contracts.experiment_interface import ExperimentEvent


class ExperimentEventHandler:
    def __init__(self, agent_graph: CompiledStateGraph, logger: logging.Logger):
        self._agent_graph = agent_graph
        self._logger = logger

    async def handle(self, event: ExperimentEvent) -> None:
        self._logger.info(
            "ExperimentEventHandler.handle: Received event",
            extra={"experimentId": event.experimentId, "eventName": event.eventName, "topic": event.topic},
        )
        await self._agent_graph.ainvoke({"event": event, "round": 1})

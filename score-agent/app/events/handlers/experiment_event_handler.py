import logging
from app.contracts.experiment_interface import ExperimentEvent
from app.services.score_service import ScoreService


class ExperimentEventHandler:
    def __init__(self, score_service: ScoreService, logger: logging.Logger):
        self._score_service = score_service
        self._logger = logger

    async def handle(self, event: ExperimentEvent) -> None:
        self._logger.info(
            "ExperimentEventHandler.handle: Received event",
            extra={"experimentId": event.experimentId, "eventName": event.eventName},
        )
        await self._score_service.execute(event)

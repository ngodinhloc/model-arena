from __future__ import annotations

import logging

from app.agent.candidate_state import CandidateState
from app.configs.event_configs import PUBLISH_EVENT_NAME
from app.events.rabbitmq_publisher import RabbitMQPublisher
from app.services.experiment_manager import ExperimentManager


class PublishNode:
    def __init__(
        self, manager: ExperimentManager, publisher: RabbitMQPublisher, logger: logging.Logger
    ):
        self._manager = manager
        self._publisher = publisher
        self._logger = logger

    async def __call__(self, state: CandidateState) -> dict:
        event = state["event"]
        cache = await self._manager.load(event.experimentId)
        messages = cache.messages if cache else []

        payload = event.model_copy(
            update={
                "eventName": PUBLISH_EVENT_NAME,
                "messages": messages,
            }
        )
        await self._publisher.publish(PUBLISH_EVENT_NAME, payload.model_dump(mode="json"))
        self._logger.info(
            "PublishNode: candidates responded",
            extra={"experimentId": event.experimentId, "messageCount": len(messages)},
        )
        return {}

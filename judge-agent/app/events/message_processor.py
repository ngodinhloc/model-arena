from __future__ import annotations
import json
import logging
import aio_pika
from app.contracts.experiment_interface import ExperimentEvent


class MessageProcessor:
    def __init__(self, handler_map: dict, logger: logging.Logger):
        self._handler_map = handler_map
        self._logger = logger

    async def process(self, message: aio_pika.abc.AbstractIncomingMessage) -> None:
        event_name, experiment_id, payload = self._parse_message(message)
        if payload is None or experiment_id is None or event_name is None:
            self._logger.warning(
                "MessageProcessor.process: Invalid message, missing required fields",
                extra={"experimentId": experiment_id, "eventName": event_name, "hasPayload": payload is not None},
            )
            return

        try:
            handler = self._handler_map.get(event_name)
            if handler is None:
                self._logger.warning(
                    "MessageProcessor.process: No handler registered",
                    extra={"experimentId": experiment_id, "eventName": event_name},
                )
                return
            event = ExperimentEvent.model_validate(payload)
            await handler.handle(event)
        except Exception as e:
            self._logger.exception(
                "MessageProcessor.process: Failed to process message",
                extra={"experimentId": experiment_id, "eventName": event_name, "error": str(e)},
            )

    def _parse_message(self, message: aio_pika.abc.AbstractIncomingMessage) -> tuple[str | None, str | None, dict | None]:
        try:
            payload = json.loads(message.body)
            return payload.get("eventName"), payload.get("experimentId"), payload
        except Exception as e:
            self._logger.exception("MessageProcessor._parse_message: Failed to parse message", extra={"error": str(e)})
            return None, None, None

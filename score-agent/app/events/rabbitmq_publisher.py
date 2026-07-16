from __future__ import annotations

import json
import logging

import aio_pika

from app.configs.event_configs import PUBLISH_EXCHANGE


class RabbitMQPublisher:
    def __init__(self, rabbitmq_url: str, logger: logging.Logger):
        self._url = rabbitmq_url
        self._logger = logger
        self._connection: aio_pika.abc.AbstractRobustConnection | None = None
        self._channel: aio_pika.abc.AbstractChannel | None = None
        self._exchange: aio_pika.abc.AbstractExchange | None = None

    async def publish(self, routing_key: str, payload: dict) -> None:
        if self._connection is None or self._connection.is_closed:
            self._connection = await aio_pika.connect_robust(self._url)
            self._channel = await self._connection.channel()
            self._exchange = await self._channel.declare_exchange(
                PUBLISH_EXCHANGE, aio_pika.ExchangeType.TOPIC, durable=True
            )

        await self._exchange.publish(
            aio_pika.Message(
                body=json.dumps(payload, default=str).encode(),
                delivery_mode=aio_pika.DeliveryMode.PERSISTENT,
            ),
            routing_key=routing_key,
        )
        self._logger.info(
            "RabbitMQPublisher.publish: Published",
            extra={"exchange": PUBLISH_EXCHANGE, "routingKey": routing_key},
        )

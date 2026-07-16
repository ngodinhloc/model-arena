import asyncio
import logging

import aio_pika

from app.configs.event_configs import CONSUME_EXCHANGE, CONSUME_QUEUE, CONSUME_ROUTING_KEY
from app.events.message_processor import MessageProcessor


class RabbitMQConsumer:
    def __init__(
        self, rabbitmq_url: str, message_processor: MessageProcessor, logger: logging.Logger
    ):
        self._url = rabbitmq_url
        self._message_processor = message_processor
        self._logger = logger

    async def start(self) -> None:
        while True:
            try:
                await self._run()
            except asyncio.CancelledError:
                raise
            except Exception as e:
                self._logger.error(
                    "RabbitMQConsumer.start: RabbitMQ consumer error", extra={"error": str(e)}
                )
                await asyncio.sleep(5)

    async def _run(self) -> None:
        connection = await aio_pika.connect_robust(self._url)
        channel = await connection.channel()
        await channel.set_qos(prefetch_count=1)

        exchange = await channel.declare_exchange(
            CONSUME_EXCHANGE, aio_pika.ExchangeType.TOPIC, durable=True
        )
        queue = await channel.declare_queue(CONSUME_QUEUE, durable=True)
        await queue.bind(exchange, routing_key=CONSUME_ROUTING_KEY)

        self._logger.info(
            "RabbitMQConsumer._run: RabbitMQ consumer started",
            extra={
                "exchange": CONSUME_EXCHANGE,
                "routingKey": CONSUME_ROUTING_KEY,
                "queue": CONSUME_QUEUE,
            },
        )

        async with queue.iterator() as messages:
            async for message in messages:
                async with message.process():
                    asyncio.create_task(self._message_processor.process(message))

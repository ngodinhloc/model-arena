from __future__ import annotations
import logging
from datetime import datetime, timezone
from app.contracts.experiment_interface import (
    AgentStatus,
    ExperimentCache,
    Message,
    MessageResponse,
    NodeName,
)

CACHE_TTL_SECONDS = 7200


class ExperimentManager:
    """Load/mutate the shared ExperimentCache stored in Redis at experiment:{uuid}."""

    def __init__(self, redis, logger: logging.Logger):
        self._redis = redis
        self._logger = logger

    @staticmethod
    def key(experiment_id: str) -> str:
        return f"experiment:{experiment_id}"

    async def load(self, experiment_id: str) -> ExperimentCache | None:
        raw = await self._redis.get(self.key(experiment_id))
        if not raw:
            self._logger.warning(
                "ExperimentManager.load: cache not found", extra={"experimentId": experiment_id}
            )
            return None
        return ExperimentCache.model_validate_json(raw)

    async def save(self, experiment_id: str, cache: ExperimentCache) -> None:
        cache.updatedAt = datetime.now(timezone.utc).isoformat()
        await self._redis.set(self.key(experiment_id), cache.model_dump_json(), ex=CACHE_TTL_SECONDS)

    async def append_thinking(self, experiment_id: str, node: NodeName, actor: str) -> None:
        cache = await self.load(experiment_id)
        if cache is None:
            return
        cache.messages.append(Message(node=node, actor=actor, agentStatus=AgentStatus.is_thinking))
        cache.agentStatus = AgentStatus.is_thinking
        await self.save(experiment_id, cache)

    async def complete_message(
        self,
        experiment_id: str,
        actor: str,
        response: MessageResponse,
        final: bool = False,
    ) -> None:
        cache = await self.load(experiment_id)
        if cache is None:
            return
        for message in reversed(cache.messages):
            if message.actor == actor and message.agentStatus == AgentStatus.is_thinking:
                message.response = response
                message.agentStatus = AgentStatus.has_replied
                break
        if final:
            cache.agentStatus = AgentStatus.has_replied
        await self.save(experiment_id, cache)

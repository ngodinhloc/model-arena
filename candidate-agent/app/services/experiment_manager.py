from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from app.contracts.experiment_interface import (
    AgentStatus,
    ExperimentCache,
    Message,
    MessageResponse,
    NodeName,
)

CACHE_TTL_SECONDS = 7200

# recover-service marks an experiment failed once its cache is both stale (default staleness
# threshold: 120s) and retryCount >= its configured MAX_RETRIES (default 3). Backdating
# updatedAt and setting a retryCount far past any reasonable threshold makes the very next
# sweep tick (~30s) treat this as already-exhausted, instead of waiting out the full
# stale/retry cycle (~10 min) for something that is guaranteed to keep failing identically.
UNRECOVERABLE_BACKDATE_SECONDS = 600
UNRECOVERABLE_RETRY_COUNT = 9999


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
        await self._redis.set(
            self.key(experiment_id), cache.model_dump_json(), ex=CACHE_TTL_SECONDS
        )

    async def append_thinking(self, experiment_id: str, node: NodeName, actor: str) -> None:
        cache = await self.load(experiment_id)
        if cache is None:
            return
        cache.messages.append(Message(node=node, actor=actor, agentStatus=AgentStatus.is_thinking))
        cache.agentStatus = AgentStatus.is_thinking
        await self.save(experiment_id, cache)

    async def mark_unrecoverable(self, experiment_id: str) -> None:
        cache = await self.load(experiment_id)
        if cache is None:
            return
        cache.retryCount = UNRECOVERABLE_RETRY_COUNT
        cache.updatedAt = (
            datetime.now(timezone.utc) - timedelta(seconds=UNRECOVERABLE_BACKDATE_SECONDS)
        ).isoformat()
        await self._redis.set(
            self.key(experiment_id), cache.model_dump_json(), ex=CACHE_TTL_SECONDS
        )

    async def set_reply(
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

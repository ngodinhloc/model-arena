from __future__ import annotations


class ModelRefusalError(Exception):
    """Raised when the provider's safety classifier refuses to respond (stop_reason == 'refusal').

    Deterministic for a given prompt — retrying the same call will refuse again every time,
    so callers should not retry and should fail the experiment immediately instead of letting
    recover-service burn through its stale/retry cycle for something that can never succeed.
    """

    def __init__(self, actor: str):
        self.actor = actor
        super().__init__(f"{actor}: response refused by provider safety classifier")

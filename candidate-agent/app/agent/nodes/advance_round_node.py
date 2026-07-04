from __future__ import annotations

from app.agent.candidate_state import CandidateState


class AdvanceRoundNode:
    async def __call__(self, state: CandidateState) -> dict:
        return {"round": state["round"] + 1}

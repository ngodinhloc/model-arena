from __future__ import annotations
from pydantic import BaseModel

from app.contracts.experiment_interface import JudgeScoreSheet


class JudgeVerdict(BaseModel):
    """Structured output: one score sheet per candidate."""

    scoreSheets: list[JudgeScoreSheet]

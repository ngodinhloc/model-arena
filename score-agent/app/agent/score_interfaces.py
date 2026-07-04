from __future__ import annotations
from typing import Literal
from pydantic import BaseModel


class WinnerDecision(BaseModel):
    """Structured output of the arbiter LLM."""

    winner: Literal["Candidate 1", "Candidate 2"]
    comment: str

from __future__ import annotations

from typing import TypedDict

from app.contracts.experiment_interface import ExperimentEvent


class JudgeState(TypedDict):
    event: ExperimentEvent

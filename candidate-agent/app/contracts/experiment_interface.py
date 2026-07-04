from enum import Enum
from typing import Optional, Union
from pydantic import BaseModel, Field


class AgentStatus(str, Enum):
    is_thinking = "isThinking"
    has_replied = "hasReplied"


class NodeName(str, Enum):
    candidate = "candidate"
    judge = "judge"
    score = "score"


class CandidateConfig(BaseModel):
    candidateNumber: int
    provider: str
    model: str
    persona: str
    temperature: float


class JudgeConfig(BaseModel):
    judgeNumber: int
    provider: str
    model: str
    persona: str
    temperature: float


class ScoreCardConfig(BaseModel):
    cardName: str
    maxPoint: int = 20


class CandidateResponse(BaseModel):
    header: str
    arguments: list[str]


class JudgeResponse(BaseModel):
    cardName: str
    point: int
    comment: str


class JudgeScoreSheet(BaseModel):
    candidateNumber: int
    cards: list[JudgeResponse]


class CandidateScore(BaseModel):
    candidateNumber: int
    provider: str
    model: str
    score: int


class ScoreResponse(BaseModel):
    candidateScores: list[CandidateScore]
    winner: str
    score: int
    comment: str = ""
    tie: bool = False


MessageResponse = Union[CandidateResponse, list[JudgeScoreSheet], ScoreResponse]


class Message(BaseModel):
    node: NodeName
    actor: str
    response: Optional[MessageResponse] = None
    agentStatus: AgentStatus = AgentStatus.is_thinking


class ExperimentEvent(BaseModel):
    eventName: str
    experimentId: str
    category: str
    topic: str
    rounds: int
    candidateConfigs: list[CandidateConfig]
    judgeConfigs: list[JudgeConfig]
    scoreCards: list[ScoreCardConfig]
    messages: list[Message] = Field(default_factory=list)


class ExperimentCache(ExperimentEvent):
    agentStatus: AgentStatus = AgentStatus.is_thinking

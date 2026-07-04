export type AgentStatus = "isThinking" | "hasReplied";
export type ExperimentStatus = "running" | "completed";

export interface ProviderWithModels {
  id: number;
  name: string;
  models: { id: number; name: string }[];
}

export interface Category {
  id: number;
  name: string;
}

export interface Topic {
  id: number;
  categoryId: number;
  topic: string;
}

export interface AgentConfig {
  number: 1 | 2;
  provider: string;
  model: string;
  temperature: number;
}

export interface CreateExperimentRequest {
  topicId: number;
  rounds: number;
  candidates: AgentConfig[];
  candidatePersona: string;
  judges: AgentConfig[];
  judgePersona: string;
}

export interface CandidateConfig {
  candidateNumber: 1 | 2;
  provider: string;
  model: string;
  persona: string;
  temperature: number;
}

export interface JudgeConfig {
  judgeNumber: 1 | 2;
  provider: string;
  model: string;
  persona: string;
  temperature: number;
}

export interface CandidateResponse {
  header: string;
  arguments: string[];
}

export interface JudgeResponse {
  cardName: string;
  point: number;
  comment: string;
}

export interface JudgeScoreSheet {
  candidateNumber: 1 | 2;
  cards: JudgeResponse[];
}

export interface CandidateScore {
  candidateNumber: 1 | 2;
  provider: string;
  model: string;
  score: number;
}

export interface ScoreResponse {
  candidateScores: CandidateScore[];
  winner: string;
  score: number;
  comment: string;
  tie: boolean;
}

export type MessageResponse = CandidateResponse | JudgeScoreSheet[] | ScoreResponse;

export interface Message {
  node: "candidate" | "judge" | "score";
  actor: string;
  response: MessageResponse | null;
  agentStatus: AgentStatus;
}

export interface ExperimentCache {
  experimentId: string;
  category: string;
  topic: string;
  candidateConfigs: CandidateConfig[];
  judgeConfigs: JudgeConfig[];
  messages: Message[];
  agentStatus: AgentStatus;
}

export interface ExperimentSummary {
  uuid: string;
  topic: string;
  category: string;
  candidateConfig: CandidateConfig[];
  judgeConfig: JudgeConfig[];
  status: ExperimentStatus;
  createdAt: string;
}

export interface ExperimentDetail {
  uuid: string;
  topic: string;
  category: string;
  candidateConfig: CandidateConfig[];
  judgeConfig: JudgeConfig[];
  status: ExperimentStatus;
  createdAt: string;
  messages: Message[];
  scoreResponse?: ScoreResponse | null;
  agentStatus: AgentStatus;
}

export interface AnalyticsModelRow {
  model: string;
  wins: number;
  battles: number;
  winRate: number;
  avgScore: number;
}

export interface AnalyticsCategoryModelRow {
  model: string;
  wins: number;
  battles: number;
}

export interface AnalyticsCategoryWinners {
  category: string;
  models: AnalyticsCategoryModelRow[];
}

export interface AnalyticsScoreCardRow {
  cardName: string;
  avgPoint: number;
  maxPossible: number;
  evaluations: number;
}

export interface AnalyticsScoreCardWinners {
  cardName: string;
  models: AnalyticsCategoryModelRow[];
}

export interface AnalyticsJudgeAvgScoreRow {
  model: string;
  avgScore: number;
  evaluations: number;
  maxPossible: number;
}

export interface Analytics {
  totalExperiments: number;
  models: AnalyticsModelRow[];
  categoryWinners: AnalyticsCategoryWinners[];
  scoreCards: AnalyticsScoreCardRow[];
  scoreCardWinners: AnalyticsScoreCardWinners[];
  judgeAvgScores: AnalyticsJudgeAvgScoreRow[];
}

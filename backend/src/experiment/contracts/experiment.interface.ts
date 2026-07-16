export const EXCHANGE_EXPERIMENT = 'model_arena.experiment';
export const EXCHANGE_SCORES = 'model_arena.scores';
export const EVENT_EXPERIMENT_CREATED = 'model_arena.experiment.created';
export const EVENT_SCORES_RESPONDED = 'model_arena.scores.responded';
export const BACKEND_QUEUE = 'backend.queue';

export const SCORE_CARD_NAMES = [
  'Technical Accuracy',
  'Reasoning',
  'Practicality',
  'Completeness',
  'Clarity',
] as const;

export const SCORE_CARD_MAX_POINT = 20;

export enum AgentStatus {
  isThinking = 'isThinking',
  hasReplied = 'hasReplied',
}

export enum ExperimentStatus {
  running = 'running',
  completed = 'completed',
  failed = 'failed',
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

export interface ScoreCardConfig {
  cardName: string;
  maxPoint: number;
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

// One judge produces one score sheet per candidate
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
  winner: 'Candidate 1' | 'Candidate 2';
  score: number;
  comment: string;
  tie: boolean;
}

export type MessageResponse =
  CandidateResponse | JudgeScoreSheet[] | ScoreResponse;

export interface Message {
  node: 'candidate' | 'judge' | 'score';
  actor: string;
  response: MessageResponse | null;
  agentStatus: AgentStatus;
}

export interface ExperimentEvent {
  eventName: string;
  experimentId: string;
  category: string;
  topic: string;
  rounds: number;
  candidateConfigs: CandidateConfig[];
  judgeConfigs: JudgeConfig[];
  scoreCards: ScoreCardConfig[];
  messages?: Message[];
}

// Stored in Redis at experiment:{uuid}
export interface ExperimentCache extends ExperimentEvent {
  messages: Message[];
  agentStatus: AgentStatus;
  updatedAt: string;
  retryCount: number;
}

export interface ExperimentItem {
  uuid: string;
  topic: string;
  category: string;
  candidateConfig: CandidateConfig[];
  judgeConfig: JudgeConfig[];
  status: ExperimentStatus;
  createdAt: Date;
}

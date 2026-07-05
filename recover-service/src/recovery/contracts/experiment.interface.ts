export enum AgentStatus {
  isThinking = 'isThinking',
  hasReplied = 'hasReplied',
}

export enum ExperimentStatus {
  running = 'running',
  completed = 'completed',
  failed = 'failed',
}

export type NodeName = 'candidate' | 'judge' | 'score';

export const EXCHANGE_EXPERIMENT = 'model_arena.experiment';
export const EVENT_EXPERIMENT_CREATED = 'model_arena.experiment.created';

export const EXCHANGE_CANDIDATES = 'model_arena.candidates';
export const EVENT_CANDIDATES_RESPONDED = 'model_arena.candidates.responded';

export const EXCHANGE_JUDGES = 'model_arena.judges';
export const EVENT_JUDGES_RESPONDED = 'model_arena.judges.responded';

export const EXCHANGE_SCORES = 'model_arena.scores';
export const EVENT_SCORES_RESPONDED = 'model_arena.scores.responded';

// Mirrors backend's static score-card seed (experiment.interface.ts) — needed here only to
// rebuild a from-scratch cache when Redis has nothing at all (see ExperimentManager.buildFreshCache).
export const SCORE_CARD_NAMES = [
  'Technical Accuracy',
  'Reasoning',
  'Practicality',
  'Completeness',
  'Clarity',
] as const;

export const SCORE_CARD_MAX_POINT = 20;

export interface Message {
  node: NodeName;
  actor: string;
  response: unknown;
  agentStatus: AgentStatus;
}

// Mirrors the shared ExperimentCache shape (backend + the 3 agents). Config arrays are
// treated opaquely here — recover-service only ever forwards them unchanged.
//
// eventName: every agent's own ExperimentCache (Python) extends ExperimentEvent, which
// requires it — Pydantic rejects a cache blob missing it. recover-service's replay logic
// never reads this field itself (only the outbound event's eventName, set via buildEvent,
// matters for dispatch); it's declared here purely so any cache object built from scratch
// (see ExperimentManager.buildFreshCache) round-trips through the Python agents' validation.
export interface ExperimentCache {
  eventName: string;
  experimentId: string;
  category: string;
  topic: string;
  rounds: number;
  candidateConfigs: unknown[];
  judgeConfigs: unknown[];
  scoreCards: unknown[];
  messages: Message[];
  agentStatus: AgentStatus;
  updatedAt: string;
  retryCount: number;
}

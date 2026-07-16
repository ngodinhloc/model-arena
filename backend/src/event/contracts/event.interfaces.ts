import { ExperimentEvent } from '../../experiment/contracts/experiment.interface';

export const EXCHANGE_EXPERIMENT = 'model_arena.experiment';
export const EXCHANGE_SCORES = 'model_arena.scores';
export const EVENT_EXPERIMENT_CREATED = 'model_arena.experiment.created';
export const EVENT_SCORES_RESPONDED = 'model_arena.scores.responded';
export const BACKEND_QUEUE = 'backend.queue';

export interface EventHandler {
  handle(event: ExperimentEvent): Promise<void>;
}

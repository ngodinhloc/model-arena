import {
  EventHandler,
  EVENT_SCORES_RESPONDED,
} from '../contracts/event.interfaces';
import { ScoreRespondedHandler } from '../handlers/score-responded.handler';

export const EVENT_REGISTRY = 'EVENT_REGISTRY';

export function createEventRegistry(
  scoreRespondedHandler: ScoreRespondedHandler,
): Record<string, EventHandler> {
  return {
    [EVENT_SCORES_RESPONDED]: scoreRespondedHandler,
  };
}

import { Inject, Injectable } from '@nestjs/common';
import { EventHandler } from '../contracts/event.interfaces';
import { EVENT_REGISTRY } from '../configs/event.config';
import {
  CandidateConfig,
  ExperimentEvent,
  JudgeConfig,
  Message,
  ScoreCardConfig,
} from 'src/experiment/contracts/experiment.interface';

@Injectable()
export class MessageProcessor {
  constructor(
    @Inject(EVENT_REGISTRY)
    readonly eventRegistry: Record<string, EventHandler>,
  ) {}

  async process(message: Record<string, unknown>): Promise<void> {
    const eventName = message.eventName as string | undefined;
    if (!eventName) {
      console.warn('MessageProcessor.process: eventName missing in message', {
        message,
      });
      return;
    }

    const handler = this.eventRegistry[eventName];
    if (!handler) {
      console.warn('MessageProcessor.process: no handler for event', {
        eventName,
      });
      return;
    }

    await handler.handle(this.buildEvent(message));
  }

  private buildEvent(message: Record<string, unknown>): ExperimentEvent {
    return {
      eventName: message.eventName as string,
      experimentId: message.experimentId as string,
      category: message.category as string,
      topic: message.topic as string,
      rounds: message.rounds as number,
      candidateConfigs: message.candidateConfigs as CandidateConfig[],
      judgeConfigs: message.judgeConfigs as JudgeConfig[],
      scoreCards: message.scoreCards as ScoreCardConfig[],
      messages: message.messages as Message[] | undefined,
    };
  }
}

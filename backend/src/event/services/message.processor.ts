import { Inject, Injectable } from '@nestjs/common';
import { EventHandler } from '../contracts/event.interfaces';
import { EVENT_REGISTRY } from '../configs/event.config';
import { ExperimentEvent } from 'src/experiment/contracts/experiment.interface';


@Injectable()
export class MessageProcessor {
    constructor(
        @Inject(EVENT_REGISTRY) readonly eventRegistry: Record<string, EventHandler>,
    ) {}

    async process(message: Record<string, unknown>): Promise<void> {
        const eventName = message.eventName as string | undefined;
        if (!eventName) {
            console.warn('MessageProcessor.process: eventName missing in message', { message });
            return;
        }

        const handler = this.eventRegistry[eventName];
        if (!handler) {
            console.warn('MessageProcessor.process: no handler for event', { eventName });
            return;
        }

        await handler.handle(this.buildEvent(message) as ExperimentEvent);
    }

    private buildEvent(message: Record<string, unknown>): ExperimentEvent {      
        return {
            eventName: message.eventName as string,
            experimentId: message.experimentId as string,
            category: message.category as string,
            topic: message.topic as string,
            rounds: message.rounds as number,
            candidateConfigs: message.candidateConfigs as any[],
            judgeConfigs: message.judgeConfigs as any[],
            scoreCards: message.scoreCards as any[],
            messages: message.messages as any[] | undefined,
        };
    }
}
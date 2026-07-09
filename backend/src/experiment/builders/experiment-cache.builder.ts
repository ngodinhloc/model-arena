import { Experiment } from 'src/database/entities/experiment.entity';
import { ExperimentCache, AgentStatus, Message, EVENT_EXPERIMENT_CREATED, SCORE_CARD_NAMES, SCORE_CARD_MAX_POINT } from 'src/experiment/contracts/experiment.interface';

export class ExperimentCacheBuilder {
    static build(experiment: Experiment, messages: Message[], agentStatus: AgentStatus): ExperimentCache {
         return {
          eventName: EVENT_EXPERIMENT_CREATED,
          experimentId: experiment.uuid,
          category: experiment.category,
          topic: experiment.topic,
          rounds: experiment.rounds,
          candidateConfigs: experiment.candidateConfig,
          judgeConfigs: experiment.judgeConfig,
          scoreCards: SCORE_CARD_NAMES.map((cardName) => ({ cardName, maxPoint: SCORE_CARD_MAX_POINT })),
          messages: [],
          agentStatus: AgentStatus.isThinking,
          updatedAt: new Date().toISOString(),
          retryCount: 0,
        };
      }
}
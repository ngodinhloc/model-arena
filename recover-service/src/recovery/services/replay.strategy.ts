import { Injectable, Logger } from '@nestjs/common';
import { RabbitMQPublisherService } from '../../rabbitmq/services/rabbitmq-publisher.service';
import { ExperimentManager } from './experiment.manager';
import {
  AgentStatus,
  EVENT_CANDIDATES_RESPONDED,
  EVENT_EXPERIMENT_CREATED,
  EVENT_JUDGES_RESPONDED,
  EVENT_SCORES_RESPONDED,
  EXCHANGE_CANDIDATES,
  EXCHANGE_EXPERIMENT,
  EXCHANGE_JUDGES,
  EXCHANGE_SCORES,
  ExperimentCache,
  NodeName,
} from '../contracts/experiment.interface';

interface ReplayTarget {
  exchange: string;
  routingKey: string;
}

// Where to replay a stalled stage. The target's queue reloads state from the (stripped)
// Redis cache, so republishing here re-runs that stage cleanly from scratch.
const STAGE_REPLAY_TARGETS: Record<NodeName, ReplayTarget> = {
  candidate: {
    exchange: EXCHANGE_EXPERIMENT,
    routingKey: EVENT_EXPERIMENT_CREATED,
  },
  judge: {
    exchange: EXCHANGE_CANDIDATES,
    routingKey: EVENT_CANDIDATES_RESPONDED,
  },
  score: { exchange: EXCHANGE_JUDGES, routingKey: EVENT_JUDGES_RESPONDED },
};

// If the pipeline fully finished (Redis says hasReplied) but Postgres never flipped to
// completed, backend itself dropped/crashed on the terminal event — replay that instead.
const FINAL_REPLAY_TARGET: ReplayTarget = {
  exchange: EXCHANGE_SCORES,
  routingKey: EVENT_SCORES_RESPONDED,
};

// Owns the mechanics of re-publishing a stalled experiment: picking the right exchange,
// making the replay idempotent, and bumping retry/updatedAt bookkeeping in the cache.
@Injectable()
export class ReplayStrategy {
  private readonly logger = new Logger(ReplayStrategy.name);

  constructor(
    private readonly experimentManager: ExperimentManager,
    private readonly rabbitMQPublisher: RabbitMQPublisherService,
  ) {}

  // Replays a stalled candidate/judge/score stage. Strips every message belonging to that
  // stage first: each agent's graph always runs its full internal sequence from scratch, so
  // leaving old completed messages for that stage in place would duplicate them post-replay
  // (and score-agent sums judge points across every judge message unconditionally, so
  // duplicates would double-count). Stripping is a no-op if that stage hasn't started yet,
  // which lets "stage stuck mid-way" and "stage done but handoff to the next one was lost"
  // share the same code path.
  async replayStalledStage(cache: ExperimentCache): Promise<void> {
    const stuckNode = this.determineStuckNode(cache);
    if (!stuckNode) return; // everything already complete — nothing to replay here

    const target = STAGE_REPLAY_TARGETS[stuckNode];
    const strippedMessages = cache.messages.filter((m) => m.node !== stuckNode);

    this.logger.log(
      'ReplayStrategy.replayStalledStage: replaying stalled stage',
      {
        experimentId: cache.experimentId,
        stuckNode,
        retryCount: cache.retryCount,
      },
    );

    await this.bumpRetryAndPublish(
      { ...cache, messages: strippedMessages },
      target,
    );
  }

  // Picks the earliest stage that hasn't fully completed yet, by comparing completed message
  // counts against expected counts — NOT by looking at the last message in the array. A stage
  // can be entirely done (all its messages hasReplied) while the pipeline still hasn't handed
  // off to the next one (e.g. a message lost between agents); treating "last message's node"
  // as stuck would then re-run an already-finished stage forever instead of advancing.
  private determineStuckNode(cache: ExperimentCache): NodeName | null {
    const repliedCount = (node: NodeName) =>
      cache.messages.filter(
        (m) => m.node === node && m.agentStatus === AgentStatus.hasReplied,
      ).length;

    const candidateDone =
      repliedCount('candidate') >= cache.rounds * cache.candidateConfigs.length;
    if (!candidateDone) return 'candidate';

    const judgeDone = repliedCount('judge') >= cache.judgeConfigs.length;
    if (!judgeDone) return 'judge';

    const scoreMessage = cache.messages.find((m) => m.node === 'score');
    if (!scoreMessage || scoreMessage.agentStatus !== AgentStatus.hasReplied)
      return 'score';

    return null;
  }

  // Replays the terminal scores-responded event when the pipeline finished (Redis says hasReplied)
  // but backend never consumed it — no stripping needed since no node re-runs.
  async replayStalledFinal(cache: ExperimentCache): Promise<void> {
    this.logger.log(
      'ReplayStrategy.replayStalledFinal: replaying terminal event to backend',
      {
        experimentId: cache.experimentId,
        retryCount: cache.retryCount,
      },
    );
    await this.bumpRetryAndPublish(cache, FINAL_REPLAY_TARGET);
  }

  private async bumpRetryAndPublish(
    cache: ExperimentCache,
    target: ReplayTarget,
  ): Promise<void> {
    const updatedCache: ExperimentCache = {
      ...cache,
      retryCount: cache.retryCount + 1,
      updatedAt: new Date().toISOString(),
    };
    await this.experimentManager.saveCache(updatedCache);

    await this.rabbitMQPublisher.publish(
      target.exchange,
      target.routingKey,
      this.buildEvent(updatedCache, target.routingKey),
    );
  }

  // Every agent's MessageProcessor dispatches its handler by looking up payload.eventName
  // in a map keyed by the consuming routing key (see publish_node.py in each agent, which
  // sets this identically) — NOT by the RabbitMQ routing key the message arrived on. The
  // recovery-only bookkeeping fields (agentStatus/updatedAt/retryCount) stay out of the
  // payload since downstream agents don't expect them.
  private buildEvent(cache: ExperimentCache, eventName: string) {
    return {
      eventName,
      experimentId: cache.experimentId,
      category: cache.category,
      topic: cache.topic,
      rounds: cache.rounds,
      candidateConfigs: cache.candidateConfigs,
      judgeConfigs: cache.judgeConfigs,
      scoreCards: cache.scoreCards,
      messages: cache.messages,
    };
  }
}

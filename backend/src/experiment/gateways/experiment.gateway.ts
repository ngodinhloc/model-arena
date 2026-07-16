import {
  WebSocketGateway,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Injectable, Logger } from '@nestjs/common';
import { WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RedisService } from '../../redis/services/redis.service';
import { Experiment } from '../../database/entities/experiment.entity';
import {
  AgentStatus,
  ExperimentCache,
  ExperimentStatus,
} from '../contracts/experiment.interface';

const POLL_INTERVAL_MS = 500;
const MAX_POLLS = 1200; // 10 min timeout
const STATUS_CHECK_EVERY_N_POLLS = 4; // ~2s — cheap Postgres check for a recover-service-driven `failed` flip
const UUID_RE = /^[0-9a-fA-F-]{36}$/;

// @nestjs/platform-ws routes upgrades by an exact literal pathname match against
// this path, so the uuid must travel as a query param rather than a path segment.
@Injectable()
@WebSocketGateway({ path: '/ws/experiments' })
export class ExperimentGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(ExperimentGateway.name);
  private readonly subscriptions = new Map<WebSocket, NodeJS.Timeout>();

  constructor(
    private readonly redisService: RedisService,
    @InjectRepository(Experiment)
    private readonly experimentRepo: Repository<Experiment>,
  ) {}

  async handleConnection(
    client: WebSocket,
    req: IncomingMessage,
  ): Promise<void> {
    const uuid =
      new URL(req.url ?? '', 'http://localhost').searchParams.get('uuid') ?? '';
    if (!UUID_RE.test(uuid)) {
      client.close(1008, 'Expected ?uuid={uuid}');
      return;
    }

    const experiment = await this.experimentRepo.findOne({ where: { uuid } });
    if (!experiment) {
      client.send(
        JSON.stringify({
          event: 'error',
          data: `Experiment ${uuid} not found`,
        }),
      );
      client.close(1008, 'Experiment not found');
      return;
    }
    // Completed experiments are served from PostgreSQL via GET — never poll Redis for them.
    if (experiment.status === ExperimentStatus.completed) {
      client.send(JSON.stringify({ event: 'completed', data: { uuid } }));
      client.close(1000, 'Experiment already completed');
      return;
    }

    if (experiment.status === ExperimentStatus.failed) {
      client.send(JSON.stringify({ event: 'failed', data: { uuid } }));
      client.close(1000, 'Experiment failed');
      return;
    }

    this.startPolling(client, uuid);
  }

  private startPolling(client: WebSocket, uuid: string): void {
    let polls = 0;
    let lastPayload = '';

    const tick = async (): Promise<void> => {
      if (++polls > MAX_POLLS) {
        this.clearSubscription(client);
        client.send(
          JSON.stringify({
            event: 'error',
            data: 'Timed out waiting for agents.',
          }),
        );
        client.close(1000, 'Timeout');
        return;
      }

      try {
        const cache = await this.redisService.getJson<ExperimentCache>(
          `experiment:${uuid}`,
        );

        // Redis alone can't tell us about a recover-service-driven `failed` flip (the cache
        // may still look like a normal in-progress run, or be gone entirely), so periodically
        // cross-check Postgres too.
        if (!cache || polls % STATUS_CHECK_EVERY_N_POLLS === 0) {
          const experiment = await this.experimentRepo.findOne({
            where: { uuid },
          });
          if (experiment?.status === ExperimentStatus.failed) {
            this.clearSubscription(client);
            client.send(JSON.stringify({ event: 'failed', data: { uuid } }));
            client.close(1000, 'Experiment failed');
            return;
          }
        }
        if (!cache) return;

        const payload = JSON.stringify({
          event: 'experiment-update',
          data: cache,
        });
        if (payload !== lastPayload) {
          lastPayload = payload;
          client.send(payload);
        }

        if (cache.agentStatus === AgentStatus.hasReplied) {
          // Redis flips to `hasReplied` as soon as the score-agent produces its message, but
          // Postgres `status` only becomes `completed` once ScoreRespondedHandler drains the
          // RabbitMQ event. Wait for Postgres too, otherwise clients (e.g. the sidebar history
          // list) that refetch on this event can still observe `status: running`.
          const experiment = await this.experimentRepo.findOne({
            where: { uuid },
          });
          if (experiment?.status === ExperimentStatus.completed) {
            this.clearSubscription(client);
            client.send(JSON.stringify({ event: 'completed', data: { uuid } }));
            client.close(1000, 'Experiment completed');
          }
        }
      } catch {
        // Redis transient error — keep polling
      }
    };

    const intervalId = setInterval(() => void tick(), POLL_INTERVAL_MS);

    this.subscriptions.set(client, intervalId);
  }

  handleDisconnect(client: WebSocket): void {
    this.clearSubscription(client);
  }

  private clearSubscription(client: WebSocket): void {
    const existing = this.subscriptions.get(client);
    if (existing) {
      clearInterval(existing);
      this.subscriptions.delete(client);
    }
  }
}

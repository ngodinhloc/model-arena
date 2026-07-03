import { WebSocketGateway, OnGatewayConnection, OnGatewayDisconnect } from '@nestjs/websockets';
import { Injectable, Logger } from '@nestjs/common';
import { WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RedisService } from '../../redis/services/redis.service';
import { Experiment } from '../../database/entities/experiment.entity';
import { AgentStatus, ExperimentCache, ExperimentStatus } from '../contracts/experiment.interface';

const POLL_INTERVAL_MS = 500;
const MAX_POLLS = 1200; // 10 min timeout

const WS_PATH = /^\/ws\/experiments\/([0-9a-fA-F-]{36})$/;

@Injectable()
@WebSocketGateway()
export class ExperimentGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(ExperimentGateway.name);
  private readonly subscriptions = new Map<WebSocket, NodeJS.Timeout>();

  constructor(
    private readonly redisService: RedisService,
    @InjectRepository(Experiment) private readonly experimentRepo: Repository<Experiment>,
  ) {}

  async handleConnection(client: WebSocket, req: IncomingMessage): Promise<void> {
    const match = WS_PATH.exec(req.url ?? '');
    if (!match) {
      client.close(1008, 'Expected path /ws/experiments/{uuid}');
      return;
    }
    const uuid = match[1];

    const experiment = await this.experimentRepo.findOne({ where: { uuid } });
    if (!experiment) {
      client.send(JSON.stringify({ event: 'error', data: `Experiment ${uuid} not found` }));
      client.close(1008, 'Experiment not found');
      return;
    }
    // Completed experiments are served from PostgreSQL via GET — never poll Redis for them.
    if (experiment.status === ExperimentStatus.completed) {
      client.send(JSON.stringify({ event: 'completed', data: { uuid } }));
      client.close(1000, 'Experiment already completed');
      return;
    }

    this.startPolling(client, uuid);
  }

  private startPolling(client: WebSocket, uuid: string): void {
    let polls = 0;
    let lastPayload = '';

    const intervalId = setInterval(async () => {
      if (++polls > MAX_POLLS) {
        this.clearSubscription(client);
        client.send(JSON.stringify({ event: 'error', data: 'Timed out waiting for agents.' }));
        client.close(1000, 'Timeout');
        return;
      }

      try {
        const cache = await this.redisService.getJson<ExperimentCache>(`experiment:${uuid}`);
        if (!cache) return;

        const payload = JSON.stringify({ event: 'experiment-update', data: cache });
        if (payload !== lastPayload) {
          lastPayload = payload;
          client.send(payload);
        }

        if (cache.agentStatus === AgentStatus.hasReplied) {
          this.clearSubscription(client);
          client.send(JSON.stringify({ event: 'completed', data: { uuid } }));
          client.close(1000, 'Experiment completed');
        }
      } catch {
        // Redis transient error — keep polling
      }
    }, POLL_INTERVAL_MS);

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

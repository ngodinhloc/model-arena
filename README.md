# ModelArena

A **choreographed, event-driven** platform for benchmarking LLMs against each other. Configure two candidate models to debate a topic, two judge models to score the debate on five rubric cards, and a deterministic score agent tallies the totals and asks an arbiter LLM to declare — and justify — a winner. There is no central orchestrator: each stage is an independent service that consumes one RabbitMQ event, does its work, appends to a shared Redis cache (streamed live to the browser over WebSocket), and publishes the next event.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│  Browser                                                            │
│  Next.js frontend  (port 3000)                                      │
│  · New Experiment form, live debate/score view, Analytics dashboard │
│  · Sidebar with history (scoped by polling GET /api/experiments)    │
└──────────────────────┬───────────────────────┬──────────────────────┘
                       │ HTTP  /api/*           │ WS  /ws/experiments
┌──────────────────────▼───────────────────────▼──────────────────────┐
│  Backend  (NestJS 11 · port 8000)                                    │
│  · POST /api/experiments — writes Postgres row + Redis cache,       │
│    publishes model_arena.experiment.created                         │
│  · WS gateway — polls Redis every 500ms, pushes experiment-update   │
│  · Consumes model_arena.scores.responded → persists Result,         │
│    marks experiment completed                                       │
│  · Catalog (categories/topics/providers/models) — static seed data  │
│  · Analytics — aggregates win-rate, score-card, judge stats         │
└────────────┬─────────────────────────────┬───────────────────────────┘
             │ AMQP publish                │ read / write
             │ model_arena.experiment      │
┌────────────▼──────────────────────┐   ┌──▼──────────────────────┐
│  RabbitMQ                         │   │  Redis                   │
│  topic exchange per stage:        │   │  key: experiment:{uuid}  │
│  · model_arena.experiment         │   │  TTL 7200s               │
│  · model_arena.candidates         │   └──────────────────────────┘
│  · model_arena.judges             │
│  · model_arena.scores             │
└────────────┬──────────────────────┘
             │ AMQP subscribe (model_arena.experiment.created)
┌────────────▼──────────────────────────────────────────────────────┐
│  Candidate Agent  (FastAPI + LangGraph · port 8001)                │
│  START → candidate_1 → candidate_2 ─┬─[round < rounds]─► advance_round │
│                                      └─[round == rounds]─► publish → END │
│  publishes model_arena.candidates.responded                        │
└────────────┬────────────────────────────────────────────────────────┘
             │ AMQP subscribe (model_arena.candidates.responded)
┌────────────▼────────────────────────────────────────────────────────┐
│  Judge Agent  (FastAPI + LangGraph · port 8002)                     │
│  START → judge_1 → judge_2 → publish → END                          │
│  publishes model_arena.judges.responded                             │
└────────────┬────────────────────────────────────────────────────────┘
             │ AMQP subscribe (model_arena.judges.responded)
┌────────────▼────────────────────────────────────────────────────────┐
│  Score Agent  (FastAPI + LangGraph · port 8003)                     │
│  START → score (totals + arbiter LLM verdict) → publish → END       │
│  publishes model_arena.scores.responded                             │
└────────────┬────────────────────────────────────────────────────────┘
             │ AMQP subscribe (backend.scores)
             ▼
       Backend: persist Result, mark experiment completed

┌───────────────────────────────────────────────────────────────────┐
│  Recover Service  (NestJS 11 · port 8004)                          │
│  Every SWEEP_INTERVAL_SECONDS: find Postgres experiments still     │
│  `running`; for each, check Redis cache staleness (updatedAt) and  │
│  either replay the stalled stage or mark the experiment `failed`   │
│  after MAX_RETRIES. Reads Postgres, reads/writes Redis, publishes  │
│  back into the same RabbitMQ exchanges above. See below.           │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Services

| Service | Port | Directory | Stack |
|---------|------|-----------|-------|
| frontend | 3000 | `frontend/` | Next.js 16 · React 19 · Tailwind CSS 4 · Recharts · lucide-react |
| backend | 8000 | `backend/` | NestJS 11 · TypeORM · PostgreSQL · Redis · RabbitMQ |
| candidate-agent | 8001 | `candidate-agent/` | FastAPI · LangGraph · LangChain (Anthropic) |
| judge-agent | 8002 | `judge-agent/` | FastAPI · LangGraph · LangChain (Anthropic) |
| score-agent | 8003 | `score-agent/` | FastAPI · LangGraph · LangChain (Anthropic arbiter) |
| recover-service | 8004 | `recover-service/` | NestJS 11 · TypeORM · `@nestjs/schedule` |
| rabbitmq | 5672 / 15672 | — | RabbitMQ 3 (topic exchange per stage) |
| redis | 6379 (internal) | — | Redis 7 — live `experiment:{uuid}` cache |
| postgres | 5432 | — | PostgreSQL 17 — `experiments`, `results` |

---

## RabbitMQ topology

Every stage owns one durable **topic exchange**; the routing key doubles as the event name each consumer's `MessageProcessor` uses to look up its handler (see [Recover Service](#recover-service-port-8004) for why this matters).

| Publisher | Exchange | Routing key / event name | Consumer · queue |
|-----------|----------|---------------------------|-------------------|
| backend | `model_arena.experiment` | `model_arena.experiment.created` | candidate-agent · `candidate-agent.experiments` |
| candidate-agent | `model_arena.candidates` | `model_arena.candidates.responded` | judge-agent · `judge-agent.candidates` |
| judge-agent | `model_arena.judges` | `model_arena.judges.responded` | score-agent · `score-agent.judges` |
| score-agent | `model_arena.scores` | `model_arena.scores.responded` | backend · `backend.scores` |

Every event carries the **full `ExperimentEvent` payload** — `experimentId`, `category`, `topic`, `rounds`, `candidateConfigs`, `judgeConfigs`, `scoreCards`, and (from the candidate stage onward) `messages` — so no downstream stage ever queries Postgres for context.

---

## Backend (port 8000)

### REST API

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/experiments` | Create experiment row (`status: running`) + write `ExperimentCache` to Redis + publish `model_arena.experiment.created`; returns `{ uuid }` |
| `GET` | `/api/experiments` | List experiments, most recent first |
| `GET` | `/api/experiments/:uuid` | One experiment — live from Redis while `running`, joined with `results` once `completed`/`failed` |
| `GET` | `/api/analytics` | Aggregated win-rate / score-card / judge stats across all completed experiments |
| `GET` | `/api/models` | Providers with nested models |
| `GET` | `/api/categories` | Category list |
| `GET` | `/api/topics?category_id=` | Topics for a category |
| `WS` | `/ws/experiments?uuid=` | Polls Redis every 500ms, pushes `experiment-update`; sends `completed`/`failed` and closes once the experiment is done — never polls Redis for an already-terminal experiment |

### Redis cache shape

Key `experiment:{uuid}`, TTL 7200s, created by `POST /api/experiments` and mutated by whichever agent is currently working on it:

```typescript
interface ExperimentCache extends ExperimentEvent {
  messages: Message[];
  agentStatus: 'isThinking' | 'hasReplied';
  updatedAt: string;     // stamped on every write — the staleness signal recover-service uses
  retryCount: number;    // bumped only by recover-service
}

interface Message {
  node: 'candidate' | 'judge' | 'score';
  actor: string;                                    // e.g. "Candidate 1 (anthropic/claude-sonnet-5)"
  response: CandidateResponse | JudgeScoreSheet[] | ScoreResponse | null;
  agentStatus: 'isThinking' | 'hasReplied';
}
```

### Catalog

Categories, topics, providers, and models are **static in-memory seed data** (`backend/src/catalog/data/*.seed.ts`), not database tables — `CatalogService` maps/filters the arrays at request time. Ten categories × ten topics each (Technology, Philosophy, Economics, Science, Politics, Education, Health, Environment, Ethics, Culture); the `anthropic` provider currently seeds `claude-opus-4-8`, `claude-sonnet-5`, `claude-haiku-4-5`, `claude-fable-5`.

### Analytics

`AnalyticsService` reduces over every persisted `Result` row (`candidateResponse`, `judgeResponse`, `scoreResponse`) to produce: per-model win rate and average score, wins by category, wins by score card, average points per score card, and average score per judge model (judge identity parsed out of the `actor` string via `/\(([^)]+)\)\s*$/`). The frontend renders these as Recharts bar charts (`frontend/src/components/charts/`) plus an HTML win-rate table.

---

## Candidate Agent (port 8001)

Subscribes to `model_arena.experiment` / `model_arena.experiment.created`.

```
START → candidate_1 → candidate_2 ─┬─[round < event.rounds]──► advance_round ──┐
                                    │                                          │
                                    └─[round == event.rounds]──► publish → END │
                                                                                │
                                    candidate_1 ◄──────────────────────────────┘
```

Each `candidate_N` node appends an `isThinking` message, calls the configured LLM (`ModelFactory.build(provider, model, temperature)`) with a structured-output `CandidateResponse {header, arguments[]}`, and completes the message. Candidate 1 always argues **for** the topic, Candidate 2 **against**. `AdvanceRoundNode` just increments `round`; multi-round debates replay `candidate_1 → candidate_2` that many times before publishing.

`ModelFactory` omits the `temperature` parameter for Anthropic models that reject sampling params entirely (`claude-opus-4-7+`, `claude-sonnet-5`, `claude-fable-5`) — sending it returns a 400.

---

## Judge Agent (port 8002)

Subscribes to `model_arena.candidates` / `model_arena.candidates.responded`.

```
START → judge_1 → judge_2 → publish → END
```

Each `judge_N` node scores **both** candidates in a single structured-output call against the five fixed score cards (Technical Accuracy, Reasoning, Practicality, Completeness, Clarity — 0–20 each), producing `list[JudgeScoreSheet]` (one sheet per candidate). It reads the candidates' arguments straight from the inbound event's `messages`, not from Redis.

---

## Score Agent (port 8003)

Subscribes to `model_arena.judges` / `model_arena.judges.responded`.

```
START → score → publish → END
```

`ScoreNode` sums judge card points per candidate **deterministically** (no LLM needed for the math), then always makes one more LLM call — an **arbiter** — to declare the winner and write a justification, even on a tied total (the arbiter must explicitly break the tie and explain why). If the arbiter call fails after its retries, the node falls back to declaring the higher point total the winner rather than leaving the experiment stuck.

---

## Recover Service (port 8004)

A choreographed pipeline with no orchestrator has no single place that knows an experiment is stuck — if an agent crashes mid-processing, an LLM call hangs, or a RabbitMQ message is silently dropped, the experiment just stays `running` in Postgres forever with nothing watching it. `recover-service` is a standalone NestJS app whose only job is to notice and repair that.

Every `SWEEP_INTERVAL_SECONDS` (default 30) it fetches every Postgres experiment still `status: running`, and for each one (in bounded-concurrency batches, each guarded by a **per-experiment Redis lock** so overlapping ticks or future replicas never act on the same experiment twice):

- **Redis cache missing/expired** → progress unrecoverable → mark `failed`.
- **Cache present but stale** (`updatedAt` older than `STALE_THRESHOLD_SECONDS`, default 120) and `retryCount >= MAX_RETRIES` (default 3) → give up, mark `failed`.
- **Cache present, stale, retries remaining**:
  - If the pipeline actually finished (`agentStatus: hasReplied`) but Postgres never flipped to `completed` — backend itself dropped the terminal event — replay `model_arena.scores.responded` directly.
  - Otherwise, find the **earliest incomplete stage** by comparing completed-message counts against expected counts (`rounds × candidateConfigs.length` for candidates, `judgeConfigs.length` for judges, then score) — *not* by looking at the last message in the array, since a finished stage can sit at the end of the array while the handoff to the next stage was simply lost. Strip every message belonging to that stage (a no-op if it never started), bump `retryCount`, and republish to that stage's exchange.

Three collaborating classes keep this readable: `ExperimentManager` (all Postgres/Redis access), `ReplayStrategy` (routing targets, message stripping, retry bookkeeping), and `RecoveryService` (the sweep loop and staleness policy only). One detail worth knowing if you extend this: every agent's `MessageProcessor` dispatches its handler by the payload's `eventName` field, not by the RabbitMQ routing key the message actually arrived on — so a replay's `eventName` must be rewritten to match the target stage, or the target agent silently drops it.

**Known limitation:** candidate-agent's graph always starts at round 1 on any invocation, so a replay of a mid-round candidate stall redoes every round, not just the unfinished one — wasteful, but not incorrect, since stripping keeps the message list clean either way.

Config: `STALE_THRESHOLD_SECONDS`, `SWEEP_INTERVAL_SECONDS`, `MAX_RETRIES` (env vars, see `docker-compose.yml`).

---

## Frontend (port 3000)

- **New Experiment** (`/`) — Category → Topic cascading selects, a 1–5 round picker, a static score-card legend, two `AgentConfigCard`s for candidates (provider → model → temperature) plus a shared candidate persona textarea, and the same for two judges. Submitting `POST /api/experiments` and redirects to `/experiments/:uuid`.
- **Experiment view** (`/experiments/:uuid`) — opens the WebSocket while `running`, renders candidate argument cards and judge score-sheets as they stream in, shows a "Thinking…" state per in-flight actor, and a winner banner once the score arrives. Renders a red "Failed" badge (no WS) for experiments recover-service gave up on.
- **Analytics** (`/analytics`) — win-rate table plus four Recharts bar charts: wins by category, winner by score card, average score per score card, average score by judge.
- **Sidebar** — collapsible left rail with "New Experiment", "Analytics", and an expandable history list from `GET /api/experiments`.

---

## Data model

```
CandidateConfig { candidateNumber: 1 | 2; provider: string; model: string; persona: string; temperature: number }
JudgeConfig     { judgeNumber: 1 | 2; provider: string; model: string; persona: string; temperature: number }
ScoreCardConfig { cardName: string; maxPoint: 20 }

CandidateResponse { header: string; arguments: string[] }
JudgeResponse     { cardName: string; point: number; comment: string }
JudgeScoreSheet   { candidateNumber: 1 | 2; cards: JudgeResponse[] }

ScoreResponse {
  candidateScores: { candidateNumber: 1 | 2; provider: string; model: string; score: number }[]
  winner: 'Candidate 1' | 'Candidate 2'
  score: number
  comment: string
  tie: boolean
}

ExperimentEvent { eventName; experimentId; category; topic; rounds; candidateConfigs; judgeConfigs; scoreCards; messages }
ExperimentCache extends ExperimentEvent { agentStatus; updatedAt; retryCount }
```

This shape is duplicated four times — once in TypeScript (`backend/src/experiment/contracts/experiment.interface.ts`) and once per Python agent (`app/contracts/experiment_interface.py`) — because Pydantic silently drops unknown fields on parse. Adding a field to one without adding it to all four means it vanishes the moment any agent round-trips the cache.

---

## Quick start

```bash
# 1. Each LLM-calling agent needs its own Anthropic key
for svc in candidate-agent judge-agent score-agent; do
  cp $svc/.env.example $svc/.env
  # edit $svc/.env — set ANTHROPIC_API_KEY=sk-ant-...
done

# 2. Start all services
docker compose up --build
```

Open [http://localhost:3000](http://localhost:3000), pick a category/topic, configure two candidates and two judges, and hit **Start Experiment**.

- RabbitMQ management: [http://localhost:15672](http://localhost:15672) — `guest` / `guest`
- Backend health: [http://localhost:8000/api/health](http://localhost:8000/api/health)
- Recover-service health: [http://localhost:8004/api/health](http://localhost:8004/api/health)

### Required environment

| Key | File | Description |
|-----|------|--------------|
| `ANTHROPIC_API_KEY` | `candidate-agent/.env`, `judge-agent/.env`, `score-agent/.env` | [console.anthropic.com](https://console.anthropic.com) |

All other configuration (database URL, Redis URL, RabbitMQ URL, recover-service tuning) is pre-set in `docker-compose.yml`.

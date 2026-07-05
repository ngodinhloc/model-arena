# ModelArena

A **choreographed, event-driven** platform for benchmarking LLMs against each other. Configure two candidate models to debate a topic, two judge models to score the debate on five rubric cards, and a deterministic score agent tallies the totals and asks an arbiter LLM to declare — and justify — a winner. There is no central orchestrator: each stage is an independent service that consumes one RabbitMQ event, does its work, appends to a shared Redis cache (streamed live to the browser over WebSocket), and publishes the next event.

Two things this project is specifically built to demonstrate:

- **LLM-as-judge** — judging is split into a deterministic step (summing rubric points) and a separate LLM step (an arbiter that declares and justifies a winner, even on a tied total) rather than trusting one LLM call to both score and decide. See [Score Agent](#score-agent-port-8003) and the [example run](#example-a-real-debate) below.
- **Auto-recovery** — because the pipeline has no orchestrator, nothing else would notice a stalled stage. `recover-service` is a standalone sweeper that detects stuck experiments and safely replays only the stuck stage. See [Recover Service](#recover-service-port-8004). The frontend's **Test Auto Recovery** page lets you manufacture a stall on demand instead of waiting for a real crash — see [Frontend](#frontend-port-3000).

---

## Architecture

![Architecture diagram](architecture.png)

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
| `POST` | `/api/test-recover` | Recovery testing: samples `count` (1–5) random `completed` experiments, clones each as a fresh `running` row with `messages` stripped back to just before `stallState` (`candidate`/`judge`/`score`), and writes a backdated `ExperimentCache` to Redis — no RabbitMQ publish, so recover-service's own sweep is what discovers and repairs it; returns the created experiments |
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

- **Redis cache missing/expired** → rebuild a fresh `ExperimentCache` straight from the Postgres row (same shape `POST /api/experiments` would have written) and restart the pipeline from scratch by republishing `model_arena.experiment.created` — a missing cache means no in-flight progress to lose, so this is just the create-experiment flow re-run rather than a dead end.
- **Cache present but stale** (`updatedAt` older than `STALE_THRESHOLD_SECONDS`, default 120) and `retryCount >= MAX_RETRIES` (default 3) → give up, mark `failed`.
- **Cache present, stale, retries remaining**:
  - If the pipeline actually finished (`agentStatus: hasReplied`) but Postgres never flipped to `completed` — backend itself dropped the terminal event — replay `model_arena.scores.responded` directly.
  - Otherwise, find the **earliest incomplete stage** by comparing completed-message counts against expected counts (`rounds × candidateConfigs.length` for candidates, `judgeConfigs.length` for judges, then score) — *not* by looking at the last message in the array, since a finished stage can sit at the end of the array while the handoff to the next stage was simply lost. Strip every message belonging to that stage (a no-op if it never started), bump `retryCount`, and republish to that stage's exchange.

Three collaborating classes keep this readable: `ExperimentManager` (all Postgres/Redis access), `ReplayStrategy` (routing targets, message stripping, retry bookkeeping), and `RecoveryService` (the sweep loop and staleness policy only).

**Why not just look at the last message?** The obvious heuristic — "the stuck stage is whatever produced the last message in the array" — is wrong exactly when a stage *finishes* but the handoff to the next stage is what's lost: after both judges reply, the last message is a correctly-completed judge verdict, not evidence of a stall. Reading that as "stuck" would strip and re-run two good verdicts to fix a problem one stage further down. Instead, `determineStuckNode` counts *completed* messages per stage against how many are expected (`rounds × candidateConfigs.length` for candidates, `judgeConfigs.length` for judges, then score) and returns the first stage that's short — this treats "still working" and "finished but stranded" identically, and only ever strips messages belonging to that one stuck stage.

**Replay must rewrite the event name, not just the routing key.** Every agent's consumer dispatches its handler by the payload's `eventName` *field*, not by the RabbitMQ routing key the message physically arrived on:

```python
handler = self._handler_map.get(payload.get("eventName"))
```

So a naive replay that just republishes the stale cache (still carrying whatever `eventName` it last had) gets silently dropped by the target agent with a "no handler registered" warning — the replay must set `eventName` to match what the target stage's handler map expects, in addition to publishing on the right exchange/routing key.

**A from-scratch cache still needs `eventName`.** Every agent's own `ExperimentCache` (Python) extends `ExperimentEvent`, which requires `eventName` — Pydantic rejects a cache blob missing it. Every cache mutation elsewhere in recover-service spreads `{...cache}` from a blob that originally came from backend (which always writes it), so the field rides along even though recover-service's own TypeScript type doesn't declare it. Building a cache from nothing (the missing-cache path above) has no such blob to spread from, so `ExperimentManager.buildFreshCache` sets `eventName: EVENT_EXPERIMENT_CREATED` explicitly — omitting it here reproduces the exact `"Field required"` validation error the previous bullet's fix was for, just one layer up.

**Locking is per-experiment, not per-sweep-tick.** A single lock for the whole sweep would force a large backlog of stalled experiments to be processed one at a time, and any tick that outran its own lock TTL would let a second tick start concurrently on the same backlog. Locking at the experiment level (`recover:sweep:lock:{uuid}`, `SET ... PX ttl NX`) lets an arbitrarily large batch of stale experiments be checked in parallel while still guaranteeing no two ticks — or future replicas — act on the same experiment twice.

**Known limitation:** candidate-agent's graph always starts at round 1 on any invocation, so a replay of a mid-round candidate stall redoes every round, not just the unfinished one — wasteful, but not incorrect, since stripping keeps the message list clean either way.

Config: `STALE_THRESHOLD_SECONDS`, `SWEEP_INTERVAL_SECONDS`, `MAX_RETRIES` (env vars, see `docker-compose.yml`).

---

## Frontend (port 3000)

- **New Experiment** (`/`) — Category → Topic cascading selects, a 1–5 round picker, a static score-card legend, two `AgentConfigCard`s for candidates (provider → model → temperature) plus a shared candidate persona textarea, and the same for two judges. Submitting `POST /api/experiments` and redirects to `/experiments/:uuid`.

  ![New Experiment form](screenshot_new.png)

- **Experiment view** (`/experiments/:uuid`) — opens the WebSocket while `running`, renders candidate argument cards and judge score-sheets as they stream in, shows a "Thinking…" state per in-flight actor, and a winner banner once the score arrives. Renders a red "Failed" badge (no WS) for experiments recover-service gave up on.

  ![Candidate responses streaming in](screenshot_candidate_responses.png)
  ![Judge score-sheets and final result](screenshot_score.png)

- **Auto Run** (`/auto-run`) — picks a run count (5/10/20/30), then fires that many `POST /api/experiments` calls with a randomized topic/category and randomized candidate/judge provider, model, and temperature per run. Each created experiment renders as a card (category, topic, candidate 1 vs. candidate 2) linking to its live view — useful for generating Analytics data or stress-testing the pipeline under concurrent load.
- **Test Auto Recovery** (`/test-auto-recovery`) — picks a count (1–5) and a stall state (Candidate/Judge/Score), then calls `POST /api/test-recover` and renders the resulting stalled experiments as cards. Each one is picked up and finished for real by recover-service's sweep within `SWEEP_INTERVAL_SECONDS` — no separate "fake" completion path.
- **Analytics** (`/analytics`) — win-rate table plus four Recharts bar charts: wins by category, winner by score card, average score per score card, average score by judge.

  ![Analytics dashboard](screenshot_analytics.png)

- **Sidebar** — collapsible left rail with "New Experiment", "Analytics", "Auto Run", "Test Auto Recovery", and an expandable history list from `GET /api/experiments`.

---

## Example: A Real Debate

A 3-round experiment on the topic **"Does globalization benefit developing nations more than it harms them?"** — `claude-fable-5` (Candidate 1, arguing for) vs. `claude-haiku-4-5` (Candidate 2, arguing against), judged by `claude-sonnet-5` and `claude-opus-4-8`. Round 1 opening arguments (trimmed):

```json
{
  "node": "candidate",
  "actor": "Candidate 1 (anthropic/claude-fable-5)",
  "response": {
    "header": "Globalization Has Been the Greatest Poverty-Reduction Engine in Human History for Developing Nations",
    "arguments": [
      "The empirical record on poverty is decisive: since 1990, as developing nations integrated into global markets, extreme poverty fell from roughly 36% of the world's population to under 10% — the fastest decline ever recorded. China alone lifted over 800 million people out of poverty after opening to trade in 1978...",
      "Globalization transferred capital, technology, and know-how that developing nations could never have generated internally at the same speed..."
    ]
  },
  "agentStatus": "hasReplied"
}
```

```json
{
  "node": "candidate",
  "actor": "Candidate 2 (anthropic/claude-haiku-4-5)",
  "response": {
    "header": "Globalization Has Concentrated Wealth and Destabilized Developing Nations More Than It Has Lifted Them",
    "arguments": [
      "While absolute poverty numbers have fallen, this masks a deeper failure: the benefits of globalization have been radically unequal, with most gains captured by multinational corporations, wealthy elites in developing nations, and developed-world consumers...",
      "Globalization has systematically undermined developing nations' policy autonomy and institutional capacity by locking them into extractive roles within global supply chains..."
    ]
  },
  "agentStatus": "hasReplied"
}
```

After all 3 rounds, Judge 1 scores each candidate independently against the five rubric cards — note the per-card `comment` justifying the point award, not just a bare number:

```json
{
  "node": "judge",
  "actor": "Judge 1 (anthropic/claude-sonnet-5)",
  "response": [
    {
      "candidateNumber": 1,
      "cards": [
        { "cardName": "Technical Accuracy", "point": 18, "comment": "Cites verifiable data points (Bangladesh's 2021 LDC graduation, EBA tariff exemptions, Serum Institute's vaccine output, $50B remittances, COVAX's ~2B doses) that are largely accurate and well-sourced..." },
        { "cardName": "Reasoning", "point": 18, "comment": "The natural-experiment framing (North/South Korea, East/West Germany, pre/post-1978 China...) is logically tight, holding confounders constant to isolate the effect of openness..." },
        { "cardName": "Practicality", "point": 17, "comment": "Offers concrete, real-world policy responses to opponent's concerns—Chile/Malaysia's capital controls within open economies, the 140-country tax agreement..." },
        { "cardName": "Completeness", "point": 19, "comment": "Systematically addresses every prong of the opposition's case... leaving little unaddressed." },
        { "cardName": "Clarity", "point": 18, "comment": "Structured as a direct point-by-point rebuttal with clear headers and transitions, culminating in an explicit weighing mechanism..." }
      ]
    }
  ],
  "agentStatus": "hasReplied"
}
```

Score-agent sums both judges' cards deterministically, then the arbiter LLM writes the final verdict — full output, unmodified:

```json
{
  "tie": false,
  "score": 178,
  "winner": "Candidate 1",
  "comment": "Candidate 1 won decisively with 178 points to Candidate 2's 155, and both judges independently scored Candidate 1 higher. Judges consistently praised Candidate 1's natural-experiment reasoning (Korea, Germany, China, India, Vietnam), its wealth of accurate data, and its systematic completeness in rebutting every objection while leaving key claims like halved child mortality and falling between-nation inequality unrebutted by Candidate 2. Candidate 2 offered a coherent structuralist counter-narrative but was flagged for risking unfalsifiability, overstating WTO constraints, and offering few practical alternatives.",
  "candidateScores": [
    { "candidateNumber": 1, "provider": "anthropic", "model": "claude-fable-5", "score": 178 },
    { "candidateNumber": 2, "provider": "anthropic", "model": "claude-haiku-4-5", "score": 155 }
  ]
}
```

Full transcripts: [`candidate_responses.json`](candidate_responses.json), [`judge_responses.json`](judge_responses.json), [`score_responses.json`](score_responses.json).

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

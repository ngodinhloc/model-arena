# Plan: ModelArena — LLM Evaluation & Debate Platform

## Overview

Build a choreographed, event-driven platform that benchmarks two LLM candidates against each other on a debate topic and scores them with multiple LLM judges. There is no central orchestrator: each stage consumes an event, does its work, appends results to a shared Redis cache (streamed live to the browser over WebSocket), and publishes the next event.

```
Frontend ──POST /api/experiments──▶ Backend ──publish──▶ model_arena.experiment.created
    │                                  ▲                        │
    │ WS /ws/experiments/{uuid}        │                        ▼
    ◀── polls Redis, streams ──────────┘                 Candidate Agent (2 LLM calls)
                                                                │ append to Redis
                                                                ▼
                                                  model_arena.candidates.responded
                                                                │
                                                                ▼
                                                     Judge Agent (2 LLM calls)
                                                                │ append to Redis
                                                                ▼
                                                    model_arena.judges.responded
                                                                │
                                                                ▼
                                                     Score Agent (deterministic)
                                                                │ append to Redis
                                                                ▼
                                                    model_arena.scores.responded
                                                                │
                                                                ▼
                                        Backend consumer: persist results, mark completed

                                        Recover Service (polls Postgres every 30s, independent of the
                                        happy path above): detects experiments stuck in `running` with a
                                        stale/missing Redis cache and re-publishes the event for whichever
                                        stage stalled, so the same choreography above resumes.
```

Candidate-agent additionally loops candidate_1 ⇄ candidate_2 for `rounds` rounds (user-configured, 1-5) before publishing `candidates.responded` — see §5.

All services follow the structure and coding patterns of `../architect-multi-agent`:
- `frontend` ← `../architect-multi-agent/frontend`
- `backend`, `recover-service` ← `../architect-multi-agent/backend`
- `candidate-agent`, `judge-agent`, `score-agent` ← `../architect-multi-agent/architect-agent`

---

## Project structure

```
model-arena/
├── docker-compose.yml
├── frontend/              Next.js 16 / React 19 / Tailwind CSS 4
├── backend/               NestJS 11, TypeORM, PostgreSQL, Redis, RabbitMQ
├── candidate-agent/       FastAPI, LangGraph, aio-pika
├── judge-agent/           FastAPI, LangGraph, aio-pika
├── score-agent/           FastAPI, aio-pika (no LLM — pure aggregation)
└── recover-service/       NestJS 11, TypeORM, Redis, RabbitMQ (no LLM — sweeps stalled experiments)
```

---

## 1. docker-compose.yml

| Service | Port | Depends on |
|---------|------|-----------|
| rabbitmq | 5672, 15672 | — |
| postgres | 5432 | — |
| redis | internal | — |
| backend | 8000 | postgres, redis, rabbitmq |
| candidate-agent | 8001 | rabbitmq, redis |
| judge-agent | 8002 | rabbitmq, redis |
| score-agent | 8003 | rabbitmq, redis |
| recover-service | 8004 | postgres, redis, rabbitmq (healthy) |
| frontend | 3000 | backend |

Environment wiring:
- `backend` → `DATABASE_URL=postgresql://arena:arena@postgres:5432/arena`, `REDIS_URL`, `RABBITMQ_URL`
- each agent → `RABBITMQ_URL`, `REDIS_URL`; candidate/judge agents also `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` (from `.env`)
- `recover-service` → `DATABASE_URL`, `REDIS_URL`, `RABBITMQ_URL`, plus `STALE_THRESHOLD_SECONDS=120`, `SWEEP_INTERVAL_SECONDS=30`, `MAX_RETRIES=3`
- All services get `Dockerfile.dev` under `infra/` (same pattern as the sample), health checks, named volumes for postgres/rabbitmq.

---

## 2. RabbitMQ topology

Per SPECS, each stage has its own **topic exchange**; routing key = event name. Each consumer declares a durable queue bound to the upstream exchange (same `aio-pika` consumer/publisher classes as the sample's `rabbitmq_consumer.py` / `rabbitmq_publisher.py`, with the exchange name parameterized).

| Publisher | Exchange | Routing key (event name) | Consumer / queue |
|-----------|----------|--------------------------|------------------|
| backend | `model_arena.experiment` | `model_arena.experiment.created` | candidate-agent / `candidate-agent.experiments` |
| candidate-agent | `model_arena.candidates` | `model_arena.candidates.responded` | judge-agent / `judge-agent.candidates` |
| judge-agent | `model_arena.judges` | `model_arena.judges.responded` | score-agent / `score-agent.judges` |
| score-agent | `model_arena.scores` | `model_arena.scores.responded` | backend / `backend.scores` |

Every event carries the full `ExperimentEvent` payload (experimentId, category, topic, candidateConfigs, judgeConfigs, scoreCards, rounds, and — from the candidate stage onward — `messages`), so each stage is self-sufficient.

`recover-service` never consumes; it only re-publishes onto the same four exchanges/routing keys above (or `model_arena.scores` / `.responded` again, for the "every stage replied but backend never marked completed" case) when its sweep finds a stalled experiment — see §8.

---

## 3. Backend (NestJS 11)

### Module layout

```
src/
  experiment/
    contracts/experiment.interface.ts   ExperimentEvent, CandidateConfig, JudgeConfig,
                                        ScoreCardConfig, ExperimentCache, Message,
                                        CandidateResponse, JudgeResponse, ScoreResponse
    dto/create-experiment.dto.ts        class-validator DTO for POST body
    controllers/experiment.controller.ts
    services/experiment.service.ts      PostgreSQL + Redis reads/writes
    services/event.service.ts           Publishes ExperimentEvent; consumes scores.responded
    gateways/experiment.gateway.ts      WebSocket, polls Redis at 500 ms
  catalog/
    controllers/catalog.controller.ts   GET /api/models, /api/categories, /api/topics
    services/catalog.service.ts
    seed/catalog.seed.ts                Seeds providers, models, categories, topics on boot
  database/entities/                    provider, model, category, topic, experiment, result
  redis/services/redis.service.ts       getJson / setJson / del  (copy pattern from sample)
  rabbitmq/services/rabbitmq.service.ts topic-exchange publish + consume (adapted from sample)
```

### Database entities (TypeORM, `synchronize: true` in dev)

```typescript
providers   { id, name }                                   // "anthropic", "openai"
models      { id, providerId, name }
categories  { id, name }
topics      { id, categoryId, topic }
experiments { id, uuid, topicId, candidateConfig (jsonb), judgeConfig (jsonb),
              status ('running' | 'completed' | 'failed'), createdAt, modifiedAt }
results     { id, experimentId, candidateResponse (jsonb), judgeResponse (jsonb),
              scoreResponse (jsonb), createdAt }
```

Notes vs SPECS: adds `status` on experiments (needed for "don't poll Redis for completed experiments", plus a `failed` terminal state that recover-service sets when it gives up on a stalled experiment — see §8) and `scoreResponse` on results (the winner/scores must be persisted somewhere queryable for Analytics).

### Seed data

- **Categories/topics**: a small starter set (e.g. Technology / Philosophy / Economics, 3–5 topics each).
- **Providers/models**:
  - `anthropic`: `claude-opus-4-8`, `claude-sonnet-5`, `claude-haiku-4-5` (current model IDs)
  - `openai`: seeded from a config file so IDs can be updated without code changes
- **Temperatures**: dropdown values `0, 0.3, 0.5, 0.7, 1.0` (frontend constant, not DB).

### REST API

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/experiments/` | Create experiment row (status `running`) + write `ExperimentCache` to Redis at `experiment:{uuid}` + publish `model_arena.experiment.created`; return `{ uuid }` |
| `GET` | `/api/experiments/` | List experiments; optional `category_id`, `topic_id` filters |
| `GET` | `/api/experiments/:uuid` | One experiment: live from Redis if `running`, joined with `results` if `completed` |
| `GET` | `/api/models/` | Providers with nested models |
| `GET` | `/api/categories/` | Category list |
| `GET` | `/api/topics/` | Topics; optional `category_id` filter |
| `GET` | `/api/analytics/` | Aggregates over the `results` table for the Analytics page (see §4a) |
| `WS` | `/ws/experiments/:uuid` | Poll Redis every 500 ms, push `experiment-update`; refuse/close immediately for completed experiments |

### POST /api/experiments — event construction

The backend builds the `scoreCards` array itself (fixed, not user input):

```typescript
scoreCards: ["Technical Accuracy", "Reasoning", "Practicality", "Completeness", "Clarity"]
  .map(cardName => ({ cardName, maxPoint: 20 }))   // 5 × 20 = 100 per judge per candidate
```

### Redis cache shape

Key `experiment:{uuid}`, mirrors the sample's `chat:{uuid}` lifecycle (backend creates it, agents mutate it, backend deletes it on completion):

```typescript
interface ExperimentCache extends ExperimentEvent {
  messages: Message[];
  agentStatus: 'isThinking' | 'hasReplied';
  retryCount: number;   // bumped by recover-service on each stalled-stage replay
  updatedAt: string;    // refreshed on every save; recover-service uses this for staleness checks
}

interface Message {
  node: string;         // "candidate" | "judge" | "score"
  actor: string;        // e.g. "Candidate 1 (anthropic/claude-sonnet-5)", "Judge 2 (...)"
  response: CandidateResponse | JudgeScoreSheet | ScoreResponse;
  agentStatus: 'isThinking' | 'hasReplied';
}
```

### Score-event consumer

`event.service.ts` subscribes to `model_arena.scores` / `model_arena.scores.responded`:
1. Read the full `ExperimentCache` from Redis.
2. Insert a `results` row (candidateResponse, judgeResponse, scoreResponse split out of `messages`).
3. Update the experiment to `status = 'completed'`.
4. Let the gateway push the final state, then delete the Redis key (grace delay of ~2 s so the last poll delivers the winner before cleanup).

### §4a. Analytics endpoint

`GET /api/analytics` → `AnalyticsService.getAnalytics()` reads the `results` table (joined with `experiments`) and computes, in-process, no query params:

```typescript
interface AnalyticsResponse {
  totalExperiments: number;
  models: { provider, model, battles, wins, winRate, avgScore }[];
  categoryWinners: { category, provider, model, wins }[];
  scoreCards: { cardName, avgPoint }[];
  scoreCardWinners: { cardName, provider, model, wins }[];
  judgeAvgScores: { provider, model, avgPointGiven }[];
}
```

Frontend renders this as a leaderboard table plus four charts — see §9.

---

## 4. Shared response contracts

Used by backend (TS), agents (Pydantic), and frontend (TS types):

```typescript
CandidateResponse { header: string; arguments: string[] }

// One judge produces one score sheet per candidate
JudgeScoreSheet {
  candidateNumber: 1 | 2;
  cards: JudgeResponse[];      // exactly the 5 score cards
}
JudgeResponse { cardName: string; point: number /* 0–20 */; comment: string }

ScoreResponse {
  candidateScores: CandidateScore[];   // total across both judges, max 200 each
  winner: 'Candidate 1' | 'Candidate 2';
  score: number;                       // winner's total
}
CandidateScore { candidateNumber: 1 | 2; provider: string; model: string; score: number }
```

Note vs SPECS: `JudgeResponse` alone doesn't say *which candidate* a card score belongs to, so the plan wraps it in `JudgeScoreSheet` keyed by `candidateNumber`. Everything else matches the spec.

---

## 5. Candidate Agent (FastAPI + LangGraph)

Same skeleton as `architect-agent`: FastAPI app with lifespan-started `RabbitMQConsumer`, `container.py` singletons, `configs/settings.py`, `services/redis_client.py`.

- **Subscribes**: exchange `model_arena.experiment`, routing key `model_arena.experiment.created`.
- **Graph** (`candidate_graph.py`): `START → candidate_1 → candidate_2 → [round < event.rounds?]`; if yes, `advance_round` (increments `state["round"]`) loops back to `candidate_1`; if no, `publish → END`. `rounds` (1-5) comes from the event, set by the user at creation (`CreateExperimentDto.rounds`) — sequential keeps Redis updates ordered and simple; the two calls within a round are independent so this can later be parallelized with a fan-out/join.
- **Each candidate node**:
  1. Append a `Message{node:"candidate", actor, agentStatus:"isThinking"}` to Redis (UI shows the spinner).
  2. Build the chat model from the config:
     ```python
     from langchain.chat_models import init_chat_model
     llm = init_chat_model(f"{cfg.provider}:{cfg.model}", **temperature_kwargs(cfg))
     result = llm.with_structured_output(CandidateResponseOut).invoke(prompt)
     ```
     `temperature_kwargs` omits `temperature` for models that reject sampling params (Anthropic Opus 4.7+ / Sonnet 5 return a 400 if it's set) — the dropdown value is applied only where supported.
  3. Prompt = debate topic + category + shared persona + "argue FOR (candidate 1) / AGAINST (candidate 2)" stance, structured output pinned to `CandidateResponse {header, arguments[]}`.
  4. Update the Redis message to `hasReplied` with the response.
- **publish node**: once both candidates have responded in the final round, publish `model_arena.candidates.responded` (full event + `messages`, i.e. every round's arguments) via a `publish_event` tool/helper (the sample's `RabbitMQPublisher` reused).

Dependencies: `fastapi`, `langgraph`, `langchain`, `langchain-anthropic`, `langchain-openai`, `aio-pika`, `redis`, `pydantic-settings`.

---

## 6. Judge Agent (FastAPI + LangGraph)

Identical skeleton; subscribes to `model_arena.candidates` / `model_arena.candidates.responded`.

- **Graph**: `START → judge_1_node → judge_2_node → publish → END`.
- **Each judge node** (per judge config):
  1. Append `isThinking` message to Redis.
  2. One structured-output LLM call scoring **both** candidates against the 5 score cards:
     prompt = topic + judge persona + both `CandidateResponse`s (pulled from `event.messages`) + score-card rubric (each card 0–20, comment required).
     Output model: `list[JudgeScoreSheet]` (one sheet per candidate, 5 `JudgeResponse` cards each).
  3. Update Redis message to `hasReplied`.
- **publish node**: publish `model_arena.judges.responded` with accumulated `messages`.

---

## 7. Score Agent (FastAPI)

Subscribes to `model_arena.judges` / `model_arena.judges.responded`. **No LLM call** — scoring is a deterministic sum, so this is a plain event handler (keeping LangGraph here would be ceremony; the service still follows the same FastAPI/consumer skeleton).

1. Walk `event.messages`, collect every `JudgeScoreSheet`, sum `point` per candidate (2 judges × 5 cards × 20 = max 200).
2. Build `ScoreResponse` (candidateScores, winner = higher total, tie → `winner` decided by candidate 1 unless we add a tie state — flagged in open questions).
3. Append `Message{node:"score", actor:"ScoreKeeper", response, agentStatus:"hasReplied"}` to Redis.
4. Publish `model_arena.scores.responded`.

---

## 8. Recover Service (NestJS 11)

Same NestJS skeleton as `backend` (`src/database`, `src/redis`, `src/rabbitmq`, `src/health`), minus a public REST API — just a `GET /api/health` endpoint and one scheduled job. No LLM, no HTTP business logic; it exists purely to make the choreography self-healing.

- **Trigger**: `@Interval(SWEEP_INTERVAL_SECONDS)` (default 30s, env-configurable), not event-driven.
- **Sweep** (`recovery.service.ts`), for each Postgres `experiments` row with `status = 'running'`:
  1. Acquire a short-lived Redis lock (`recover:sweep:lock:{uuid}`, `PX 20000 NX`) so only one instance acts on a given experiment.
  2. Load `experiment:{uuid}` from Redis.
  3. **Cache missing** → mark the experiment `failed`.
  4. **Cache updated within `STALE_THRESHOLD_SECONDS`** (default 120s) → skip, still legitimately in progress.
  5. **`retryCount >= MAX_RETRIES`** (default 3) → mark `failed`.
  6. **Cache's `agentStatus === hasReplied`** (every stage finished but backend never flipped `status` to `completed`, e.g. backend crashed right after consuming `scores.responded`) → replay the final `model_arena.scores` / `model_arena.scores.responded` event.
  7. **Otherwise** → determine the stuck stage by comparing completed-message counts against what's expected (candidate/judge/score), strip that stage's partial messages from the cache, bump `retryCount` and `updatedAt`, and re-publish onto that stage's exchange/routing key (`model_arena.experiment.created`, `model_arena.candidates.responded`, or `model_arena.judges.responded`) so the normal pipeline resumes.
- **Database**: reads/writes only `experiments.status` (via a partial entity mirror, `synchronize: false` — backend owns the schema).
- **Redis**: reads/writes the same `experiment:{uuid}` cache the agents use, plus its own lock keys.

---

## 9. Frontend (Next.js 16 / React 19 / Tailwind 4)

Structure mirrors the sample: `src/app/`, `src/components/`, `src/lib/api.ts`, `src/types/`.

### Layout & routes

```
src/app/layout.tsx        Shell with left Sidebar
src/app/page.tsx          New Experiment (default)
src/app/experiments/[uuid]/page.tsx   Live/replay experiment view
src/app/analytics/page.tsx
```

**Sidebar** (adapted from the sample's `Sidebar.tsx`):
- "New Experiment" button → `/`
- "Analytics" button → `/analytics`
- "Histories" — vertically expandable list from `GET /api/experiments/` (topic + date + status), each linking to `/experiments/{uuid}`.

### New Experiment page

- **Topic section**: Category dropdown (`GET /api/categories`) → Topic dropdown (`GET /api/topics?category_id=`).
- **Candidate section**: two identical `AgentConfigCard` components (Provider → Model cascading dropdowns from `GET /api/models`, Temperature dropdown) + one shared Persona textarea for both candidates.
- **Judge section**: same `AgentConfigCard` reused for Judge 1/2 + one shared judge Persona textarea.
- **Rounds**: a number input/dropdown (1-5) controlling how many candidate argument rounds the debate runs, sent as `rounds` on the create request.
- **Start**: `POST /api/experiments/` → receive `{ uuid }` → `router.push('/experiments/{uuid}')`.

### Experiment view (`/experiments/[uuid]`)

- If experiment `status === 'running'`: open `WS /ws/experiments/{uuid}`, render `messages` as they stream — candidate argument cards (header + bullet arguments), judge score-sheet tables (card / points / comment per candidate), thinking-skeleton while `agentStatus === 'isThinking'` (reuse `LoadingSkeleton` pattern).
- Final `ScoreResponse` renders a winner banner + per-candidate totals; WS closes.
- If `completed`: fetch once via `GET /api/experiments/{uuid}` and render the persisted result (no WS).

### Analytics page

Fetches `GET /api/analytics` (see §4a) and renders:
- A leaderboard table: per-model battles, wins, win rate, avg score.
- `CategoryWinnersChart` — wins by category.
- `ScoreCardWinnersChart` — winner by score card.
- `ScoreCardAvgChart` — average score per score card.
- `JudgeAvgScoreChart` — average score given by judge.

`CategoryWinnersChart` and `ScoreCardWinnersChart` share a common `GroupedWinnersChart` component under `src/components/charts/`.

---

## 10. Key decisions

- **Redis key** — `experiment:{uuid}`; created by backend, appended to by agents (read-modify-write on the `messages` array), deleted by backend shortly after completion. Same lifecycle as the sample's `chat:{uuid}`.
- **Event payload is self-contained** — every event carries configs + scoreCards + messages so agents never read the database.
- **Judge output keyed by candidate** — `JudgeScoreSheet{candidateNumber, cards}` fixes the spec gap where `JudgeResponse` can't be attributed to a candidate.
- **Score agent has no LLM** — deterministic aggregation; cheaper, instant, reproducible.
- **Multi-provider via `init_chat_model`** — one code path for Anthropic/OpenAI; provider/model strings come straight from the event. Temperature only passed to models that accept it.
- **WS gateway polls Redis at 500 ms** (sample pattern) and never polls for `status === 'completed'` experiments, per spec.
- **`synchronize: true` + boot-time seeder** in dev; no migrations initially.
- **Recovery is choreography, not orchestration** — recover-service doesn't retry in-process or hold pipeline state; it just re-publishes the same event the stalled stage should have consumed/produced, so the existing agents handle it exactly like the happy path.
- **`retryCount`/`updatedAt` live on `ExperimentCache`** rather than a separate table, so recover-service only needs Redis + the experiments table's `status` column to make a decision.

## 11. Open questions / defaults taken

1. **Debate format** — implemented as configurable multi-round: candidates alternate for `rounds` (1-5, user-supplied, validated in `CreateExperimentDto`) before publishing. Originally planned as a single round; the graph's conditional-loop shape made multi-round straightforward to add.
2. **Candidate stances** — spec doesn't say how the two candidates differ. Default: Candidate 1 argues FOR the topic, Candidate 2 AGAINST.
3. **Ties** — spec's `ScoreResponse.winner` has no tie value. Default: higher-numbered candidate never wins ties; Candidate 1 declared winner on a tie (flag in UI as "tie").
4. **Analytics scope** — implemented: per-model win/battle/win-rate/avg-score leaderboard, wins by category, winner/avg by score card, avg score given by judge (§4a, §9).
5. **OpenAI model list** — seeded from config to be filled in with the IDs you want to expose (Anthropic IDs above are current as of mid-2026).
6. **Recovery thresholds** — `STALE_THRESHOLD_SECONDS=120`, `SWEEP_INTERVAL_SECONDS=30`, `MAX_RETRIES=3` taken as reasonable defaults, not specified in SPECS; env-configurable if they need tuning.

## 12. Build order

1. `docker-compose.yml` + infra (rabbitmq, postgres, redis)
2. Backend: entities, seeder, catalog API, experiment POST/GET, Redis + RabbitMQ services
3. Candidate agent end-to-end (event in → LLM ×2 per round, looped → Redis → event out)
4. Judge agent, then score agent, then backend score-consumer (persist + complete)
5. Backend WS gateway
6. Frontend: sidebar + New Experiment form → live experiment view → histories → analytics
7. Recover-service: sweep loop, stuck-stage detection, replay
8. Smoke test: full run with cheap models (e.g. `claude-haiku-4-5` candidates/judges), including a manual kill of an agent mid-run to verify recover-service replays it

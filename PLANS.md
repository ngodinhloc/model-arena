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
```

All services follow the structure and coding patterns of `../architect-multi-agent`:
- `frontend` ← `../architect-multi-agent/frontend`
- `backend` ← `../architect-multi-agent/backend`
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
└── score-agent/           FastAPI, aio-pika (no LLM — pure aggregation)
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
| frontend | 3000 | backend |

Environment wiring:
- `backend` → `DATABASE_URL=postgresql://arena:arena@postgres:5432/arena`, `REDIS_URL`, `RABBITMQ_URL`
- each agent → `RABBITMQ_URL`, `REDIS_URL`; candidate/judge agents also `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` (from `.env`)
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

Every event carries the full `ExperimentEvent` payload (experimentId, category, topic, candidateConfigs, judgeConfigs, scoreCards, and — from the candidate stage onward — `messages`), so each stage is self-sufficient.

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
              status ('running' | 'completed'), createdAt, modifiedAt }
results     { id, experimentId, candidateResponse (jsonb), judgeResponse (jsonb),
              scoreResponse (jsonb), createdAt }
```

Notes vs SPECS: adds `status` on experiments (needed for "don't poll Redis for completed experiments") and `scoreResponse` on results (the winner/scores must be persisted somewhere queryable for Analytics).

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
- **Graph**: `START → candidate_1_node → candidate_2_node → publish → END` (sequential keeps Redis updates ordered and simple; the two calls are independent so this can later be parallelized with a fan-out/join).
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
- **publish node**: once both candidates have responded, publish `model_arena.candidates.responded` (full event + `messages`) via a `publish_event` tool/helper (the sample's `RabbitMQPublisher` reused).

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

## 8. Frontend (Next.js 16 / React 19 / Tailwind 4)

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
- **Start**: `POST /api/experiments/` → receive `{ uuid }` → `router.push('/experiments/{uuid}')`.

### Experiment view (`/experiments/[uuid]`)

- If experiment `status === 'running'`: open `WS /ws/experiments/{uuid}`, render `messages` as they stream — candidate argument cards (header + bullet arguments), judge score-sheet tables (card / points / comment per candidate), thinking-skeleton while `agentStatus === 'isThinking'` (reuse `LoadingSkeleton` pattern).
- Final `ScoreResponse` renders a winner banner + per-candidate totals; WS closes.
- If `completed`: fetch once via `GET /api/experiments/{uuid}` and render the persisted result (no WS).

### Analytics page

Minimal first version from persisted `results`: win count per model, average total score per model, experiments per category. (Backend adds a small `GET /api/analytics` aggregate endpoint.)

---

## 9. Key decisions

- **Redis key** — `experiment:{uuid}`; created by backend, appended to by agents (read-modify-write on the `messages` array), deleted by backend shortly after completion. Same lifecycle as the sample's `chat:{uuid}`.
- **Event payload is self-contained** — every event carries configs + scoreCards + messages so agents never read the database.
- **Judge output keyed by candidate** — `JudgeScoreSheet{candidateNumber, cards}` fixes the spec gap where `JudgeResponse` can't be attributed to a candidate.
- **Score agent has no LLM** — deterministic aggregation; cheaper, instant, reproducible.
- **Multi-provider via `init_chat_model`** — one code path for Anthropic/OpenAI; provider/model strings come straight from the event. Temperature only passed to models that accept it.
- **WS gateway polls Redis at 500 ms** (sample pattern) and never polls for `status === 'completed'` experiments, per spec.
- **`synchronize: true` + boot-time seeder** in dev; no migrations initially.

## 10. Open questions / defaults taken

1. **Debate format** — SPECS shows a single argument round per candidate (no rebuttals). Plan implements one round; the graph shape makes multi-round easy to add later.
2. **Candidate stances** — spec doesn't say how the two candidates differ. Default: Candidate 1 argues FOR the topic, Candidate 2 AGAINST.
3. **Ties** — spec's `ScoreResponse.winner` has no tie value. Default: higher-numbered candidate never wins ties; Candidate 1 declared winner on a tie (flag in UI as "tie").
4. **Analytics scope** — unspecified in SPECS; starting with win-rate/avg-score per model.
5. **OpenAI model list** — seeded from config to be filled in with the IDs you want to expose (Anthropic IDs above are current as of mid-2026).

## 11. Build order

1. `docker-compose.yml` + infra (rabbitmq, postgres, redis)
2. Backend: entities, seeder, catalog API, experiment POST/GET, Redis + RabbitMQ services
3. Candidate agent end-to-end (event in → LLM ×2 → Redis → event out)
4. Judge agent, then score agent, then backend score-consumer (persist + complete)
5. Backend WS gateway
6. Frontend: sidebar + New Experiment form → live experiment view → histories → analytics
7. Smoke test: full run with cheap models (e.g. `claude-haiku-4-5` candidates/judges)

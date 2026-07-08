# ModelArena — Specification

A distributed, event-driven AI evaluation platform that benchmarks and compares LLM behavior using structured debates and multi-judge consensus scoring. The user defines a topic and configures two competing LLM candidates and two LLM judges; the system runs a fully automated debate pipeline, scores it, and determines a winner. The pipeline is choreographed via RabbitMQ events — there is no central orchestrator.

---

## Data Interfaces

```typescript
// ── Config ────────────────────────────────────────────────────────────
CandidateConfig {
    candidateNumber: 1 | 2;
    provider:        string;
    model:           string;
    persona:         string;
    temperature:     number;
}

JudgeConfig {
    judgeNumber: 1 | 2;
    provider:    string;
    model:       string;
    persona:     string;
    temperature: number;
}

ScoreCardConfig {
    cardName: "Technical Accuracy" | "Reasoning" | "Practicality" | "Completeness" | "Clarity";
    maxPoint: 20;   // each card maxes at 20; 5 cards sum to 100
}

// ── Responses ─────────────────────────────────────────────────────────
CandidateResponse {
    header:    string;
    arguments: string[];
}

JudgeResponse {
    cardName: "Technical Accuracy" | "Reasoning" | "Practicality" | "Completeness" | "Clarity";
    point:    number;
    comment:  string;
}

// one judge produces one score sheet per candidate
JudgeScoreSheet {
    candidateNumber: 1 | 2;
    cards:           JudgeResponse[];
}

CandidateScore {
    candidateNumber: 1 | 2;
    provider:        string;
    model:           string;
    score:           number;
}

ScoreResponse {
    candidateScores: CandidateScore[];
    winner:          "Candidate 1" | "Candidate 2";
    score:           number;   // total score of the winning candidate
    comment:         string;
    tie:             boolean;
}

Message {
    node:        "candidate" | "judge" | "score";
    actor:       string;
    response:    CandidateResponse | JudgeScoreSheet[] | ScoreResponse | null;
    agentStatus: "isThinking" | "hasReplied";
}

// ── Events ────────────────────────────────────────────────────────────
// Republished at each pipeline stage under a new eventName/exchange, carrying
// the growing `messages` transcript forward.
ExperimentEvent {
    eventName:        string;   // model_arena.experiment.created | model_arena.candidates.responded
                                 // | model_arena.judges.responded | model_arena.scores.responded
    experimentId:     string;
    category:         string;
    topic:            string;
    rounds:           number;   // 1-5, number of candidate argument rounds, set at creation
    candidateConfigs: CandidateConfig[];
    judgeConfigs:     JudgeConfig[];
    scoreCards:       ScoreCardConfig[];
    messages?:        Message[];
}

// stored in Redis at experiment:{uuid}
ExperimentCache extends ExperimentEvent {
    messages:    Message[];
    agentStatus: "isThinking" | "hasReplied";
    retryCount:  number;   // bumped by recover-service each time it replays a stalled stage
    updatedAt:   string;   // refreshed on every save; used by recover-service to detect staleness
}
```

---

## Components

### frontend (port 3000)
Next.js / React. Left menu: "New Experiment", "Analytics", and an expandable "Histories" list.

- **New Experiment page** — Topic section (Category dropdown → Topic dropdown); Candidate section (Candidate 1 / Candidate 2, each with Provider, Model, Temperature dropdowns, plus a shared Persona text field); Judge section (same shape as Candidate, for Judge 1 / Judge 2). "Start" sends `POST /api/experiments`, receives a `uuid`, then opens a WebSocket to `/ws/experiments?uuid={uuid}` to stream live progress.
- **Analytics page** — renders the aggregates from `GET /api/analytics`.

### backend (port 8000)
NestJS API. Owns experiment state in PostgreSQL and Redis, and is the choreography entry/exit point.

**Database (PostgreSQL)**

| Table | Columns |
|---|---|
| `experiments` | `id` (PK), `uuid` (unique), `category`, `topic`, `rounds`, `candidate_config` (jsonb), `judge_config` (jsonb), `status` (`running`\|`completed`\|`failed`), `created_at`, `modified_at` |
| `results` | `id` (PK), `experiment_id` (FK → experiments.id), `candidate_response` (jsonb), `judge_response` (jsonb), `score_response` (jsonb), `created_at` |

Providers, models, categories, and topics are not database-backed — they're served from static seed data by the catalog module.

**REST API**

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/experiments` | Create an experiment: persist to Postgres, seed the Redis cache, publish `model_arena.experiment.created` |
| `GET` | `/api/experiments` | List experiments, filterable by category/topic |
| `GET` | `/api/experiments/:uuid` | Get one experiment |
| `GET` | `/api/models` | List providers + models |
| `GET` | `/api/categories` | List categories |
| `GET` | `/api/topics?category_id=` | List topics for a category |
| `GET` | `/api/analytics` | Aggregate stats from `results` (per-model win/battle counts, win rate, avg score; wins by category; winner/avg by score card; avg score by judge) |
| `GET` | `/api/health` | Health check |

**WebSocket**: `/ws/experiments?uuid={uuid}` — polls the Redis `ExperimentCache` for the given experiment and streams updates. Once an experiment is `completed`, the backend stops polling Redis for that connection.

**Subscribes** to exchange `model_arena.scores`, routing key `model_arena.scores.responded`: on receipt, persists the full cache to `results` and marks the experiment `completed`.

### candidate-agent (port 8001)
FastAPI + LangGraph. Subscribes to exchange `model_arena.experiment`, routing key `model_arena.experiment.created` only.

On receiving an `ExperimentEvent`:
1. Build the two candidates from `candidateConfigs`.
2. For each candidate, call its LLM with the topic and config to get a `CandidateResponse`, and append it to `ExperimentCache.messages` in Redis.
3. Repeat candidate 1 → candidate 2 for `rounds` rounds — each round both candidates argue again, seeing the transcript so far.
4. When both candidates have responded for the final round, publish the event to exchange `model_arena.candidates`, routing key `model_arena.candidates.responded`.

### judge-agent (port 8002)
FastAPI + LangGraph. Subscribes to exchange `model_arena.candidates`, routing key `model_arena.candidates.responded` only.

On receiving an `ExperimentEvent`:
1. Build the two judges from `judgeConfigs`.
2. For each judge, call its LLM with the topic, `judgeConfigs`, and `scoreCards` to score every score card per candidate (`JudgeScoreSheet[]`), and append the result to `ExperimentCache.messages` in Redis.
3. When both judges have responded, publish the event to exchange `model_arena.judges`, routing key `model_arena.judges.responded`.

### score-agent (port 8003)
FastAPI + LangGraph. Subscribes to exchange `model_arena.judges`, routing key `model_arena.judges.responded` only.

On receiving an `ExperimentEvent`: tally each judge's `JudgeScoreSheet[]` into a `ScoreResponse` (per-candidate totals, winner, tie), append it to `ExperimentCache.messages` in Redis, then publish the event to exchange `model_arena.scores`, routing key `model_arena.scores.responded`.

### recover-service (port 8004)
NestJS background sweeper — no LLM, no user-facing API beyond a health check. Recovers experiments stuck mid-pipeline (an agent crashed, a message was dropped).

- Runs on a fixed interval (`SWEEP_INTERVAL_SECONDS`, default 30s): scans `experiments` in Postgres for `status = running`.
- For each running experiment, loads its `ExperimentCache` from Redis, guarded by a short-lived per-experiment Redis lock so only one sweep instance acts on it.
  - Cache missing entirely → mark the experiment `failed`.
  - Cache updated within `STALE_THRESHOLD_SECONDS` (default 120s) → skip, still legitimately in progress.
  - `retryCount` ≥ `MAX_RETRIES` (default 3) → mark the experiment `failed`.
  - Otherwise: determine which stage (candidate/judge/score) is stuck by comparing messages present vs. expected, strip that stage's partial messages, bump `retryCount` and `updatedAt`, and re-publish the event to that stage's exchange/routing key — or, if every stage already replied but the experiment was never marked `completed`, replay the final `model_arena.scores.responded` event.
- This makes the pipeline self-healing without a central orchestrator: recovery is just another choreography participant that re-emits the appropriate event.

### Infrastructure
- **PostgreSQL (port 5432)** — `experiments` and `results` tables (`arena` database), shared by backend and recover-service.
- **Redis** — live `ExperimentCache` per experiment during pipeline execution.
- **RabbitMQ (port 5672)** — topic exchanges choreographing the pipeline: `model_arena.experiment`, `model_arena.candidates`, `model_arena.judges`, `model_arena.scores`.

---

## Workflow

### New experiment

1. User configures Topic, Candidate 1/2, and Judge 1/2 on the New Experiment page and clicks Start.
2. Frontend `POST /api/experiments` → backend creates the experiment in PostgreSQL (`status: running`), seeds an `ExperimentCache` in Redis, publishes `model_arena.experiment.created`, and returns `{ uuid }`.
3. Frontend opens a WebSocket to `/ws/experiments?uuid={uuid}`.
4. **candidate-agent** runs both candidates for `rounds` rounds, appending each `CandidateResponse` to the Redis cache, then publishes `model_arena.candidates.responded`.
5. **judge-agent** runs both judges over the full transcript and score cards, appending each `JudgeScoreSheet[]` to the Redis cache, then publishes `model_arena.judges.responded`.
6. **score-agent** tallies the judges' scores into a `ScoreResponse`, appends it to the Redis cache, then publishes `model_arena.scores.responded`.
7. Throughout steps 4-6, the backend's WebSocket gateway polls the Redis cache and streams updates to the frontend; the UI renders each new `Message` as it arrives.
8. On `model_arena.scores.responded`, the backend persists the full cache to `results`, marks the experiment `completed`, and stops polling Redis for that connection.

### Recovery (self-healing)

1. `recover-service` sweeps `experiments` with `status = running` every `SWEEP_INTERVAL_SECONDS`.
2. For any experiment whose Redis cache is stale (not updated within `STALE_THRESHOLD_SECONDS`) and under `MAX_RETRIES`, it identifies the stuck stage, strips that stage's partial messages, bumps `retryCount`/`updatedAt`, and re-publishes the event for that stage — letting the appropriate agent pick up where the pipeline stalled.
3. Experiments with a missing cache, or that have exhausted `MAX_RETRIES`, are marked `failed`.

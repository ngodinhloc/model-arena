# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Model Arena is a **choreographed, event-driven** platform for benchmarking LLMs against each other: two candidate
models debate a topic, two judge models score the debate on five rubric cards, and a deterministic score agent
tallies totals and asks an arbiter LLM to declare a winner. There is **no central orchestrator** — each stage is
an independent service that consumes one RabbitMQ event, does its work, appends to a shared Redis cache
(streamed live to the browser over WebSocket), and publishes the next event. See `README.md` for the full
architecture diagram, REST/WS API reference, RabbitMQ topology, and an annotated example run — it's kept
current and is the best first read for understanding any given service in depth.

## Services

| Service | Port | Directory | Stack |
|---------|------|-----------|-------|
| frontend | 3000 | `frontend/` | Next.js 16 · React 19 · Tailwind CSS 4 · Recharts |
| backend | 8000 | `backend/` | NestJS 11 · TypeORM · PostgreSQL · Redis · RabbitMQ |
| candidate-agent | 8001 | `candidate-agent/` | FastAPI · LangGraph · LangChain (Anthropic) |
| judge-agent | 8002 | `judge-agent/` | FastAPI · LangGraph · LangChain (Anthropic) |
| score-agent | 8003 | `score-agent/` | FastAPI · LangGraph · LangChain (Anthropic arbiter) |
| recover-service | 8004 | `recover-service/` | NestJS 11 · TypeORM · `@nestjs/schedule` |

Pipeline: `backend → candidate-agent → judge-agent → score-agent → backend`, each hop over a dedicated RabbitMQ
topic exchange, plus `recover-service` sweeping in the background to detect and replay stalled stages.

## Commands

There are no automated test suites in this repo. Verification is: type-checking, Python syntax checks, and
tracing behavior through logs/REST calls — **not** browser screenshots (see Notes below).

```bash
# Run everything (each Python agent needs its own ANTHROPIC_API_KEY in <agent>/.env, copied from .env.example)
docker compose up --build

# Backend / recover-service (NestJS) — from the service directory
npm run start:dev   # nest start --watch (hot reload; already running inside docker compose)
npm run build        # nest build
npm run lint          # eslint src --ext .ts
npx tsc --noEmit      # type-check without emitting — primary verification method

# Frontend (Next.js) — from frontend/
npm run dev
npm run build
npm run lint
npx tsc --noEmit

# Python agents (candidate-agent / judge-agent / score-agent) — from the agent directory
python3 -c "import ast; ast.parse(open(f).read())"   # syntax check a single file, no test runner exists
```

Health checks: `curl http://localhost:8000/api/health` (backend), `http://localhost:8004/api/health`
(recover-service). RabbitMQ management UI: `http://localhost:15672` (`guest`/`guest`).

## Architecture notes that span multiple files

- **The shared event contract is hand-mirrored in five places** and must be kept in sync manually:
  `backend/src/experiment/contracts/experiment.interface.ts`, each Python agent's
  `app/contracts/experiment_interface.py` (candidate-agent, judge-agent, score-agent), and
  `recover-service/src/recovery/contracts/experiment.interface.ts`. Adding a field to one without adding it to
  all five makes it silently vanish the moment any agent round-trips the cache — Pydantic ignores unknown
  fields on parse, and recover-service just won't know the field exists. recover-service treats
  `candidateConfigs`/`judgeConfigs`/`scoreCards` as opaque `unknown[]` and forwards them unchanged, so only
  top-level `ExperimentCache` fields need mirroring there.

- **Every consumer dispatches by the payload's `eventName` field, not the RabbitMQ routing key it arrived on.**
  A handler-map lookup lives in `MessageProcessor.process` in each service's `event`/`events` module. Publishing
  or replaying a message without setting `eventName` to match the target stage gets silently dropped with a
  "no handler registered" warning — this is the pattern documented in the `event-processor-pattern` skill and
  is the most common source of silent pipeline breakage.

- **Trace the whole pipeline before calling a change done.** This is choreographed with no central orchestrator:
  backend → candidate-agent → judge-agent → score-agent → backend, plus recover-service republishing into any
  of those same exchanges when a stage stalls. A change to message shape or actor/labeling conventions in one
  service can silently break matching logic downstream (e.g. judge-agent parses candidate actor strings) —
  check every consumer, not just the producer you're editing.

- **Catalog data is static, not database-backed.** Categories/topics/providers/models live in
  `backend/src/catalog/data/*.seed.ts` and are served in-memory by `CatalogService`.

- **`recover-service` finds the stuck stage by counting completed messages against expected counts**, not by
  looking at the last message in the array — a stage can finish while the handoff to the next stage is what's
  lost, so "last message" is not evidence of where the stall is. See `README.md`'s Recover Service section for
  the full reasoning; it's subtle and worth reading before touching `recover-service/src/recovery`.

- Docker compose hot-reloads everything: `backend` and `recover-service` run `nest start --watch`, the Python
  agents run `uvicorn --reload`. Saving a file restarts that service automatically — never run a manual restart,
  and expect a brief WebSocket disconnect on the frontend during a backend restart.

## Working conventions

- **Do not take screenshots to verify UI changes.** Use `tsc --noEmit`, Python syntax checks, `docker compose
  logs <service>`, and `curl` against the REST endpoints instead.
- Match existing Tailwind utility patterns, color choices, and component structure already used in
  `frontend/src/components` rather than inventing new patterns for similar UI.

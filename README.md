# ModelArena

LLM evaluation & debate platform — two LLM candidates debate a topic, multiple LLM judges score them, and a deterministic score agent declares the winner. Fully choreographed, event-driven architecture (RabbitMQ) with no central orchestrator; live progress is streamed to the browser over WebSocket from a shared Redis cache.

See [SPECS.md](SPECS.md) for the specification and [PLANS.md](PLANS.md) for the implementation plan.

## Architecture

```
Frontend (Next.js 16) ──POST /api/experiments──▶ Backend (NestJS 11)
    │                                               │ publish model_arena.experiment.created
    │  WS /ws/experiments/{uuid}                    ▼
    ◀── backend polls Redis, streams ──── Candidate Agent (FastAPI + LangGraph, 2 LLM calls)
                                                    │ model_arena.candidates.responded
                                                    ▼
                                          Judge Agent (FastAPI + LangGraph, 2 LLM calls)
                                                    │ model_arena.judges.responded
                                                    ▼
                                          Score Agent (totals + arbiter LLM verdict)
                                                    │ model_arena.scores.responded
                                                    ▼
                                Backend consumer: persist results, mark experiment completed
```

| Service | Port | Stack |
|---------|------|-------|
| frontend | 3000 | Next.js 16, React 19, Tailwind 4 |
| backend | 8000 | NestJS 11, TypeORM, PostgreSQL, Redis, RabbitMQ |
| candidate-agent | 8001 | FastAPI, LangGraph, LangChain (Anthropic + OpenAI) |
| judge-agent | 8002 | FastAPI, LangGraph, LangChain (Anthropic + OpenAI) |
| score-agent | 8003 | FastAPI + arbiter LLM (winner decision) |
| rabbitmq | 5672 / 15672 | topic exchanges per pipeline stage |
| postgres | 5432 | experiments, results, catalog |
| redis | internal | live `experiment:{uuid}` cache |

## Running

Each LLM-calling agent has its own `.env` (see the `.env.example` next to it):

```bash
for svc in candidate-agent judge-agent score-agent; do
  cp $svc/.env.example $svc/.env   # fill in ANTHROPIC_API_KEY (add OPENAI_API_KEY=... only if you use OpenAI models)
done
docker compose up --build
```

Then open http://localhost:3000, pick a category/topic, configure two candidates and two judges, and hit **Start Experiment**.

## Notes

- Candidate 1 argues FOR the topic, Candidate 2 AGAINST.
- Each judge scores both candidates on 5 fixed score cards (0–20 each, 100 max per judge per candidate); totals across 2 judges max out at 200 per candidate.
- The score agent sums the points deterministically, then feeds the judge score sheets to an arbiter LLM (`SCORE_PROVIDER`/`SCORE_MODEL`, default `anthropic/claude-opus-4-8`) which declares the winner with a written justification — on tied totals it still must pick one and explain the tie-break.
- The temperature dropdown is ignored for Anthropic models that reject sampling parameters (Opus 4.7+, Sonnet 5).
- Model catalog, categories, and topics are seeded on backend boot — edit `backend/src/catalog/seed/catalog.seed.ts`.

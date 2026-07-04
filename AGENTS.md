# Agent Instructions

- Do not take screenshots to verify UI changes.

## Best practices

- **Verify without screenshots.** Use `tsc --noEmit` (backend, frontend) and a Python syntax check
  (`python3 -c "import ast; ast.parse(open(f).read())"`) for the FastAPI agents. For runtime behavior,
  read `docker compose logs <service>` and hit the REST endpoints with `curl` rather than opening a browser.
- **Keep the shared event contract in sync.** `ExperimentEvent`/`Message`/etc. are duplicated in
  `backend/src/experiment/contracts/experiment.interface.ts` (TypeScript) and in each Python agent's
  `app/contracts/experiment_interface.py` (candidate-agent, judge-agent, score-agent). A field added to
  one must be added to all four, or the RabbitMQ payload silently drops it on the Python side (Pydantic
  ignores unknown fields by default).
- **Trace the whole pipeline before calling a change done.** This is a choreographed, event-driven system
  with no central orchestrator: backend → candidate-agent → judge-agent → score-agent → backend, each hop
  over RabbitMQ. A change to message shape or actor/labeling conventions in one service can silently break
  matching logic downstream (e.g. judge-agent parses candidate actor strings) — check every consumer, not
  just the producer you're editing.
- **Docker compose hot-reloads everything.** `backend` runs `nest start --watch`; the Python agents run
  `uvicorn --reload`. Saving a file restarts that service's process automatically — never run a manual
  restart, and expect a brief WebSocket disconnect on the frontend during a backend restart.
- **Match existing conventions before introducing new ones.** Follow the Tailwind utility patterns, color
  choices, and component structure already used in `frontend/src/components` rather than inventing new
  patterns for similar UI.

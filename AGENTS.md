# Agent Instructions

- Do not take screenshots to verify UI changes.

## Best practices

- **Verify without screenshots.** Use `tsc --noEmit` (backend, frontend, recover-service) and a Python syntax
  check (`python3 -c "import ast; ast.parse(open(f).read())"`) for the FastAPI agents. For runtime behavior,
  read `docker compose logs <service>` and hit the REST endpoints with `curl` rather than opening a browser.
- **Keep the shared event contract in sync.** `ExperimentEvent`/`ExperimentCache`/`Message`/etc. are hand-mirrored
  in five places: `backend/src/experiment/contracts/experiment.interface.ts`, each Python agent's
  `app/contracts/experiment_interface.py` (candidate-agent, judge-agent, score-agent), and
  `recover-service/src/recovery/contracts/experiment.interface.ts`. A field added to one must be added to all
  five, or it silently vanishes the moment any agent round-trips the cache (Pydantic ignores unknown fields on
  parse; recover-service just doesn't know the field exists). recover-service treats `candidateConfigs`/
  `judgeConfigs`/`scoreCards` as opaque `unknown[]` and forwards them unchanged, so only top-level
  `ExperimentCache` fields need mirroring there.
- **Trace the whole pipeline before calling a change done.** This is a choreographed, event-driven system with
  no central orchestrator: backend → candidate-agent → judge-agent → score-agent → backend, each hop over
  RabbitMQ, plus recover-service sweeping in the background and republishing into any of those same four
  exchanges when a stage stalls. A change to message shape or actor/labeling conventions in one service can
  silently break matching logic downstream (e.g. judge-agent parses candidate actor strings) — check every
  consumer, not just the producer you're editing. Every consumer dispatches by the payload's `eventName`
  *field*, not the RabbitMQ routing key it arrived on — a handler-map lookup lives in `MessageProcessor.process`
  (backend, see `backend/src/event/`) and equivalents in each agent, so republishing a message without setting
  `eventName` to match the target stage gets silently dropped with a "no handler registered" warning.
- **Docker compose hot-reloads everything.** `backend` and `recover-service` run `nest start --watch`; the
  Python agents run `uvicorn --reload`. Saving a file restarts that service's process automatically — never
  run a manual restart, and expect a brief WebSocket disconnect on the frontend during a backend restart.
- **Match existing conventions before introducing new ones.** Follow the Tailwind utility patterns, color
  choices, and component structure already used in `frontend/src/components` rather than inventing new
  patterns for similar UI.

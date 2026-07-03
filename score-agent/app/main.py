import asyncio
import json
import logging
import os
import time
from datetime import datetime, timezone
from contextlib import asynccontextmanager, suppress
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from aiormq.exceptions import ConnectionClosed
from app.configs.settings import settings
from app.container import container
from app.routers import health_router


_STANDARD_LOG_ATTRS = {
    "args", "created", "exc_info", "exc_text", "filename", "funcName",
    "levelname", "levelno", "lineno", "message", "module", "msecs",
    "msg", "name", "pathname", "process", "processName", "relativeCreated",
    "stack_info", "thread", "threadName", "taskName",
}

_APP_ENV = os.environ.get("APP_ENV", "DEV")
_SERVICE_NAME = os.environ.get("SERVICE_NAME", "score-agent")
_LEVEL_LABELS = {"DEBUG": "DEBUG", "INFO": "INFO", "WARNING": "WARN", "ERROR": "ERROR", "CRITICAL": "CRITICAL"}


class _LogFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        extra = {k: v for k, v in record.__dict__.items() if k not in _STANDARD_LOG_ATTRS}
        msg = record.getMessage()
        exc = self.formatException(record.exc_info) if record.exc_info else None
        if _APP_ENV == "PROD":
            entry = {
                "@timestamp": datetime.fromtimestamp(record.created, tz=timezone.utc).isoformat(),
                "log.level": record.levelname,
                "message": msg,
                "service.name": _SERVICE_NAME,
                **extra,
            }
            if exc:
                entry["error.stack_trace"] = exc
            return json.dumps(entry, default=str)
        level = _LEVEL_LABELS.get(record.levelname, record.levelname)
        ctx = f" {json.dumps(extra, default=str)}" if extra else ""
        return f"[{level}] {msg}{ctx}\n{exc}" if exc else f"[{level}] {msg}{ctx}"


_handler = logging.StreamHandler()
_handler.setFormatter(_LogFormatter())
logging.basicConfig(level=logging.INFO, handlers=[_handler], force=True)
logging.getLogger("watchfiles").setLevel(logging.WARNING)
logger = logging.getLogger("http")


class _HealthFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        return "/api/health" not in record.getMessage()


logging.getLogger("uvicorn.access").addFilter(_HealthFilter())


@asynccontextmanager
async def lifespan(app: FastAPI):
    task = asyncio.create_task(container.rabbitmq_consumer.start())
    yield
    task.cancel()
    with suppress(asyncio.CancelledError, ConnectionClosed):
        await task


app = FastAPI(title="Score Agent API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def log_requests(request: Request, call_next):
    start = time.time()
    response = await call_next(request)
    if request.url.path != "/api/health":
        ms = int((time.time() - start) * 1000)
        logger.info("%s %s %s %dms", request.method, request.url.path, response.status_code, ms)
    return response


app.include_router(health_router.router, prefix="/api")

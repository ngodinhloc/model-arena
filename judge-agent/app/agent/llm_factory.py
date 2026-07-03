from __future__ import annotations
from langchain.chat_models import init_chat_model
from langchain_core.language_models.chat_models import BaseChatModel

# Anthropic models from Opus 4.7 onward reject sampling parameters (400 if sent).
NO_SAMPLING_PARAM_PREFIXES = (
    "claude-opus-4-7",
    "claude-opus-4-8",
    "claude-sonnet-5",
    "claude-fable-5",
    "claude-mythos",
)


def supports_temperature(provider: str, model: str) -> bool:
    if provider == "anthropic" and model.startswith(NO_SAMPLING_PARAM_PREFIXES):
        return False
    return True


def build_llm(provider: str, model: str, temperature: float) -> BaseChatModel:
    kwargs: dict = {"max_tokens": 4096}
    if supports_temperature(provider, model):
        kwargs["temperature"] = temperature
    return init_chat_model(model, model_provider=provider, **kwargs)

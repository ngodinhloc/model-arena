from __future__ import annotations
from langchain.chat_models import init_chat_model
from langchain_core.language_models.chat_models import BaseChatModel


class ModelFactory:
    # Anthropic models from Opus 4.7 onward reject sampling parameters (400 if sent).
    NO_SAMPLING_PARAM_PREFIXES = (
        "claude-opus-4-7",
        "claude-opus-4-8",
        "claude-sonnet-5",
        "claude-fable-5",
        "claude-mythos",
    )

    def build(self, provider: str, model: str, temperature: float) -> BaseChatModel:
        kwargs: dict = {"max_tokens": 4096}
        if self.supports_temperature(provider, model):
            kwargs["temperature"] = temperature
        return init_chat_model(model, model_provider=provider, **kwargs)

    def supports_temperature(self, provider: str, model: str) -> bool:
        if provider == "anthropic" and model.startswith(self.NO_SAMPLING_PARAM_PREFIXES):
            return False
        return True

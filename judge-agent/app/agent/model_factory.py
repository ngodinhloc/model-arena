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
    )

    # These run adaptive thinking by default when `thinking` is omitted (Sonnet 5) or
    # unconditionally (Fable 5), sharing max_tokens with the final answer — pin them to
    # adaptive + low effort so thinking can't consume the whole budget and leave nothing
    # for the structured response. Opus 4.7/4.8 have thinking off by default and don't
    # need this.
    ADAPTIVE_THINKING_PREFIXES = (
        "claude-sonnet-5",
        "claude-fable-5",
    )

    def build(self, provider: str, model: str, temperature: float) -> BaseChatModel:
        kwargs: dict = {"max_tokens": 4096}
        if self.supports_temperature(provider, model):
            kwargs["temperature"] = temperature
        if provider == "anthropic" and model.startswith(self.ADAPTIVE_THINKING_PREFIXES):
            kwargs["thinking"] = {"type": "adaptive"}
            kwargs["effort"] = "low"
        return init_chat_model(model, model_provider=provider, **kwargs)

    def supports_temperature(self, provider: str, model: str) -> bool:
        if provider == "anthropic" and model.startswith(self.NO_SAMPLING_PARAM_PREFIXES):
            return False
        return True

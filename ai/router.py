from enum import Enum

class ModelType(Enum):
    FAST = "fast"
    REASONING = "reasoning"
    VISION = "vision"

class ModelRouter:
    def __init__(self, providers: dict, fallbacks: dict | None = None):
        self.providers = providers
        self.fallbacks = fallbacks or {}

    def route(self, request_type: ModelType, payload: dict):
        provider = self.providers.get(request_type)
        if provider is None:
            raise ValueError(f"No provider configured for {request_type}")
        try:
            return provider.execute(payload)
        except Exception:
            fallback = self.fallbacks.get(request_type)
            if fallback is None:
                raise
            return fallback.execute(payload)

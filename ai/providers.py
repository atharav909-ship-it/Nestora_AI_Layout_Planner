"""Hosted Gemini adapters. Tool calls are explicit and read-only by default."""
import json
import os
from abc import ABC, abstractmethod

from google import genai
from google.genai import types
from pydantic import ValidationError

from ai.schemas import DesignIntent, IMAGE_ANALYSIS_SCHEMA


class AIProviderError(RuntimeError):
    pass


class MissingAIKey(AIProviderError):
    pass


def get_client():
    key = os.getenv("GEMINI_API_KEY")
    if not key:
        raise MissingAIKey("GEMINI_API_KEY is not configured")
    return genai.Client(api_key=key)


def generate_content(**kwargs):
    """Keep the Gemini client alive for the whole request and close it afterward."""
    client = get_client()
    try:
        return client.models.generate_content(**kwargs)
    finally:
        client.close()


def parse_json_response(response):
    raw = getattr(response, "text", None)
    if not raw or not isinstance(raw, str):
        raise AIProviderError("Model returned no text")
    raw = raw.strip()
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
    try:
        result = json.loads(raw)
    except (ValueError, TypeError) as exc:
        raise AIProviderError("Model returned invalid JSON") from exc
    if not isinstance(result, dict):
        raise AIProviderError("Expected a JSON object")
    return result


class BaseProvider(ABC):
    @abstractmethod
    def execute(self, payload: dict) -> dict:
        ...


class GeminiReasoningProvider(BaseProvider):
    def __init__(self, model_name=None):
        self.model_name = model_name or os.getenv(
            "GEMINI_REASONING_MODEL", os.getenv("GEMINI_MODEL", "gemini-3.8-flash")
        )

    def execute(self, payload: dict) -> dict:
        prompt = payload["system_prompt"] + "\n" + json.dumps(payload["context"], default=str)
        response = generate_content(
            model=self.model_name,
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json", temperature=0.2
            ),
        )
        return parse_json_response(response)


class GeminiFastProvider(BaseProvider):
    def __init__(self, model_name=None):
        self.model_name = model_name or os.getenv(
            "GEMINI_FAST_MODEL", os.getenv("GEMINI_MODEL", "gemini-3.8-flash")
        )

    def execute(self, payload: dict) -> dict:
        # Intent parsing must not trigger side-effectful tools or unbounded automatic calls.
        prompt = payload["system_prompt"] + "\n\nUser Request:\n" + payload["instruction"]
        response = generate_content(
            model=self.model_name,
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json", temperature=0.1
            ),
        )
        try:
            return DesignIntent.model_validate(parse_json_response(response)).model_dump(
                exclude_unset=True
            )
        except ValidationError as exc:
            raise AIProviderError("Model returned an invalid design intent") from exc


class GeminiVisionProvider(BaseProvider):
    def __init__(self, model_name=None):
        self.model_name = model_name or os.getenv(
            "GEMINI_VISION_MODEL", os.getenv("GEMINI_MODEL", "gemini-3.8-flash")
        )

    def execute(self, payload: dict) -> dict:
        response = generate_content(
            model=self.model_name,
            contents=[
                types.Part.from_bytes(
                    data=payload["image_bytes"], mime_type=payload["mime_type"]
                ),
                payload["system_prompt"],
            ],
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=IMAGE_ANALYSIS_SCHEMA,
            ),
        )
        return parse_json_response(response)

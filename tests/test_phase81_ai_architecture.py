import pytest
from ai.router import ModelRouter, ModelType
from ai.providers import GeminiFastProvider, AIProviderError, MissingAIKey
from ai.tools import ToolRegistry, ToolInterface, CatalogSearchSchema

class Fake:
    def __init__(self, value=None, fail=False):
        self.value, self.fail = value, fail
    def execute(self, payload):
        if self.fail: raise RuntimeError("provider failed")
        return self.value

def test_router():
    assert ModelRouter({ModelType.FAST: Fake({"ok": 1})}).route(ModelType.FAST, {}) == {"ok": 1}

def test_fallback():
    r = ModelRouter({ModelType.FAST: Fake(fail=True)}, {ModelType.FAST: Fake({"ok": 2})})
    assert r.route(ModelType.FAST, {}) == {"ok": 2}

def test_tool_rejects_unknown():
    assert ToolRegistry().execute("not_registered", {})["error"] == "Unknown tool"

def test_tool_validation():
    r = ToolRegistry()
    r.register(ToolInterface("search", "test", lambda **kw: kw, CatalogSearchSchema))
    assert "error" in r.execute("search", {"max_width": -1})
    assert "error" in r.execute("search", {"made_up": True})
    assert r.execute("search", {"max_width": 24}) == {"max_width": 24}

def test_model_roles_configurable(monkeypatch):
    monkeypatch.setenv("GEMINI_FAST_MODEL", "test-fast-model")
    assert GeminiFastProvider().model_name == "test-fast-model"

def test_missing_key(monkeypatch):
    from ai.providers import get_client
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    with pytest.raises(MissingAIKey): get_client()

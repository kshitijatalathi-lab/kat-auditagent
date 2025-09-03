import os
import types
import pytest

from adk.services.audit_utils import (
    framework_for_policy_type,
    clamp_top_k,
    normalize_question,
    stable_session_id,
)
from adk.llm.mcp_router import LLMRouter
from adk.orchestrator import Orchestrator


# ---------- Utils ----------

def test_utils_framework_for_policy_type():
    assert framework_for_policy_type("gdpr") == "GDPR"
    assert framework_for_policy_type("hr") == "GDPR"
    assert framework_for_policy_type("dpdp") == "DPDP"
    assert framework_for_policy_type("") == "GDPR"


def test_utils_clamp_top_k():
    assert clamp_top_k(1) == 3
    assert clamp_top_k(10) == 10
    assert clamp_top_k(999) == 30
    assert clamp_top_k("bad") == 3


def test_utils_normalize_and_session_id():
    item = {"title": "Check encryption", "text": "ignored"}
    assert normalize_question(item) == "Check encryption"
    assert stable_session_id("acme", "/tmp/policy.pdf").startswith("audit:acme:policy.pdf")


# ---------- LLM Router (Groq path) ----------
@pytest.mark.asyncio
async def test_llm_router_groq_generate(monkeypatch):
    # Ensure only GROQ path is considered
    monkeypatch.setenv("GROQ_API_KEY", "dummy")
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.delenv("GOOGLE_API_KEY", raising=False)
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)

    # Fake httpx AsyncClient
    class FakeResp:
        def __init__(self):
            self.status_code = 200
        def json(self):
            return {
                "choices": [
                    {"message": {"content": "hello from groq mock"}}
                ]
            }
        @property
        def text(self):
            return "ok"

    class FakeClient:
        def __init__(self, *args, **kwargs):
            pass
        async def __aenter__(self):
            return self
        async def __aexit__(self, exc_type, exc, tb):
            return False
        async def post(self, *args, **kwargs):
            return FakeResp()

    import httpx
    monkeypatch.setattr(httpx, "AsyncClient", FakeClient)

    router = LLMRouter()
    res = await router.generate("ping", prefer="groq")
    assert res is not None
    assert res.provider == "groq"
    assert "hello from groq" in res.text


# ---------- Orchestrator score_batch ----------
@pytest.mark.asyncio
async def test_orchestrator_score_batch(monkeypatch):
    orch = Orchestrator()

    # Fakes for internal agents
    class FakeRetriever:
        def search(self, q, k=5, framework="GDPR"):
            return [{"id": "c1", "text": "clause text"}]

    class Bundle:
        def __init__(self, prompt, clauses):
            self.prompt = prompt
            self.clauses = clauses

    class FakePromptBuilder:
        def build(self, q, a, clauses):
            return Bundle(prompt=f"PROMPT::{q}", clauses=clauses)

    class FakeScoreResult:
        def __init__(self):
            self.score = 4
            self.rationale = "good"
            self.provider = "mock"
            self.model = "mock-1"

    class FakeScorer:
        async def score(self, prompt: str):
            assert prompt.startswith("PROMPT::")
            return FakeScoreResult()

    class FakeSessions:
        def make_event(self, **kwargs):
            return kwargs
        def log(self, evt):
            # no-op
            return None

    # Monkeypatch agents
    orch.retriever = FakeRetriever()
    orch.prompt_builder = FakePromptBuilder()
    orch.scorer = FakeScorer()
    orch.sessions = FakeSessions()

    items = [
        {"question": "Is data encrypted?", "user_answer": "Yes"},
        {"question": "Do we have RBAC?", "user_answer": "Yes"},
    ]

    out = await orch.score_batch(
        session_id="s1",
        org_id="acme",
        user_id="u1",
        framework="GDPR",
        items=items,
        k=3,
    )

    assert "items" in out and len(out["items"]) == 2
    assert out["composite_score"] == pytest.approx(4.0)
    for r in out["items"]:
        assert r["score"] == 4
        assert r["llm_provider"] == "mock"
        assert r["llm_model"] == "mock-1"

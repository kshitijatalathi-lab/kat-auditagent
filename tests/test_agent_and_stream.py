from fastapi.testclient import TestClient
import types

from api import app
import adk.http.router as adk_router

client = TestClient(app)


def setup_module(_):
    # Provide a fake orchestrator for agent and streaming endpoints
    fake = types.SimpleNamespace()

    async def score_question(**kwargs):
        return {
            "score": 5,
            "rationale": "This is a streamed rationale that should be chunked.",
            "llm_provider": "test",
            "llm_model": "gpt",
            "clauses": [{"id": 1, "text": "c1"}, {"id": 2, "text": "c2"}],
        }

    def index_documents(files):
        return {"index_path": "/tmp/index.faiss", "meta_path": "/tmp/meta.json", "count": len(files)}

    def compute_gaps(scored_items, min_score):
        items = [it for it in scored_items if int(it.get("score", 0)) < int(min_score)]
        return {"count": len(items), "items": items}

    def generate_report(**kwargs):
        return {"json_path": "/tmp/r.json", "pdf_path": "/tmp/r.pdf"}
    
    def annotate_policy(file, gaps, out_path=None):
        return {"annotated_path": out_path or "/tmp/annotated.pdf"}

    fake.score_question = score_question
    fake.index_documents = index_documents
    fake.compute_gaps = compute_gaps
    fake.generate_report = generate_report
    fake.annotate_policy = annotate_policy

    adk_router._orch = fake  # type: ignore


def test_agent_run_index_documents():
    r = client.post("/ai/agent/run", json={"tool": "index_documents", "args": {"files": ["/tmp/a.pdf"]}})
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is True
    assert body["result"]["count"] == 1


def test_agent_run_score_question():
    args = {
        "session_id": "s1",
        "org_id": "o1",
        "user_id": "u1",
        "framework": "GDPR",
        "checklist_question": "Q?",
        "user_answer": "A",
        "k": 3,
    }
    r = client.post("/ai/agent/run", json={"tool": "score_question", "args": args})
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is True
    assert body["result"]["score"] == 5


def test_stream_score_sse():
    payload = {
        "session_id": "s1",
        "org_id": "o1",
        "user_id": "u1",
        "framework": "GDPR",
        "checklist_question": "Q?",
        "user_answer": "A",
        "k": 3,
    }
    with client.stream("POST", "/adk/score/stream", json=payload) as r:
        assert r.status_code == 200
        # Read the event-stream body as chunks
        buf = b"".join(list(r.iter_bytes()))
    text = buf.decode("utf-8")
    # Expect clauses first, then rationale deltas, then final and [DONE]
    assert "\n\n" in text or text  # ensure some separators
    assert '"type": "clauses"' in text
    assert '"type": "final"' in text
    assert "[DONE]" in text

from fastapi.testclient import TestClient
import types

from api import app
import adk.http.router as adk_router


client = TestClient(app)


def setup_module(_):
    # Monkeypatch orchestrator methods with simple fakes
    fake = types.SimpleNamespace()

    async def score_question(**kwargs):
        return {
            "score": 4,
            "rationale": "ok",
            "llm_provider": "test",
            "llm_model": "gpt",
            "clauses": [{"id": 1, "text": "clause"}],
        }

    def generate_report(**kwargs):
        return {
            "json_path": "/tmp/report.json",
            "pdf_path": "/tmp/report.pdf",
            "json_gcs": None,
            "pdf_gcs": None,
        }

    def index_documents(files):
        return {"index_path": "/tmp/index.faiss", "meta_path": "/tmp/meta.json", "count": len(files)}

    def generate_checklist(**kwargs):
        return {"framework": kwargs.get("framework", "GDPR"), "version": "1.0", "items": [{"question": "Q1"}]}

    async def score_batch(**kwargs):
        items = kwargs.get("items", [])
        return {"items": [{"question": it["question"], "score": 3} for it in items], "composite_score": 3.0}

    def compute_gaps(scored_items, min_score):
        items = [it for it in scored_items if int(it.get("score", 0)) < int(min_score)]
        return {"count": len(items), "items": items}

    def annotate_policy(file, gaps, out_path=None):
        return {"annotated_path": out_path or "/tmp/annotated.pdf"}

    fake.score_question = score_question
    fake.generate_report = generate_report
    fake.index_documents = index_documents
    fake.generate_checklist = generate_checklist
    fake.score_batch = score_batch
    fake.compute_gaps = compute_gaps
    fake.annotate_policy = annotate_policy

    adk_router._orch = fake  # type: ignore
    # Ensure checklist loader returns a string version
    adk_router.ck.load_checklist = lambda framework: {"framework": framework, "version": "1.0", "items": [{"id": "q1", "question": "Q1"}]}


def test_health():
    r = client.get("/health")
    assert r.status_code == 200
    assert "status" in r.json()


def test_score():
    r = client.post(
        "/adk/score",
        json={
            "session_id": "s1",
            "org_id": "o1",
            "user_id": "u1",
            "checklist_question": "What is X?",
            "user_answer": "Answer",
            "k": 3,
            "framework": "GDPR",
        },
    )
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is True
    assert body["score"] == 4
    assert body["provider"] == "test"


def test_report():
    r = client.post(
        "/adk/report",
        json={
            "session_id": "s1",
            "org_id": "o1",
            "items": [
                {
                    "question": "Q1",
                    "user_answer": "A1",
                    "score": 3,
                    "rationale": "",
                    "llm_provider": "p",
                    "llm_model": "m",
                    "clauses": [],
                }
            ],
        },
    )
    assert r.status_code == 200
    body = r.json()
    assert "json_path" in body and "pdf_path" in body


def test_index():
    r = client.post("/adk/index", json={"files": ["/tmp/a.pdf", "/tmp/b.pdf"]})
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is True
    assert body["count"] == 2


def test_checklists():
    r = client.get("/adk/checklists/GDPR")
    assert r.status_code == 200
    body = r.json()
    assert body["framework"] == "GDPR"
    assert isinstance(body["items"], list)


def test_checklist_generate():
    r = client.post(
        "/adk/checklist/generate",
        json={"framework": "GDPR", "files": ["/tmp/policy.pdf"], "top_n": 10},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["framework"] == "GDPR"
    assert len(body["items"]) >= 1


def test_score_batch():
    r = client.post(
        "/adk/score/batch",
        json={
            "session_id": "s1",
            "org_id": "o1",
            "user_id": "u1",
            "framework": "GDPR",
            "items": [{"question": "Q1", "user_answer": "A1"}],
            "k": 3,
        },
    )
    assert r.status_code == 200
    body = r.json()
    assert body["composite_score"] == 3.0
    assert len(body["items"]) == 1


def test_gaps():
    r = client.post(
        "/adk/gaps",
        json={
            "scored_items": [
                {"question": "Q1", "score": 2},
                {"question": "Q2", "score": 5},
            ],
            "min_score": 4,
        },
    )
    assert r.status_code == 200
    body = r.json()
    assert body["count"] == 1
    assert body["items"][0]["question"] == "Q1"


def test_policy_annotate():
    r = client.post(
        "/adk/policy/annotate",
        json={"file": "/tmp/policy.pdf", "gaps": [], "out_path": "/tmp/out.pdf"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["annotated_path"].endswith("out.pdf")

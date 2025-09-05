from fastapi.testclient import TestClient
from api import app

client = TestClient(app)


def test_index_stats_endpoint():
    r = client.get("/adk/index/stats")
    assert r.status_code == 200
    body = r.json()
    assert isinstance(body, dict)
    assert "exists" in body
    assert "count" in body


def test_session_state_roundtrip(tmp_path):
    session_id = "sess-test-1"
    org_id = "org-xyz"

    # Initial save
    payload = {
        "session_id": session_id,
        "org_id": org_id,
        "answers": [
            {"id": "q1", "question": "Q1", "userAnswer": "A1", "score": 3}
        ],
        "meta": {"agent_runs": []},
    }
    r = client.post(f"/adk/sessions/{session_id}/state", json=payload)
    assert r.status_code == 200
    saved = r.json()
    assert saved["session_id"] == session_id
    assert saved["org_id"] == org_id
    assert isinstance(saved.get("meta", {}), dict)

    # Read back
    r2 = client.get(f"/adk/sessions/{session_id}/state", params={"org_id": org_id})
    assert r2.status_code == 200
    got = r2.json()
    assert got["session_id"] == session_id
    assert got["org_id"] == org_id
    assert len(got.get("answers", [])) == 1

    # Append an agent run and save again
    run = {"ts": "2025-01-01T00:00:00Z", "tool": "score_question", "args": {"x": 1}, "output": {"ok": True}}
    got_meta = got.get("meta", {})
    runs = list(got_meta.get("agent_runs", []))
    runs.append(run)
    got_meta["agent_runs"] = runs
    got["meta"] = got_meta

    r3 = client.post(f"/adk/sessions/{session_id}/state", json=got)
    assert r3.status_code == 200

    # Verify persisted
    r4 = client.get(f"/adk/sessions/{session_id}/state", params={"org_id": org_id})
    assert r4.status_code == 200
    final_state = r4.json()
    final_runs = final_state.get("meta", {}).get("agent_runs", [])
    assert isinstance(final_runs, list)
    assert any(rr.get("tool") == "score_question" for rr in final_runs)

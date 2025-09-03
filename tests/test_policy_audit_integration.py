from fastapi.testclient import TestClient
import os
import json
import api as api_module

app = api_module.app
client = TestClient(app)

def test_policy_audit_smoke():
    # Ensure sample file exists
    path = "uploads/comppoli.pdf"
    assert os.path.exists(path), f"Missing test file: {path}"

    payload = {
        "file_path": path,
        "org_id": "acme",
        "policy_type": "hr",
        "top_k": 6,
    }
    res = client.post("/adk/policy/audit", json=payload)
    assert res.status_code == 200, res.text
    data = res.json()

    # Basic fields
    assert isinstance(data.get("policy_type"), str)
    assert isinstance(data.get("composite"), (int, float))
    assert isinstance(data.get("checklist"), list)
    assert isinstance(data.get("scores"), list)
    assert isinstance(data.get("gaps"), list)

    # Report URLs are optional but if present must be strings
    if data.get("download_url") is not None:
        assert isinstance(data["download_url"], str)
    if data.get("annotated_url") is not None:
        assert isinstance(data["annotated_url"], str)

    # corrected_draft may be None if no LLM key; if present, it should be a string
    cd = data.get("corrected_draft")
    if cd is not None:
        assert isinstance(cd, str)

from fastapi.testclient import TestClient
import os
from pathlib import Path
import api as api_module

app = api_module.app
client = TestClient(app)

SAMPLE_PDF = "uploads/comppoli.pdf"

def _assert_common_audit_fields(data: dict):
    assert isinstance(data.get("policy_type"), str)
    assert isinstance(data.get("composite"), (int, float))
    assert isinstance(data.get("checklist"), list)
    assert isinstance(data.get("scores"), list)
    assert isinstance(data.get("gaps"), list)


def test_policy_audit_posh_mapping_smoke():
    assert os.path.exists(SAMPLE_PDF), f"Missing test file: {SAMPLE_PDF}"
    res = client.post("/adk/policy/audit", json={
        "file_path": SAMPLE_PDF,
        "org_id": "acme",
        "policy_type": "posh",
        "top_k": 5,
    })
    assert res.status_code == 200, res.text
    data = res.json()
    _assert_common_audit_fields(data)
    assert data.get("policy_type") == "posh"


def test_policy_audit_hipaa_mapping_smoke():
    assert os.path.exists(SAMPLE_PDF), f"Missing test file: {SAMPLE_PDF}"
    res = client.post("/adk/policy/audit", json={
        "file_path": SAMPLE_PDF,
        "org_id": "acme",
        "policy_type": "hipaa",
        "top_k": 5,
    })
    assert res.status_code == 200, res.text
    data = res.json()
    _assert_common_audit_fields(data)
    assert data.get("policy_type") == "hipaa"


def test_policy_annotate_creates_pdf(tmp_path: Path):
    assert os.path.exists(SAMPLE_PDF), f"Missing test file: {SAMPLE_PDF}"
    out_path = Path("reports") / "test_annotated.pdf"
    # ensure reports dir exists
    out_path.parent.mkdir(parents=True, exist_ok=True)

    gaps = [{
        "question": "Does the policy define data retention?",
        "score": 2,
        "suggestion": "Add a clear retention schedule in line with regulations.",
        "keywords": ["retention", "schedule", "data"],
    }]
    res = client.post("/adk/policy/annotate", json={
        "file": SAMPLE_PDF,
        "gaps": gaps,
        "out_path": str(out_path),
    })
    assert res.status_code == 200, res.text
    annotated_path = res.json().get("annotated_path")
    assert annotated_path and os.path.exists(annotated_path)
    # file should be non-empty
    assert os.path.getsize(annotated_path) > 0
    # cleanup
    try:
        os.remove(annotated_path)
    except Exception:
        pass

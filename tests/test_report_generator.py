import json
from pathlib import Path
import types

from adk.agents.report_generator import Report, ReportGeneratorAgent
from adk.config import settings as _settings


def test_report_generator_local_save(tmp_path, monkeypatch):
    # point processed_dir to tmp
    class FakeSettings(types.SimpleNamespace):
        processed_dir: Path
        gcs_bucket: str | None
        gcp_project: str | None

    fake_settings = FakeSettings(processed_dir=tmp_path, gcs_bucket=None, gcp_project=None)
    monkeypatch.setattr("adk.agents.report_generator.settings", fake_settings, raising=True)

    agent = ReportGeneratorAgent()
    rep = Report(session_id="s1", org_id="o1", items=[{"question": "Q1", "user_answer": "A1", "score": 3, "rationale": "r", "llm_provider": "p", "llm_model": "m", "clauses": []}])
    out = agent.generate_and_store(rep)

    # Files exist
    assert Path(out["json_path"]).exists()
    assert Path(out["pdf_path"]).exists()

    # JSON content includes session_id
    data = json.loads(Path(out["json_path"]).read_text(encoding="utf-8"))
    assert data["session_id"] == "s1"

    # No GCS since bucket None
    assert out["json_gcs"] is None
    assert out["pdf_gcs"] is None

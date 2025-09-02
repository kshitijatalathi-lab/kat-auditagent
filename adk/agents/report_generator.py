from __future__ import annotations

from dataclasses import dataclass, asdict
from typing import Any, Dict, List
from pathlib import Path
import json
import io

from adk.config import settings

try:
    from reportlab.lib.pagesizes import LETTER  # type: ignore
    from reportlab.pdfgen import canvas  # type: ignore
except Exception:
    LETTER = None  # type: ignore
    canvas = None  # type: ignore

try:
    from google.cloud import storage  # type: ignore
except Exception:
    storage = None  # type: ignore


@dataclass
class Report:
    session_id: str
    org_id: str
    items: List[Dict[str, Any]]  # each item has question, user_answer, score, rationale, clauses


class ReportGeneratorAgent:
    def __init__(self) -> None:
        self.bucket = settings.gcs_bucket

    def _save_json_local(self, report: Report) -> Path:
        out_dir = settings.processed_dir / "reports"
        out_dir.mkdir(parents=True, exist_ok=True)
        p = out_dir / f"{report.session_id}.json"
        p.write_text(json.dumps(asdict(report), ensure_ascii=False, indent=2), encoding="utf-8")
        return p

    def _save_pdf_local(self, report: Report) -> Path:
        out_dir = settings.processed_dir / "reports"
        out_dir.mkdir(parents=True, exist_ok=True)
        p = out_dir / f"{report.session_id}.pdf"
        if canvas is None:
            # Fallback: write a simple text-only representation
            txt = json.dumps(asdict(report), ensure_ascii=False, indent=2)
            p.write_text(txt, encoding="utf-8")
            return p
        c = canvas.Canvas(str(p), pagesize=LETTER)
        width, height = LETTER
        y = height - 72
        c.setFont("Helvetica", 12)
        c.drawString(72, y, f"Audit Report: {report.session_id} | Org: {report.org_id}")
        y -= 24
        for i, item in enumerate(report.items, start=1):
            if y < 80:
                c.showPage()
                c.setFont("Helvetica", 12)
                y = height - 72
            c.drawString(72, y, f"{i}. Q: {item.get('question','')[:80]}")
            y -= 16
            c.drawString(72, y, f"Answer: {item.get('user_answer','')[:80]}")
            y -= 16
            c.drawString(72, y, f"Score: {item.get('score','')} | Provider: {item.get('llm_provider','')} {item.get('llm_model','')}")
            y -= 16
            rationale = (item.get('rationale','') or '').replace('\n', ' ')[:200]
            c.drawString(72, y, f"Rationale: {rationale}")
            y -= 20
        c.showPage()
        c.save()
        return p

    def _upload_gcs(self, path: Path) -> str | None:
        if not self.bucket or storage is None:
            return None
        try:
            client = storage.Client(project=settings.gcp_project)
            b = client.bucket(self.bucket)
            blob = b.blob(f"reports/{path.name}")
            blob.upload_from_filename(str(path))
            return f"gs://{self.bucket}/reports/{path.name}"
        except Exception:
            return None

    def generate_and_store(self, report: Report) -> Dict[str, str | None]:
        j = self._save_json_local(report)
        p = self._save_pdf_local(report)
        j_uri = self._upload_gcs(j)
        p_uri = self._upload_gcs(p)
        return {"json_path": str(j), "pdf_path": str(p), "json_gcs": j_uri, "pdf_gcs": p_uri}

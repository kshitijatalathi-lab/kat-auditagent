from __future__ import annotations

from dataclasses import dataclass, asdict
from typing import Any, Dict, List, Optional
from pathlib import Path
import json
import io
import asyncio

from adk.config import settings
from adk.llm.mcp_router import LLMRouter
from adk.prompts.templates import build_report_summary_prompt
from pydantic import BaseModel

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
    summary: Optional[str] = None


class ReportGeneratorAgent:
    def __init__(self) -> None:
        self.bucket = settings.gcs_bucket

    def _save_json_local(self, report: Report) -> Path:
        out_dir = settings.processed_dir / "reports"
        out_dir.mkdir(parents=True, exist_ok=True)
        p = out_dir / f"{report.session_id}.json"
        p.write_text(json.dumps(asdict(report), ensure_ascii=False, indent=2), encoding="utf-8")
        return p

    def _save_pdf_local(self, report: Report, *, options: Optional[Dict[str, Any]] = None) -> Path:
        out_dir = settings.processed_dir / "reports"
        out_dir.mkdir(parents=True, exist_ok=True)
        p = out_dir / f"{report.session_id}.pdf"
        if canvas is None:
            # Fallback: write a simple text-only representation
            payload = {"report": asdict(report), "options": options or {}}
            txt = json.dumps(payload, ensure_ascii=False, indent=2)
            p.write_text(txt, encoding="utf-8")
            return p
        opts = options or {}
        fmt = str(opts.get("format", "summary")).lower()  # executive|summary|detailed
        theme = str(opts.get("theme", "modern")).lower()  # modern|classic|minimal
        include_ev = bool(opts.get("includeEvidence", False))

        c = canvas.Canvas(str(p), pagesize=LETTER)
        width, height = LETTER
        y = height - 72
        # Theme
        font = "Helvetica"
        if theme == "classic":
            font = "Times-Roman"
        elif theme == "minimal":
            font = "Helvetica"
        c.setFont(font, 12)
        c.drawString(72, y, f"Audit Report: {report.session_id} | Org: {report.org_id}")
        y -= 24
        # Executive Summary block
        if report.summary:
            c.setFont(font, 12)
            c.drawString(72, y, "Executive Summary:")
            y -= 18
            c.setFont(font, 10)
            summary_text = (report.summary or "").replace("\r", "").split("\n")
            for para in summary_text:
                # Wrap manually at ~95 chars
                line = ""
                words = para.split()
                for w in words:
                    if len(line) + 1 + len(w) > 95:
                        c.drawString(72, y, line)
                        y -= 14
                        if y < 80:
                            c.showPage(); c.setFont(font, 10); y = height - 72
                        line = w
                    else:
                        line = (line + " " + w).strip()
                if line:
                    c.drawString(72, y, line)
                    y -= 14
                    if y < 80:
                        c.showPage(); c.setFont(font, 10); y = height - 72
            # spacer
            y -= 10
            c.setFont(font, 12)
            if y < 120:
                c.showPage(); c.setFont(font, 12); y = height - 72
        # Executive/summary can limit detail depth
        max_rationale = 120 if fmt == "executive" else (200 if fmt == "summary" else 400)
        for i, item in enumerate(report.items, start=1):
            if y < 80:
                c.showPage()
                c.setFont(font, 12)
                y = height - 72
            c.drawString(72, y, f"{i}. Q: {item.get('question','')[:80]}")
            y -= 16
            if fmt != "executive":
                c.drawString(72, y, f"Answer: {item.get('user_answer','')[:80]}")
                y -= 16
            c.drawString(72, y, f"Score: {item.get('score','')} | Provider: {item.get('llm_provider','')} {item.get('llm_model','')}")
            y -= 16
            rationale = (item.get('rationale','') or '').replace('\n', ' ')[:max_rationale]
            c.drawString(72, y, f"Rationale: {rationale}")
            y -= 20
            if include_ev:
                clause_ids = [str(c.get('clause_id', '')) for c in (item.get('clauses') or [])][:5]
                if clause_ids:
                    c.drawString(72, y, f"Evidence Clauses: {', '.join(clause_ids)}")
                    y -= 16
        c.showPage()
        c.save()
        return p

    def _make_summary(self, items: List[Dict[str, Any]], options: Optional[Dict[str, Any]] = None) -> Optional[str]:
        # Option flag to disable summaries
        if (options or {}).get("disableSummary"):
            return None
        # Build prompt and call LLM via LLMRouter (async); run in a temporary loop
        try:
            prompt = build_report_summary_prompt(items)
        except Exception:
            prompt = None
        if not prompt:
            return None
        try:
            router = LLMRouter()
            # Run async method in this sync context
            loop = None
            try:
                loop = asyncio.get_running_loop()
            except RuntimeError:
                loop = None
            if loop and loop.is_running():
                # In rare cases, we might be on an event loop; schedule a task and wait
                return None  # avoid deadlocks; skip LLM in nested loop
            res = asyncio.run(router.generate(prompt))
            txt = (res.text if res else "") or ""
            if txt.strip():
                return txt.strip()
        except Exception:
            pass
        # Fallback: compute a simple deterministic summary
        try:
            if not items:
                return None
            scores = [float(it.get("score", 0)) for it in items if isinstance(it.get("score"), (int, float))]
            avg = sum(scores)/len(scores) if scores else 0.0
            lows = [it for it in items if float(it.get("score", 0)) <= 2]
            highs = [it for it in items if float(it.get("score", 0)) >= 4]
            lines = [
                f"Overall average score: {avg:.2f} (0-5 scale).",
            ]
            if highs:
                lines.append("Strengths:")
                for it in highs[:3]:
                    lines.append(f"- {it.get('question','')[:80]}")
            if lows:
                lines.append("Key gaps:")
                for it in lows[:3]:
                    lines.append(f"- {it.get('question','')[:80]}")
            lines.append("Next steps: prioritize addressing low-scoring areas and verify supporting evidence.")
            return "\n".join(lines)
        except Exception:
            return None

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

    def generate_and_store(self, report: Report, *, options: Optional[Dict[str, Any]] = None) -> Dict[str, str | None]:
        # Derive summary (optional)
        try:
            summary = self._make_summary(report.items, options=options)
            if summary:
                report.summary = summary
        except Exception:
            pass
        j = self._save_json_local(report)
        p = self._save_pdf_local(report, options=options)
        j_uri = self._upload_gcs(j)
        p_uri = self._upload_gcs(p)
        return {"json_path": str(j), "pdf_path": str(p), "json_gcs": j_uri, "pdf_gcs": p_uri}

    # Public entry to align with Orchestrator.generate_report
    def generate(
        self,
        *,
        session_id: str,
        org_id: str,
        items: List[Dict[str, Any]],
        options: Optional[Dict[str, Any]] = None,
        upload_to_gcs: bool = True,
    ) -> Dict[str, str | None]:
        report = Report(session_id=session_id, org_id=org_id, items=items)
        # upload_to_gcs flag is handled by _upload_gcs; if not configured, URIs will be None
        return self.generate_and_store(report, options=options)

    # ---------- Contracts ----------
    class GenerateRequest(BaseModel):
        session_id: str
        org_id: str
        items: List[Dict[str, Any]]
        options: Optional[Dict[str, Any]] = None
        upload_to_gcs: bool = True

    class GenerateResponse(BaseModel):
        json_path: Optional[str]
        pdf_path: Optional[str]
        json_gcs: Optional[str]
        pdf_gcs: Optional[str]

    def generate_structured(self, req: "ReportGeneratorAgent.GenerateRequest") -> "ReportGeneratorAgent.GenerateResponse":
        res = self.generate(
            session_id=req.session_id,
            org_id=req.org_id,
            items=req.items,
            options=req.options,
            upload_to_gcs=req.upload_to_gcs,
        )
        return ReportGeneratorAgent.GenerateResponse(**res)

    # ---------- Health ----------
    def health(self) -> Dict[str, Any]:
        try:
            pdf_lib = "reportlab" if ("canvas" in globals() and canvas is not None) else None
            gcs_enabled = bool(self.bucket)
            return {
                "ok": True,
                "pdf_backend": pdf_lib or "fallback",
                "gcs_enabled": gcs_enabled,
            }
        except Exception as e:
            return {"ok": False, "error": str(e)}

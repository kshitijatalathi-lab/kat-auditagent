from __future__ import annotations

import os
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional
import textwrap

from reportlab.pdfgen import canvas  # type: ignore
from reportlab.lib.pagesizes import A4  # type: ignore

from adk.config import settings


def write_audit_pdf(
    *,
    policy_file_path: str,
    policy_type: str,
    composite: float,
    checklist: List[Dict[str, Any]],
    scores: List[Dict[str, Any]],
    gaps: List[Dict[str, Any]],
    corrected_draft: Optional[str],
) -> Dict[str, str]:
    reports_dir = settings.root / "reports"
    reports_dir.mkdir(parents=True, exist_ok=True)
    ts = datetime.utcnow().strftime("%Y%m%d-%H%M%S")
    base_name = f"policy_audit_{policy_type}_{ts}.pdf"
    pdf_path = reports_dir / base_name

    try:
        c = canvas.Canvas(str(pdf_path), pagesize=A4)
        width, height = A4
        y = height - 50
        c.setFont("Helvetica-Bold", 16)
        c.drawString(40, y, "Policy Audit Report")
        y -= 24
        c.setFont("Helvetica", 11)
        c.drawString(40, y, f"Policy file: {os.path.basename(policy_file_path)}")
        y -= 16
        c.drawString(40, y, f"Policy type: {policy_type}")
        y -= 16
        c.drawString(40, y, f"Composite score: {composite:.2f}")
        y -= 24
        c.setFont("Helvetica-Bold", 12)
        c.drawString(40, y, "Top Gaps (up to 5):")
        y -= 18
        c.setFont("Helvetica", 10)
        for i, g in enumerate(gaps[:5], start=1):
            text = g.get("question") or g.get("gap") or "(no text)"
            c.drawString(48, y, f"{i}. {text[:100]}")
            y -= 14
            if y < 80:
                c.showPage(); y = height - 50
        # Corrections block
        y -= 4
        c.setFont("Helvetica-Bold", 12)
        c.drawString(40, y, "Suggested Corrections (up to 5):")
        y -= 18
        c.setFont("Helvetica", 10)
        for i, g in enumerate(gaps[:5], start=1):
            sugg = g.get("suggestion") or "Improve this section."
            c.drawString(48, y, f"{i}. {sugg[:100]}")
            y -= 14
            if y < 80:
                c.showPage(); y = height - 50
        y -= 8
        c.setFont("Helvetica-Bold", 12)
        c.drawString(40, y, "Checklist Overview (up to 10):")
        y -= 18
        c.setFont("Helvetica", 10)
        for i, it in enumerate(checklist[:10], start=1):
            q = it.get("question") or it.get("text") or "(no text)"
            c.drawString(48, y, f"{i}. {q[:100]}")
            y -= 14
            if y < 80:
                c.showPage(); y = height - 50
        # Corrected draft excerpt
        y -= 8
        c.setFont("Helvetica-Bold", 12)
        c.drawString(40, y, "Corrected Draft (excerpt):")
        y -= 18
        c.setFont("Helvetica", 10)
        if corrected_draft:
            lines: List[str] = []
            text_left = corrected_draft.replace("\r", "").split("\n")
            for ln in text_left:
                lines += textwrap.wrap(ln, width=95) or [""]
            for ln in lines[:60]:
                c.drawString(48, y, ln[:110])
                y -= 12
                if y < 80:
                    c.showPage(); y = height - 50; c.setFont("Helvetica", 10)
        # Per-item Scores & Rationales
        y -= 12
        c.setFont("Helvetica-Bold", 12)
        c.drawString(40, y, "Per-item Scores & Rationales (up to 8):")
        y -= 18
        c.setFont("Helvetica", 10)
        for i, it in enumerate(scores[:8], start=1):
            q = (it.get("question") or "").strip()
            sc = int(it.get("score", 0))
            rationale = (it.get("rationale") or "").replace("\n", " ").strip()
            if rationale:
                rationale = rationale[:180] + ("…" if len(rationale) > 180 else "")
            line1 = f"{i}. [Score {sc}] {q[:80]}"
            c.drawString(48, y, line1)
            y -= 12
            if rationale:
                for ln in textwrap.wrap(rationale, width=95)[:2]:
                    c.drawString(60, y, ln)
                    y -= 12
            cl = (it.get("clauses") or [])
            if cl:
                c0 = cl[0]
                src = c0.get("source") or c0.get("title") or c0.get("id") or "clause"
                c.drawString(60, y, f"Citation: {src}")
                y -= 12
            y -= 2
            if y < 80:
                c.showPage(); y = height - 50; c.setFont("Helvetica", 10)
        c.showPage()
        c.save()
        report_rel = str(pdf_path.relative_to(settings.root))
        download_url = f"/reports/{pdf_path.name}"
        return {"report_path": report_rel, "download_url": download_url}
    except Exception:
        return {"report_path": None, "download_url": None}

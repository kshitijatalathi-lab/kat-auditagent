from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import List, Optional

try:
    from reportlab.lib.pagesizes import A4  # type: ignore
    from reportlab.lib.styles import getSampleStyleSheet  # type: ignore
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer  # type: ignore
    from reportlab.lib.units import cm  # type: ignore
    from reportlab.lib import colors  # type: ignore
except Exception:  # graceful fallback if reportlab missing
    A4 = None  # type: ignore


@dataclass
class ChecklistItemResult:
    question: str
    user_answer: str
    ai_feedback: str


def generate_report_pdf(
    title: str,
    checklist_name: str,
    items: List[ChecklistItemResult],
    out_path: str | Path,
    summary: Optional[str] = None,
) -> str:
    """
    Generate a simple PDF report. Returns the output path.
    Requires reportlab; if unavailable, writes a plain text fallback.
    """
    out = Path(out_path)
    out.parent.mkdir(parents=True, exist_ok=True)

    if A4 is None:
        # Fallback to plaintext if reportlab not installed
        lines = [f"{title}", f"Checklist: {checklist_name}", ""]
        if summary:
            lines.append("Summary:")
            lines.append(summary)
            lines.append("")
        for i, it in enumerate(items, 1):
            lines.append(f"{i}. {it.question}")
            lines.append(f"   Your answer: {it.user_answer}")
            lines.append(f"   AI feedback: {it.ai_feedback}")
            lines.append("")
        out.write_text("\n".join(lines), encoding="utf-8")
        return str(out)

    # PDF path
    doc = SimpleDocTemplate(str(out), pagesize=A4, title=title)
    styles = getSampleStyleSheet()
    flow = []

    flow.append(Paragraph(title, styles["Title"]))
    flow.append(Spacer(1, 0.4 * cm))
    flow.append(Paragraph(f"Checklist: {checklist_name}", styles["Heading2"]))
    flow.append(Spacer(1, 0.3 * cm))

    if summary:
        flow.append(Paragraph("Summary", styles["Heading3"]))
        flow.append(Paragraph(summary, styles["BodyText"]))
        flow.append(Spacer(1, 0.4 * cm))

    for i, it in enumerate(items, 1):
        flow.append(Paragraph(f"{i}. {it.question}", styles["Heading4"]))
        flow.append(Paragraph(f"<b>Your answer:</b> {it.user_answer}", styles["BodyText"]))
        flow.append(Paragraph(f"<b>AI feedback:</b> {it.ai_feedback}", styles["BodyText"]))
        flow.append(Spacer(1, 0.3 * cm))

    doc.build(flow)
    return str(out)

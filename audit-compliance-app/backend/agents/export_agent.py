from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict

from .base_agent import BaseAgent

try:
    from reportlab.lib.pagesizes import letter  # type: ignore
    from reportlab.pdfgen import canvas  # type: ignore
except Exception:
    letter = None
    canvas = None


class ExportAgent(BaseAgent):
    """Exports reports to JSON, PDF, and HTML."""

    def name(self) -> str:
        return "export"

    def export_json(self, data: Dict[str, Any], path: Path) -> Path:
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        return path

    def export_pdf(self, data: Dict[str, Any], path: Path) -> Path:
        if canvas is None or letter is None:
            # Fallback: write a .txt placeholder with .pdf extension
            path.parent.mkdir(parents=True, exist_ok=True)
            with path.open("w", encoding="utf-8") as f:
                f.write("PDF support (reportlab) not installed.\n")
                f.write(json.dumps(data)[:2000])
            return path
        path.parent.mkdir(parents=True, exist_ok=True)
        c = canvas.Canvas(str(path), pagesize=letter)
        textobject = c.beginText(40, 750)
        textobject.textLine("Audit Report Summary")
        textobject.textLine("")
        textobject.textLine(f"Composite score: {data.get('composite_score', 0)}")
        textobject.textLine(f"Items: {data.get('items_count', 0)} | Gaps: {data.get('gaps_count', 0)}")
        c.drawText(textobject)
        c.showPage()
        c.save()
        return path

    def export_html(self, data: Dict[str, Any], path: Path) -> Path:
        html = f"""
<!doctype html>
<html>
  <head><meta charset='utf-8'><title>Audit Report</title></head>
  <body>
    <h1>Audit Report Summary</h1>
    <p>Composite score: {data.get('composite_score', 0)}</p>
    <p>Items: {data.get('items_count', 0)} | Gaps: {data.get('gaps_count', 0)}</p>
  </body>
</html>
"""
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("w", encoding="utf-8") as f:
            f.write(html)
        return path

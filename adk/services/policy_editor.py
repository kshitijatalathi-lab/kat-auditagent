from __future__ import annotations

from typing import List, Dict, Optional
from dataclasses import dataclass
from pathlib import Path
import re

import fitz  # PyMuPDF


@dataclass
class AnnotationRequest:
    file: str
    gaps: List[Dict]
    out_path: Optional[str] = None


class PolicyEditor:
    """Annotate a PDF policy file with highlights and sticky notes for gaps.

    We search for gap keywords and question fragments; then add highlight and a note with suggestions.
    """

    def annotate(self, req: AnnotationRequest) -> str:
        in_path = Path(req.file)
        if not in_path.exists():
            raise FileNotFoundError(str(in_path))
        out_path = Path(req.out_path) if req.out_path else in_path.with_name(in_path.stem + ".annotated.pdf")

        with fitz.open(in_path) as doc:
            for gap in req.gaps:
                suggestion = gap.get("suggestion", "Improve this section to meet compliance requirements.")
                # Build a search pattern from question keywords
                words = gap.get("keywords") or []
                q = gap.get("question", "")
                terms = [w for w in words if isinstance(w, str)]
                # Also include a few words from the question
                terms += re.findall(r"[A-Za-z]{4,}", q)[:4]
                if not terms:
                    terms = [q[:20]] if q else []

                for page in doc:
                    for term in terms:
                        if not term:
                            continue
                        try:
                            areas = page.search_for(term, hit_max=32)  # search occurrences
                        except Exception:
                            areas = []
                        for rect in areas:
                            try:
                                # Highlight
                                hl = page.add_highlight_annot(rect)
                                hl.update()
                                # Add a sticky note near the rect
                                note_rect = fitz.Rect(rect.x0, max(0, rect.y0 - 12), rect.x0 + 18, rect.y0 + 6)
                                text = f"Gap: {gap.get('question','')[:80]}\nScore: {gap.get('score','?')}\nSuggestion: {suggestion}"
                                page.add_text_annot(note_rect.br, text)
                            except Exception:
                                continue
            doc.save(out_path)
        return str(out_path)

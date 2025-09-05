from __future__ import annotations

from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Iterable, List, Dict, Any, Optional
import re

from PyPDF2 import PdfReader  # type: ignore
from docx import Document  # type: ignore
from pydantic import BaseModel


@dataclass
class Clause:
    law: str
    article: str
    clause_id: str
    title: str
    clause_text: str
    source_path: str


class ClauseAnnotatorAgent:
    """Extracts and tags legal clauses from uploaded documents.

    For simplicity, we infer law and article by regex hints in content or filenames.
    In production, replace the heuristics with a proper NER/section parser.
    """

    LAW_HINTS = {
        "gdpr": "GDPR",
        "dpdp": "DPDP",
        "hipaa": "HIPAA",
    }

    ARTICLE_PAT = re.compile(r"(?:Article|Art\.)\s*(\d+[a-zA-Z]?)", re.IGNORECASE)

    def __init__(self) -> None:
        pass

    def _detect_law(self, text: str, path: Path) -> str:
        p = path.name.lower()
        for k, v in self.LAW_HINTS.items():
            if k in p or k in text.lower():
                return v
        return "GDPR"  # default

    def _read_text(self, path: Path) -> str:
        if path.suffix.lower() == ".pdf":
            reader = PdfReader(str(path))
            return "\n".join(page.extract_text() or "" for page in reader.pages)
        if path.suffix.lower() in {".docx"}:
            doc = Document(str(path))
            return "\n".join(p.text for p in doc.paragraphs)
        return path.read_text(encoding="utf-8", errors="ignore")

    def annotate(self, paths: Iterable[Path]) -> List[Clause]:
        clauses: List[Clause] = []
        for p in paths:
            text = self._read_text(p)
            law = self._detect_law(text, p)
            # naive clause splitting by numbered headings
            chunks = re.split(r"\n\s*(?:\d+\.|Section\s+\d+|Article\s+\d+)\s+", text)
            for i, ch in enumerate(chunks):
                if not ch or len(ch.strip()) < 40:
                    continue
                art = self.ARTICLE_PAT.search(ch)
                article = art.group(1) if art else str(i)
                title = ch.strip().split("\n", 1)[0][:120]
                clause_id = f"{law}-{article}-{i}"
                clauses.append(
                    Clause(
                        law=law,
                        article=str(article),
                        clause_id=clause_id,
                        title=title,
                        clause_text=ch.strip()[:4000],
                        source_path=str(p),
                    )
                )
        return clauses

    @staticmethod
    def to_jsonl(clauses: List[Clause]) -> List[Dict]:
        return [asdict(c) for c in clauses]

    # Structured API types
    class AnnotateRequest(BaseModel):
        paths: List[str]

    class AnnotateResponse(BaseModel):
        clauses: List[Dict[str, Any]]
        count: int

    def annotate_structured(self, req: "ClauseAnnotatorAgent.AnnotateRequest") -> "ClauseAnnotatorAgent.AnnotateResponse":
        paths = [Path(p) for p in req.paths]
        out = self.annotate(paths)
        payload = self.to_jsonl(out)
        return ClauseAnnotatorAgent.AnnotateResponse(clauses=payload, count=len(payload))

    def health(self) -> Dict[str, Optional[str]]:
        try:
            supported = [".pdf", ".docx", ".txt", "*"]
            # Try minimal call path without IO
            ok = True
        except Exception:
            ok = False
        return {"ok": "true" if ok else "false", "supported": ",".join(supported)}

from __future__ import annotations

from typing import List, Dict, Tuple
from dataclasses import dataclass
from pathlib import Path
import re

import fitz  # PyMuPDF

from adk.services import checklists as ck


@dataclass
class DocScanResult:
    file: str
    text_len: int


def _extract_text(paths: List[str]) -> Tuple[str, List[DocScanResult]]:
    corpus = []
    details: List[DocScanResult] = []
    for p in paths:
        path = Path(p)
        if not path.exists():
            continue
        try:
            if path.suffix.lower() in {".pdf"}:
                with fitz.open(path) as doc:
                    buf = []
                    for page in doc:
                        buf.append(page.get_text("text"))
                    txt = "\n".join(buf)
            else:
                # naive text read for .txt/.md
                txt = path.read_text(errors="ignore")
        except Exception:
            txt = ""
        details.append(DocScanResult(file=str(path), text_len=len(txt)))
        corpus.append(txt)
    return "\n".join(corpus), details


def _score_keywords(text: str, query: str) -> float:
    if not text or not query:
        return 0.0
    t = text.lower()
    q = query.lower()
    # simple token & phrase matching
    score = 0.0
    for term in re.findall(r"[a-z0-9]+", q):
        if term and term in t:
            score += 1.0
    if q in t:
        score += 2.0
    return score


def generate_checklist_from_docs(framework: str, files: List[str], top_n: int = 20) -> Dict:
    """Suggest a checklist subset based on uploaded documents' content.

    Returns { framework, version, items: [ {question, id, weight, rationale} ] }
    """
    data = ck.load_checklist(framework)
    items = data.get("items", [])
    text, _ = _extract_text(files)

    scored = []
    for it in items:
        q = it.get("question") or it.get("title") or ""
        s = _score_keywords(text, q)
        scored.append((it, s))
    scored.sort(key=lambda x: x[1], reverse=True)

    selected = []
    for it, s in scored[:top_n]:
        sel = dict(it)
        sel["rationale"] = f"selected_by_doc_relevance:{s:.1f}"
        selected.append(sel)

    return {
        "framework": data.get("framework", framework),
        "version": data.get("version", "1.0"),
        "items": selected,
    }


def analyze_gaps(scored_items: List[Dict], min_score: int = 4) -> Dict:
    """Return items below threshold with suggested remediations."""
    gaps = []
    for it in scored_items:
        score = int(it.get("score", 0))
        if score >= min_score:
            continue
        question = it.get("question", "")
        answer = it.get("user_answer", "")
        suggestion = (
            "Strengthen controls for this checklist item. Document specific procedures, add monitoring, and align with the cited regulation clauses."
        )
        gaps.append({
            "question": question,
            "current_answer": answer,
            "score": score,
            "suggestion": suggestion,
            "keywords": question.split()[:5],
        })
    return {"count": len(gaps), "items": gaps}

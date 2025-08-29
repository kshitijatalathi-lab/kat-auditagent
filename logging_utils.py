from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable, Optional

# Log file under project package root
ROOT = Path(__file__).resolve().parent
LOG_PATH = ROOT / "logs" / "prompts_log.jsonl"
LOG_PATH.parent.mkdir(parents=True, exist_ok=True)


def _extract_sources(retrieved: Optional[Iterable[Any]]) -> list[str]:
    sources: list[str] = []
    if not retrieved:
        return sources
    for r in retrieved:
        try:
            # Supports dicts or objects with .source
            if isinstance(r, dict):
                src = r.get("source")
            else:
                src = getattr(r, "source", None)
            if src:
                sources.append(str(src))
        except Exception:
            continue
    return sources


essential_fields = ("timestamp", "query", "retrieved_sources", "prompt", "response")


def log_interaction(query: str, retrieved_chunks: Optional[Iterable[Any]], prompt: str, model_output: str, meta: Optional[dict] = None) -> None:
    """Append a single interaction to prompts_log.jsonl.

    meta may include provider, model, k, pre_k, rerank, trace ids, etc.
    """
    entry = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "query": query,
        "retrieved_sources": _extract_sources(retrieved_chunks),
        "prompt": prompt,
        "response": model_output,
    }
    if meta:
        try:
            entry["meta"] = meta
        except Exception:
            pass
    try:
        with LOG_PATH.open("a", encoding="utf-8") as f:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")
    except Exception:
        # Best-effort logging; avoid crashing the pipeline
        pass


def collect_feedback() -> dict:
    try:
        rating = input("Rate the response quality (1–5): ").strip()
        comment = input("Any feedback? ").strip()
        return {"rating": int(rating), "comment": comment}
    except Exception:
        return {"rating": None, "comment": ""}


def log_feedback(query: str, rating: Optional[int], comment: str, meta: Optional[dict] = None) -> None:
    """Append a feedback entry to the same JSONL file for simplicity.

    Use this to record user-provided ratings/comments for a given query/turn.
    """
    entry = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "type": "feedback",
        "query": query,
        "feedback": {"rating": rating, "comment": comment},
    }
    if meta:
        entry["meta"] = meta
    try:
        with LOG_PATH.open("a", encoding="utf-8") as f:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")
    except Exception:
        pass

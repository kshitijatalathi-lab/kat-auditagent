from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List

from .base_agent import BaseAgent


class RetrieverAgent(BaseAgent):
    """Naive keyword-overlap retriever with file-backed JSONL store.

    Each indexed chunk is stored as a JSON line: {"framework": str, "text": str}
    Search computes a simple overlap score between query tokens and chunk tokens.
    """

    def __init__(self, db_dir: Path) -> None:
        self.db_dir = db_dir
        self.store_path = self.db_dir / "chunks.jsonl"
        self.store_path.parent.mkdir(parents=True, exist_ok=True)
        if not self.store_path.exists():
            self.store_path.touch()

    def name(self) -> str:
        return "retriever"

    def index_chunks(self, chunks: List[str], *, framework: str | None = None) -> None:
        with self.store_path.open("a", encoding="utf-8") as f:
            for ch in chunks:
                rec = {"framework": (framework or "generic").lower(), "text": ch}
                f.write(json.dumps(rec, ensure_ascii=False) + "\n")

    def _read_all(self) -> List[Dict[str, Any]]:
        out: List[Dict[str, Any]] = []
        with self.store_path.open("r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    out.append(json.loads(line))
                except Exception:
                    continue
        return out

    def search(self, *, query: str, k: int = 5, framework: str | None = None) -> List[Dict[str, Any]]:
        qset = set(tokenize(query))
        results: List[Dict[str, Any]] = []
        fw = (framework or "").lower()
        for rec in self._read_all():
            if fw and rec.get("framework") not in {fw, "generic"}:
                continue
            text: str = rec.get("text", "")
            tset = set(tokenize(text))
            overlap = len(qset & tset)
            if overlap <= 0:
                continue
            results.append({"text": text, "score": overlap})
        results.sort(key=lambda r: r["score"], reverse=True)
        return results[:k]


def tokenize(s: str) -> List[str]:
    return [t.lower() for t in s.split() if t.strip()]

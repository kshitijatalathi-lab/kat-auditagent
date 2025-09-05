from __future__ import annotations

from dataclasses import dataclass
from typing import List, Optional, Sequence, Dict, Any
import os

import numpy as np

try:
    import faiss  # type: ignore
except Exception:
    faiss = None  # type: ignore

from adk.config import settings
from adk.agents.embedder import EmbedderAgent

try:
    from google.cloud import aiplatform  # type: ignore
except Exception:
    aiplatform = None  # type: ignore


@dataclass
class RetrievedClause:
    law: str
    article: str
    clause_id: str
    title: str
    clause_text: str
    source_path: str
    score: float


class RetrieverAgent:
    def __init__(self, use_matching_engine: Optional[bool] = None):
        self.use_me = use_matching_engine if use_matching_engine is not None else settings.vertex_use_matching_engine
        self.index = None
        self.meta: List[dict] | None = None
        self.embedder = None
        try:
            self.embedder = EmbedderAgent()
        except Exception:
            self.embedder = None
        if not self.use_me and faiss is not None:
            # Try loading local clauses index if present
            from pathlib import Path
            idx_path = settings.processed_dir / "clauses_index.faiss"
            meta_path = settings.processed_dir / "clauses_index_meta.json"
            if idx_path.exists() and meta_path.exists():
                try:
                    self.index = faiss.read_index(str(idx_path))
                    import json
                    self.meta = json.loads(meta_path.read_text())
                except Exception:
                    self.index = None
                    self.meta = None

    def search_local(self, query_vec: np.ndarray, top_k: int = 5) -> List[RetrievedClause]:
        if self.index is None or self.meta is None:
            return []
        D, I = self.index.search(query_vec.astype(np.float32), top_k)
        out: List[RetrievedClause] = []
        for i, d in zip(I[0].tolist(), D[0].tolist()):
            if i < 0 or i >= len(self.meta):
                continue
            m = self.meta[i]
            out.append(
                RetrievedClause(
                    law=m.get("law", ""),
                    article=m.get("article", ""),
                    clause_id=m.get("clause_id", ""),
                    title=m.get("title", ""),
                    clause_text=m.get("clause_text", ""),
                    source_path=m.get("source_path", ""),
                    score=float(d),
                )
            )
        return out

    # ---------- Contracts ----------
    try:
        from pydantic import BaseModel
    except Exception:  # pragma: no cover - optional at runtime
        BaseModel = object  # type: ignore

    class RetrieveRequest(BaseModel):  # type: ignore
        query_text: str
        k: int = 5
        framework: Optional[str] = None

    class RetrievedItem(BaseModel):  # type: ignore
        law: str
        article: str
        clause_id: str
        title: str
        clause_text: str
        source_path: str
        score: float

    class RetrieveResponse(BaseModel):  # type: ignore
        items: List["RetrieverAgent.RetrievedItem"]

    def search_structured(self, req: "RetrieverAgent.RetrieveRequest") -> "RetrieverAgent.RetrieveResponse":  # type: ignore
        items = self.search(req.query_text, k=req.k, framework=req.framework)
        return self.RetrieveResponse(items=[self.RetrievedItem(**it) for it in items])

    # ---------- Health ----------
    def health(self) -> Dict[str, Any]:
        return {
            "faiss_available": faiss is not None,
            "index_loaded": self.index is not None,
            "meta_count": len(self.meta or []),
            "use_matching_engine": bool(self.use_me),
            "vertex_configured": bool(os.getenv("GCP_PROJECT")),
            "embedder": self.embedder.health() if hasattr(self.embedder, "health") and self.embedder else None,
        }

    def search_me(self, query_vec: np.ndarray, top_k: int = 5) -> List[RetrievedClause]:
        # Placeholder: real Matching Engine requires deployed index and datapoints
        # Here we return empty to avoid misleading calls if not configured
        return []

    def retrieve(self, query_vec: np.ndarray, top_k: int = 5) -> List[RetrievedClause]:
        if self.use_me and aiplatform is not None and settings.vertex_index_id:
            items = self.search_me(query_vec, top_k=top_k)
            if items:
                return items
        return self.search_local(query_vec, top_k=top_k)

    # ---------- Text-based Search API ----------
    def search(self, query_text: str, k: int = 5, framework: Optional[str] = None) -> List[dict]:
        """Search using embeddings when available; fallback to keyword scoring.

        Returns list of clause dicts with keys matching index meta format.
        """
        # Prefer vector search when possible
        if self.embedder is not None and (self.index is not None and self.meta is not None or (self.use_me and aiplatform is not None)):
            try:
                emb = self.embedder.embed([query_text])
                vec = emb.vectors.astype(np.float32)
                items = self.retrieve(vec, top_k=k)
                return [
                    {
                        "law": it.law or (framework or "GDPR"),
                        "article": it.article,
                        "clause_id": it.clause_id,
                        "title": it.title,
                        "clause_text": it.clause_text,
                        "source_path": it.source_path,
                        "score": float(it.score),
                    }
                    for it in items
                ]
            except Exception:
                pass

        # Keyword fallback over meta or chunks
        from pathlib import Path
        import json
        meta_path = settings.processed_dir / "clauses_index_meta.json"
        chunks_path = settings.faiss_chunks_path
        records: List[dict] = []
        if meta_path.exists():
            try:
                records = json.loads(meta_path.read_text())
            except Exception:
                records = []
        elif chunks_path.exists():
            # map chunks to clause-like records
            try:
                for line in chunks_path.read_text().splitlines():
                    if not line.strip():
                        continue
                    obj = json.loads(line)
                    records.append({
                        "law": framework or "GDPR",
                        "article": "?",
                        "clause_id": f"{obj.get('source','')}#{obj.get('chunk_id','')}",
                        "title": obj.get("source", ""),
                        "clause_text": obj.get("text", ""),
                        "source_path": obj.get("source", ""),
                    })
            except Exception:
                records = []

        if not records:
            return []

        q = query_text.lower()
        def score_text(t: str) -> float:
            t_low = t.lower()
            s = 0.0
            # simple term matches
            for term in q.split():
                if term and term in t_low:
                    s += 1.0
            # bonus for exact substring
            if q in t_low:
                s += 2.0
            return s

        scored = [
            (rec, score_text(rec.get("clause_text", "") + " " + rec.get("title", "")))
            for rec in records
        ]
        scored.sort(key=lambda x: x[1], reverse=True)
        out = []
        for rec, sc in scored[:k]:
            rec = dict(rec)
            rec["score"] = float(sc)
            out.append(rec)
        return out

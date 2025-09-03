from __future__ import annotations

import json
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import List, Dict, Any, Optional

import numpy as np

try:
    from sentence_transformers import SentenceTransformer  # type: ignore
except Exception:
    SentenceTransformer = None  # type: ignore

try:
    import faiss  # type: ignore
except Exception:
    faiss = None  # type: ignore

ROOT = Path(__file__).resolve().parent
INDEX_PATH = ROOT / "data" / "processed" / "index.faiss"
CHUNKS_PATH = ROOT / "data" / "processed" / "all_chunks.jsonl"
MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"
RERANK_MODEL_NAME = "cross-encoder/ms-marco-MiniLM-L-6-v2"


@dataclass
class Retrieved:
    source: str
    chunk_id: int
    text: str
    score: float


@lru_cache(maxsize=1)
def _load_chunks() -> List[Dict[str, Any]]:
    items: List[Dict[str, Any]] = []
    with CHUNKS_PATH.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                items.append(json.loads(line))
    return items


@lru_cache(maxsize=1)
def _load_index():
    if faiss is None:
        raise RuntimeError("faiss-cpu is required for retrieval. Install faiss-cpu.")
    if not INDEX_PATH.exists():
        raise RuntimeError(f"Missing FAISS index at {INDEX_PATH}. Build it first: python smartaudit/build_index.py")
    return faiss.read_index(str(INDEX_PATH))


@lru_cache(maxsize=1)
def _load_model():
    if SentenceTransformer is None:
        raise RuntimeError("sentence-transformers (with a backend like torch) is required for retrieval.")
    return SentenceTransformer(MODEL_NAME)


@lru_cache(maxsize=1)
def _load_reranker():
    try:
        from sentence_transformers import CrossEncoder  # type: ignore
    except Exception:
        raise RuntimeError("CrossEncoder not available. Install sentence-transformers for reranking.")
    return CrossEncoder(RERANK_MODEL_NAME)


def retrieve_top_k(
    query: str,
    k: int = 5,
    pre_k: Optional[int] = None,
    rerank: bool = False,
    prefer_prefix: Optional[str] = None,
) -> List[Retrieved]:
    """Return top-k relevant chunks with scores.

    Args:
        query: user query string
        k: number of results
    """
    if not query or not query.strip():
        return []

    # Lightweight acronym expansion to improve recall for compliance acronyms
    def _expand_query(q: str) -> str:
        ql = q.lower()
        expansions: list[str] = []
        if "dpia" in ql:
            expansions.append("Data Protection Impact Assessment")
        if "pia" in ql and "dpia" not in ql:
            expansions.append("Privacy Impact Assessment")
        if "dpo" in ql:
            expansions.append("Data Protection Officer")
        if expansions:
            return q + " " + " ".join(expansions)
        return q

    expanded_query = _expand_query(query)

    model = _load_model()
    index = _load_index()
    chunks = _load_chunks()

    q = model.encode([expanded_query], normalize_embeddings=True, convert_to_numpy=True)
    topn = pre_k if pre_k is not None else max(k, 20)
    D, I = index.search(q.astype(np.float32), int(topn))

    candidates: List[Retrieved] = []
    for idx, score in zip(I[0].tolist(), D[0].tolist()):
        item = chunks[idx]
        candidates.append(
            Retrieved(
                source=item["source"],
                chunk_id=int(item["chunk_id"]),
                text=item["text"],
                score=float(score),
            )
        )

    if rerank and candidates:
        # Cross-encoder reranking
        reranker = _load_reranker()
        pairs = [(expanded_query, c.text) for c in candidates]
        rr_scores = reranker.predict(pairs)
        # Attach and sort by rerank score desc
        rescored = list(zip(candidates, rr_scores))
        rescored.sort(key=lambda x: float(x[1]), reverse=True)
        reranked = [c for c, s in rescored]
        # Optional stable preference by source prefix
        if prefer_prefix:
            pref = [c for c in reranked if str(c.source).startswith(prefer_prefix)]
            rest = [c for c in reranked if not str(c.source).startswith(prefer_prefix)]
            reranked = pref + rest
        return reranked[:k]

    # No rerank: optional stable preference, then return top-k
    if prefer_prefix:
        pref = [c for c in candidates if str(c.source).startswith(prefer_prefix)]
        rest = [c for c in candidates if not str(c.source).startswith(prefer_prefix)]
        ordered = pref + rest
        return ordered[:k]
    return candidates[:k]


def _demo():
    import argparse

    p = argparse.ArgumentParser(description="Test retrieval over SmartAudit index")
    p.add_argument("query", type=str)
    p.add_argument("--k", type=int, default=5)
    args = p.parse_args()

    results = retrieve_top_k(args.query, k=args.k)
    for i, r in enumerate(results, start=1):
        snippet = r.text.strip().replace("\n", " ")
        if len(snippet) > 300:
            snippet = snippet[:300] + "..."
        print(f"#{i} | score={r.score:.3f} | {r.source} [chunk {r.chunk_id}]\n{snippet}\n")


if __name__ == "__main__":
    _demo()

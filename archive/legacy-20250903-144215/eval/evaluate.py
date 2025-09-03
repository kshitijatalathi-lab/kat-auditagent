from __future__ import annotations

from dataclasses import dataclass
from typing import List, Optional, Dict, Any

from smartaudit.retrieval import retrieve_top_k


@dataclass
class QueryItem:
    q: str
    # A result is considered relevant if any of these substrings appear in the hit's `source`
    expected_sources: List[str]


DEFAULT_QUERIES: List[QueryItem] = [
    QueryItem(
        q="data subject rights",
        expected_sources=["CELEX_32016R0679_EN_TXT.txt"],
    ),
    QueryItem(
        q="lawful basis of processing",
        expected_sources=["CELEX_32016R0679_EN_TXT.txt", "privacy_policy_template.txt"],
    ),
    QueryItem(
        q="data protection officer responsibilities",
        expected_sources=["CELEX_32016R0679_EN_TXT.txt"],
    ),
]


def is_relevant(hit: Dict[str, Any], expected_sources: List[str]) -> bool:
    src = hit.get("source") or ""
    return any(exp in src for exp in expected_sources)


def recall_at_k(results: List[Dict[str, Any]], expected_sources: List[str], k: int) -> float:
    subset = results[:k]
    relevant = any(is_relevant(r, expected_sources) for r in subset)
    return 1.0 if relevant else 0.0


def reciprocal_rank(results: List[Dict[str, Any]], expected_sources: List[str]) -> float:
    for i, r in enumerate(results, start=1):
        if is_relevant(r, expected_sources):
            return 1.0 / i
    return 0.0


def evaluate(queries: List[QueryItem], k: int = 5, rerank: bool = False, pre_k: Optional[int] = None) -> None:
    recalls: List[float] = []
    mrrs: List[float] = []

    for item in queries:
        hits = retrieve_top_k(item.q, k=k, pre_k=pre_k, rerank=rerank)
        results = [
            {"source": h.source, "chunk_id": h.chunk_id, "score": h.score, "text": h.text}
            for h in hits
        ]
        r = recall_at_k(results, item.expected_sources, k)
        rr = reciprocal_rank(results, item.expected_sources)
        recalls.append(r)
        mrrs.append(rr)
        print(f"Q: {item.q}")
        for i, h in enumerate(results, start=1):
            print(f"  {i:>2}. {h['source']} (score={h['score']:.3f})")
        print(f"  Recall@{k}: {r:.3f} | RR: {rr:.3f}\n")

    avg_recall = sum(recalls) / len(recalls) if recalls else 0.0
    avg_mrr = sum(mrrs) / len(mrrs) if mrrs else 0.0
    print(f"AVG Recall@{k}: {avg_recall:.3f} | AVG MRR: {avg_mrr:.3f}")


if __name__ == "__main__":
    import argparse

    p = argparse.ArgumentParser(description="Evaluate SmartAudit retrieval quality")
    p.add_argument("--k", type=int, default=5)
    p.add_argument("--rerank", action="store_true")
    p.add_argument("--pre-k", type=int, default=None)
    args = p.parse_args()

    evaluate(DEFAULT_QUERIES, k=args.k, rerank=args.rerank, pre_k=args.pre_k)

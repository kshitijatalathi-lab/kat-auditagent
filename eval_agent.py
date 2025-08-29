import os
import argparse
import json
import re
from typing import List, Tuple

from smartaudit.rag_cli import answer_query

CITATION_RE = re.compile(r"\[#(\d+)\]")


def extract_citation_ids(text: str) -> List[int]:
    return [int(m.group(1)) for m in CITATION_RE.finditer(text or "")]


def eval_one(question: str, provider: str, k: int, pre_k: int, max_new_tokens: int) -> Tuple[str, List, dict]:
    ans, chunks = answer_query(
        query=question,
        k=k,
        provider=provider,
        model_dir=os.path.join(os.path.dirname(__file__), "models", "smartaudit-gemma"),
        max_new_tokens=max_new_tokens,
        openai_model=os.getenv("OPENAI_MODEL", "gpt-3.5-turbo"),
        rerank=True,
        pre_k=pre_k,
    )
    cited = extract_citation_ids(ans)
    valid_ids = set(range(1, len(chunks) + 1))
    cited_valid = [i for i in cited if i in valid_ids]
    has_citation = len(cited_valid) > 0
    not_in_context = ans.strip() == "Not in context"
    metrics = {
        "has_citation": has_citation,
        "not_in_context": not_in_context,
        "num_retrieved": len(chunks),
        "num_citations": len(cited),
        "num_valid_citations": len(cited_valid),
    }
    return ans, chunks, metrics


def main():
    parser = argparse.ArgumentParser(description="Evaluate SmartAudit agent for grounding & citations")
    parser.add_argument("--input_jsonl", type=str, default="smartaudit/data/fine_tune/train.sample.jsonl")
    parser.add_argument("--provider", type=str, default=os.getenv("PROVIDER", "ollama"))
    parser.add_argument("--k", type=int, default=5)
    parser.add_argument("--pre_k", type=int, default=20)
    parser.add_argument("--max_new_tokens", type=int, default=400)
    args = parser.parse_args()

    total = 0
    citation_hits = 0
    nic_hits = 0
    results = []

    with open(args.input_jsonl, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            obj = json.loads(line)
            q = obj.get("question", "").strip()
            if not q:
                continue
            total += 1
            ans, chunks, m = eval_one(q, args.provider, args.k, args.pre_k, args.max_new_tokens)
            citation_hits += int(m["has_citation"]) if m else 0
            nic_hits += int(m["not_in_context"]) if m else 0
            results.append({
                "question": q,
                "answer": ans,
                "metrics": m,
                "retrieved": [{"source": c.source, "chunk_id": c.chunk_id} for c in chunks],
            })

    summary = {
        "total": total,
        "citation_rate": (citation_hits / total) if total else 0.0,
        "not_in_context_rate": (nic_hits / total) if total else 0.0,
    }

    print("\n=== Evaluation Summary ===")
    print(json.dumps(summary, indent=2))
    print("\n=== Sample Results ===")
    for r in results[:3]:
        print(json.dumps(r, indent=2))


if __name__ == "__main__":
    main()

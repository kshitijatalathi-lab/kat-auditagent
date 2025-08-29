from __future__ import annotations

import json
from pathlib import Path
from typing import List, Tuple

import numpy as np

try:
    from sentence_transformers import SentenceTransformer
except Exception as e:
    raise SystemExit("Please install sentence-transformers: pip install sentence-transformers") from e

try:
    import faiss  # type: ignore
except Exception as e:
    raise SystemExit("Please install faiss-cpu: pip install faiss-cpu") from e

ROOT = Path(__file__).resolve().parent
INDEX_PATH = ROOT / "data" / "processed" / "index.faiss"
META_PATH = ROOT / "data" / "processed" / "index_meta.json"
CHUNKS_PATH = ROOT / "data" / "processed" / "all_chunks.jsonl"


def load_meta() -> dict:
    return json.loads(META_PATH.read_text(encoding="utf-8"))


def load_chunks() -> List[dict]:
    items: List[dict] = []
    with CHUNKS_PATH.open("r", encoding="utf-8") as f:
        for line in f:
            if line.strip():
                items.append(json.loads(line))
    return items


def search(query: str, top_k: int = 5) -> List[Tuple[int, float]]:
    model_name = "sentence-transformers/all-MiniLM-L6-v2"
    model = SentenceTransformer(model_name)
    q = model.encode([query], normalize_embeddings=True, convert_to_numpy=True)
    index = faiss.read_index(str(INDEX_PATH))
    D, I = index.search(q.astype(np.float32), top_k)
    return list(zip(I[0].tolist(), D[0].tolist()))


def pretty_print(results: List[Tuple[int, float]], chunks: List[dict]) -> None:
    for rank, (idx, score) in enumerate(results, start=1):
        item = chunks[idx]
        text = item["text"].strip().replace("\n", " ")
        snippet = (text[:300] + "...") if len(text) > 300 else text
        print(f"#{rank} | score={score:.3f} | {item['source']} [chunk {item['chunk_id']}]\n{snippet}\n")


def main() -> None:
    import argparse

    parser = argparse.ArgumentParser(description="Search SmartAudit FAISS index")
    parser.add_argument("query", type=str, help="search query")
    parser.add_argument("--k", type=int, default=5, help="top-k results")
    args = parser.parse_args()

    if not INDEX_PATH.exists() or not META_PATH.exists():
        raise SystemExit("Index not found. Build it first: python smartaudit/build_index.py")

    chunks = load_chunks()
    results = search(args.query, top_k=args.k)
    pretty_print(results, chunks)


if __name__ == "__main__":
    main()

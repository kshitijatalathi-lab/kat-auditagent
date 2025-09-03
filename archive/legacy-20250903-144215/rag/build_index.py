from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import List, Dict, Any

import numpy as np

# Deps: sentence-transformers, faiss-cpu
try:
    from sentence_transformers import SentenceTransformer
except Exception as e:  # pragma: no cover
    raise SystemExit("Please install sentence-transformers: pip install sentence-transformers") from e

try:
    import faiss  # type: ignore
except Exception as e:  # pragma: no cover
    raise SystemExit("Please install faiss-cpu: pip install faiss-cpu") from e

ROOT = Path(__file__).resolve().parent
CHUNKS_PATH = ROOT / "data" / "processed" / "all_chunks.jsonl"
INDEX_PATH = ROOT / "data" / "processed" / "index.faiss"
META_PATH = ROOT / "data" / "processed" / "index_meta.json"


@dataclass
class Record:
    source: str
    chunk_id: int
    text: str


def load_chunks(path: Path) -> List[Record]:
    recs: List[Record] = []
    with path.open("r", encoding="utf-8") as f:
        for line in f:
            if not line.strip():
                continue
            obj: Dict[str, Any] = json.loads(line)
            recs.append(Record(source=obj["source"], chunk_id=int(obj["chunk_id"]), text=obj["text"]))
    return recs


def main() -> None:
    if not CHUNKS_PATH.exists():
        raise SystemExit(f"Missing chunks file: {CHUNKS_PATH}")

    print("Loading chunks...")
    records = load_chunks(CHUNKS_PATH)
    texts = [r.text for r in records]

    print("Encoding with sentence-transformers (all-MiniLM-L6-v2)...")
    model = SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2")
    embs = model.encode(texts, batch_size=64, show_progress_bar=True, convert_to_numpy=True, normalize_embeddings=True)
    dim = embs.shape[1]

    print(f"Building FAISS index (dim={dim})...")
    index = faiss.IndexFlatIP(dim)  # using inner product with normalized embeddings ~ cosine
    index.add(embs.astype(np.float32))

    INDEX_PATH.parent.mkdir(parents=True, exist_ok=True)
    faiss.write_index(index, str(INDEX_PATH))

    meta = {
        "dimension": int(dim),
        "count": int(index.ntotal),
        "model": "sentence-transformers/all-MiniLM-L6-v2",
        "mapping": [{"source": r.source, "chunk_id": r.chunk_id} for r in records],
        "chunks_path": str(CHUNKS_PATH.relative_to(ROOT)),
    }
    META_PATH.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote index: {INDEX_PATH}\nWrote meta:  {META_PATH}")


if __name__ == "__main__":
    main()

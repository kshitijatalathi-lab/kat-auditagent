from __future__ import annotations

from pathlib import Path
from typing import List, Dict
import json
import numpy as np

try:
    import faiss  # type: ignore
except Exception as e:  # pragma: no cover
    faiss = None  # type: ignore

from adk.config import settings
from adk.agents.clause_annotator import ClauseAnnotatorAgent, Clause
from adk.agents.embedder import EmbedderAgent


class ClauseIndexer:
    def __init__(self) -> None:
        if faiss is None:
            raise RuntimeError("faiss is required for local clause index. Install faiss-cpu.")
        self.annotator = ClauseAnnotatorAgent()
        self.embedder = EmbedderAgent()
        self.idx_path = settings.processed_dir / "clauses_index.faiss"
        self.meta_path = settings.processed_dir / "clauses_index_meta.json"
        settings.processed_dir.mkdir(parents=True, exist_ok=True)

    def build(self, files: List[str]) -> Dict[str, str]:
        paths = [Path(p) for p in files]
        clauses: List[Clause] = self.annotator.annotate(paths)
        texts = [c.clause_text for c in clauses]
        if not texts:
            raise ValueError("No clauses extracted from provided files")
        emb = self.embedder.embed(texts)
        vecs = emb.vectors.astype(np.float32)
        # Build FAISS index (L2)
        dim = vecs.shape[1]
        index = faiss.IndexFlatIP(dim)
        # Normalize for cosine sim
        norms = np.linalg.norm(vecs, axis=1, keepdims=True) + 1e-12
        vecs_norm = vecs / norms
        index.add(vecs_norm)
        faiss.write_index(index, str(self.idx_path))
        meta = [
            {
                "law": c.law,
                "article": c.article,
                "clause_id": c.clause_id,
                "title": c.title,
                "clause_text": c.clause_text,
                "source_path": c.source_path,
            }
            for c in clauses
        ]
        self.meta_path.write_text(json.dumps(meta, ensure_ascii=False), encoding="utf-8")
        return {"index_path": str(self.idx_path), "meta_path": str(self.meta_path), "count": str(len(meta))}

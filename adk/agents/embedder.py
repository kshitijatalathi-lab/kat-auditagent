from __future__ import annotations

from dataclasses import dataclass
from typing import List, Sequence
import os

import numpy as np

try:
    import vertexai  # type: ignore
    from vertexai.preview import generative_models  # noqa: F401
    from vertexai.language_models import TextEmbeddingModel  # type: ignore
except Exception:  # Optional
    TextEmbeddingModel = None  # type: ignore

try:
    from sentence_transformers import SentenceTransformer
except Exception:
    SentenceTransformer = None  # type: ignore


@dataclass
class EmbeddingResult:
    vectors: np.ndarray
    model: str


class EmbedderAgent:
    def __init__(self, model_name: str | None = None, project: str | None = None, location: str = "us-central1"):
        self.model_name = model_name or os.getenv("VERTEX_EMBED_MODEL", "text-embedding-004")
        self.project = project or os.getenv("GCP_PROJECT")
        self.location = location or os.getenv("GCP_LOCATION", "us-central1")
        self._st_model = None

    def _maybe_st(self):
        global SentenceTransformer
        if SentenceTransformer is None:
            raise RuntimeError("sentence-transformers is not installed")
        if self._st_model is None:
            self._st_model = SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2")
        return self._st_model

    def embed(self, texts: Sequence[str]) -> EmbeddingResult:
        # Prefer Vertex if project is configured and SDK available
        if self.project and TextEmbeddingModel is not None:
            try:
                import google.auth  # type: ignore
                from google.cloud import aiplatform  # type: ignore
                aiplatform.init(project=self.project, location=self.location)
                model = TextEmbeddingModel.from_pretrained(self.model_name)
                res = model.get_embeddings(list(texts))
                vecs = np.array([r.values for r in res], dtype=np.float32)
                return EmbeddingResult(vectors=vecs, model=self.model_name)
            except Exception:
                pass
        # Fallback to local ST, with graceful degradation
        try:
            st = self._maybe_st()
            vecs = st.encode(list(texts), normalize_embeddings=True)
            return EmbeddingResult(vectors=np.array(vecs, dtype=np.float32), model="all-MiniLM-L6-v2")
        except Exception:
            # Deterministic lightweight fallback: hash-based random vectors
            dim = 384
            out = []
            for t in texts:
                seed = abs(hash(t)) % (2**32)
                rng = np.random.RandomState(seed)
                v = rng.randn(dim).astype(np.float32)
                # normalize to unit length
                norm = np.linalg.norm(v) + 1e-12
                out.append(v / norm)
            return EmbeddingResult(vectors=np.vstack(out), model="hash-fallback-384")

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Settings:
    # Project paths
    root: Path = Path(__file__).resolve().parents[1]
    data_dir: Path = root / "data"
    processed_dir: Path = data_dir / "processed"
    uploads_dir: Path = root / "uploads"

    # Local vector index fallback (FAISS)
    faiss_index_path: Path = processed_dir / "index.faiss"
    faiss_meta_path: Path = processed_dir / "index_meta.json"
    faiss_chunks_path: Path = processed_dir / "all_chunks.jsonl"

    # GCP
    gcp_project: str | None = os.getenv("GCP_PROJECT")
    gcp_location: str = os.getenv("GCP_LOCATION", "us-central1")

    # GCS
    gcs_bucket: str | None = os.getenv("GCS_BUCKET")

    # Firestore
    firestore_project: str | None = os.getenv("FIRESTORE_PROJECT") or os.getenv("GCP_PROJECT")

    # Vertex AI
    vertex_embeddings_model: str = os.getenv("VERTEX_EMBED_MODEL", "text-embedding-004")
    vertex_use_matching_engine: bool = os.getenv("USE_MATCHING_ENGINE", "false").lower() in {"1", "true", "yes"}
    vertex_index_id: str | None = os.getenv("VERTEX_ME_INDEX_ID")
    vertex_endpoint_id: str | None = os.getenv("VERTEX_ME_ENDPOINT_ID")

    # LLM Providers (default to Groq; can override with LLM_PROVIDER)
    prefer: str = os.getenv("LLM_PROVIDER", "groq")  # auto|gemini|openai|groq
    openai_model: str = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
    gemini_model: str = os.getenv("GEMINI_MODEL", "gemini-1.5-flash")
    groq_model: str = os.getenv("GROQ_MODEL", "llama3-70b-8192")

    # Security / tenancy
    firebase_project_id: str | None = os.getenv("FIREBASE_PROJECT_ID")
    multitenant: bool = os.getenv("MULTITENANT", "true").lower() in {"1", "true", "yes"}

    # Features
    agents_enabled: bool = os.getenv("AGENTS_ENABLED", "true").lower() in {"1", "true", "yes"}


settings = Settings()

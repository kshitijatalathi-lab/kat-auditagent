from __future__ import annotations

from dataclasses import dataclass, asdict
from typing import Any, Dict, List, Optional
from datetime import datetime
from pathlib import Path
import json
import os

from adk.config import settings

try:
    from google.cloud import firestore  # type: ignore
except Exception:
    firestore = None  # type: ignore


@dataclass
class SessionEvent:
    org_id: str
    user_id: str
    session_id: str
    framework: Optional[str]
    question: str
    user_answer: str
    retrieved_clauses: List[Dict[str, Any]]
    llm_provider: str
    llm_model: str
    score: int
    rationale: str
    timestamp: str


class SessionTrackerAgent:
    def __init__(self, collection: str = "adk_sessions") -> None:
        self.collection = collection
        self._fs = None
        if firestore is not None and settings.firestore_project:
            try:
                self._fs = firestore.Client(project=settings.firestore_project)
            except Exception:
                self._fs = None
        self._local_log = settings.processed_dir / "sessions.jsonl"
        self._local_log.parent.mkdir(parents=True, exist_ok=True)

    def log(self, evt: SessionEvent) -> None:
        rec = asdict(evt)
        # Firestore
        if self._fs is not None:
            try:
                col = self._fs.collection(self.collection).document(evt.session_id)
                col.collection("events").add(rec)
            except Exception:
                pass
        # Local JSONL fallback
        try:
            with self._local_log.open("a", encoding="utf-8") as f:
                f.write(json.dumps(rec, ensure_ascii=False) + "\n")
        except Exception:
            pass

    @staticmethod
    def make_event(
        org_id: str,
        user_id: str,
        session_id: str,
        framework: Optional[str],
        question: str,
        user_answer: str,
        retrieved_clauses: List[Dict[str, Any]],
        llm_provider: str,
        llm_model: str,
        score: int,
        rationale: str,
    ) -> SessionEvent:
        return SessionEvent(
            org_id=org_id,
            user_id=user_id,
            session_id=session_id,
            framework=framework,
            question=question,
            user_answer=user_answer,
            retrieved_clauses=retrieved_clauses,
            llm_provider=llm_provider,
            llm_model=llm_model,
            score=score,
            rationale=rationale,
            timestamp=datetime.utcnow().isoformat() + "Z",
        )

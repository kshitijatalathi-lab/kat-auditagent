from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, List, Optional

import yaml

from .base_agent import BaseAgent
from .chunking_agent import ChunkingAgent
from .retriever_agent import RetrieverAgent
from .scoring_agent import ScoringAgent
from .gap_agent import GapAgent
from .report_agent import ReportAgent
from mcp.gdrive_wrapper import GDriveClient
from mcp.llm_wrapper import LLMClient
from mcp.context import MCPContext


class AgentixUXAgent(BaseAgent):
    """End-to-end UX audit orchestrator.

    Flow: ingest -> chunk -> index -> load checklist -> score -> gaps -> report.
    """

    def __init__(self, *, db_dir: Path, checklists_dir: Path) -> None:
        self.db_dir = db_dir
        self.checklists_dir = checklists_dir
        self.chunker = ChunkingAgent()
        self.retriever = RetrieverAgent(db_dir)
        self.gapper = GapAgent()
        self.reporter = ReportAgent()

    def name(self) -> str:
        return "agentix_ux"

    async def run(
        self,
        *,
        framework: str,
        user_answers: Dict[str, str] | None,
        session_id: str = "ui",
        gdrive_file_id: Optional[str] = None,
        raw_text: Optional[str] = None,
        prefer: Optional[str] = None,
    ) -> Dict[str, Any]:
        # Ingest
        text = raw_text or ""
        if not text and gdrive_file_id:
            ctx = MCPContext()
            gdrive = GDriveClient(ctx)
            text = await gdrive.read_pdf(gdrive_file_id)

        # Chunk + Index (idempotent append store)
        if text:
            chunks = self.chunker.chunk_text(text)
            self.retriever.index_chunks(chunks)

        # Load checklist
        path = self.checklists_dir / f"{framework.lower()}.yaml"
        if not path.exists():
            raise FileNotFoundError(f"Checklist not found: {framework}")
        with path.open("r", encoding="utf-8") as f:
            checklist = yaml.safe_load(f) or {}
        items: List[Dict[str, Any]] = checklist.get("items", [])

        # Score each question
        ctx = MCPContext()
        llm = LLMClient(ctx)
        scorer = ScoringAgent(llm)
        results: List[Dict[str, Any]] = []
        for it in items:
            qid = it.get("id")
            question = it.get("question", "")
            answer = (user_answers or {}).get(qid, "")
            clauses = self.retriever.search(query=question, k=5, framework=framework)
            scored = await scorer.score(
                question=question,
                user_answer=answer,
                clauses=clauses,
                prefer=prefer,
            )
            results.append({
                "id": qid,
                "category": it.get("category"),
                "question": question,
                "user_answer": answer,
                "score": int(scored.get("score", 0)),
                "rationale": scored.get("rationale", ""),
                "citations": scored.get("citations", []),
            })

        # Gaps + Report summary
        gaps = self.gapper.find_gaps(results, min_score=3)
        summary = self.reporter.summarize(results)

        return {
            "framework": framework,
            "session_id": session_id,
            "summary": summary,
            "items": results,
            "gaps": gaps,
        }

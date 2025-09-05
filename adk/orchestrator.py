from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, List, Optional

from adk.config import settings
from adk.agents import (
    PromptBuilderAgent,
    ScorerAgent,
    SessionTrackerAgent,
    ReportGeneratorAgent,
)
from adk.agents.retriever import RetrieverAgent
from adk.services.indexer import ClauseIndexer
from adk.services.gap_analysis import generate_checklist_from_docs, analyze_gaps
from adk.services.policy_editor import PolicyEditor, AnnotationRequest


class Orchestrator:
    """
    High-level coordinator that composes ADK agents.
    Exposes simple methods for indexing, scoring, and report generation.
    """

    def __init__(self) -> None:
        self.retriever = RetrieverAgent()
        self.prompt_builder = PromptBuilderAgent()
        self.scorer = ScorerAgent()
        self.sessions = SessionTrackerAgent()
        self.reporter = ReportGeneratorAgent()

    # ---------- Indexing ----------
    def index_documents(self, files: List[str]) -> Dict[str, Any]:
        idx = ClauseIndexer()
        return idx.build(files)

    # ---------- Scoring ----------
    async def score_question(
        self,
        *,
        session_id: str,
        org_id: str,
        user_id: str,
        framework: str,
        checklist_question: str,
        user_answer: str,
        k: int = 5,
        prefer: Optional[str] = None,
    ) -> Dict[str, Any]:
        # Retrieval
        clauses = self.retriever.search(checklist_question, k=k, framework=framework)
        # Prompt
        bundle = self.prompt_builder.build(checklist_question, user_answer, clauses)
        # Score via LLM (expects a string prompt); be backward-compatible with mocks
        try:
            result = await self.scorer.score(bundle.prompt, prefer=prefer)
        except TypeError:
            # Older FakeScorer in tests may not accept 'prefer'
            result = await self.scorer.score(bundle.prompt)
        # Session log (best-effort)
        try:
            evt = self.sessions.make_event(
                org_id=org_id,
                user_id=user_id,
                session_id=session_id,
                framework=framework,
                question=checklist_question,
                user_answer=user_answer,
                retrieved_clauses=bundle.clauses,
                llm_provider=result.provider,
                llm_model=result.model,
                score=result.score,
                rationale=result.rationale,
            )
            self.sessions.log(evt)
        except Exception:
            pass
        return {
            "score": result.score,
            "rationale": result.rationale,
            "clauses": bundle.clauses,
            "llm_provider": result.provider,
            "llm_model": result.model,
        }

    # ---------- Reports ----------
    def generate_report(
        self,
        *,
        session_id: str,
        org_id: str,
        items: List[Dict[str, Any]],
        upload_to_gcs: bool = True,
        options: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        out = self.reporter.generate(
            session_id=session_id,
            org_id=org_id,
            items=items,
            options=options or {},
            upload_to_gcs=upload_to_gcs,
        )
        # Session log (non-critical)
        try:
            # We log a synthetic score-style event summarizing report generation
            evt = self.sessions.make_event(
                org_id=org_id,
                user_id="system",
                session_id=session_id,
                framework=None,
                question="report_generated",
                user_answer="",
                retrieved_clauses=[],
                llm_provider="",
                llm_model="",
                score=0,
                rationale="report",
            )
            self.sessions.log(evt)
        except Exception:
            pass
        return out

    # ---------- Checklist generation from uploaded docs ----------
    def generate_checklist(self, *, framework: str, files: List[str], top_n: int = 20) -> Dict[str, Any]:
        return generate_checklist_from_docs(framework, files, top_n)

    # ---------- Batch scoring for a checklist ----------
    async def score_batch(
        self,
        *,
        session_id: str,
        org_id: str,
        user_id: str,
        framework: str,
        items: List[Dict[str, Any]],  # each has question, user_answer
        k: int = 5,
        prefer: Optional[str] = None,
    ) -> Dict[str, Any]:
        results: List[Dict[str, Any]] = []
        total = 0.0
        count = 0
        for it in items:
            q = it.get("question", "")
            a = it.get("user_answer", "")
            r = await self.score_question(
                session_id=session_id,
                org_id=org_id,
                user_id=user_id,
                framework=framework,
                checklist_question=q,
                user_answer=a,
                k=k,
                prefer=prefer,
            )
            results.append({
                "question": q,
                "user_answer": a,
                "score": r.get("score", 0),
                "rationale": r.get("rationale", ""),
                "clauses": r.get("clauses", []),
                "llm_provider": r.get("llm_provider", ""),
                "llm_model": r.get("llm_model", ""),
            })
            try:
                total += float(r.get("score", 0))
                count += 1
            except Exception:
                pass
        composite = total / count if count else 0.0
        return {"items": results, "composite_score": composite}

    # ---------- Gap analysis ----------
    def compute_gaps(self, *, scored_items: List[Dict[str, Any]], min_score: int = 4) -> Dict[str, Any]:
        return analyze_gaps(scored_items, min_score=min_score)

    # ---------- Policy annotation ----------
    def annotate_policy(self, *, file: str, gaps: List[Dict[str, Any]], out_path: Optional[str] = None) -> Dict[str, Any]:
        editor = PolicyEditor()
        final_path = editor.annotate(AnnotationRequest(file=file, gaps=gaps, out_path=out_path))
        return {"annotated_path": final_path}

import asyncio
from typing import Any, Dict, List, Optional

import pytest

from adk.services.audit_pipeline import PolicyAuditPipeline
from adk.llm.mcp_router import LLMResponse


class DummyOrchestrator:
    def index_documents(self, files: List[str]) -> Dict[str, Any]:
        return {"ok": True, "count": len(files)}

    def generate_checklist(self, *, framework: str, files: List[str], top_n: int = 20) -> Dict[str, Any]:
        return {
            "items": [
                {"question": "Is data encrypted at rest?"},
                {"question": "Is access role-based?"},
            ][:top_n]
        }

    async def score_batch(self, *, session_id: str, org_id: str, user_id: str, framework: str, items: List[Dict[str, Any]], k: int = 5) -> Dict[str, Any]:
        results = []
        for it in items:
            results.append({
                "question": it["question"],
                "user_answer": it.get("user_answer", ""),
                "score": 3,
                "rationale": "mocked",
                "clauses": [{"id": "c1", "source": "policy.pdf", "text": "sample"}],
                "llm_provider": "mock",
                "llm_model": "mock-1",
            })
        return {"items": results, "composite_score": 3.0}

    def compute_gaps(self, *, scored_items: List[Dict[str, Any]], min_score: int = 4) -> Dict[str, Any]:
        # Any score < 4 is a gap
        gaps = []
        for it in scored_items:
            if int(it.get("score", 0)) < min_score:
                gaps.append({
                    "question": it["question"],
                    "suggestion": "Add control",
                })
        return {"items": gaps}

    def annotate_policy(self, *, file: str, gaps: List[Dict[str, Any]], out_path: Optional[str] = None) -> Dict[str, Any]:
        # For test, pretend the input file is the annotated output so existence check passes
        return {"annotated_path": file}


class MockLLM:
    async def generate(self, prompt: str, prefer: str | None = None, temperature: float = 0.2):
        return LLMResponse(
            text=(
                "Section: Data Handling\n"
                "We process personal data lawfully and transparently.\n"
                "Section: Access Controls\n"
                "Role-based access is enforced.\n"
            ),
            provider="mock",
            model="mock-1",
        )


@pytest.mark.asyncio
async def test_policy_audit_pipeline_with_mocks():
    pipeline = PolicyAuditPipeline(orchestrator=DummyOrchestrator(), llm=MockLLM())
    out = await pipeline.run(
        file_path="uploads/CELEX_32016R0679_EN_TXT.pdf",
        org_id="acme",
        policy_type="gdpr",
        top_k=5,
    )

    # Checklist and scores
    assert out.get("policy_type") == "gdpr"
    assert out.get("composite") == pytest.approx(3.0)
    assert len(out.get("scores", [])) == 2

    # Gaps and corrected draft
    assert len(out.get("gaps", [])) >= 1
    assert out.get("corrected_draft")

    # Artifacts
    assert out.get("report_path")  # PDF generated
    assert out.get("annotated_path")  # uses input path in dummy

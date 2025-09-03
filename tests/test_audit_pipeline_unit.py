import asyncio
import os
from pathlib import Path
from typing import Any, Dict, List, Optional

import pytest

from adk.services.audit_pipeline import PolicyAuditPipeline


class DummyOrchestrator:
    def __init__(self,
                 checklist: Optional[List[Dict[str, Any]]] = None,
                 score_items: Optional[List[Dict[str, Any]]] = None,
                 composite: float = 0.0,
                 gaps: Optional[List[Dict[str, Any]]] = None,
                 annotate_ok: bool = True,
                 ) -> None:
        self._checklist = checklist if checklist is not None else []
        self._score_items = score_items if score_items is not None else []
        self._composite = composite
        self._gaps = gaps if gaps is not None else []
        self._annotate_ok = annotate_ok

    def index_documents(self, files: List[str]) -> Dict[str, Any]:
        return {"ok": True, "count": len(files)}

    def generate_checklist(self, *, framework: str, files: List[str], top_n: int = 20) -> Dict[str, Any]:
        return {"items": self._checklist}

    async def score_batch(self, *, session_id: str, org_id: str, user_id: str, framework: str, items: List[Dict[str, Any]], k: int = 5) -> Dict[str, Any]:
        return {"items": self._score_items, "composite_score": self._composite}

    def compute_gaps(self, *, scored_items: List[Dict[str, Any]], min_score: int = 4) -> Dict[str, Any]:
        return {"items": self._gaps}

    def annotate_policy(self, *, file: str, gaps: List[Dict[str, Any]], out_path: Optional[str] = None) -> Dict[str, Any]:
        # Write a tiny empty PDF if requested and annotate_ok True
        if out_path and self._annotate_ok:
            Path(out_path).parent.mkdir(parents=True, exist_ok=True)
            # create an empty file placeholder
            Path(out_path).write_bytes(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
            return {"annotated_path": out_path}
        return {"annotated_path": out_path or ""}


class DummyLLM:
    def __init__(self, text: Optional[str] = "Draft") -> None:
        self._text = text

    class _Res:
        def __init__(self, text: Optional[str]):
            self.text = text

    async def generate(self, prompt: str):
        if isinstance(self._text, Exception):
            raise self._text
        return DummyLLM._Res(self._text)


@pytest.mark.asyncio
async def test_pipeline_handles_missing_file(tmp_path: Path):
    # Non-existent file should not crash pipeline
    orch = DummyOrchestrator(checklist=[{"question": "Q1"}],
                             score_items=[{"question": "Q1", "score": 5, "rationale": "ok", "clauses": []}],
                             composite=5.0,
                             gaps=[{"question": "Q1", "suggestion": "Improve"}],
                             )
    llm = DummyLLM(text="Section: ...")
    p = PolicyAuditPipeline(orchestrator=orch, llm=llm)
    out = await p.run(file_path=str(tmp_path / "nope.pdf"), org_id="acme", policy_type="hr", top_k=5)
    assert isinstance(out.get("policy_type"), str)
    assert isinstance(out.get("composite"), (int, float))
    assert isinstance(out.get("checklist"), list)
    assert isinstance(out.get("scores"), list)
    assert isinstance(out.get("gaps"), list)


@pytest.mark.asyncio
async def test_pipeline_empty_checklist(tmp_path: Path):
    orch = DummyOrchestrator(checklist=[], score_items=[], composite=0.0, gaps=[])
    llm = DummyLLM(text="Section: ...")
    p = PolicyAuditPipeline(orchestrator=orch, llm=llm)
    out = await p.run(file_path=str(tmp_path / "file.pdf"), org_id="acme", policy_type="hr", top_k=3)
    assert out.get("checklist") == []
    assert out.get("scores") == []
    assert out.get("composite") == 0.0


@pytest.mark.asyncio
async def test_pipeline_llm_failure(tmp_path: Path):
    orch = DummyOrchestrator(checklist=[{"question": "Q1"}],
                             score_items=[{"question": "Q1", "score": 3, "rationale": "gap", "clauses": []}],
                             composite=3.0,
                             gaps=[{"question": "Q1", "suggestion": "Improve"}],
                             )
    llm = DummyLLM(text=RuntimeError("llm down"))
    p = PolicyAuditPipeline(orchestrator=orch, llm=llm)
    out = await p.run(file_path=str(tmp_path / "file.pdf"), org_id="acme", policy_type="hr", top_k=5)
    assert out.get("corrected_draft") is None

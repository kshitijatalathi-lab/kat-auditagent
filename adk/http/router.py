from __future__ import annotations

from typing import Any, Dict, List, Optional
from dataclasses import dataclass
from fastapi import APIRouter
from fastapi import UploadFile, File
from pydantic import BaseModel

from adk.orchestrator import Orchestrator
from adk.services import checklists as ck
from adk.config import settings

router = APIRouter()
_orch = Orchestrator()


class ScoreRequest(BaseModel):
    session_id: str
    org_id: str = "default_org"
    user_id: str = "anonymous"
    checklist_question: str
    user_answer: str
    k: int = 5
    framework: Optional[str] = None  # e.g., GDPR/DPDP/HIPAA


class ScoreResponse(BaseModel):
    ok: bool
    score: int
    rationale: str
    provider: str
    model: str
    clauses: List[Dict[str, Any]]


class ReportItem(BaseModel):
    question: str
    user_answer: str
    score: int
    rationale: str
    llm_provider: str
    llm_model: str
    clauses: List[Dict[str, Any]]


class ReportRequest(BaseModel):
    session_id: str
    org_id: str
    items: List[ReportItem]


class ReportResponse(BaseModel):
    json_path: Optional[str]
    pdf_path: Optional[str]
    json_gcs: Optional[str]
    pdf_gcs: Optional[str]


class IndexRequest(BaseModel):
    files: List[str]  # absolute or relative paths on server


class IndexResponse(BaseModel):
    index_path: Optional[str]
    meta_path: Optional[str]
    count: Optional[int]
    ok: bool = True


class ChecklistListResponse(BaseModel):
    frameworks: List[str]


class ChecklistResponse(BaseModel):
    framework: str
    version: str
    items: List[dict]


class UploadResponse(BaseModel):
    path: str
    filename: str


@router.post("/adk/score", response_model=ScoreResponse)
async def adk_score(req: ScoreRequest) -> ScoreResponse:
    out = await _orch.score_question(
        session_id=req.session_id,
        org_id=req.org_id,
        user_id=req.user_id,
        framework=req.framework or "GDPR",
        checklist_question=req.checklist_question,
        user_answer=req.user_answer,
        k=req.k,
    )
    return ScoreResponse(
        ok=True,
        score=int(out.get("score", 3)),
        rationale=str(out.get("rationale", "")),
        provider=str(out.get("llm_provider", "unknown")),
        model=str(out.get("llm_model", "unknown")),
        clauses=out.get("clauses", []),
    )


@router.post("/adk/report", response_model=ReportResponse)
async def adk_report(req: ReportRequest) -> ReportResponse:
    items = [
        {
            "question": it.question,
            "user_answer": it.user_answer,
            "score": it.score,
            "rationale": it.rationale,
            "llm_provider": it.llm_provider,
            "llm_model": it.llm_model,
            "clauses": it.clauses,
        }
        for it in req.items
    ]
    res = _orch.generate_report(
        session_id=req.session_id,
        org_id=req.org_id,
        items=items,
        upload_to_gcs=True,
    )
    return ReportResponse(**res)


@router.post("/adk/index", response_model=IndexResponse)
async def adk_index(req: IndexRequest) -> IndexResponse:
    out = _orch.index_documents(req.files)
    return IndexResponse(index_path=out.get("index_path"), meta_path=out.get("meta_path"), count=int(out.get("count", 0)), ok=True)


@router.get("/adk/checklists", response_model=ChecklistListResponse)
async def adk_checklists() -> ChecklistListResponse:
    return ChecklistListResponse(frameworks=ck.list_frameworks())


@router.get("/adk/checklists/{framework}", response_model=ChecklistResponse)
async def adk_checklist(framework: str) -> ChecklistResponse:
    data = ck.load_checklist(framework)
    return ChecklistResponse(framework=data.get("framework", framework), version=data.get("version", "1.0"), items=data.get("items", []))


@router.post("/adk/upload", response_model=UploadResponse)
async def adk_upload(file: UploadFile = File(...)) -> UploadResponse:
    settings.uploads_dir.mkdir(parents=True, exist_ok=True)
    dest = settings.uploads_dir / file.filename
    content = await file.read()
    dest.write_bytes(content)
    return UploadResponse(path=str(dest), filename=file.filename)


# --------- New: Checklist generation from uploaded docs ---------
class ChecklistGenRequest(BaseModel):
    framework: str = "GDPR"
    files: List[str]
    top_n: int = 20


class ChecklistGenResponse(BaseModel):
    framework: str
    version: str
    items: List[dict]


@router.post("/adk/checklist/generate", response_model=ChecklistGenResponse)
async def adk_checklist_generate(req: ChecklistGenRequest) -> ChecklistGenResponse:
    out = _orch.generate_checklist(framework=req.framework, files=req.files, top_n=req.top_n)
    return ChecklistGenResponse(framework=out.get("framework", req.framework), version=out.get("version", "1.0"), items=out.get("items", []))


# --------- New: Batch scoring ---------
class BatchScoreItem(BaseModel):
    question: str
    user_answer: str


class BatchScoreRequest(BaseModel):
    session_id: str
    org_id: str = "default_org"
    user_id: str = "anonymous"
    framework: str = "GDPR"
    items: List[BatchScoreItem]
    k: int = 5


class BatchScoreResponse(BaseModel):
    items: List[Dict[str, Any]]
    composite_score: float


@router.post("/adk/score/batch", response_model=BatchScoreResponse)
async def adk_score_batch(req: BatchScoreRequest) -> BatchScoreResponse:
    items = [{"question": i.question, "user_answer": i.user_answer} for i in req.items]
    out = await _orch.score_batch(
        session_id=req.session_id,
        org_id=req.org_id,
        user_id=req.user_id,
        framework=req.framework,
        items=items,
        k=req.k,
    )
    return BatchScoreResponse(items=out.get("items", []), composite_score=float(out.get("composite_score", 0.0)))


# --------- New: Gap analysis ---------
class GapAnalysisRequest(BaseModel):
    scored_items: List[Dict[str, Any]]
    min_score: int = 4


class GapAnalysisResponse(BaseModel):
    count: int
    items: List[Dict[str, Any]]


@router.post("/adk/gaps", response_model=GapAnalysisResponse)
async def adk_gaps(req: GapAnalysisRequest) -> GapAnalysisResponse:
    out = _orch.compute_gaps(scored_items=req.scored_items, min_score=req.min_score)
    return GapAnalysisResponse(count=int(out.get("count", 0)), items=out.get("items", []))


# --------- New: Policy PDF annotation ---------
class PolicyAnnotateRequest(BaseModel):
    file: str
    gaps: List[Dict[str, Any]]
    out_path: Optional[str] = None


class PolicyAnnotateResponse(BaseModel):
    annotated_path: str


@router.post("/adk/policy/annotate", response_model=PolicyAnnotateResponse)
async def adk_policy_annotate(req: PolicyAnnotateRequest) -> PolicyAnnotateResponse:
    out = _orch.annotate_policy(file=req.file, gaps=req.gaps, out_path=req.out_path)
    return PolicyAnnotateResponse(annotated_path=str(out.get("annotated_path", "")))

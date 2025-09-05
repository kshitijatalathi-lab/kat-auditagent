from __future__ import annotations

from typing import Any, Dict, List, Optional
import os
import io
import zipfile
from datetime import datetime
from pathlib import Path
from dataclasses import dataclass
import textwrap
import asyncio
from fastapi import APIRouter
from fastapi import UploadFile, File
from pydantic import BaseModel
from fastapi.responses import StreamingResponse
import json
from pypdf import PdfReader, PdfWriter  # fallback for annotate output
try:
    from openai import OpenAI
except Exception:  # library optional until enabled
    OpenAI = None  # type: ignore

from adk.orchestrator import Orchestrator
from adk.agents.retriever import RetrieverAgent
from adk.agents.embedder import EmbedderAgent
from adk.agents.prompt_builder import PromptBuilderAgent as PromptBuilder
from adk.agents.scorer import ScorerAgent
from adk.agents.clause_annotator import ClauseAnnotatorAgent as ClauseAnnotator
from adk.agents.report_generator import ReportGeneratorAgent as ReportGenerator
from adk.services import checklists as ck
from adk.config import settings
from adk.llm.mcp_router import LLMRouter
from adk.services.report_writer import write_audit_pdf
from adk.services.audit_pipeline import PolicyAuditPipeline
from adk.services.indexer import ClauseIndexer

router = APIRouter()
_orch = Orchestrator()
_llm = LLMRouter()
_pipeline = PolicyAuditPipeline(orchestrator=_orch, llm=_llm)

# --------- Agent Registry and Tools Catalog ---------
@router.get("/ai/agents/registry")
async def ai_agents_registry() -> Dict[str, Any]:
    """Return a registry of agents, their responsibilities, and the MCP tools they use."""
    agents = [
        {
            "id": "retriever",
            "name": "RetrieverAgent",
            "role": "Retrieval of relevant clauses from indexes and corpora",
            "tools": ["index_documents", "search_clauses"],
        },
        {
            "id": "prompt_builder",
            "name": "PromptBuilderAgent",
            "role": "Craft prompts for scoring and generation using retrieved clauses",
            "tools": ["build_scoring_prompt"],
        },
        {
            "id": "scorer",
            "name": "ScorerAgent",
            "role": "Score checklist questions using LLMRouter with provider preference",
            "tools": ["score_question", "score_batch"],
        },
        {
            "id": "reporter",
            "name": "ReportGeneratorAgent",
            "role": "Compile results, gaps, and corrected drafts into a report",
            "tools": ["compute_gaps", "generate_report"],
        },
        {
            "id": "orchestrator",
            "name": "PolicyAuditPipeline",
            "role": "End-to-end Auto Audit orchestration across agents",
            "tools": ["auto_audit"],
        },
    ]
    return {"agents": agents}


@router.get("/ai/agents/graph")
async def ai_agents_graph() -> Dict[str, Any]:
    """Directed acyclic graph of agents and tool invocations for the audit pipeline."""
    nodes = [
        {"id": "embedder", "label": "EmbedderAgent"},
        {"id": "retriever", "label": "RetrieverAgent"},
        {"id": "prompt_builder", "label": "PromptBuilder"},
        {"id": "scorer", "label": "ScorerAgent"},
        {"id": "annotator", "label": "ClauseAnnotator"},
        {"id": "reporter", "label": "ReportGenerator"},
        {"id": "orchestrator", "label": "PolicyAuditPipeline"},
    ]
    edges = [
        {"from": "embedder", "to": "retriever", "label": "vectorize -> retrieve"},
        {"from": "retriever", "to": "prompt_builder", "label": "clauses -> prompt"},
        {"from": "prompt_builder", "to": "scorer", "label": "score batch"},
        {"from": "scorer", "to": "annotator", "label": "gaps -> annotate"},
        {"from": "scorer", "to": "reporter", "label": "results -> report"},
        {"from": "annotator", "to": "reporter", "label": "annotated -> report"},
        {"from": "orchestrator", "to": "reporter", "label": "finalize"},
    ]
    return {"nodes": nodes, "edges": edges}


@router.get("/ai/agents/status")
async def ai_agents_status() -> Dict[str, Any]:
    """Lightweight health/status snapshot for key agents and providers."""
    def safe_health(make):
        try:
            agent = make()
            if hasattr(agent, "health"):
                return {"ok": True, "details": agent.health()}
            return {"ok": True}
        except Exception as e:
            return {"ok": False, "error": str(e)}

    return {
        "embedder": safe_health(lambda: EmbedderAgent()),
        "retriever": safe_health(lambda: RetrieverAgent()),
        "prompt_builder": safe_health(lambda: PromptBuilder()),
        "scorer": safe_health(lambda: ScorerAgent()),
        "annotator": safe_health(lambda: ClauseAnnotator()),
        "reporter": safe_health(lambda: ReportGenerator()),
        "pipeline": True,
        "providers": {
            "openai_available": bool(os.getenv("OPENAI_API_KEY")),
            "groq_available": bool(os.getenv("GROQ_API_KEY")),
            "gemini_available": bool(os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")),
        },
    }

@router.get("/ai/tools/catalog")
async def ai_tools_catalog() -> Dict[str, Any]:
    """Return a catalog of available MCP tools and brief descriptions."""
    tools = [
        {
            "tool": "index_documents",
            "desc": "Index uploaded policy and corpus for retrieval.",
            "schema": {
                "type": "object",
                "properties": {
                    "files": {"type": "array", "items": {"type": "string"}},
                },
                "required": ["files"],
            },
        },
        {
            "tool": "score_question",
            "desc": "Score a single checklist question using LLM and citations.",
            "schema": {
                "type": "object",
                "properties": {
                    "session_id": {"type": "string"},
                    "org_id": {"type": "string"},
                    "framework": {"type": "string"},
                    "checklist_question": {"type": "string"},
                    "user_answer": {"type": "string"},
                    "k": {"type": "integer", "minimum": 1, "maximum": 10},
                    "prefer": {"type": "string", "enum": ["auto","openai","groq","gemini"]},
                },
                "required": ["session_id","org_id","framework","checklist_question","user_answer"],
            },
        },
        {
            "tool": "compute_gaps",
            "desc": "Compute gaps from scored items and extract citations.",
            "schema": {
                "type": "object",
                "properties": {
                    "scored_items": {"type": "array", "items": {"type": "object"}},
                    "min_score": {"type": "integer", "minimum": 1, "maximum": 5},
                },
                "required": ["scored_items"],
            },
        },
        {
            "tool": "generate_report",
            "desc": "Generate an audit report (JSON/PDF).",
            "schema": {
                "type": "object",
                "properties": {
                    "session_id": {"type": "string"},
                    "org_id": {"type": "string"},
                    "items": {"type": "array", "items": {"type": "object"}},
                    "upload_to_gcs": {"type": "boolean"},
                },
                "required": ["session_id","org_id","items"],
            },
        },
        {
            "tool": "auto_audit",
            "desc": "Run end-to-end audit pipeline automatically.",
            "schema": {
                "type": "object",
                "properties": {
                    "file_path": {"type": "string"},
                    "org_id": {"type": "string"},
                    "policy_type": {"type": "string"},
                    "top_k": {"type": "integer", "minimum": 1, "maximum": 20},
                    "prefer": {"type": "string", "enum": ["auto","openai","groq","gemini"]},
                },
                "required": ["file_path","org_id"],
            },
        },
    ]
    return {"tools": tools}


# --- Helper: Tool catalog map and lightweight schema validation/enrichment ---
def _tool_catalog_map() -> Dict[str, Dict[str, Any]]:
    """Return a mapping of tool -> schema copied from ai_tools_catalog.
    Keep in sync with ai_tools_catalog above.
    """
    catalog = {
        "index_documents": {
            "type": "object",
            "properties": {
                "files": {"type": "array", "items": {"type": "string"}},
            },
            "required": ["files"],
        },
        "score_question": {
            "type": "object",
            "properties": {
                "session_id": {"type": "string"},
                "org_id": {"type": "string"},
                "framework": {"type": "string"},
                "checklist_question": {"type": "string"},
                "user_answer": {"type": "string"},
                "k": {"type": "integer", "minimum": 1, "maximum": 10},
                "prefer": {"type": "string", "enum": ["auto", "openai", "groq", "gemini"]},
            },
            "required": ["session_id", "org_id", "framework", "checklist_question", "user_answer"],
        },
        "compute_gaps": {
            "type": "object",
            "properties": {
                "scored_items": {"type": "array", "items": {"type": "object"}},
                "min_score": {"type": "integer", "minimum": 1, "maximum": 5},
            },
            "required": ["scored_items"],
        },
        "generate_report": {
            "type": "object",
            "properties": {
                "session_id": {"type": "string"},
                "org_id": {"type": "string"},
                "items": {"type": "array", "items": {"type": "object"}},
                "upload_to_gcs": {"type": "boolean"},
            },
            "required": ["session_id", "org_id", "items"],
        },
        "auto_audit": {
            "type": "object",
            "properties": {
                "file_path": {"type": "string"},
                "org_id": {"type": "string"},
                "policy_type": {"type": "string"},
                "top_k": {"type": "integer", "minimum": 1, "maximum": 20},
                "prefer": {"type": "string", "enum": ["auto", "openai", "groq", "gemini"]},
            },
            "required": ["file_path", "org_id"],
        },
    }
    return catalog


def _coerce_type(value: Any, schema: Dict[str, Any]) -> Any:
    """Best-effort type coercion for integer/boolean based on schema."""
    t = schema.get("type")
    try:
        if t == "integer" and value is not None:
            return int(value)
        if t == "boolean" and value is not None:
            if isinstance(value, bool):
                return value
            if isinstance(value, str):
                return value.lower() in ("1", "true", "yes", "on")
            return bool(value)
    except Exception:
        return value
    return value


def _validate_and_enrich_args(tool: str, args: Dict[str, Any], req: "OpenAIAgentRequest") -> (Optional[Dict[str, Any]], Optional[Dict[str, Any]]):
    """Validate args against tool schema and enrich from request/session defaults.
    Returns (enriched_args, None) on success or (None, errors) on failure.
    """
    schemas = _tool_catalog_map()
    schema = schemas.get(tool)
    if not schema:
        return None, {"error": f"unknown tool: {tool}"}

    enriched = dict(args or {})

    # Enrichment from request context per tool
    if tool == "score_question":
        enriched.setdefault("session_id", req.session_id)
        enriched.setdefault("org_id", req.org_id)
        enriched.setdefault("user_id", req.user_id)
        enriched.setdefault("framework", "GDPR")
        enriched.setdefault("k", 5)
        if req.prefer and not enriched.get("prefer"):
            enriched["prefer"] = req.prefer
    elif tool == "generate_report":
        enriched.setdefault("session_id", req.session_id)
        enriched.setdefault("org_id", req.org_id)
        enriched.setdefault("upload_to_gcs", True)
    elif tool == "auto_audit":
        enriched.setdefault("org_id", req.org_id or "default_org")
        enriched.setdefault("top_k", 8)
        if req.prefer and not enriched.get("prefer"):
            enriched["prefer"] = req.prefer

    # Lightweight validation
    errors: Dict[str, Any] = {"missing": [], "invalid": []}
    props = schema.get("properties", {})
    # Coerce simple types
    for key, spec in props.items():
        if key in enriched:
            enriched[key] = _coerce_type(enriched[key], spec)
            # enum check
            if "enum" in spec and enriched[key] not in spec["enum"]:
                errors["invalid"].append({key: f"must be one of {spec['enum']}"})
            # numeric bounds
            if spec.get("type") == "integer":
                try:
                    v = int(enriched[key])
                    if "minimum" in spec and v < spec["minimum"]:
                        errors["invalid"].append({key: f"must be >= {spec['minimum']}"})
                    if "maximum" in spec and v > spec["maximum"]:
                        errors["invalid"].append({key: f"must be <= {spec['maximum']}"})
                except Exception:
                    errors["invalid"].append({key: "must be integer"})

    for req_key in schema.get("required", []):
        if enriched.get(req_key) in (None, "", []):
            errors["missing"].append(req_key)

    # Clean empty sections
    if not errors["missing"] and not errors["invalid"]:
        return enriched, None
    if not errors["missing"]:
        errors.pop("missing")
    if not errors.get("invalid"):
        errors.pop("invalid", None)
    return None, errors


class ScoreRequest(BaseModel):
    session_id: str
    org_id: str = "default_org"
    user_id: str = "anonymous"
    checklist_question: str
    user_answer: str
    k: int = 5
    framework: Optional[str] = None  # e.g., GDPR/DPDP/HIPAA
    prefer: Optional[str] = None  # preferred LLM provider: openai|groq|gemini


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
    options: Optional[Dict[str, Any]] = None


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
    count: int
    ok: bool = True


class IndexStatsResponse(BaseModel):
    exists: bool
    count: int
    index_path: Optional[str] = None
    meta_path: Optional[str] = None
    updated_at: Optional[str] = None


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
        prefer=req.prefer,
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
        options=req.options or {},
    )
    return ReportResponse(**res)


@router.post("/adk/index", response_model=IndexResponse)
async def adk_index(req: IndexRequest) -> IndexResponse:
    out = _orch.index_documents(req.files)
    return IndexResponse(index_path=out.get("index_path"), meta_path=out.get("meta_path"), count=int(out.get("count", 0)), ok=True)

@router.get("/adk/index/stats", response_model=IndexStatsResponse)
async def adk_index_stats() -> IndexStatsResponse:
    try:
        idx = ClauseIndexer()
        index_path = str(idx.idx_path)
        meta_path = str(idx.meta_path)
        count = 0
        updated_at: Optional[str] = None
        if os.path.exists(meta_path):
            try:
                with open(meta_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    if isinstance(data, list):
                        count = len(data)
            except Exception:
                pass
        # Prefer meta mtime, else index mtime
        mtime_path = meta_path if os.path.exists(meta_path) else (index_path if os.path.exists(index_path) else None)
        if mtime_path:
            try:
                ts = os.path.getmtime(mtime_path)
                updated_at = datetime.utcfromtimestamp(ts).isoformat() + "Z"
            except Exception:
                updated_at = None
        exists = os.path.exists(index_path) or os.path.exists(meta_path)
        return IndexStatsResponse(exists=exists, count=count, index_path=index_path, meta_path=meta_path, updated_at=updated_at)
    except Exception:
        return IndexStatsResponse(exists=False, count=0)


@router.get("/adk/checklists", response_model=ChecklistListResponse)
async def adk_checklists() -> ChecklistListResponse:
    return ChecklistListResponse(frameworks=ck.list_frameworks())


@router.get("/adk/checklists/{framework}", response_model=ChecklistResponse)
async def adk_checklist(framework: str) -> ChecklistResponse:
    try:
        data = ck.load_checklist(framework)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Checklist not found: {framework}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to load checklist {framework}: {e}")
    return ChecklistResponse(
        framework=str(data.get("framework", framework)),
        version=str(data.get("version", "1.0")),
        items=data.get("items", []),
    )


@router.post("/adk/upload", response_model=UploadResponse)
async def adk_upload(file: UploadFile = File(...)) -> UploadResponse:
    settings.uploads_dir.mkdir(parents=True, exist_ok=True)
    dest = settings.uploads_dir / file.filename
    content = await file.read()
    dest.write_bytes(content)
    return UploadResponse(path=str(dest), filename=file.filename)


# --------- AI: Streaming chat (SSE-like) ---------
class ChatRequest(BaseModel):
    prompt: str
    prefer: Optional[str] = None
    temperature: Optional[float] = 0.2


def _sse_chunk(data: str) -> bytes:
    # Minimal SSE formatting
    return f"data: {data}\n\n".encode("utf-8")


@router.post("/ai/chat")
async def ai_chat(req: ChatRequest):
    async def gen():
        # Stream chunks from LLMRouter (provider-native ready)
        async for chunk in _llm.generate_stream(req.prompt, prefer=req.prefer, temperature=float(req.temperature or 0.2)):
            yield _sse_chunk(chunk)
        # final event marker (optional)
        yield _sse_chunk("[DONE]")

    return StreamingResponse(gen(), media_type="text/event-stream")


 


 


# --------- Jobs listing and details (run history) ---------
def _load_jobs(limit: int = 20) -> List[Dict[str, Any]]:
    path = settings.root / "data" / "processed" / "session_states" / "jobs.jsonl"
    out: List[Dict[str, Any]] = []
    try:
        if path.exists():
            with open(str(path), "r", encoding="utf-8") as f:
                lines = f.readlines()[-limit:]
            for ln in lines:
                try:
                    out.append(json.loads(ln))
                except Exception:
                    continue
    except Exception:
        pass
    # Also merge in-memory jobs (recent runtime) if not persisted yet
    try:
        for jid, j in list(_jobs.items()):
            if j.get("status") in ("completed", "error", "cancelled"):
                if not any(rec.get("job_id") == jid for rec in out):
                    out.append({
                        "job_id": jid,
                        "status": j.get("status"),
                        "created_at": j.get("created_at"),
                        "params": j.get("params", {}),
                        "result": j.get("result", {}),
                    })
    except Exception:
        pass
    # Newest first
    out.sort(key=lambda r: r.get("created_at", ""), reverse=True)
    return out[:limit]


@router.get("/adk/policy/audit/jobs")
async def adk_policy_audit_jobs(limit: int = 20) -> Dict[str, Any]:
    return {"jobs": _load_jobs(limit=limit)}


@router.get("/adk/policy/audit/job/{job_id}")
async def adk_policy_audit_job_detail(job_id: str) -> Dict[str, Any]:
    # First look in memory
    async with _jobs_lock:
        job = _jobs.get(job_id)
    if job:
        return {
            "job_id": job_id,
            "status": job.get("status"),
            "created_at": job.get("created_at"),
            "params": job.get("params", {}),
            "result": job.get("result", {}),
        }
    # Fallback to disk
    for rec in _load_jobs(limit=500):
        if rec.get("job_id") == job_id:
            return rec
    from fastapi import HTTPException
    raise HTTPException(status_code=404, detail="job not found")


# --------- New: Download all artifacts (zip) for a completed job ---------
@router.get("/adk/policy/audit/job/{job_id}/artifacts.zip")
async def adk_policy_audit_job_artifacts_zip(job_id: str):
    async with _jobs_lock:
        job = _jobs.get(job_id)
        if not job:
            from fastapi import HTTPException
            raise HTTPException(status_code=404, detail="job not found")
        result: Dict[str, Any] = job.get("result") or {}
        params: Dict[str, Any] = job.get("params") or {}

    # Prepare in-memory zip
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
        # Include report PDF if available
        report_path = result.get("report_path")
        if report_path and os.path.exists(report_path):
            zf.write(report_path, arcname=os.path.basename(report_path))
        # Include annotated PDF if available
        annotated_path = result.get("annotated_path")
        if annotated_path and os.path.exists(annotated_path):
            zf.write(annotated_path, arcname=os.path.basename(annotated_path))
        # Include results.json summary
        try:
            summary = {
                "job_id": job_id,
                "params": params,
                "result": result,
            }
            zf.writestr("results.json", json.dumps(summary, indent=2))
        except Exception:
            pass
        # Include corrected draft as text if present
        draft = result.get("corrected_draft")
        if isinstance(draft, str) and draft.strip():
            try:
                zf.writestr("corrected_draft.txt", draft)
            except Exception:
                pass

    buf.seek(0)
    headers = {
        "Content-Disposition": f"attachment; filename=artifacts-{job_id}.zip"
    }
    return StreamingResponse(buf, media_type="application/zip", headers=headers)


# --------- Background job orchestration for Auto Audit ---------
class PolicyAuditJobRequest(BaseModel):
    file_path: str
    org_id: str = "default_org"
    policy_type: Optional[str] = None
    top_k: int = 8
    prefer: Optional[str] = None


class PolicyAuditJobResponse(BaseModel):
    job_id: str
    status: str


_jobs: Dict[str, Dict[str, Any]] = {}
_jobs_lock = asyncio.Lock()


async def _start_audit_job(job_id: str, params: Dict[str, Any]):
    q: asyncio.Queue = _jobs[job_id]["queue"]
    _jobs[job_id]["status"] = "running"
    try:
        async for ev in _pipeline.run_stream(
            file_path=str(params["file_path"]),
            org_id=str(params.get("org_id", "default_org")),
            policy_type=params.get("policy_type"),
            top_k=int(params.get("top_k", 8)),
            prefer=params.get("prefer"),
        ):
            await q.put(ev)
            try:
                if isinstance(ev, dict) and ev.get("stage") == "final":
                    # Persist final result for later retrieval (e.g., artifacts download)
                    _jobs[job_id]["result"] = ev.get("data") or ev
            except Exception:
                pass
        await q.put("[DONE]")
        _jobs[job_id]["status"] = "completed"
        # Persist summary to disk for run history
        try:
            base_dir = settings.root / "data" / "processed" / "session_states"
            base_dir.mkdir(parents=True, exist_ok=True)
            record = {
                "job_id": job_id,
                "status": _jobs[job_id]["status"],
                "created_at": _jobs[job_id].get("created_at"),
                "params": _jobs[job_id].get("params", {}),
                "result": _jobs[job_id].get("result", {}),
            }
            with open(str(base_dir / "jobs.jsonl"), "a", encoding="utf-8") as f:
                f.write(json.dumps(record) + "\n")
        except Exception:
            pass
    except asyncio.CancelledError:
        _jobs[job_id]["status"] = "cancelled"
        try:
            await q.put({"stage": "cancelled", "data": {"message": "Job was cancelled"}})
            await q.put("[DONE]")
        except Exception:
            pass
        # Persist summary to disk for run history on cancellation
        try:
            base_dir = settings.root / "data" / "processed" / "session_states"
            base_dir.mkdir(parents=True, exist_ok=True)
            record = {
                "job_id": job_id,
                "status": _jobs[job_id]["status"],
                "created_at": _jobs[job_id].get("created_at"),
                "params": _jobs[job_id].get("params", {}),
                "result": _jobs[job_id].get("result", {}),
            }
            with open(str(base_dir / "jobs.jsonl"), "a", encoding="utf-8") as f:
                f.write(json.dumps(record) + "\n")
        except Exception:
            pass
        raise
    except Exception as e:
        _jobs[job_id]["status"] = "error"
        try:
            await q.put({"stage": "error", "data": {"message": str(e)}})
            await q.put("[DONE]")
        except Exception:
            pass
        # Persist summary to disk for run history on errors
        try:
            base_dir = settings.root / "data" / "processed" / "session_states"
            base_dir.mkdir(parents=True, exist_ok=True)
            record = {
                "job_id": job_id,
                "status": _jobs[job_id]["status"],
                "created_at": _jobs[job_id].get("created_at"),
                "params": _jobs[job_id].get("params", {}),
                "result": _jobs[job_id].get("result", {}),
            }
            with open(str(base_dir / "jobs.jsonl"), "a", encoding="utf-8") as f:
                f.write(json.dumps(record) + "\n")
        except Exception:
            pass


@router.post("/adk/policy/audit/job", response_model=PolicyAuditJobResponse)
async def adk_policy_audit_job(req: PolicyAuditJobRequest) -> PolicyAuditJobResponse:
    job_id = f"job-{datetime.utcnow().strftime('%Y%m%d%H%M%S')}-{os.getpid()}-{abs(hash(req.file_path))%10000}"
    # Smart Auto normalization: clamp top_k; treat 'Auto' as None for policy_type; default org_id
    params = req.dict()
    try:
        pk = int(params.get("top_k", 8))
        params["top_k"] = max(1, min(20, pk))
    except Exception:
        params["top_k"] = 8
    pt = params.get("policy_type")
    if pt is None or (isinstance(pt, str) and pt.strip().lower() == "auto"):
        params["policy_type"] = None
    if not params.get("org_id"):
        params["org_id"] = "default_org"
    async with _jobs_lock:
        q: asyncio.Queue = asyncio.Queue()
        _jobs[job_id] = {
            "queue": q,
            "status": "queued",
            "created_at": datetime.utcnow().isoformat() + "Z",
            "params": params,
        }
        task = asyncio.create_task(_start_audit_job(job_id, params))
        _jobs[job_id]["task"] = task
    return PolicyAuditJobResponse(job_id=job_id, status="running")


class PolicyAuditJobStatus(BaseModel):
    job_id: str
    status: str
    created_at: Optional[str] = None


@router.get("/adk/policy/audit/job/{job_id}/status", response_model=PolicyAuditJobStatus)
async def adk_policy_audit_job_status(job_id: str) -> PolicyAuditJobStatus:
    async with _jobs_lock:
        job = _jobs.get(job_id)
        if not job:
            return PolicyAuditJobStatus(job_id=job_id, status="not_found")
        return PolicyAuditJobStatus(job_id=job_id, status=str(job.get("status", "unknown")), created_at=job.get("created_at"))


@router.post("/adk/policy/audit/job/{job_id}/cancel", response_model=PolicyAuditJobStatus)
async def adk_policy_audit_job_cancel(job_id: str) -> PolicyAuditJobStatus:
    async with _jobs_lock:
        job = _jobs.get(job_id)
        if not job:
            return PolicyAuditJobStatus(job_id=job_id, status="not_found")
        task: asyncio.Task = job.get("task")
        if task and not task.done():
            task.cancel()
        job["status"] = "cancelling"
    return PolicyAuditJobStatus(job_id=job_id, status="cancelling")


@router.get("/adk/policy/audit/job/{job_id}/stream")
async def adk_policy_audit_job_stream(job_id: str):
    async def gen():
        # Fetch job and queue
        async with _jobs_lock:
            job = _jobs.get(job_id)
            if not job:
                yield _sse_chunk(json.dumps({"stage": "error", "data": {"message": "job not found"}}))
                yield _sse_chunk("[DONE]")
                return
            q: asyncio.Queue = job["queue"]
        # Heartbeat interval in seconds
        heartbeat = 15
        while True:
            try:
                item = await asyncio.wait_for(q.get(), timeout=heartbeat)
            except asyncio.TimeoutError:
                # Emit heartbeat to keep the connection alive and update UI
                yield _sse_chunk(json.dumps({"stage": "heartbeat", "data": {"message": "Step is still running"}}))
                continue
            if item == "[DONE]":
                yield _sse_chunk("[DONE]")
                break
            try:
                yield _sse_chunk(json.dumps(item))
            except Exception:
                yield _sse_chunk(str(item))

    return StreamingResponse(gen(), media_type="text/event-stream")


@router.post("/adk/policy/audit/job/{job_id}/rerun", response_model=PolicyAuditJobResponse)
async def adk_policy_audit_job_rerun(job_id: str) -> PolicyAuditJobResponse:
    """Start a new audit job using the same parameters as a previous job."""
    # Read from memory first
    async with _jobs_lock:
        job = _jobs.get(job_id)
    params: Optional[Dict[str, Any]] = None
    if job:
        params = dict(job.get("params", {}))
    if not params:
        # Try to load from disk history
        for rec in _load_jobs(limit=500):
            if rec.get("job_id") == job_id:
                params = dict(rec.get("params", {}))
                break
    if not params:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="job not found")

    # Ensure required fields
    if not params.get("file_path"):
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="original job missing file_path")
    # Start a new job with same params
    req = PolicyAuditJobRequest(
        file_path=str(params.get("file_path")),
        org_id=str(params.get("org_id", "default_org")),
        policy_type=params.get("policy_type"),
        top_k=int(params.get("top_k", 8)),
        prefer=params.get("prefer"),
    )
    return await adk_policy_audit_job(req)

# --------- ADK: Streaming score (SSE-like) ---------
@router.post("/adk/score/stream")
async def adk_score_stream(req: ScoreRequest):
    async def gen():
        out = await _orch.score_question(
            session_id=req.session_id,
            org_id=req.org_id,
            user_id=req.user_id,
            framework=req.framework or "GDPR",
            checklist_question=req.checklist_question,
            user_answer=req.user_answer,
            k=req.k,
            prefer=req.prefer,
        )
        import json
        # 1) send clauses as one event
        yield _sse_chunk(json.dumps({
            "type": "clauses",
            "clauses": out.get("clauses", []),
        }))
        # 2) stream rationale in chunks
        rationale = str(out.get("rationale", ""))
        chunk_size = 120
        for i in range(0, len(rationale), chunk_size):
            chunk = rationale[i : i + chunk_size]
            yield _sse_chunk(json.dumps({
                "type": "rationale",
                "delta": chunk,
            }))
        # 3) final summary
        yield _sse_chunk(json.dumps({
            "type": "final",
            "score": out.get("score", 0),
            "llm_provider": out.get("llm_provider", ""),
            "llm_model": out.get("llm_model", ""),
        }))
        yield _sse_chunk("[DONE]")

    return StreamingResponse(gen(), media_type="text/event-stream")


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
    return ChecklistGenResponse(
        framework=str(out.get("framework", req.framework)),
        version=str(out.get("version", "1.0")),
        items=out.get("items", []),
    )


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
    prefer: Optional[str] = None


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
        prefer=req.prefer,
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
    # Normalize output path: if provided and relative, resolve under project root
    out_path = req.out_path
    try:
        if out_path and not Path(out_path).is_absolute():
            out_path = str((settings.root / out_path).resolve())
            Path(out_path).parent.mkdir(parents=True, exist_ok=True)
    except Exception:
        pass
    out = _orch.annotate_policy(file=req.file, gaps=req.gaps, out_path=out_path)
    annotated_path = str(out.get("annotated_path", ""))
    # Fallback: if annotation did not create a file (rare), copy original PDF to target path
    try:
        if annotated_path and not Path(annotated_path).exists():
            src = Path(req.file)
            Path(annotated_path).parent.mkdir(parents=True, exist_ok=True)
            reader = PdfReader(str(src))
            writer = PdfWriter()
            for page in reader.pages:
                writer.add_page(page)
            with open(annotated_path, "wb") as f:
                writer.write(f)
    except Exception:
        pass
    return PolicyAnnotateResponse(annotated_path=annotated_path)


# --------- New: Policy audit (scaffold) ---------
class PolicyAuditRequest(BaseModel):
    file_path: str
    org_id: str = "default_org"
    policy_type: Optional[str] = None  # e.g., hr, posh
    top_k: int = 8
    prefer: Optional[str] = None


class PolicyAuditResponse(BaseModel):
    policy_type: str
    composite: float
    checklist: List[Dict[str, Any]]
    scores: List[Dict[str, Any]]
    gaps: List[Dict[str, Any]]
    report_path: Optional[str] = None
    download_url: Optional[str] = None
    annotated_path: Optional[str] = None
    annotated_url: Optional[str] = None
    corrected_draft: Optional[str] = None


@router.post("/adk/policy/audit", response_model=PolicyAuditResponse)
async def adk_policy_audit(req: PolicyAuditRequest) -> PolicyAuditResponse:
    out = await _pipeline.run(
        file_path=req.file_path,
        org_id=req.org_id,
        policy_type=req.policy_type,
        top_k=req.top_k,
        prefer=req.prefer,
    )
    return PolicyAuditResponse(**out)


@router.get("/adk/policy/audit/stream")
async def adk_policy_audit_stream(
    file_path: str,
    org_id: str = "default_org",
    policy_type: Optional[str] = None,
    top_k: int = 8,
    prefer: Optional[str] = None,
):
    async def gen():
        async for ev in _pipeline.run_stream(
            file_path=file_path,
            org_id=org_id,
            policy_type=policy_type,
            top_k=top_k,
            prefer=prefer,
        ):
            try:
                yield _sse_chunk(json.dumps(ev))
            except Exception:
                # best-effort: stringify
                yield _sse_chunk(str(ev))
        yield _sse_chunk("[DONE]")

    return StreamingResponse(gen(), media_type="text/event-stream")

# --------- Agent-like tools dispatch (generic) ---------
class AgentRunRequest(BaseModel):
    tool: str
    args: Optional[Dict[str, Any]] = None


class AgentRunResponse(BaseModel):
    ok: bool
    result: Optional[Dict[str, Any]] = None
    error: Optional[str] = None


@router.post("/ai/agent/run", response_model=AgentRunResponse)
async def ai_agent_run(req: AgentRunRequest) -> AgentRunResponse:
    if not settings.agents_enabled:
        return AgentRunResponse(ok=False, error="agents feature disabled")
    t = (req.tool or "").lower()
    a: Dict[str, Any] = req.args or {}
    try:
        if t == "index_documents":
            files = a.get("files", [])
            out = _orch.index_documents(files)
            return AgentRunResponse(ok=True, result=out)
        elif t == "score_question":
            out = await _orch.score_question(
                session_id=a.get("session_id", "agent"),
                org_id=a.get("org_id", "default_org"),
                user_id=a.get("user_id", "agent"),
                framework=a.get("framework", "GDPR"),
                checklist_question=a.get("checklist_question", ""),
                user_answer=a.get("user_answer", ""),
                k=int(a.get("k", 5)),
                prefer=a.get("prefer"),
            )
            return AgentRunResponse(ok=True, result=out)
        elif t == "generate_report":
            out = _orch.generate_report(
                session_id=a.get("session_id", "agent"),
                org_id=a.get("org_id", "default_org"),
                items=a.get("items", []),
                upload_to_gcs=bool(a.get("upload_to_gcs", True)),
            )
            return AgentRunResponse(ok=True, result=out)
        elif t == "compute_gaps":
            out = _orch.compute_gaps(
                scored_items=a.get("scored_items", []),
                min_score=int(a.get("min_score", 4)),
            )
            return AgentRunResponse(ok=True, result=out)
        elif t == "auto_audit":
            # End-to-end audit using the PolicyAuditPipeline
            file_path = a.get("file_path") or a.get("file")
            org_id = a.get("org_id") or "default_org"
            policy_type = a.get("policy_type")
            top_k = int(a.get("top_k", 8))
            prefer = a.get("prefer")
            if not file_path:
                return AgentRunResponse(ok=False, error="auto_audit requires file_path")
            try:
                out = await _pipeline.run(
                    file_path=str(file_path),
                    org_id=str(org_id),
                    policy_type=str(policy_type) if policy_type else None,
                    top_k=top_k,
                    prefer=prefer,
                )
                return AgentRunResponse(ok=True, result=out)
            except Exception as ex:
                return AgentRunResponse(ok=False, error=str(ex))
        else:
            return AgentRunResponse(ok=False, error=f"unknown tool: {req.tool}")
    except Exception as e:
        return AgentRunResponse(ok=False, error=str(e))


# --------- Feature-flagged: OpenAI Agent ---------
class AgentChatMessage(BaseModel):
    role: str
    content: str


class OpenAIAgentRequest(BaseModel):
    session_id: str
    org_id: str
    user_id: str
    messages: List[AgentChatMessage]
    tools: Optional[List[str]] = None
    execute: bool = False
    prefer: Optional[str] = None


class OpenAIAgentResponse(BaseModel):
    ok: bool
    result: Optional[Dict[str, Any]] = None
    error: Optional[str] = None


@router.post("/ai/agent/openai", response_model=OpenAIAgentResponse)
async def ai_agent_openai(req: OpenAIAgentRequest) -> OpenAIAgentResponse:
    if not settings.agents_enabled:
        return OpenAIAgentResponse(ok=False, error="agents feature disabled")
    if OpenAI is None:
        return OpenAIAgentResponse(ok=False, error="openai SDK not installed")
    if not os.getenv("OPENAI_API_KEY"):
        return OpenAIAgentResponse(ok=False, error="OPENAI_API_KEY missing")

    # Planning-only step: ask OpenAI which tool to use and arguments, return plan JSON (no execution)
    try:
        client = OpenAI()
        sys_prompt = (
            "You are an AI planning assistant. You must select one tool from the provided list and output strictly JSON with keys: "
            "tool (string), args (object), rationale (string). Do not include any extra text."
        )
        tools_desc = ", ".join(req.tools or [
            "index_documents",
            "score_question",
            "compute_gaps",
            "generate_report",
            "auto_audit",
        ])
        user_context = (
            f"Session: {req.session_id}\nOrg: {req.org_id}\nUser: {req.user_id}\n"
            f"Available tools: {tools_desc}\n"
            f"Preferred LLM (if any): {req.prefer or 'auto'}\n"
            f"Messages: {json.dumps([m.dict() for m in (req.messages or [])])}"
        )
        completion = client.chat.completions.create(
            model=settings.openai_model,
            temperature=0.2,
            messages=[
                {"role": "system", "content": sys_prompt},
                {"role": "user", "content": user_context},
            ],
        )
        content = (completion.choices[0].message.content or "").strip()
        plan: Dict[str, Any] = {}
        try:
            plan = json.loads(content)
        except Exception:
            # Try to extract JSON substring
            start = content.find("{")
            end = content.rfind("}")
            if start != -1 and end != -1 and end > start:
                try:
                    plan = json.loads(content[start : end + 1])
                except Exception:
                    pass
        if not isinstance(plan, dict) or "tool" not in plan:
            return OpenAIAgentResponse(ok=False, error="planner returned invalid JSON", result={"raw": content})

        # Return plan only if not executing
        if not req.execute:
            return OpenAIAgentResponse(ok=True, result={
                "plan": plan,
                "model": settings.openai_model,
            })

        # Execute supported tools with validated/enriched args
        tool = str(plan.get("tool", "")).strip()
        args = plan.get("args") or {}
        if not isinstance(args, dict):
            args = {}

        # Allow-list tools
        allowed = set(req.tools or ["index_documents","score_question","compute_gaps","generate_report","auto_audit"]) 
        if tool not in allowed:
            return OpenAIAgentResponse(ok=False, error=f"tool '{tool}' not allowed", result={"plan": plan})

        # Validate and enrich args (except trivial index_documents where we only check presence below)
        if tool != "index_documents":
            enriched, errors = _validate_and_enrich_args(tool, args, req)
            if errors:
                return OpenAIAgentResponse(ok=False, error="argument validation failed", result={"plan": plan, "errors": errors})
            args = enriched or {}

        try:
            if tool == "index_documents":
                files = args.get("files") or []
                if not isinstance(files, list) or not files:
                    return OpenAIAgentResponse(ok=False, error="index_documents requires args.files (list)", result={"plan": plan})
                out = _orch.index_documents(files=files)
                return OpenAIAgentResponse(ok=True, result={"plan": plan, "output": out})

            elif tool == "score_question":
                # Args already validated/enriched; map aliases for robustness
                checklist_question = args.get("checklist_question") or args.get("question") or ""
                user_answer = args.get("user_answer") or args.get("answer") or ""
                framework = args.get("framework") or "GDPR"
                k = int(args.get("k", 5))
                out = await _orch.score_question(
                    session_id=args.get("session_id", req.session_id),
                    org_id=args.get("org_id", req.org_id),
                    user_id=args.get("user_id", req.user_id),
                    framework=str(framework),
                    checklist_question=str(checklist_question),
                    user_answer=str(user_answer),
                    k=k,
                    prefer=args.get("prefer") or req.prefer,
                )
                return OpenAIAgentResponse(ok=True, result={"plan": plan, "output": out})

            elif tool == "compute_gaps":
                scored_items = args.get("scored_items") or args.get("items") or []
                if not isinstance(scored_items, list):
                    return OpenAIAgentResponse(ok=False, error="compute_gaps requires scored_items (list)", result={"plan": plan})
                min_score = int(args.get("min_score", 4))
                out = _orch.compute_gaps(scored_items=scored_items, min_score=min_score)
                return OpenAIAgentResponse(ok=True, result={"plan": plan, "output": out})

            elif tool == "generate_report":
                items = args.get("items") or []
                if not isinstance(items, list) or not items:
                    return OpenAIAgentResponse(ok=False, error="generate_report requires items (list)", result={"plan": plan})
                upload_to_gcs = bool(args.get("upload_to_gcs", True))
                out = _orch.generate_report(
                    session_id=args.get("session_id", req.session_id),
                    org_id=args.get("org_id", req.org_id),
                    items=items,
                    upload_to_gcs=upload_to_gcs,
                )
                return OpenAIAgentResponse(ok=True, result={"plan": plan, "output": out})

            elif tool == "auto_audit":
                file_path = args.get("file_path") or args.get("file")
                org_id = args.get("org_id") or req.org_id or "default_org"
                policy_type = args.get("policy_type")
                top_k = int(args.get("top_k", 8))
                prefer = args.get("prefer") or req.prefer
                if not file_path:
                    return OpenAIAgentResponse(ok=False, error="auto_audit requires file_path", result={"plan": plan})
                out = await _pipeline.run(
                    file_path=str(file_path),
                    org_id=str(org_id),
                    policy_type=str(policy_type) if policy_type else None,
                    top_k=top_k,
                    prefer=prefer,
                )
                return OpenAIAgentResponse(ok=True, result={"plan": plan, "output": out})

            else:
                return OpenAIAgentResponse(ok=False, error=f"unsupported tool '{tool}'", result={"plan": plan})
        except Exception as ex:
            return OpenAIAgentResponse(ok=False, error=str(ex), result={"plan": plan})
    except Exception as e:
        return OpenAIAgentResponse(ok=False, error=str(e))


# --------- Providers health ---------
class ProvidersHealth(BaseModel):
    prefer: str
    openai_available: bool
    groq_available: bool
    gemini_available: bool
    openai_model: str
    groq_model: str
    gemini_model: str


@router.get("/ai/providers/health", response_model=ProvidersHealth)
async def ai_providers_health() -> ProvidersHealth:
    return ProvidersHealth(
        prefer=settings.prefer,
        openai_available=bool(os.getenv("OPENAI_API_KEY")),
        groq_available=bool(os.getenv("GROQ_API_KEY")),
        gemini_available=bool(os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")),
        openai_model=settings.openai_model,
        groq_model=settings.groq_model,
        gemini_model=settings.gemini_model,
    )


# --------- Sessions listing (local JSONL log) ---------
class SessionSummary(BaseModel):
    session_id: str
    org_id: str
    user_id: Optional[str] = None
    framework: Optional[str] = None
    last_event: Optional[str] = None
    last_question: Optional[str] = None
    last_score: Optional[int] = None
    updated_at: str
    # progress metadata (from saved session state)
    progress_answered: Optional[int] = None
    progress_total: Optional[int] = None
    progress_percent: Optional[float] = None


class SessionsListResponse(BaseModel):
    items: List[SessionSummary]


def _read_sessions_jsonl() -> List[Dict[str, Any]]:
    path = settings.processed_dir / "sessions.jsonl"
    if not path.exists():
        return []
    rows: List[Dict[str, Any]] = []
    try:
        with path.open("r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    rows.append(json.loads(line))
                except Exception:
                    pass
    except Exception:
        return []
    return rows


@router.get("/adk/sessions", response_model=SessionsListResponse)
async def adk_sessions(org_id: Optional[str] = None) -> SessionsListResponse:
    rows = _read_sessions_jsonl()
    by_session: Dict[str, Dict[str, Any]] = {}
    for r in rows:
        if org_id and str(r.get("org_id")) != org_id:
            continue
        sid = str(r.get("session_id"))
        ts = str(r.get("timestamp", ""))
        cur = by_session.get(sid)
        if not cur or ts > cur.get("updated_at", ""):
            by_session[sid] = {
                "session_id": sid,
                "org_id": str(r.get("org_id", "")),
                "user_id": r.get("user_id"),
                "framework": r.get("framework") or cur.get("framework") if cur else r.get("framework"),
                "last_event": str(r.get("question", "")),
                "last_question": str(r.get("question", "")),
                "last_score": int(r.get("score", 0)) if isinstance(r.get("score"), (int, float)) else None,
                "updated_at": ts,
            }
        else:
            # keep earliest non-null framework if missing
            if not by_session[sid].get("framework") and r.get("framework"):
                by_session[sid]["framework"] = r.get("framework")

    # Enrich with progress from saved state (if available)
    for v in by_session.values():
        try:
            org = str(v.get("org_id", ""))
            sid = str(v.get("session_id", ""))
            path = _state_path(org, sid)
            if os.path.exists(path):
                data = json.loads(Path(path).read_text(encoding="utf-8"))
                prog = data.get("progress") or {}
                ans = data.get("answers") or []
                answered = int(prog.get("answered") or (len([a for a in ans if (a.get("answer") or a.get("user_answer"))])) or 0)
                total = int(prog.get("total") or (len(ans) or 0))
                pct = (answered / total * 100.0) if total else None
                v["progress_answered"] = answered
                v["progress_total"] = total
                v["progress_percent"] = round(pct, 2) if pct is not None else None
        except Exception:
            pass

    # Fallback: populate sessions from saved session state files even if no JSONL events were logged
    try:
        base = settings.processed_dir / "session_states"
        if base.exists():
            for org_dir in base.iterdir():
                if not org_dir.is_dir():
                    continue
                org_name = org_dir.name
                if org_id and org_name != org_id:
                    continue
                for p in org_dir.glob("*.json"):
                    sid = p.stem
                    if sid in by_session:
                        continue
                    try:
                        data = json.loads(p.read_text(encoding="utf-8"))
                    except Exception:
                        data = {}
                    prog = data.get("progress") or {}
                    ans = data.get("answers") or []
                    answered = int(prog.get("answered") or (len([a for a in ans if (a.get("answer") or a.get("user_answer"))])) or 0)
                    total = int(prog.get("total") or (len(ans) or 0))
                    pct = (answered / total * 100.0) if total else None
                    # Use file mtime as updated_at
                    try:
                        mtime = datetime.utcfromtimestamp(p.stat().st_mtime).isoformat() + "Z"
                    except Exception:
                        mtime = datetime.utcnow().isoformat() + "Z"
                    by_session[sid] = {
                        "session_id": sid,
                        "org_id": org_name,
                        "user_id": data.get("user_id"),
                        "framework": data.get("framework"),
                        "last_event": None,
                        "last_question": None,
                        "last_score": None,
                        "updated_at": mtime,
                        "progress_answered": answered,
                        "progress_total": total,
                        "progress_percent": round(pct, 2) if pct is not None else None,
                    }
    except Exception:
        pass

    items = [SessionSummary(**v) for v in sorted(by_session.values(), key=lambda x: x["updated_at"], reverse=True)]
    return SessionsListResponse(items=items)


@router.get("/adk/sessions/{session_id}", response_model=SessionSummary)
async def adk_session_detail(session_id: str) -> SessionSummary:
    rows = _read_sessions_jsonl()
    latest: Optional[Dict[str, Any]] = None
    for r in rows:
        if str(r.get("session_id")) != session_id:
            continue
        if (latest is None) or str(r.get("timestamp", "")) > str(latest.get("timestamp", "")):
            latest = r
    if not latest:
        # Fallback: locate saved state across orgs
        try:
            base = settings.processed_dir / "session_states"
            if base.exists():
                for org_dir in base.iterdir():
                    if not org_dir.is_dir():
                        continue
                    p = org_dir / f"{session_id}.json"
                    if p.exists():
                        try:
                            data = json.loads(p.read_text(encoding="utf-8"))
                        except Exception:
                            data = {}
                        prog = data.get("progress") or {}
                        ans = data.get("answers") or []
                        answered = int(prog.get("answered") or (len([a for a in ans if (a.get("answer") or a.get("user_answer"))])) or 0)
                        total = int(prog.get("total") or (len(ans) or 0))
                        pct = (answered / total * 100.0) if total else None
                        try:
                            mtime = datetime.utcfromtimestamp(p.stat().st_mtime).isoformat() + "Z"
                        except Exception:
                            mtime = datetime.utcnow().isoformat() + "Z"
                        return SessionSummary(
                            session_id=session_id,
                            org_id=org_dir.name,
                            user_id=data.get("user_id"),
                            framework=data.get("framework"),
                            last_event=None,
                            last_question=None,
                            last_score=None,
                            updated_at=mtime,
                            progress_answered=answered,
                            progress_total=total,
                            progress_percent=round(pct, 2) if pct is not None else None,
                        )
        except Exception:
            pass
        return SessionSummary(session_id=session_id, org_id="", updated_at=datetime.utcnow().isoformat() + "Z")
    # prepare base summary
    base = dict(
        session_id=str(latest.get("session_id", session_id)),
        org_id=str(latest.get("org_id", "")),
        user_id=latest.get("user_id"),
        framework=latest.get("framework"),
        last_event=str(latest.get("question", "")),
        last_question=str(latest.get("question", "")),
        last_score=int(latest.get("score", 0)) if isinstance(latest.get("score"), (int, float)) else None,
        updated_at=str(latest.get("timestamp", datetime.utcnow().isoformat() + "Z")),
    )
    # enrich with progress if available
    try:
        org = str(base.get("org_id", ""))
        sid = str(base.get("session_id", session_id))
        path = _state_path(org, sid)
        if os.path.exists(path):
            data = json.loads(Path(path).read_text(encoding="utf-8"))
            prog = data.get("progress") or {}
            ans = data.get("answers") or []
            answered = int(prog.get("answered") or (len([a for a in ans if (a.get("answer") or a.get("user_answer"))])) or 0)
            total = int(prog.get("total") or (len(ans) or 0))
            pct = (answered / total * 100.0) if total else None
            base["progress_answered"] = answered
            base["progress_total"] = total
            base["progress_percent"] = round(pct, 2) if pct is not None else None
    except Exception:
        pass
    return SessionSummary(**base)


# --------- Session state persistence ---------
class SessionState(BaseModel):
    session_id: str
    org_id: str
    framework: Optional[str] = None
    answers: List[Dict[str, Any]] = []  # [{question_id, answer, score?, rationale?, updated_at}]
    progress: Optional[Dict[str, Any]] = None  # e.g., {answered: n, total: m}
    meta: Optional[Dict[str, Any]] = None


def _state_path(org_id: str, session_id: str) -> os.PathLike:
    base = settings.processed_dir / "session_states" / org_id
    base.mkdir(parents=True, exist_ok=True)
    return base / f"{session_id}.json"


@router.post("/adk/sessions/{session_id}/state", response_model=SessionState)
async def save_session_state(session_id: str, payload: SessionState) -> SessionState:
    # trust session_id path param
    org_id = payload.org_id
    path = _state_path(org_id, session_id)
    data = payload.model_dump()
    data["session_id"] = session_id
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    return SessionState(**data)


@router.get("/adk/sessions/{session_id}/state", response_model=SessionState)
async def get_session_state(session_id: str, org_id: str) -> SessionState:
    path = _state_path(org_id, session_id)
    if not os.path.exists(path):
        return SessionState(session_id=session_id, org_id=org_id, answers=[])
    try:
        data = json.loads(Path(path).read_text(encoding="utf-8"))
        # ensure org and session coherence
        data["session_id"] = session_id
        data["org_id"] = org_id
        return SessionState(**data)
    except Exception:
        return SessionState(session_id=session_id, org_id=org_id, answers=[])

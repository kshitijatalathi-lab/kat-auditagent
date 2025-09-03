from __future__ import annotations

from typing import Any, Dict, List, Optional
import os
from dataclasses import dataclass
from fastapi import APIRouter
from fastapi import UploadFile, File
from pydantic import BaseModel
from fastapi.responses import StreamingResponse
import json
try:
    from openai import OpenAI
except Exception:  # library optional until enabled
    OpenAI = None  # type: ignore

from adk.orchestrator import Orchestrator
from adk.services import checklists as ck
from adk.config import settings
from adk.llm.mcp_router import LLMRouter

router = APIRouter()
_orch = Orchestrator()
_llm = LLMRouter()


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
        ])
        user_context = (
            f"Session: {req.session_id}\nOrg: {req.org_id}\nUser: {req.user_id}\n"
            f"Available tools: {tools_desc}\n"
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
        allowed = set(req.tools or ["index_documents","score_question","compute_gaps","generate_report"]) 
        if tool not in allowed:
            return OpenAIAgentResponse(ok=False, error=f"tool '{tool}' not allowed", result={"plan": plan})

        try:
            if tool == "index_documents":
                files = args.get("files") or []
                if not isinstance(files, list) or not files:
                    return OpenAIAgentResponse(ok=False, error="index_documents requires args.files (list)", result={"plan": plan})
                out = _orch.index_documents(files=files)
                return OpenAIAgentResponse(ok=True, result={"plan": plan, "output": out})

            elif tool == "score_question":
                # Required fields
                checklist_question = args.get("checklist_question") or args.get("question")
                user_answer = args.get("user_answer") or args.get("answer")
                framework = args.get("framework") or "GDPR"
                k = int(args.get("k", 5))
                if not checklist_question:
                    return OpenAIAgentResponse(ok=False, error="score_question requires checklist_question", result={"plan": plan})
                out = await _orch.score_question(
                    session_id=req.session_id,
                    org_id=req.org_id,
                    user_id=req.user_id,
                    framework=str(framework),
                    checklist_question=str(checklist_question),
                    user_answer=str(user_answer or ""),
                    k=k,
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
                    session_id=req.session_id,
                    org_id=req.org_id,
                    items=items,
                    upload_to_gcs=upload_to_gcs,
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

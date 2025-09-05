from __future__ import annotations

import os
import sys
from pathlib import Path
from typing import List, Dict, Any, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Resolve local package imports when running this file directly
ROOT = Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from mcp.context import MCPContext  # type: ignore
from mcp.gdrive_wrapper import GDriveClient  # type: ignore
from mcp.llm_wrapper import LLMClient  # type: ignore
from agents.chunking_agent import ChunkingAgent  # type: ignore
from agents.retriever_agent import RetrieverAgent  # type: ignore
from agents.scoring_agent import ScoringAgent  # type: ignore
from agents.gap_agent import GapAgent  # type: ignore
from agents.report_agent import ReportAgent  # type: ignore
from agents.export_agent import ExportAgent  # type: ignore
from agents.ux_agent import AgentixUXAgent  # type: ignore

CHECKLISTS_DIR = ROOT / "checklists"
DB_DIR = ROOT / "db"
DB_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="MCP Hybrid Audit Compliance API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ScoreRequest(BaseModel):
    session_id: str
    framework: str
    question: str
    user_answer: str
    k: int = 5
    prefer: Optional[str] = None


class ScoreResponse(BaseModel):
    score: int
    rationale: str
    citations: List[Dict[str, Any]]
    provider: str
    model: str


class ReportRequest(BaseModel):
    session_id: str
    org_id: str
    items: List[Dict[str, Any]]  # question, user_answer, score, rationale, citations


class AgentixUXRequest(BaseModel):
    session_id: str
    framework: str
    # Either provide gdrive_file_id or raw_text for ingestion (raw_text wins if both set)
    gdrive_file_id: Optional[str] = None
    raw_text: Optional[str] = None
    # Map of checklist item id -> user answer (optional; can be empty)
    user_answers: Optional[Dict[str, str]] = None
    prefer: Optional[str] = None


@app.get("/health")
def health() -> Dict[str, Any]:
    return {
        "ok": True,
        "env": {
            "LLM_MOCK": os.getenv("LLM_MOCK", "").lower() in {"1", "true", "yes"},
            "MCP_GDRIVE_URL": os.getenv("MCP_GDRIVE_URL", ""),
            "MCP_LLM_URL": os.getenv("MCP_LLM_URL", ""),
        },
    }


@app.get("/checklists")
def list_checklists() -> Dict[str, Any]:
    items = sorted([p.stem for p in CHECKLISTS_DIR.glob("*.yaml")])
    return {"frameworks": items}


@app.get("/checklists/{framework}")
def get_checklist(framework: str) -> Dict[str, Any]:
    import yaml
    path = CHECKLISTS_DIR / f"{framework.lower()}.yaml"
    if not path.exists():
        raise HTTPException(404, f"Checklist not found: {framework}")
    with path.open("r", encoding="utf-8") as f:
        data = yaml.safe_load(f)
    return data


@app.post("/score", response_model=ScoreResponse)
async def score(req: ScoreRequest) -> ScoreResponse:
    ctx = MCPContext()
    llm = LLMClient(ctx)

    retriever = RetrieverAgent(DB_DIR)
    scorer = ScoringAgent(llm)

    retrieved = retriever.search(query=req.question, k=req.k, framework=req.framework)

    result = await scorer.score(
        question=req.question,
        user_answer=req.user_answer,
        clauses=retrieved,
        prefer=req.prefer,
    )
    return ScoreResponse(
        score=int(result["score"]),
        rationale=str(result["rationale"]),
        citations=list(result.get("citations", [])),
        provider=str(result.get("provider", "")),
        model=str(result.get("model", "")),
    )


@app.post("/report")
def report(req: ReportRequest) -> Dict[str, Any]:
    reporter = ReportAgent()
    exporter = ExportAgent()
    summary = reporter.summarize(req.items)
    json_path = exporter.export_json(summary, DB_DIR / f"report_{req.session_id}.json")
    pdf_path = exporter.export_pdf(summary, DB_DIR / f"report_{req.session_id}.pdf")
    return {"ok": True, "summary": summary, "paths": {"json": str(json_path), "pdf": str(pdf_path)}}


@app.post("/upload/gdrive")
async def upload_from_gdrive(file_id: str) -> Dict[str, Any]:
    ctx = MCPContext()
    gdrive = GDriveClient(ctx)
    chunker = ChunkingAgent()
    retriever = RetrieverAgent(DB_DIR)

    content = await gdrive.read_pdf(file_id)
    chunks = chunker.chunk_text(content)
    retriever.index_chunks(chunks)
    return {"ok": True, "chunks": len(chunks)}


@app.post("/agentix/ux/audit")
async def agentix_ux(req: AgentixUXRequest) -> Dict[str, Any]:
    agent = AgentixUXAgent(db_dir=DB_DIR, checklists_dir=CHECKLISTS_DIR)
    result = await agent.run(
        framework=req.framework,
        user_answers=req.user_answers or {},
        session_id=req.session_id,
        gdrive_file_id=req.gdrive_file_id,
        raw_text=req.raw_text,
        prefer=req.prefer,
    )
    return {"ok": True, **result}


if __name__ == "__main__":
    import uvicorn  # type: ignore
    uvicorn.run("main:app", host="127.0.0.1", port=8010, reload=False)

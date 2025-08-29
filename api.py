from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import List, Tuple

import numpy as np
from fastapi import FastAPI, Query, Header, HTTPException, Depends, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import subprocess
from typing import List, Optional
try:
    # When imported as part of the package 'smartaudit'
    from smartaudit.retrieval import retrieve_top_k  # type: ignore
    from smartaudit.logging_utils import log_interaction  # type: ignore
except Exception:  # fallback to local imports when running from repo root
    from retrieval import retrieve_top_k  # type: ignore
    from logging_utils import log_interaction  # type: ignore
import os
from contextlib import nullcontext

try:
    from sentence_transformers import SentenceTransformer
except Exception as e:
    raise SystemExit("Please install sentence-transformers: pip install sentence-transformers") from e

try:
    import faiss  # type: ignore
except Exception as e:
    raise SystemExit("Please install faiss-cpu: pip install faiss-cpu") from e

ROOT = Path(__file__).resolve().parent
INDEX_PATH = ROOT / "data" / "processed" / "index.faiss"
META_PATH = ROOT / "data" / "processed" / "index_meta.json"
CHUNKS_PATH = ROOT / "data" / "processed" / "all_chunks.jsonl"

app = FastAPI(title="SmartAudit RAG API", version="0.1.0")

# Enable CORS for local development and simple frontends
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve a simple static UI if present
WEB_DIR = ROOT / "web"
if WEB_DIR.exists():
    app.mount("/ui", StaticFiles(directory=str(WEB_DIR), html=True), name="ui")

# --- Optional Observability (Phoenix via OTLP, Langfuse) ---
tracer = None
langfuse = None
try:
    # OpenTelemetry tracer with OTLP exporter (point at Phoenix collector)
    from openinference.instrumentation.fastapi import FastAPIInstrumentor  # type: ignore
    from opentelemetry.sdk.trace import TracerProvider  # type: ignore
    from opentelemetry.sdk.trace.export import BatchSpanProcessor  # type: ignore
    from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import (
        OTLPSpanExporter,  # type: ignore
    )
    from opentelemetry import trace as _otel_trace  # type: ignore

    collector = os.getenv("PHOENIX_COLLECTOR_ENDPOINT")
    if collector:
        provider = TracerProvider()
        processor = BatchSpanProcessor(
            OTLPSpanExporter(endpoint=collector, insecure=True)
        )
        provider.add_span_processor(processor)
        _otel_trace.set_tracer_provider(provider)
        FastAPIInstrumentor.instrument_app(app)
        tracer = _otel_trace.get_tracer("smartaudit")
except Exception:
    tracer = None  # observability optional

try:
    from langfuse import Langfuse  # type: ignore

    # Only init if keys exist
    if os.getenv("LANGFUSE_PUBLIC_KEY") and os.getenv("LANGFUSE_SECRET_KEY"):
        langfuse = Langfuse()
except Exception:
    langfuse = None


# --- Helpers to attach trace headers ---
def _maybe_set_trace_headers(response: Response, langfuse_trace_id: Optional[str] = None) -> None:
    try:
        from opentelemetry import trace as _ot  # type: ignore
        span = _ot.get_current_span()
        sc = span.get_span_context() if span else None
        if sc and getattr(sc, "trace_id", None):
            response.headers["X-Trace-Id"] = format(sc.trace_id, "032x")
    except Exception:
        pass
    if langfuse_trace_id:
        try:
            response.headers["X-Langfuse-Trace-Id"] = langfuse_trace_id
        except Exception:
            pass


class SearchResult(BaseModel):
    source: str
    chunk_id: int
    score: float
    text: str


class SynthesisResponse(BaseModel):
    query: str
    answer: str
    citations: list[dict]


class PromptResponse(BaseModel):
    query: str
    prompt: str
    sources: list[dict]


class GenerateRequest(BaseModel):
    q: str
    k: int = 5
    rerank: bool = False
    pre_k: Optional[int] = None
    model: Optional[str] = None  # OpenAI model name override


class GenerateResponse(BaseModel):
    ok: bool
    query: str
    answer: Optional[str] = None
    citations: Optional[list[dict]] = None
    error: Optional[str] = None


@lru_cache(maxsize=1)
def get_model() -> SentenceTransformer:
    return SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2")


@lru_cache(maxsize=1)
def get_index() -> faiss.Index:
    if not INDEX_PATH.exists():
        raise RuntimeError("Index not found. Build it first: python smartaudit/build_index.py")
    return faiss.read_index(str(INDEX_PATH))


@lru_cache(maxsize=1)
def get_chunks() -> List[dict]:
    items: List[dict] = []
    with CHUNKS_PATH.open("r", encoding="utf-8") as f:
        for line in f:
            if line.strip():
                items.append(json.loads(line))
    return items


@app.get("/health")
def health():
    return {"status": "ok", "count": len(get_chunks())}


def require_api_key(x_api_key: str | None = Header(default=None)) -> None:
    """Optional API key requirement.

    If SMARTAUDIT_API_KEY is set in the environment, incoming requests must
    include X-API-Key header matching it. If not set, requests are allowed.
    """
    required = os.getenv("SMARTAUDIT_API_KEY")
    if not required:
        return None
    if not x_api_key or x_api_key != required:
        raise HTTPException(status_code=401, detail="Invalid or missing API key")


@app.get("/search", response_model=List[SearchResult])
def search_endpoint(
    response: Response,
    q: str = Query(..., min_length=2),
    k: int = Query(5, ge=1, le=20),
    rerank: bool = Query(False),
    pre_k: Optional[int] = Query(None, ge=1, le=200),
):
    span_cm = (
        tracer.start_as_current_span("retrieve_top_k") if tracer else nullcontext()
    )
    if tracer:
        with tracer.start_as_current_span("retrieve_top_k") as span:
            span.set_attribute("query.length", len(q))
            span.set_attribute("retrieval.k", k)
            span.set_attribute("retrieval.rerank", bool(rerank))
            if pre_k is not None:
                span.set_attribute("retrieval.pre_k", pre_k)
            hits = retrieve_top_k(q, k=k, pre_k=pre_k, rerank=rerank)
            span.set_attribute("retrieval.hits_count", len(hits))
    else:
        with span_cm:
            hits = retrieve_top_k(q, k=k, pre_k=pre_k, rerank=rerank)
    _maybe_set_trace_headers(response)
    return [SearchResult(source=h.source, chunk_id=h.chunk_id, score=h.score, text=h.text) for h in hits]


@app.get("/answer", response_model=List[SearchResult])
def answer_endpoint(
    response: Response,
    q: str = Query(..., min_length=2),
    k: int = Query(5, ge=1, le=20),
    rerank: bool = Query(False),
    pre_k: Optional[int] = Query(None, ge=1, le=200),
):
    """Alias of /search suitable for frontend consumption, with optional reranking."""
    span_cm = (
        tracer.start_as_current_span("answer_retrieve") if tracer else nullcontext()
    )
    if tracer:
        with tracer.start_as_current_span("answer_retrieve") as span:
            span.set_attribute("query.length", len(q))
            span.set_attribute("retrieval.k", k)
            span.set_attribute("retrieval.rerank", bool(rerank))
            if pre_k is not None:
                span.set_attribute("retrieval.pre_k", pre_k)
            hits = retrieve_top_k(q, k=k, pre_k=pre_k, rerank=rerank)
            span.set_attribute("retrieval.hits_count", len(hits))
    else:
        with span_cm:
            hits = retrieve_top_k(q, k=k, pre_k=pre_k, rerank=rerank)
    _maybe_set_trace_headers(response)
    return [SearchResult(source=h.source, chunk_id=h.chunk_id, score=h.score, text=h.text) for h in hits]


def _make_extractive_answer(q: str, results: list[SearchResult]) -> SynthesisResponse:
    # Simple extractive strategy: take top sentences from best chunks and compose
    snippets: list[str] = []
    citations: list[dict] = []
    for r in results:
        text = (r.text or "").replace("\n", " ").strip()
        if not text:
            continue
        # Take first ~2 sentences per chunk, capped length per snippet
        sentences = [s.strip() for s in text.split('.') if s.strip()]
        snippet = '. '.join(sentences[:2])
        if len(snippet) > 400:
            snippet = snippet[:400] + '…'
        snippets.append(snippet)
        citations.append({"source": r.source, "chunk_id": r.chunk_id, "score": r.score})

    if not snippets:
        return SynthesisResponse(query=q, answer="No relevant context found.", citations=[])

    answer = "\n\n".join(f"- {s}" for s in snippets[:5])
    return SynthesisResponse(query=q, answer=answer, citations=citations[:5])


@app.get("/synthesize", response_model=SynthesisResponse)
def synthesize(
    response: Response,
    q: str = Query(..., min_length=2),
    k: int = Query(5, ge=1, le=10),
    rerank: bool = Query(False),
    pre_k: Optional[int] = Query(None, ge=1, le=200),
):
    # Reuse unified retrieval with optional reranking for consistent results
    span_cm = (
        tracer.start_as_current_span("synthesize_retrieve") if tracer else nullcontext()
    )
    if tracer:
        with tracer.start_as_current_span("synthesize_retrieve") as span:
            span.set_attribute("query.length", len(q))
            span.set_attribute("retrieval.k", k)
            span.set_attribute("retrieval.rerank", bool(rerank))
            if pre_k is not None:
                span.set_attribute("retrieval.pre_k", pre_k)
            hits = retrieve_top_k(q, k=k, pre_k=pre_k, rerank=rerank)
            span.set_attribute("retrieval.hits_count", len(hits))
    else:
        with span_cm:
            hits = retrieve_top_k(q, k=k, pre_k=pre_k, rerank=rerank)
    results = [
        SearchResult(source=h.source, chunk_id=h.chunk_id, score=h.score, text=h.text)
        for h in hits
    ]
    span2 = tracer.start_as_current_span("synthesize_build") if tracer else nullcontext()
    if tracer:
        with tracer.start_as_current_span("synthesize_build") as span:
            span.set_attribute("results.count", len(results))
            ans = _make_extractive_answer(q, results)
            span.set_attribute("answer.length", len(ans.answer or ""))
    else:
        with span2:
            ans = _make_extractive_answer(q, results)
    _maybe_set_trace_headers(response)
    return ans


def _build_prompt(q: str, results: list[SearchResult]) -> PromptResponse:
    header = (
        "You are SmartAudit, an assistant for compliance and audit tasks. "
        "Answer the user's question strictly using the provided CONTEXT. "
        "Cite sources as [source:chunk_id]. If the answer is not in the context, say so.\n\n"
    )
    ctx_lines: list[str] = []
    sources: list[dict] = []
    for i, r in enumerate(results, start=1):
        ctx_lines.append(f"[#{i} {r.source}#{r.chunk_id}]\n{r.text}\n")
        sources.append({"source": r.source, "chunk_id": r.chunk_id, "score": r.score})
    context_block = "\n".join(ctx_lines)
    prompt = f"{header}QUESTION: {q}\n\nCONTEXT:\n{context_block}\n\nINSTRUCTIONS:\n- Provide a concise, accurate answer.\n- Include short citations like [#{1}] referencing the context block IDs.\n"
    return PromptResponse(query=q, prompt=prompt, sources=sources)


@app.get("/prompt", response_model=PromptResponse)
def prompt_endpoint(
    response: Response,
    q: str = Query(..., min_length=2),
    k: int = Query(5, ge=1, le=20),
    rerank: bool = Query(False),
    pre_k: Optional[int] = Query(None, ge=1, le=200),
):
    span_cm = (
        tracer.start_as_current_span("prompt_retrieve") if tracer else nullcontext()
    )
    if tracer:
        with tracer.start_as_current_span("prompt_retrieve") as span:
            span.set_attribute("query.length", len(q))
            span.set_attribute("retrieval.k", k)
            span.set_attribute("retrieval.rerank", bool(rerank))
            if pre_k is not None:
                span.set_attribute("retrieval.pre_k", pre_k)
            hits = retrieve_top_k(q, k=k, pre_k=pre_k, rerank=rerank)
            span.set_attribute("retrieval.hits_count", len(hits))
    else:
        with span_cm:
            hits = retrieve_top_k(q, k=k, pre_k=pre_k, rerank=rerank)
    span2 = tracer.start_as_current_span("prompt_build") if tracer else nullcontext()
    if tracer:
        with tracer.start_as_current_span("prompt_build") as span:
            pr = _build_prompt(q, hits)
            span.set_attribute("prompt.length", len(pr.prompt or ""))
    else:
        with span2:
            pr = _build_prompt(q, hits)
    _maybe_set_trace_headers(response)
    return pr


def _get_openai_client():
    try:
        from openai import OpenAI  # type: ignore
    except Exception:
        return None, "OpenAI client not available. Install openai: pip install openai"
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        return None, "Missing OPENAI_API_KEY in environment."
    try:
        client = OpenAI(api_key=api_key)
        return client, None
    except Exception as e:
        return None, f"Failed to init OpenAI client: {e}"


# --- Optional local LLM (Unsloth) inference ---
@lru_cache(maxsize=1)
def _load_local_llm():
    """Lazily load a local fine-tuned model if available.

    Controlled by env:
      - USE_LOCAL_LLM=true to prefer local
      - SMARTAUDIT_LOCAL_MODEL_DIR for path (default: smartaudit/models/smartaudit-gemma)
    Returns (model, tokenizer) or (None, None) if unavailable.
    """
    model_dir = os.getenv(
        "SMARTAUDIT_LOCAL_MODEL_DIR",
        str((ROOT / "models" / "smartaudit-gemma")),
    )
    try:
        from unsloth import FastLanguageModel  # type: ignore
    except Exception:
        return None, None
    try:
        model, tokenizer = FastLanguageModel.from_pretrained(
            model_name=model_dir,
            max_seq_length=2048,
            dtype=None,
            load_in_4bit=False,
        )
        return model, tokenizer
    except Exception:
        return None, None


def _maybe_local_generate(prompt: str) -> tuple[Optional[str], Optional[str]]:
    """Try generating with local model. Returns (answer, error)."""
    model, tokenizer = _load_local_llm()
    if model is None or tokenizer is None:
        return None, "Local model not available"
    try:
        inputs = tokenizer(prompt, return_tensors="pt")
        try:
            device = getattr(model, "device", None)
            if device is not None:
                inputs = {k: v.to(device) for k, v in inputs.items()}
        except Exception:
            pass
        from torch import no_grad  # type: ignore
        with no_grad():
            outputs = model.generate(**inputs, max_new_tokens=400)
        text = tokenizer.decode(outputs[0], skip_special_tokens=True)
        # extract assistant segment if tags remain
        return text, None
    except Exception as e:
        return None, str(e)


@app.post("/generate", response_model=GenerateResponse)
def generate(req: GenerateRequest, response: Response, _: None = Depends(require_api_key)):
    # Build prompt from retrieved context
    lf_trace = None
    if langfuse:
        try:
            lf_trace = langfuse.trace(
                name="generate",
                input={"q": req.q, "k": req.k, "rerank": req.rerank, "pre_k": req.pre_k},
            )
        except Exception:
            lf_trace = None

    span_r = tracer.start_as_current_span("generate_retrieve") if tracer else nullcontext()
    if tracer:
        with tracer.start_as_current_span("generate_retrieve") as span:
            span.set_attribute("query.length", len(req.q))
            span.set_attribute("retrieval.k", req.k)
            span.set_attribute("retrieval.rerank", bool(req.rerank))
            if req.pre_k is not None:
                span.set_attribute("retrieval.pre_k", req.pre_k)
            hits = retrieve_top_k(req.q, k=req.k, pre_k=req.pre_k, rerank=req.rerank)
            span.set_attribute("retrieval.hits_count", len(hits))
    else:
        with span_r:
            hits = retrieve_top_k(req.q, k=req.k, pre_k=req.pre_k, rerank=req.rerank)
    if lf_trace:
        try:
            lf_span = lf_trace.span(name="retrieval", input={"q": req.q})
            lf_span.end(output={"hits_count": len(hits), "sources": [h.source for h in hits]})
        except Exception:
            pass

    span_p = tracer.start_as_current_span("generate_prompt") if tracer else nullcontext()
    if tracer:
        with tracer.start_as_current_span("generate_prompt") as span:
            prompt = _build_prompt(req.q, hits)
            span.set_attribute("prompt.length", len(prompt.prompt or ""))
    else:
        with span_p:
            prompt = _build_prompt(req.q, hits)
    if lf_trace:
        try:
            lf_span = lf_trace.span(name="prompt_build")
            lf_span.end(output={"prompt_len": len(prompt.prompt)})
        except Exception:
            pass

    # Decide provider: local or OpenAI
    use_local = os.getenv("USE_LOCAL_LLM", "").lower() in {"1", "true", "yes"} or (req.model or "").lower() == "local"
    if use_local:
        answer, lerr = _maybe_local_generate(prompt.prompt)
        if answer is not None:
            if tracer:
                from opentelemetry import trace as _ot  # type: ignore
                _ot.get_current_span().set_attribute("generation.provider", "local_unsloth")
                _ot.get_current_span().set_attribute("answer.length", len(answer))
            # Log locally
            try:
                log_interaction(
                    query=req.q,
                    retrieved_chunks=hits,
                    prompt=prompt.prompt,
                    model_output=answer,
                    meta={
                        "provider": "local",
                        "k": req.k,
                        "pre_k": req.pre_k,
                        "rerank": req.rerank,
                    },
                )
            except Exception:
                pass
            _maybe_set_trace_headers(response, getattr(lf_trace, "id", None))
            return GenerateResponse(ok=True, query=req.q, answer=answer, citations=prompt.sources)
        # Fallback to OpenAI if local unavailable
    client, err = _get_openai_client()
    if client is None:
        _maybe_set_trace_headers(response, getattr(lf_trace, "id", None) if 'lf_trace' in locals() else None)
        return GenerateResponse(ok=False, query=req.q, error=err or "No generation provider available")
    model_name = req.model or os.getenv("OPENAI_MODEL", "gpt-3.5-turbo")

    try:
        # Use Chat Completions API
        resp = client.chat.completions.create(
            model=model_name,
            messages=[
                {
                    "role": "system",
                    "content": "You are SmartAudit. Answer only using provided context and include short citations like [#1].",
                },
                {"role": "user", "content": prompt.prompt},
            ],
            temperature=0.2,
        )
        answer = resp.choices[0].message.content if resp and resp.choices else ""
        if tracer:
            from opentelemetry import trace as _ot  # type: ignore
            _ot.get_current_span().set_attribute("generation.provider", "openai")
            _ot.get_current_span().set_attribute("model.name", model_name)
            _ot.get_current_span().set_attribute("answer.length", len(answer))
        # Log locally
        try:
            log_interaction(
                query=req.q,
                retrieved_chunks=hits,
                prompt=prompt.prompt,
                model_output=answer,
                meta={
                    "provider": "openai",
                    "model": model_name,
                    "k": req.k,
                    "pre_k": req.pre_k,
                    "rerank": req.rerank,
                },
            )
        except Exception:
            pass
        if lf_trace:
            try:
                lf_trace.end(output={"answer_len": len(answer)})
            except Exception:
                pass
        _maybe_set_trace_headers(response, getattr(lf_trace, "id", None))
        return GenerateResponse(ok=True, query=req.q, answer=answer, citations=prompt.sources)
    except Exception as e:
        if lf_trace:
            try:
                lf_trace.end(output={"error": str(e)})
            except Exception:
                pass
        _maybe_set_trace_headers(response, getattr(lf_trace, "id", None) if 'lf_trace' in locals() else None)
        return GenerateResponse(ok=False, query=req.q, error=f"OpenAI request failed: {e}")


def _clear_caches() -> None:
    # Clear lru_cache singletons so subsequent calls reload artifacts
    get_model.cache_clear()  # type: ignore[attr-defined]
    get_index.cache_clear()  # type: ignore[attr-defined]
    get_chunks.cache_clear()  # type: ignore[attr-defined]


@app.post("/reindex")
def reindex(_: None = Depends(require_api_key)):
    """Re-run preprocessing and index build, then reload cached resources."""
    root = ROOT
    # Run preprocess
    proc1 = subprocess.run(
        ["python3", str(root / "preprocess.py")],
        cwd=str(root.parent),
        capture_output=True,
        text=True,
        check=False,
    )
    # Run build_index
    proc2 = subprocess.run(
        ["python3", str(root / "build_index.py")],
        cwd=str(root.parent),
        capture_output=True,
        text=True,
        check=False,
    )

    # Refresh caches
    _clear_caches()

    ok = (proc1.returncode == 0) and (proc2.returncode == 0)
    return {
        "ok": ok,
        "preprocess_rc": proc1.returncode,
        "build_rc": proc2.returncode,
        "preprocess_stdout": proc1.stdout[-2000:],
        "preprocess_stderr": proc1.stderr[-2000:],
        "build_stdout": proc2.stdout[-2000:],
        "build_stderr": proc2.stderr[-2000:],
    }

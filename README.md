# SmartAudit Audit Assistant (Backend + ADK + Tests)

This repository contains a FastAPI backend with an Agentic Developer Kit (ADK) for audit/compliance workflows, plus a minimal Next.js-based API smoke test setup. You can run the backend entirely in token-free mock mode to validate the API surface, and optionally connect real providers later.

## Quick mock-mode API smoke test (no tokens)

We provide a token-free mock mode for the FastAPI backend and Jest-based frontend API smoke tests.

1) Start backend in mock mode (returns deterministic LLM output):

```bash
python3 -m pip install -r requirements.txt
export LLM_MOCK=1
uvicorn api:app --host 127.0.0.1 --port 8000
```

2) In another terminal, run frontend API smoke tests against the backend:

```bash
cd audit-assistant/frontend/nextjs
npm ci
export NEXT_PUBLIC_API_BASE=http://127.0.0.1:8000
npm test -- src/__tests__/api-smoke.test.ts src/__tests__/api-nonstream-smoke.test.ts
```

Endpoints covered:
- `GET /ai/providers/health` → provider availability snapshot
- `POST /ai/chat` (SSE passthrough) → streams `MOCK: <prompt>` and `[DONE]`
- `POST /adk/score/stream` (SSE) → clauses, rationale chunks, final summary
- `POST /adk/score`, `POST /adk/gaps`, `POST /adk/report`

To test with real providers later, unset `LLM_MOCK` and set your provider keys (e.g. `GROQ_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_API_KEY`/`GEMINI_API_KEY`). See `.env.example`.

## Layout
- `api.py` — FastAPI service exposing ADK endpoints and optional retrieval endpoints
- `adk/` — Agentic Developer Kit (agents, services, HTTP router)
- `data/processed/` — processed artifacts (chunks, indexes, sessions, reports)
- `preprocess.py` — cleans and chunks input texts; writes `regulations_chunks.jsonl`, `company_chunks.jsonl` (if present), and `all_chunks.jsonl`
- `tools/download_india_policies.py` — helper to fetch DPDP/DPIA materials and convert to TXT
- `audit-assistant/frontend/nextjs/` — Next.js project with Jest tests for API smoke checks

## Quick start
1) Install Python dependencies:
   - `python3 -m pip install -r requirements.txt`

2) (Optional) Preprocess corpus into chunks (if you want retrieval artifacts):
   - `python3 preprocess.py`

3) Start API server (mock mode):
   - `export LLM_MOCK=1`
   - `uvicorn api:app --host 127.0.0.1 --port 8000`

4) Health check:
   - `curl http://127.0.0.1:8000/health`

## Add company policies
- Place `.txt` files in `data/company_policies/`.
- Rerun preprocessing to include them in the combined chunks (`python3 preprocess.py`).

### Download India DPIA/DPDP materials (auto)

We provide a helper script to download Indian DPIA/DPDP-related materials (DPDP summary, DPIA templates, checklists), convert PDFs/DOCX to TXT, and place them in the corpus.

1) Run the downloader:

```bash
python3 tools/download_india_policies.py
```

2) Rebuild chunks:

```bash
python3 preprocess.py
```

TXT outputs will be placed in `data/company_policies/india/txt/`.

## ADK API overview (primary workflow)

The ADK router (see `adk/http/router.py`) mounts under the same FastAPI app and exposes endpoints for scoring, gap analysis, reporting, indexing, and streaming chat.

- `GET /ai/providers/health`
  - Quick provider availability snapshot (env-based). Useful for diagnostics.

- `POST /ai/chat` (SSE)
  - Streams LLM output. In mock mode (`LLM_MOCK=1`), streams `MOCK: <prompt>` then `[DONE]`.

- `POST /adk/score`
  - Scores a single checklist question. Returns score, rationale, and cited clauses.

- `POST /adk/score/stream` (SSE)
  - Streams scoring phases including retrieved clauses, rationale chunks, and final summary.

- `GET /adk/checklists`
  - Lists available frameworks from `adk/checklists/` (e.g., GDPR, HIPAA, DPDP).

- `GET /adk/checklists/{framework}`
  - Returns the selected checklist.

- `POST /adk/gaps`
  - Computes gaps from scored items and extracts citations.

- `POST /adk/report`
  - Generates an audit report (JSON and optionally PDF). Reports are served under `/reports/`.

- `POST /adk/index`
  - Builds a local clause-level FAISS index for uploaded documents.

- Jobs API for end-to-end Auto Audit
  - `POST /adk/policy/audit/job` → start job
  - `GET /adk/policy/audit/job/{job_id}/status` → status
  - `GET /adk/policy/audit/job/{job_id}/stream` → stream events (SSE)
  - `GET /adk/policy/audit/job/{job_id}/artifacts.zip` → download artifacts

Example curl invocations:

```bash
# Providers health
curl http://127.0.0.1:8000/ai/providers/health

# Streaming chat (mock)
curl -sX POST http://127.0.0.1:8000/ai/chat -H 'Content-Type: application/json' \
  -d '{"prompt":"hello world","prefer":"groq","temperature":0.2}'

# Score (non-streaming)
curl -sX POST http://127.0.0.1:8000/adk/score -H 'Content-Type: application/json' \
  -d '{"session_id":"s1","org_id":"o1","user_id":"u1","framework":"GDPR","checklist_question":"Is data encrypted?","user_answer":"Yes","k":3}'

# Score (streaming)
curl -sN -X POST http://127.0.0.1:8000/adk/score/stream -H 'Content-Type: application/json' \
  -d '{"session_id":"s1","org_id":"o1","user_id":"u1","framework":"GDPR","checklist_question":"Is data encrypted?","user_answer":"Yes","k":1}'

# Checklists
curl http://127.0.0.1:8000/adk/checklists
curl http://127.0.0.1:8000/adk/checklists/GDPR

# Gaps
curl -sX POST http://127.0.0.1:8000/adk/gaps -H 'Content-Type: application/json' \
  -d '{"scored_items":[{"question":"Q1","user_answer":"A1","score":2,"rationale":"...","llm_provider":"mock","llm_model":"mock","clauses":[]}],"min_score":3}'

# Report
curl -sX POST http://127.0.0.1:8000/adk/report -H 'Content-Type: application/json' \
  -d '{"session_id":"s1","org_id":"o1","items":[{"question":"Q1","user_answer":"A1","score":2,"rationale":"...","llm_provider":"mock","llm_model":"mock","clauses":[]}]}'
```

## Word-based chunking

`preprocess.py` supports word-based chunks with overlap:

```bash
python3 preprocess.py --mode words --words 250 --overlap 50
```

Keep paragraph mode (default):

```bash
python3 preprocess.py --mode paras --max-chars 1200
```

## Retrieval (optional/legacy)

There are optional retrieval endpoints (`/search`, `/answer`, `/synthesize`, `/prompt`, `/generate`) implemented in `api.py`. These rely on a FAISS index of combined chunks under `data/processed/` (`index.faiss`, `index_meta.json`, `all_chunks.jsonl`).

- Build chunks via `python3 preprocess.py`.
- If an index already exists in `data/processed/`, the endpoints will use it.
- If not, you may skip these endpoints and focus on the ADK workflow above.

## Additional retrieval endpoints (optional)

- `GET /synthesize?q=...&k=5` — extractive bullet-point answer with citations.
- `GET /prompt?q=...&k=5[&rerank=true&pre_k=40]` — returns an LLM-ready prompt plus sources.
- `POST /generate` — optional OpenAI-powered answer using the prompt (requires `OPENAI_API_KEY`).

## Frontend (optional)

There is a Next.js project under `audit-assistant/frontend/nextjs/` primarily used for API smoke tests. You can run its tests as shown above. A full interactive UI is not required for backend validation in this repository.

## Audit checklist and reports

- Checklists are defined under `adk/checklists/` (e.g., `gdpr.yaml`, `hipaa.yaml`, `dpdp.yaml`).
- Use `/adk/score` or `/adk/score/stream` to evaluate answers against a checklist.
- Use `/adk/gaps` to compute gaps and `/adk/report` to generate JSON/PDF outputs.
- Generated reports are served at `/reports/` and stored under `data/processed/`.

## Notes on providers and local models

- Many operations can run in mock mode (`LLM_MOCK=1`) without any provider tokens.
- To use real providers, set relevant keys from `.env.example` (e.g., `OPENAI_API_KEY`, `GROQ_API_KEY`, `GOOGLE_API_KEY`/`GEMINI_API_KEY`).
- Retrieval artifacts (if used) rely on FAISS and `sentence-transformers` as specified in `requirements.txt`.

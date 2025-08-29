# SmartAudit RAG (workspace)

This folder contains a minimal pipeline to extract, preprocess, index, and search regulatory texts.

## Layout
- `data/extracted/` — input .txt files (already extracted from PDFs)
- `data/processed/` — chunked JSONL and FAISS index
- `preprocess.py` — cleans and chunks texts; writes `regulations_chunks.jsonl`, `company_chunks.jsonl` (if present), and `all_chunks.jsonl`
- `build_index.py` — embeds chunks and builds FAISS index
- `search.py` — CLI search against the FAISS index
- `api.py` — FastAPI service for HTTP search

## Quick start (Day 1–2)
1) Ensure dependencies (user-local install shown):
   - Core: `python3 -m pip install --user pypdf sentence-transformers faiss-cpu fastapi uvicorn`
   - UI + Providers (optional but recommended):
     - `python3 -m pip install --user gradio google-generativeai`  # Gradio UI + Gemini
     - `python3 -m pip install --user python-docx reportlab`       # DOCX uploads + PDF reports

2) Preprocess (creates combined chunks):
   - `python3 smartaudit/preprocess.py`

3) Build index:
   - `python3 smartaudit/build_index.py`

4) CLI search:
   - `python3 smartaudit/search.py "lawful basis of processing" --k 5`

5) Run API:
   - `uvicorn smartaudit.api:app --host 127.0.0.1 --port 8000`
   - Health: `curl http://127.0.0.1:8000/health`
   - Search: `curl -G --data-urlencode "q=lawful basis of processing" --data-urlencode k=5 http://127.0.0.1:8000/search`

## Add company policies
- Place `.txt` files in `data/company_policies/`.
- Rerun steps 2 and 3 to include them in the combined index.

### Download India DPIA/DPDP materials (auto)

We provide a helper script to download Indian DPIA/DPDP-related materials (DPDP summary, DPIA templates, checklists), convert PDFs/DOCX to TXT, and place them in the corpus.

1) Install optional dependencies (if not already installed):

```bash
python3 -m pip install --user -r smartaudit/requirements.txt
```

2) Run the downloader:

```bash
PYTHONPATH=. python3 smartaudit/tools/download_india_policies.py
```

3) Rebuild data and index:

```bash
PYTHONPATH=. python3 smartaudit/preprocess.py
PYTHONPATH=. python3 smartaudit/build_index.py
```

TXT outputs will be placed in `data/company_policies/india/txt/`.

## Day 3–4: Indexing & Retrieval Setup (RAG backbone)

- Chunking and embeddings are implemented via `preprocess.py` and `build_index.py` using `sentence-transformers/all-MiniLM-L6-v2` and FAISS.
- A ready-to-use retrieval helper is provided in `retrieval.py`.
- Optional word-based chunking and reranking are supported.

### Retrieve top-k programmatically

```bash
python3 smartaudit/retrieval.py "What are the key GDPR requirements for data handling?" --k 5
```

Or in Python:

```python
from smartaudit.retrieval import retrieve_top_k

# Base retrieval (FAISS order)
results = retrieve_top_k("What are the key GDPR requirements for data handling?", k=5)
for r in results:
    print(r.score, r.source, r.chunk_id)
    print(r.text[:300])

# With cross-encoder reranking (better precision)
reranked = retrieve_top_k("data subject rights", k=5, pre_k=40, rerank=True)
```

### Via API

The API exposes a front-end-friendly endpoint that returns top-k chunks with metadata:

- `GET /answer?q=...&k=5[&rerank=true&pre_k=40]`

Example:

```bash
uvicorn smartaudit.api:app --host 127.0.0.1 --port 8000
curl -G --data-urlencode "q=What are the key GDPR requirements for data handling?" --data-urlencode k=5 --data-urlencode rerank=true --data-urlencode pre_k=40 http://127.0.0.1:8000/answer
```

### Notes

- Chunks are created from cleaned paragraphs with a target size of ~1200 characters; adjust in `preprocess.py` if you prefer 100–300 words.
- FAISS index is cosine-simulated via inner product on normalized embeddings.

## Word-based chunking

`preprocess.py` supports word-based chunks with overlap:

```bash
python3 smartaudit/preprocess.py --mode words --words 250 --overlap 50
python3 smartaudit/build_index.py
```

Keep paragraph mode (default):

```bash
python3 smartaudit/preprocess.py --mode paras --max-chars 1200
python3 smartaudit/build_index.py
```

## Reranking (optional)

Improve precision using a cross-encoder reranker (`cross-encoder/ms-marco-MiniLM-L-6-v2`).

- Programmatic: `retrieve_top_k(query, k=5, pre_k=40, rerank=True)`
- API: add `&rerank=true&pre_k=40` to `/search` or `/answer`.

## Additional API endpoints

- `GET /synthesize?q=...&k=5` — extractive bullet-point answer with citations.
- `GET /prompt?q=...&k=5[&rerank=true&pre_k=40]` — returns an LLM-ready prompt plus sources.
- `POST /generate` — optional OpenAI-powered answer using the prompt.

Example for `/prompt`:

```bash
curl -G --data-urlencode "q=lawful basis of processing" --data-urlencode k=4 --data-urlencode rerank=true --data-urlencode pre_k=40 http://127.0.0.1:8000/prompt
```

Example for `/generate` (requires `OPENAI_API_KEY`):

```bash
export OPENAI_API_KEY=YOUR_KEY
uvicorn smartaudit.api:app --host 127.0.0.1 --port 8000
curl -sX POST http://127.0.0.1:8000/generate -H 'Content-Type: application/json' \
  -d '{"q":"What are key GDPR requirements for data handling?","k":4,"rerank":true,"pre_k":40}'
```

## Chat UI (Gradio) — Week 1 demo

A simple UI to upload company policies and ask grounded questions.

1) Build data and index once:
   - `python3 smartaudit/preprocess.py`
   - `python3 smartaudit/build_index.py`
2) (Optional) Use Gemini provider:
   - `export GEMINI_API_KEY=YOUR_GEMINI_KEY`  (or `GOOGLE_API_KEY`)
3) Launch UI:
   - `python3 smartaudit/app_gradio.py`  (set `GRADIO_SHARE=true` to share)

In the “Chat” tab:
- Upload `.pdf`, `.txt`, or `.docx` files (requires `python-docx` for DOCX).
- Ask questions; answers are grounded by retrieval with a visible “Retrieved Context”.
- Providers: `auto | gemini | openai | local | ollama` (Gemini requires `google-generativeai`).
- Submit feedback; logs written to `smartaudit/logs/prompts_log.jsonl`.

## Audit Checklist & Report — Week 2 demo

Use the “Audit Checklist” tab to run a guided audit and export a report.

- Choose checklist: currently `Data Privacy` from `smartaudit/audit_flows/data_privacy.py`.
- For each question:
  - Enter your answer.
  - Click “Generate AI Feedback” to get an assessment grounded via RAG.
- Click “Export Report (PDF/TXT)” to save an audit report to `smartaudit/reports/`.
  - PDF export requires `reportlab`; otherwise a plaintext report is created.

## Notes on local fine‑tuned models

- Retrieval is fully local via FAISS and `sentence-transformers`.
- The UI can call external providers today (Gemini/OpenAI). For a local fine‑tuned SLM, train with the scripts in `smartaudit/training/`, merge LoRA, and serve with vLLM; then point the UI to your local OpenAI-compatible endpoint (see environment variables in code and docs).

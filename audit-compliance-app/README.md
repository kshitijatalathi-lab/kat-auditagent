# MCP Hybrid Audit-Compliance App

This is a reuse-first, MCP-integrated scaffold that wraps existing MCP servers for Google Drive and LLM scoring, and adds minimal local agents for chunking, retrieval, gap detection, reporting, and export.

## Structure

- `backend/`
  - `main.py`: FastAPI app with endpoints for health, checklists, scoring, report, and GDrive upload.
  - `agents/`: Local agents (`ChunkingAgent`, `RetrieverAgent`, `ScoringAgent`, `GapAgent`, `ReportAgent`, `ExportAgent`).
  - `mcp/`: Lightweight wrappers for `@isaacphi/mcp-gdrive` and `mcp-llm-server`, and a simple `MCPContext`.
  - `checklists/`: YAML checklists (`gdpr.yaml`, `hipaa.yaml`, `dpdp.yaml`).
  - `requirements.txt`, `.env.example`, `Dockerfile`.
- `docker-compose.yml`: Spins up backend, `mcp-gdrive`, and `mcp-llm` services.

## Quick Start (Mock Mode)

1. Copy env:
   ```bash
   cp backend/.env.example backend/.env
   ```

2. Install deps and run backend locally:
   ```bash
   cd backend
   pip install -r requirements.txt
   LLM_MOCK=1 uvicorn main:app --reload --port 8010
   ```

3. Test endpoints:
   ```bash
   curl -s http://127.0.0.1:8010/health | jq
   curl -s http://127.0.0.1:8010/checklists | jq
   curl -s http://127.0.0.1:8010/checklists/gdpr | jq
   ```

4. Score (mocked):
   ```bash
   curl -s -X POST http://127.0.0.1:8010/score \
     -H 'Content-Type: application/json' \
     -d '{
       "session_id":"s1",
       "framework":"GDPR",
       "question":"Do you implement appropriate technical measures?",
       "user_answer":"Yes, we encrypt data at rest and in transit.",
       "k": 5
     }' | jq
   ```

5. Generate report:
   ```bash
   curl -s -X POST http://127.0.0.1:8010/report \
     -H 'Content-Type: application/json' \
     -d '{
       "session_id":"s1",
       "org_id":"acme",
       "items":[{"question":"Q1","user_answer":"A1","score":2}]
     }' | jq
   ```

## Docker Compose

```bash
cd audit-compliance-app
docker compose up --build
```

- Backend: http://127.0.0.1:8010
- MCP GDrive: http://127.0.0.1:8787
- MCP LLM: http://127.0.0.1:8788

Set `OPENAI_API_KEY` and `GOOGLE_API_KEY` in your environment for non-mock runs.

## Notes

- In `LLM_MOCK=1` mode, `mcp/gdrive_wrapper.py` and `mcp/llm_wrapper.py` return deterministic stubbed responses.
- To integrate real MCP calls, implement the HTTP/WebSocket clients inside those wrappers.
- Retrieval is a simple keyword ranker to avoid heavy dependencies; swap in FAISS/Chroma + embeddings for production.

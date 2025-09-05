# KAT Audit Assistant - AI-Powered Compliance Platform

A comprehensive audit assistant application featuring Firebase authentication, multi-agent AI workflows, and real-time compliance auditing. Built with Next.js frontend and FastAPI backend with an Agentic Developer Kit (ADK) for sophisticated audit/compliance workflows.

## Loom demo video
[Demo](https://www.loom.com/share/a69ebadedada491c8465c2ae016af7b0?sid=5bbddf7c-c477-458b-b8b1-00eb8619fed1)

## 🚀 Features

- **🔐 Firebase Authentication**: Email/password and Google OAuth login
- **🤖 AI Chatbot**: Compliance-focused assistant with streaming responses
- **📊 Agent Workflow Visualization**: Real-time multi-agent audit pipeline
- **📋 Audit Wizard**: Upload documents and get comprehensive compliance reports
- **📈 Dashboard**: User-specific audit history and report management
- **🔄 Real-time Progress**: Live audit execution with agent status tracking
- **📄 Report Generation**: PDF reports with gap analysis and recommendations

## 🚀 Quick Start

### 1. Backend Setup
```bash
# Install Python dependencies
python3 -m pip install -r requirements.txt

# Start backend (port 8011)
python3 -m uvicorn api:app --host 0.0.0.0 --port 8011 --reload
```

### 2. Frontend Setup
```bash
# Navigate to frontend directory
cd audit-assistant/frontend/nextjs

# Install dependencies
npm install

# Set environment variables
export NEXT_PUBLIC_API_BASE=http://127.0.0.1:8011

# Start frontend (port 3000)
npm run dev
```

### 3. Firebase Authentication Setup
Create a `.env.local` file in the frontend directory:
```bash
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
NEXT_PUBLIC_API_BASE=http://127.0.0.1:8011
```

### 4. Access the Application
- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8011
- **Login**: Click "Sign In" in the navigation
- **Dashboard**: Access your audit history after login
- **Wizard**: Upload documents for compliance auditing

## 🔧 Configuration Options

### LLM Providers
Configure AI providers by setting environment variables:
```bash
# For real AI responses
export OPENAI_API_KEY=your_openai_key
export GROQ_API_KEY=your_groq_key
export GOOGLE_API_KEY=your_google_key

# For testing (mock responses)
export LLM_MOCK=1
```

## 🏗️ Architecture

### Multi-Agent Workflow
The system uses a sophisticated multi-agent architecture for compliance auditing:

```
EmbedderAgent → RetrieverAgent → PromptBuilder → ScorerAgent
                                                      ↓
ClauseAnnotator ← PolicyAuditPipeline → ReportGenerator
```

**Agent Responsibilities:**
- **EmbedderAgent**: Vectorizes documents for semantic search
- **RetrieverAgent**: Finds relevant regulatory clauses
- **PromptBuilder**: Crafts scoring prompts with context
- **ScorerAgent**: Evaluates compliance using LLM
- **ClauseAnnotator**: Annotates gaps in documents
- **ReportGenerator**: Creates comprehensive audit reports
- **PolicyAuditPipeline**: Orchestrates end-to-end workflow

### Project Structure
- `api.py` — FastAPI backend with ADK endpoints
- `adk/` — Agentic Developer Kit (agents, services, HTTP router)
- `audit-assistant/frontend/nextjs/` — Next.js frontend with authentication
- `data/processed/` — Processed artifacts (chunks, indexes, sessions, reports)
- `preprocess.py` — Document preprocessing and chunking
- `tools/` — Utility scripts for data preparation

## 🎯 User Journey

1. **Sign Up/Login**: Create account or login with email/password or Google OAuth
2. **Upload Document**: Use the audit wizard to upload policy documents (PDF, DOCX, TXT)
3. **Configure Audit**: Select framework (GDPR, HIPAA, DPDP) and analysis depth
4. **Run Audit**: Watch real-time agent workflow execution with live progress
5. **Review Results**: Download comprehensive PDF reports and annotated documents
6. **Dashboard**: Track audit history and access previous reports

## 🤖 AI Chatbot Features

- **Compliance Expertise**: Specialized in GDPR, HIPAA, DPDP regulations
- **Real-time Streaming**: Responsive chat with SSE streaming
- **Context-Aware**: Understands audit workflows and compliance requirements
- **Always Available**: Fixed position chatbot accessible from any page

## 📊 Supported Frameworks

- **GDPR**: General Data Protection Regulation
- **HIPAA**: Health Insurance Portability and Accountability Act  
- **DPDP**: Digital Personal Data Protection Act (India)
- **Custom**: Extensible framework system

## 🔌 API Endpoints

### Authentication & User Management
- `POST /auth/login` - User authentication
- `POST /auth/signup` - User registration
- `GET /auth/user` - Get user profile

### AI & Chat
- `POST /ai/chat` - Streaming chatbot responses (SSE)
- `GET /ai/providers/health` - LLM provider status
- `GET /ai/agents/graph` - Agent workflow visualization
- `GET /ai/agents/registry` - Available agents list

### Audit Workflow
- `POST /adk/policy/audit/job` - Start audit job (SSE streaming)
- `GET /adk/policy/audit/job/{job_id}` - Job status and progress
- `POST /adk/score` - Document scoring
- `POST /adk/gaps` - Gap analysis
- `POST /adk/report` - Generate audit report

### File Management
- `POST /upload` - Document upload
- `GET /reports/{report_id}` - Download reports
- `GET /artifacts/{job_id}.zip` - Download audit artifacts

## 🧪 Testing

### Mock Mode Testing
Run backend in mock mode for testing without API keys:
```bash
export LLM_MOCK=1
python3 -m uvicorn api:app --host 0.0.0.0 --port 8011 --reload
```

### Frontend API Tests
```bash
cd audit-assistant/frontend/nextjs
npm test -- src/__tests__/api-smoke.test.ts
```

## 📦 Deployment

### Environment Variables
Create `.env` files with required variables:

**Backend (.env)**:
```bash
LLM_MOCK=0
OPENAI_API_KEY=your_openai_key
GROQ_API_KEY=your_groq_key
GOOGLE_API_KEY=your_google_key
```

**Frontend (.env.local)**:
```bash
NEXT_PUBLIC_API_BASE=http://your-backend-url
NEXT_PUBLIC_FIREBASE_API_KEY=your_firebase_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
```

## 📁 Data Management

### Adding Company Policies
- Place `.txt` files in `data/company_policies/`
- Rerun preprocessing: `python3 preprocess.py`

### Download Regulatory Materials
Download regulatory materials automatically:
```bash
python3 tools/download_india_policies.py
python3 preprocess.py
```

TXT outputs will be placed in `data/company_policies/india/txt/`.

## 🛠️ Development

### Running Tests
```bash
# Backend tests
python3 -m pytest tests/ -v

# Frontend tests  
cd audit-assistant/frontend/nextjs
npm test
```

### Key Test Files
- `tests/test_adk_endpoints.py` - ADK API endpoints
- `tests/test_agent_and_stream.py` - Streaming functionality
- `tests/test_audit_pipeline_unit.py` - Audit pipeline units

## 🔧 Troubleshooting

### Common Issues

**Backend not starting:**
- Check Python dependencies: `pip install -r requirements.txt`
- Verify port 8011 is available
- Check environment variables in `.env`

**Frontend authentication errors:**
- Verify Firebase configuration in `.env.local`
- Check `NEXT_PUBLIC_API_BASE` points to backend
- Ensure Firebase project is properly configured

**Chatbot not responding:**
- Set `LLM_MOCK=1` for testing without API keys
- Verify LLM provider API keys are valid
- Check backend logs for streaming errors

**Agent workflow not loading:**
- Verify backend `/ai/agents/graph` endpoint is accessible
- Check network connectivity between frontend and backend
- Ensure agent registry is properly initialized

## 📝 System Status

### Current Features ✅
- ✅ Firebase Authentication (Email/Password + Google OAuth)
- ✅ AI Chatbot with streaming responses
- ✅ Agent workflow visualization with real-time updates
- ✅ Audit wizard with document upload
- ✅ Dashboard with user-specific audit history
- ✅ PDF report generation and download
- ✅ Multi-framework support (GDPR, HIPAA, DPDP)
- ✅ Mock mode for testing without API keys
- ✅ Comprehensive API documentation

### Known Limitations
- Requires valid LLM API keys for full AI functionality
- PyTorch version warning (non-blocking)
- Limited to supported document formats (PDF, DOCX, TXT)

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

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

# Audit Assistant

A production-grade Audit Assistant System for regulatory compliance assessments built with FastAPI and React.

## Features

- **Multi-tenant Architecture**: Support for multiple organizations and users with role-based access control
- **Document Processing**: Ingest and process PDFs, Word documents, and text files
- **Vector Search**: Semantic search over compliance documents using FAISS
- **Multi-LLM Support**: OpenAI, Gemini, and local models via Ollama
- **Audit Workflows**: Guided compliance assessments with scoring and reporting
- **API-First**: Fully documented RESTful API

## Tech Stack

- **Backend**: FastAPI, SQLAlchemy, Pydantic
- **Vector Store**: FAISS
- **LLM Providers**: OpenAI, Gemini, Ollama
- **Frontend**: React, Next.js, TypeScript
- **Database**: PostgreSQL (SQLite for development)
- **Deployment**: Docker, Kubernetes

## Getting Started

### Prerequisites

- Python 3.9+
- Node.js 16+
- PostgreSQL (optional, SQLite used by default)

### Installation

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd audit-assistant
   ```

2. Set up the backend:
   ```bash
   cd backend
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   pip install -r requirements.txt
   ```

3. Set up environment variables:
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. Initialize the database:
   ```bash
   alembic upgrade head
   ```

5. Start the development server:
   ```bash
   uvicorn app.main:app --reload
   ```

6. Set up the frontend (in a new terminal):
   ```bash
   cd ../frontend
   npm install
   npm run dev
   ```

## Project Structure

```
audit-assistant/
├── backend/               # FastAPI backend
│   ├── app/
│   │   ├── api/          # API routes
│   │   ├── core/         # Core application logic
│   │   ├── db/           # Database models and migrations
│   │   └── services/     # Business logic services
│   └── tests/            # Backend tests
└── frontend/             # React frontend
    └── src/
        ├── components/   # Reusable UI components
        ├── pages/        # Next.js pages
        └── lib/          # API clients and utilities
```

## API Documentation

Once the server is running, you can access:

- Interactive API docs: http://localhost:8000/api/docs
- Alternative API docs: http://localhost:8000/api/redoc
- OpenAPI schema: http://localhost:8000/api/openapi.json

## Development

### Running Tests

```bash
# Run backend tests
pytest

# Run frontend tests
cd frontend
npm test
```

### Code Style

We use:
- Black for Python code formatting
- isort for import sorting
- ESLint and Prettier for JavaScript/TypeScript

### Deployment

See the [deployment guide](DEPLOYMENT.md) for instructions on deploying to production.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

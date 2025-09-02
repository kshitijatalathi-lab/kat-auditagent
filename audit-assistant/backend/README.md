# Audit Assistant Backend

This is the backend service for the Audit Assistant application, built with FastAPI and SQLAlchemy.

## Features

- **User Authentication**: JWT-based authentication with role-based access control
- **Multi-tenant Architecture**: Support for multiple organizations
- **Document Management**: Upload, process, and analyze documents
- **Audit Workflows**: Create and manage audit sessions with findings
- **RESTful API**: Well-documented endpoints for frontend integration

## Prerequisites

- Python 3.8+
- PostgreSQL (recommended) or SQLite
- pip (Python package manager)

## Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/yourusername/audit-assistant.git
cd audit-assistant/backend
```

### 2. Set up the environment

1. Create and activate a virtual environment:

   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

2. Install dependencies:

   ```bash
   pip install -r requirements.txt
   ```

3. Create a `.env` file based on the example:

   ```bash
   cp .env.example .env
   ```

4. Update the `.env` file with your configuration (database URL, secret key, etc.)

### 3. Initialize the database

```bash
python init_db.py
```

This will create all necessary database tables and create an admin user with the following credentials:
- Email: admin@example.com
- Password: changeme

### 4. Run the development server

```bash
python run.py
```

The API will be available at `http://localhost:8000`

## API Documentation

Once the server is running, you can access:

- **Interactive API docs**: http://localhost:8000/docs
- **Alternative API docs**: http://localhost:8000/redoc

## Project Structure

```
backend/
├── app/                    # Application package
│   ├── api/               # API routes
│   ├── core/              # Core functionality (config, security)
│   ├── crud/              # Database operations
│   ├── db/                # Database configuration
│   ├── models/            # SQLAlchemy models
│   ├── schemas/           # Pydantic models
│   └── main.py            # FastAPI application
├── migrations/            # Database migrations (Alembic)
├── scripts/               # Utility scripts
├── tests/                 # Test files
├── .env.example           # Environment variables example
├── init_db.py            # Database initialization
├── requirements.txt       # Production dependencies
├── requirements-dev.txt   # Development dependencies
└── run.py                # Application entry point
```

## Development

### Code Style

We use `black` for code formatting and `isort` for import sorting. Before committing, run:

```bash
black .
isort .
```

### Running Tests

```bash
pytest
```

### Database Migrations

We use Alembic for database migrations. To create a new migration:

```bash
alembic revision --autogenerate -m "Your migration message"
alembic upgrade head
```

## Deployment

### Production

For production deployment, consider using:

- **ASGI Server**: Uvicorn with Gunicorn
- **Process Manager**: Systemd, Supervisor, or Docker
- **Database**: PostgreSQL with connection pooling
- **Caching**: Redis
- **Monitoring**: Sentry, Prometheus, Grafana

Example with Gunicorn:

```bash
gunicorn -w 4 -k uvicorn.workers.UvicornWorker app.main:app
```

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

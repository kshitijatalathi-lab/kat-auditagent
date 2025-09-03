#!/usr/bin/env python3
"""
Run the FastAPI application using Uvicorn.

This script starts the FastAPI application with Uvicorn ASGI server.
"""
import uvicorn
from app.core.config import settings

def main() -> None:
    """Run the FastAPI application with Uvicorn."""
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.DEBUG,
        log_level="info",
    )

if __name__ == "__main__":
    main()

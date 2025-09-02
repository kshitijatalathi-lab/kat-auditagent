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
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG,
        workers=settings.WORKERS,
        log_level=settings.LOG_LEVEL.lower(),
    )

if __name__ == "__main__":
    main()

"""Database configuration and session management.

This module provides database session management and base model definitions.
"""

from .session import SessionLocal, ScopedSession, get_db
from .base import Base, BaseModel

# Import all models to ensure they are registered with SQLAlchemy
from app.models import (
    User, 
    Organization, 
    Document, 
    DocumentChunk, 
    AuditSession, 
    AuditFinding,
    user_organization,
    audit_session_documents
)

__all__ = [
    'Base',
    'BaseModel',
    'SessionLocal',
    'ScopedSession',
    'get_db',
    'User',
    'Organization',
    'Document',
    'DocumentChunk',
    'AuditSession',
    'AuditFinding',
    'user_organization',
    'audit_session_documents'
]
#!/usr/bin/env python3
"""
Initialize the database with required tables and initial data.

This script creates all database tables based on the SQLAlchemy models
and populates them with initial data if needed.
"""
import logging
import sys
from typing import List

from sqlalchemy.orm import Session
from sqlalchemy import text

from app.core.config import settings
from app.core.security import get_password_hash
from app.db.base import Base
from app.db.session import engine, SessionLocal

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def init_db(db: Session) -> None:
    """Initialize the database with required tables and initial data.
    
    Args:
        db: Database session
    """
    # Import all models to ensure they are registered with SQLAlchemy
    from app.models import (
        User, Organization, Document, DocumentChunk, AuditSession, AuditFinding
    )
    
    # Create all tables
    logger.info("Creating database tables...")
    Base.metadata.create_all(bind=engine)
    logger.info("Database tables created successfully!")
    
    # Create default organization
    org = db.query(Organization).filter(
        Organization.name == "Default Organization"
    ).first()
    
    if not org:
        org = Organization(
            name="Default Organization",
            description="Default organization for initial setup"
        )
        db.add(org)
        db.commit()
        db.refresh(org)
        logger.info("Created default organization")
    
    # Create admin user if it doesn't exist
    admin = db.query(User).filter(
        User.email == settings.FIRST_SUPERUSER
    ).first()
    
    if not admin:
        admin = User(
            email=settings.FIRST_SUPERUSER,
            hashed_password=get_password_hash(settings.FIRST_SUPERUSER_PASSWORD),
            full_name="Admin User",
            is_superuser=True,
            is_active=True,
        )
        db.add(admin)
        db.commit()
        db.refresh(admin)
        logger.info(f"Created admin user: {settings.FIRST_SUPERUSER}")
        
        # Add admin to organization
        db.execute(
            text(
                """
                INSERT INTO user_organization (user_id, organization_id, role)
                VALUES (:user_id, :org_id, 'owner')
                """
            ),
            {"user_id": admin.id, "org_id": org.id}
        )
        db.commit()
        logger.info(f"Added admin user to default organization")


def main() -> None:
    """Main entry point for database initialization."""
    logger.info("Starting database initialization...")
    db = SessionLocal()
    try:
        init_db(db)
        logger.info("Database initialization completed successfully!")
    except Exception as e:
        logger.error(f"Error initializing database: {e}")
        sys.exit(1)
    finally:
        db.close()


if __name__ == "__main__":
    main()

from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, scoped_session
from typing import Generator

from app.core.config import settings

# Create SQLAlchemy engine
"""Base database configuration and models.

This module provides the base SQLAlchemy configuration and base model classes.
"""
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy import Column, Integer, DateTime, func
from typing import Any, Dict

# Create declarative base
Base = declarative_base()

class BaseModel:
    """Base model with common columns and methods.
    
    Attributes:
        id: Primary key
        created_at: Timestamp of when the record was created
        updated_at: Timestamp of when the record was last updated
    """
    id = Column(Integer, primary_key=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert model instance to dictionary.
        
        Returns:
            Dict containing the model's attributes
        """
        return {
            column.name: getattr(self, column.name) 
            for column in self.__table__.columns
        }
        
    def update(self, **kwargs) -> None:
        """Update model attributes.
        
        Args:
            **kwargs: Attributes to update
        """
        for key, value in kwargs.items():
            if hasattr(self, key):
                setattr(self, key, value)

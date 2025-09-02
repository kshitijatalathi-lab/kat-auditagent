"""CRUD operations for the application."""
from .base import CRUDBase
from .crud_user import user

__all__ = [
    "CRUDBase",
    "user",
]

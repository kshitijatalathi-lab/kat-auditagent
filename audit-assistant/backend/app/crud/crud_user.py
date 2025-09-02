"""CRUD operations for users."""
from typing import Any, Dict, List, Optional, Union

from fastapi.encoders import jsonable_encoder
from sqlalchemy.orm import Session

from app import models, schemas
from app.core.security import get_password_hash, verify_password
from app.crud.base import CRUDBase


class CRUDUser(CRUDBase[models.User, schemas.UserCreate, schemas.UserUpdate]):
    """CRUD operations for User model with additional authentication methods."""
    
    def get_by_email(self, db: Session, *, email: str) -> Optional[models.User]:
        """Get a user by email."""
        return db.query(models.User).filter(models.User.email == email).first()
    
    def create(self, db: Session, *, obj_in: schemas.UserCreate) -> models.User:
        """Create a new user with hashed password."""
        db_obj = models.User(
            email=obj_in.email,
            hashed_password=get_password_hash(obj_in.password),
            full_name=obj_in.full_name,
            is_superuser=obj_in.is_superuser,
        )
        db.add(db_obj)
        db.commit()
        db.refresh(db_obj)
        return db_obj
    
    def update(
        self, db: Session, *, db_obj: models.User, obj_in: Union[schemas.UserUpdate, Dict[str, Any]]
    ) -> models.User:
        """Update a user, handling password hashing if needed."""
        if isinstance(obj_in, dict):
            update_data = obj_in
        else:
            update_data = obj_in.dict(exclude_unset=True)
            
        if "password" in update_data and update_data["password"]:
            hashed_password = get_password_hash(update_data["password"])
            del update_data["password"]
            update_data["hashed_password"] = hashed_password
            
        return super().update(db, db_obj=db_obj, obj_in=update_data)
    
    def authenticate(
        self, db: Session, *, email: str, password: str
    ) -> Optional[models.User]:
        """Authenticate a user."""
        user = self.get_by_email(db, email=email)
        if not user:
            return None
        if not verify_password(password, user.hashed_password):
            return None
        return user
    
    def is_active(self, user: models.User) -> bool:
        """Check if user is active."""
        return user.is_active
    
    def is_superuser(self, user: models.User) -> bool:
        """Check if user is a superuser."""
        return user.is_superuser
    
    def get_with_organizations(
        self, db: Session, *, user_id: int
    ) -> Optional[models.User]:
        """Get a user with their organizations."""
        return (
            db.query(models.User)
            .options(
                sqlalchemy.orm.joinedload(models.User.organizations)
            )
            .filter(models.User.id == user_id)
            .first()
        )


# Create a singleton instance
user = CRUDUser(models.User)

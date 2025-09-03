"""Dependencies for API endpoints."""
from typing import Generator, Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import jwt
from pydantic import ValidationError
from sqlalchemy.orm import Session

from app import crud, models, schemas
from app.core import security
from app.core.config import settings
from app.db.session import SessionLocal

# OAuth2 scheme for token authentication
oauth2_scheme = OAuth2PasswordBearer(
    tokenUrl=f"{settings.API_V1_STR}/auth/login/access-token"
)

def get_db() -> Generator:
    """
    Dependency that provides a database session.
    
    Yields:
        Session: Database session
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def get_current_user(
    db: Session = Depends(get_db), 
    token: str = Depends(oauth2_scheme)
) -> models.User:
    """
    Get the current authenticated user from the token.
    
    Args:
        db: Database session
        token: JWT token
        
    Returns:
        models.User: Authenticated user
        
    Raises:
        HTTPException: If the token is invalid or user not found
    """
    try:
        payload = jwt.decode(
            token, settings.SECRET_KEY, algorithms=[settings.JWT_ALGORITHM]
        )
        token_data = schemas.TokenPayload(**payload)
    except (jwt.JWTError, ValidationError):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Could not validate credentials",
        )
    
    user = crud.user.get(db, id=token_data.sub)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    return user

def get_current_active_user(
    current_user: models.User = Depends(get_current_user),
) -> models.User:
    """
    Get the current active user.
    
    Args:
        current_user: Current authenticated user
        
    Returns:
        models.User: Active user
        
    Raises:
        HTTPException: If the user is inactive
    """
    if not crud.user.is_active(current_user):
        raise HTTPException(status_code=400, detail="Inactive user")
    return current_user

def get_current_active_superuser(
    current_user: models.User = Depends(get_current_user),
) -> models.User:
    """
    Get the current active superuser.
    
    Args:
        current_user: Current authenticated user
        
    Returns:
        models.User: Active superuser
        
    Raises:
        HTTPException: If the user is not a superuser
    """
    if not crud.user.is_superuser(current_user):
        raise HTTPException(
            status_code=400, 
            detail="The user doesn't have enough privileges"
        )
    return current_user

def get_current_user_with_organizations(
    current_user: models.User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> models.User:
    """
    Get the current user with their organizations.
    
    Args:
        current_user: Current authenticated user
        db: Database session
        
    Returns:
        models.User: User with organizations
    """
    return crud.user.get_with_organizations(db, user_id=current_user.id)

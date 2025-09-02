"""Pydantic models for user-related schemas."""
from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, EmailStr, Field, validator

class UserBase(BaseModel):
    """Base user schema with common fields."""
    email: EmailStr = Field(..., description="User email address")
    full_name: Optional[str] = Field(None, description="User's full name")
    is_active: bool = Field(True, description="Whether the user is active")
    is_superuser: bool = Field(False, description="Whether the user is a superuser")

class UserCreate(UserBase):
    """Schema for creating a new user."""
    password: str = Field(..., min_length=8, description="User password (min 8 characters)")
    
    @validator('password')
    def password_complexity(cls, v):
        """Validate password complexity."""
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters long")
        if not any(c.isupper() for c in v):
            raise ValueError("Password must contain at least one uppercase letter")
        if not any(c.islower() for c in v):
            raise ValueError("Password must contain at least one lowercase letter")
        if not any(c.isdigit() for c in v):
            raise ValueError("Password must contain at least one number")
        return v

class UserUpdate(BaseModel):
    """Schema for updating an existing user."""
    email: Optional[EmailStr] = Field(None, description="New email address")
    full_name: Optional[str] = Field(None, description="New full name")
    password: Optional[str] = Field(None, min_length=8, description="New password (min 8 characters)")
    is_active: Optional[bool] = Field(None, description="Whether the user is active")
    
    @validator('password')
    def password_complexity(cls, v):
        """Validate password complexity if provided."""
        if v is not None:
            if len(v) < 8:
                raise ValueError("Password must be at least 8 characters long")
            if not any(c.isupper() for c in v):
                raise ValueError("Password must contain at least one uppercase letter")
            if not any(c.islower() for c in v):
                raise ValueError("Password must contain at least one lowercase letter")
            if not any(c.isdigit() for c in v):
                raise ValueError("Password must contain at least one number")
        return v

class UserInDBBase(UserBase):
    """Base schema for user data in the database."""
    id: int = Field(..., description="User ID")
    created_at: datetime = Field(..., description="When the user was created")
    updated_at: datetime = Field(..., description="When the user was last updated")
    
    class Config:
        orm_mode = True

class User(UserInDBBase):
    """User schema for API responses (excludes sensitive data)."""
    pass

class UserInDB(UserInDBBase):
    """User schema with sensitive data included (for internal use only)."""
    hashed_password: str = Field(..., description="Hashed password")

class UserWithOrganizations(User):
    """User schema with organization information."""
    organizations: List[dict] = Field(default_factory=list, description="List of organizations the user belongs to")

"""Pydantic models for token handling."""
from pydantic import BaseModel, Field

class Token(BaseModel):
    """Token response model."""
    access_token: str = Field(..., description="JWT access token")
    token_type: str = Field("bearer", description="Token type")

class TokenData(BaseModel):
    """Token payload model."""
    email: str | None = None
    scopes: list[str] = []

class TokenCreate(BaseModel):
    """Token creation model."""
    email: str = Field(..., description="User email")
    password: str = Field(..., description="User password")

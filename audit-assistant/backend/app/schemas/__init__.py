from .user import (
    User,
    UserBase,
    UserCreate,
    UserUpdate,
    UserInDB,
    UserInDBBase,
    UserWithOrganizations,
)
from .token import Token, TokenData, TokenCreate

__all__ = [
    "User",
    "UserBase",
    "UserCreate",
    "UserUpdate",
    "UserInDB",
    "UserInDBBase",
    "UserWithOrganizations",
    "Token",
    "TokenData",
    "TokenCreate",
]


from pydantic import BaseModel, Field

class Msg(BaseModel):
    msg: str = Field(..., description="Message")

__all__.append("Msg")

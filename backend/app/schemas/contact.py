from pydantic import BaseModel, EmailStr, Field
from datetime import datetime


class ContactRequest(BaseModel):
    firstName: str = Field(..., min_length=1)
    lastName: str = Field(..., min_length=1)
    email: EmailStr
    message: str = Field(..., min_length=5)


class ContactResponse(BaseModel):
    status: str
    received: bool = True
    message: str


class ContactMessage(BaseModel):
    id: int
    first_name: str
    last_name: str
    email: str
    message: str
    submitted_at: datetime

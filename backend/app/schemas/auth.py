from pydantic import BaseModel, Field


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = 'Bearer'
    expires_in: int = Field(default=0)

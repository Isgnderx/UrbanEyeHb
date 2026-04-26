from typing import Any

from pydantic import BaseModel, Field


class ProcessProxyRequest(BaseModel):
    payload: dict[str, Any] = Field(..., description='Exact payload expected by Copernicus Process API')


class ProcessProxyResponse(BaseModel):
    image_base64: str
    content_type: str

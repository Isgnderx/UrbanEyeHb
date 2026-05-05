from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime


class ReportItem(BaseModel):
    id: int
    category: str
    latitude: float
    longitude: float
    notes: str
    submittedAt: str
    photoPath: Optional[str] = None


class ReportListResponse(BaseModel):
    reports: List[ReportItem] = Field(default_factory=list)


class ReportUploadRequest(BaseModel):
    category: str = Field(..., min_length=1)
    latitude: float
    longitude: float
    notes: str = Field(..., min_length=1)
    photo: Optional[str] = None  # Base64 or file path


class UrbanReport(BaseModel):
    id: int
    category: str
    latitude: float
    longitude: float
    notes: str
    submitted_at: datetime
    photo_path: Optional[str] = None
    user_id: Optional[int] = None

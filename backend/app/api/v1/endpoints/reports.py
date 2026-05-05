from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.database import UrbanReport
from app.schemas.reports import ReportListResponse, ReportItem

router = APIRouter(tags=['reports'])


@router.get('/reports', response_model=ReportListResponse)
async def get_reports(db: Session = Depends(get_db)) -> ReportListResponse:
    reports = db.query(UrbanReport).all()
    report_items = [
        ReportItem(
            id=r.id,
            category=r.category,
            latitude=r.latitude,
            longitude=r.longitude,
            notes=r.notes,
            submittedAt=r.submitted_at.isoformat(),
            photoPath=r.photo_path
        ) for r in reports
    ]
    return ReportListResponse(reports=report_items)

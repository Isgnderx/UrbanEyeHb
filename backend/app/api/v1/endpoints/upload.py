from fastapi import APIRouter, UploadFile, File, Form, Depends
from sqlalchemy.orm import Session
from typing import Optional

from app.core.database import get_db
from app.models.database import UrbanReport
from app.schemas.reports import ReportUploadRequest, ReportItem

router = APIRouter(tags=['upload'])


@router.post('/upload/report')
async def upload_report(
    category: str = Form(...),
    latitude: float = Form(...),
    longitude: float = Form(...),
    notes: str = Form(...),
    photo: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db)
):
    photo_path = None
    if photo:
        # Save file logic here
        photo_path = f"uploads/{photo.filename}"
        with open(photo_path, "wb") as buffer:
            buffer.write(await photo.read())

    report = UrbanReport(
        category=category,
        latitude=latitude,
        longitude=longitude,
        notes=notes,
        photo_path=photo_path
    )
    db.add(report)
    db.commit()
    db.refresh(report)

    return {"message": "Report uploaded successfully", "id": report.id}

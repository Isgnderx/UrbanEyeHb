from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.database import UrbanReport, ContactMessage

router = APIRouter(prefix='/admin', tags=['admin'])


@router.get('/reports')
async def get_admin_reports(db: Session = Depends(get_db)):
    reports = db.query(UrbanReport).all()
    return {"reports": reports}


@router.get('/contacts')
async def get_admin_contacts(db: Session = Depends(get_db)):
    contacts = db.query(ContactMessage).all()
    return {"contacts": contacts}

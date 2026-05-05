from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.database import ContactMessage
from app.schemas.contact import ContactRequest, ContactResponse
from app.services.email_service import email_service

router = APIRouter(tags=['contact'])


@router.post('/contact', response_model=ContactResponse)
async def submit_contact(request: ContactRequest, db: Session = Depends(get_db)) -> ContactResponse:
    # Save to database
    contact = ContactMessage(
        first_name=request.firstName,
        last_name=request.lastName,
        email=request.email,
        message=request.message
    )
    db.add(contact)
    db.commit()
    db.refresh(contact)

    # Send email
    subject = f"New Contact from {request.firstName} {request.lastName}"
    body = f"Email: {request.email}\n\nMessage:\n{request.message}"
    await email_service.send_email("admin@urbaneye.ai", subject, body)

    return ContactResponse(
        status='received',
        received=True,
        message=f'Thank you, {request.firstName}. Your message has been queued for review.',
    )

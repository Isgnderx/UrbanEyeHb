from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.services.satellite_service import satellite_service
from app.schemas.copernicus import ProcessProxyRequest

router = APIRouter(tags=['satellite'])


@router.post('/satellite/process')
async def process_satellite(request: ProcessProxyRequest):
    return await satellite_service.process_satellite_data(request.payload)

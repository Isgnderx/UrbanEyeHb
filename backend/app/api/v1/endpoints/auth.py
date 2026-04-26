from fastapi import APIRouter

from app.schemas.auth import TokenResponse
from app.services.copernicus_service import copernicus_service

router = APIRouter(tags=['auth'])


@router.post('/auth/token', response_model=TokenResponse)
@router.post('/token', response_model=TokenResponse, include_in_schema=False)
async def get_token() -> TokenResponse:
    token_payload = await copernicus_service.get_access_token()
    return TokenResponse(**token_payload)

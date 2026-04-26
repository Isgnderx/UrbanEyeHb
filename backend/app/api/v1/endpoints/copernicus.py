import base64

from fastapi import APIRouter, Response

from app.schemas.copernicus import ProcessProxyRequest, ProcessProxyResponse
from app.services.copernicus_service import copernicus_service

router = APIRouter(tags=['copernicus'])


@router.post('/copernicus/process/image')
async def process_image_raw(request: ProcessProxyRequest) -> Response:
    image_bytes, content_type = await copernicus_service.process(request.payload)
    return Response(content=image_bytes, media_type=content_type)


@router.post('/copernicus/process', response_model=ProcessProxyResponse)
async def process_image_base64(request: ProcessProxyRequest) -> ProcessProxyResponse:
    image_bytes, content_type = await copernicus_service.process(request.payload)
    return ProcessProxyResponse(
        image_base64=base64.b64encode(image_bytes).decode('ascii'),
        content_type=content_type,
    )

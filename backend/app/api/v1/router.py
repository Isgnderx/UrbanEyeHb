from fastapi import APIRouter

from app.api.v1.endpoints import auth, copernicus, health, reports, contact, upload, satellite, home, admin

api_router = APIRouter(prefix='/api/v1')
api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(copernicus.router)
api_router.include_router(reports.router)
api_router.include_router(contact.router)
api_router.include_router(upload.router)
api_router.include_router(satellite.router)
api_router.include_router(home.router)
api_router.include_router(admin.router)

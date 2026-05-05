from pathlib import Path
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.v1.endpoints.health import health as health_handler
from app.api.v1.endpoints.auth import get_token as token_handler
from app.api.v1.endpoints.contact import submit_contact as contact_handler
from app.api.v1.endpoints.reports import get_reports as reports_handler
from app.api.v1.router import api_router
from app.core.config import settings
from app.core.database import engine
from app.models.database import Base

BASE_DIR = Path(__file__).resolve().parents[2]
FRONT_DIR = BASE_DIR / 'Front'


def create_app() -> FastAPI:
    # Create database tables
    Base.metadata.create_all(bind=engine)

    app = FastAPI(title=settings.app_name, debug=settings.app_debug)

    allowed_origins = [o.strip() for o in settings.frontend_origin.split(',') if o.strip()]
    if not allowed_origins:
        allowed_origins = ['*']

    app.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins,
        allow_credentials=True,
        allow_methods=['*'],
        allow_headers=['*'],
    )

    app.include_router(api_router)

    # Backward-compatible endpoints used by the current frontend code.
    app.add_api_route('/health', health_handler, methods=['GET'], tags=['compat'])
    app.add_api_route('/token', token_handler, methods=['POST'], tags=['compat'])
    app.add_api_route('/api/contact', contact_handler, methods=['POST'], tags=['compat'])
    app.add_api_route('/api/reports', reports_handler, methods=['GET'], tags=['compat'])

    if FRONT_DIR.exists() and not os.getenv('VERCEL'):
        app.mount('/', StaticFiles(directory=str(FRONT_DIR), html=True), name='frontend')

    return app


app = create_app()

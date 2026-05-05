from pathlib import Path
import os
import traceback

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from app.api.v1.endpoints.health import health as health_handler
from app.api.v1.endpoints.auth import get_token as token_handler
from app.api.v1.router import api_router
from app.core.config import settings

BASE_DIR = Path(__file__).resolve().parents[2]
FRONT_DIR = BASE_DIR / 'Front'


def create_app() -> FastAPI:

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

    @app.on_event('startup')
    async def startup_debug() -> None:
        print('Vercel Debug: CDSE_CLIENT_ID loaded:', bool(settings.cdse_client_id))
        print('Vercel Debug: CDSE_CLIENT_SECRET loaded:', bool(settings.cdse_client_secret))
        print('Vercel Debug: CDSE_TOKEN_URL:', settings.cdse_token_url)
        print('Vercel Debug: CDSE_PROCESS_URL:', settings.cdse_process_url)
        print('Vercel Debug: FRONTEND_ORIGIN:', settings.frontend_origin)

    @app.exception_handler(Exception)
    async def log_all_exceptions(request: Request, exc: Exception):
        traceback.print_exception(type(exc), exc, exc.__traceback__)
        return JSONResponse(
            status_code=500,
            content={'detail': 'Internal server error'},
        )

    try:
        app.include_router(api_router)
    except Exception as e:
        print(f"Router inclusion error: {e}")

    # Backward-compatible endpoints used by the current frontend code.
    app.add_api_route('/health', health_handler, methods=['GET'], tags=['compat'])
    app.add_api_route('/token', token_handler, methods=['POST'], tags=['compat'])

    # Don't mount static files in Vercel - they're handled by Vercel's static hosting
    if FRONT_DIR.exists() and not os.getenv('VERCEL'):
        app.mount('/', StaticFiles(directory=str(FRONT_DIR), html=True), name='frontend')

    return app


app = create_app()

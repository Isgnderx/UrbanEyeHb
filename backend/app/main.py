from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.endpoints.health import health as health_handler
from app.api.v1.endpoints.auth import get_token as token_handler
from app.api.v1.router import api_router
from app.core.config import settings


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

    app.include_router(api_router)

    # Backward-compatible endpoints used by the current frontend code.
    app.add_api_route('/health', health_handler, methods=['GET'], tags=['compat'])
    app.add_api_route('/token', token_handler, methods=['POST'], tags=['compat'])

    return app


app = create_app()

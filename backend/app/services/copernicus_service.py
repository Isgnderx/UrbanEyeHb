import asyncio
import time
from typing import Any

import httpx
from fastapi import HTTPException, status

from app.core.config import settings


class CopernicusService:
    def __init__(self) -> None:
        self._token: str | None = None
        self._token_expiry_ts: float = 0.0
        self._lock = asyncio.Lock()

    async def _request_new_token(self) -> dict[str, Any]:
        if not settings.cdse_client_id or not settings.cdse_client_secret:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail='Missing CDSE credentials in .env',
            )

        body = {
            'grant_type': 'client_credentials',
            'client_id': settings.cdse_client_id,
            'client_secret': settings.cdse_client_secret,
        }

        async with httpx.AsyncClient(timeout=30) as client:
            res = await client.post(
                settings.cdse_token_url,
                data=body,
                headers={'Content-Type': 'application/x-www-form-urlencoded'},
            )

        if res.status_code >= 400:
            raise HTTPException(
                status_code=res.status_code,
                detail=f'CDSE auth failed: {res.text}',
            )

        return res.json()

    async def get_access_token(self) -> dict[str, Any]:
        now = time.time()
        if self._token and now < self._token_expiry_ts:
            ttl = max(0, int(self._token_expiry_ts - now))
            return {
                'access_token': self._token,
                'token_type': 'Bearer',
                'expires_in': ttl,
            }

        async with self._lock:
            now = time.time()
            if self._token and now < self._token_expiry_ts:
                ttl = max(0, int(self._token_expiry_ts - now))
                return {
                    'access_token': self._token,
                    'token_type': 'Bearer',
                    'expires_in': ttl,
                }

            token_payload = await self._request_new_token()
            access_token = token_payload.get('access_token')
            expires_in = int(token_payload.get('expires_in', 0))

            if not access_token:
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail='CDSE token response missing access_token',
                )

            # Keep a 60-second safety window before real expiry.
            safe_ttl = max(0, expires_in - 60)
            self._token = access_token
            self._token_expiry_ts = time.time() + safe_ttl

            return {
                'access_token': access_token,
                'token_type': token_payload.get('token_type', 'Bearer'),
                'expires_in': expires_in,
            }

    async def process(self, payload: dict[str, Any]) -> tuple[bytes, str]:
        token_payload = await self.get_access_token()
        token = token_payload['access_token']

        print(f"Vercel Debug: Copernicus process payload: {payload}")
        print(f"Vercel Debug: Copernicus token: {token[:50]}...")

        async with httpx.AsyncClient(timeout=90) as client:
            res = await client.post(
                settings.cdse_process_url,
                json=payload,
                headers={
                    'Authorization': f'Bearer {token}',
                    'Content-Type': 'application/json',
                    'Accept': 'image/png',
                },
            )

        print(f"Vercel Debug: Copernicus API response status: {res.status_code}")
        print(f"Vercel Debug: Copernicus API response text: {res.text[:500]}")

        if res.status_code >= 400:
            raise HTTPException(
                status_code=res.status_code,
                detail=f'CDSE process failed: {res.text}',
            )

        return res.content, res.headers.get('content-type', 'image/png')


copernicus_service = CopernicusService()

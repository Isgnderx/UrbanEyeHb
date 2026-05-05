from typing import Any, Dict

from app.core.config import settings
from app.interfaces import ISatelliteService
from app.services.copernicus_service import copernicus_service


class SatelliteService(ISatelliteService):
    async def process_satellite_data(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        # Delegate to existing copernicus service
        return await copernicus_service.process(payload)


satellite_service = SatelliteService()

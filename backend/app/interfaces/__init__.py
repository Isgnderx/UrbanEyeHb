from abc import ABC, abstractmethod
from typing import Any, Dict


class IEmailService(ABC):
    @abstractmethod
    async def send_email(self, to_email: str, subject: str, body: str) -> bool:
        pass


class ISatelliteService(ABC):
    @abstractmethod
    async def process_satellite_data(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        pass

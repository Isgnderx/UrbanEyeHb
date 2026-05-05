from datetime import datetime
from typing import List

from app.schemas.reports import ReportItem


_SAMPLE_REPORTS: List[ReportItem] = [
    ReportItem(
        id=1,
        category='Construction',
        latitude=40.4200,
        longitude=49.8380,
        notes='Unauthorized high-rise foundation detected near Sabail district.',
        submittedAt=datetime(2026, 5, 4, 14, 26).isoformat(),
        photoPath='https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=400&q=80',
    ),
    ReportItem(
        id=2,
        category='Traffic',
        latitude=40.4032,
        longitude=49.9220,
        notes='Persistent construction traffic congestion at Heydar Aliyev Avenue.',
        submittedAt=datetime(2026, 5, 4, 12, 10).isoformat(),
        photoPath='https://images.unsplash.com/photo-1494526585095-c41746248156?auto=format&fit=crop&w=400&q=80',
    ),
    ReportItem(
        id=3,
        category='Construction',
        latitude=40.3712,
        longitude=49.8294,
        notes='New excavation activity inside protected heritage perimeter.',
        submittedAt=datetime(2026, 5, 4, 9, 44).isoformat(),
        photoPath='https://images.unsplash.com/photo-1494522358659-2e4b63b6c0d2?auto=format&fit=crop&w=400&q=80',
    ),
]


class ReportService:
    def __init__(self) -> None:
        self._reports = list(_SAMPLE_REPORTS)

    def get_reports(self) -> List[ReportItem]:
        return list(self._reports)


report_service = ReportService()

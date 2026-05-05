from fastapi import APIRouter
from fastapi.responses import HTMLResponse

router = APIRouter(tags=['home'])


@router.get('/', response_class=HTMLResponse)
async def home():
    return """
    <html>
        <head><title>UrbanEye</title></head>
        <body>
            <h1>Welcome to UrbanEye</h1>
            <a href="/dashboard.html">Go to Dashboard</a>
        </body>
    </html>
    """

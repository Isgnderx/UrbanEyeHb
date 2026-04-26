# Urban FastAPI Backend

FastAPI backend for Copernicus token + process proxy. Credentials stay in backend `.env`, not in frontend code.

## 1) Configure env

Use your existing `.env` or copy from `.env.example` and fill:

- `CDSE_CLIENT_ID`
- `CDSE_CLIENT_SECRET`

## 2) Create virtual environment

```bash
cd backend
python -m venv .venv
```

Activate:

- Windows PowerShell:

```powershell
.\.venv\Scripts\Activate.ps1
```

## 3) Install packages

```bash
pip install -r requirements.txt
```

## 4) Run API

```bash
python run.py
```

Server runs on `http://localhost:8000`.

## 5) Main endpoints

Backward-compatible (current frontend uses these):

- `GET /health`
- `POST /token`

Versioned API:

- `GET /api/v1/health`
- `POST /api/v1/auth/token`
- `POST /api/v1/copernicus/process/image`
- `POST /api/v1/copernicus/process`

## 6) Quick checks

```powershell
Invoke-RestMethod -Method Get -Uri "http://localhost:8000/health"
```

```powershell
Invoke-RestMethod -Method Post -Uri "http://localhost:8000/token" -Body @{}
```

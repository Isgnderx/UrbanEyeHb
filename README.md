# Urban Anomaly Detection System - Technical Documentation

This project integrates satellite data processing with interactive geospatial visualization to identify urban changes and preservation risks. The system utilizes Copernicus Sentinel-2 imagery and a 3D dual-visualization interface.

---

## 1. Architectural Overview
The system follows a **decoupled Client-Server architecture**.

* **Frontend:** A static web application using **Leaflet.js** for 2D mapping and **Three.js** for 3D terrain visualization. It manages the user interface, AOI drawing, and client-side change detection logic.
* **Backend:** A **FastAPI** service acting as a secure proxy. It manages authentication with Copernicus CDSE, handles in-memory token caching, and proxies imagery requests to protect sensitive credentials.
* **External Integrations:** * **Copernicus CDSE:** Source for Sentinel-2 satellite imagery.
    * **Google Maps API:** Provides Street View for ground-level validation.

---

## 2. System Use Case Diagram
The following diagram illustrates the primary interactions between the Urban Analyst, the system modules, and external providers.

```mermaid
usecaseDiagram
    actor "Urban Analyst" as user
    actor "Copernicus CDSE" as copernicus <<System>>
    actor "Google Maps API" as gmaps <<System>>

    package "Urban Anomaly Detection System" {
        usecase "Draw AOI on Map" as UC1
        usecase "View Satellite Imagery" as UC2
        usecase "Perform Change Detection" as UC3
        usecase "View 3D Street/Terrain" as UC4
        usecase "Authenticate with Copernicus" as UC5
    }

    user --> UC1
    user --> UC2
    user --> UC3
    user --> UC4
    
    UC2 ..> UC5 : <<include>>
    UC5 -- copernicus
    UC2 -- copernicus
    UC4 -- gmaps
```
```
deploymentDiagram
    node "User Device" {
        node "Web Browser" {
            artifact "Static Assets (HTML/JS)"
        }
    }

    node "Static Web Host (Vercel/S3)" {
        artifact "Frontend Build"
    }

    node "App Server (EC2/Cloud Run)" {
        node "Docker Container" {
            artifact "FastAPI App (Uvicorn)"
        }
    }

    node "Cloud Services" {
        [Copernicus CDSE API]
        [Google Maps API]
    }

    "Web Browser" -- "HTTPS/JSON" : "API_BASE_URL (config.js)" --> "App Server"
    "Web Browser" -- "Load" --> "Static Web Host"
    "App Server" -- "Proxy Request" --> [Copernicus CDSE API]
```
```
classDiagram
    class FastAPIApp {
        +cors_middleware
        +include_router(auth)
        +include_router(copernicus)
    }

    class Settings {
        +CDSE_CLIENT_ID: str
        +CDSE_CLIENT_SECRET: str
        +CDSE_TOKEN_URL: str
        +CDSE_PROCESS_URL: str
    }

    class CopernicusService {
        -token_cache: dict
        -settings: Settings
        +get_token() TokenResponse
        +process_request(payload) ProcessProxyResponse
        -is_token_expired() bool
    }

    class TokenResponse {
        +access_token: str
        +expires_in: int
    }

    FastAPIApp --> Settings
    FastAPIApp --> CopernicusService
    CopernicusService ..> TokenResponse : returns
```
```
sequenceDiagram
    participant BE as API Router
    participant CS as CopernicusService
    participant Cache as In-Memory Cache
    participant CDSE as CDSE Auth Endpoint

    BE->>CS: get_token()
    CS->>Cache: check token & expiry
    alt Token valid in cache
        Cache-->>CS: return cached_token
    else Token missing or expired
        CS->>CDSE: POST /token (client_credentials)
        CDSE-->>CS: New Token + expires_in
        CS->>Cache: Store token + timestamp
    end
    CS-->>BE: return access_token
```
```
partition Frontend {
  (*) --> "User draws AOI"
  "User draws AOI" --> "Extract Geometry"
  "Extract Geometry" --> "Request Imagery (T1/T2)"
}

partition Backend {
  "Request Imagery (T1/T2)" --> "Verify Token"
  "Verify Token" --> "Fetch from Copernicus API"
  "Fetch from Copernicus API" --> "Return Imagery Stream"
}

partition Frontend {
  "Return Imagery Stream" --> "Pixel-wise Comparison"
  "Pixel-wise Comparison" --> "Cluster Anomaly Points"
  if "Point in Preservation Zone?" then
    -->[Yes] "Flag as Risk (Red)"
  else
    -->[No] "Standard Change (Yellow)"
  end
  "Standard Change (Yellow)" --> "Render Markers on Leaflet"
  "Flag as Risk (Red)" --> "Render Markers on Leaflet"
  "Render Markers on Leaflet" --> (*)
}
```

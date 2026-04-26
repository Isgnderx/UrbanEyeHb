# 🌍 Urban Anomaly Detection System
### *AI-Assisted Satellite Imagery Analysis for Urban Preservation*

This project is an end-to-end solution for detecting urban changes and preservation risks using **Copernicus Sentinel-2** satellite data. Specifically optimized for the Baku region, it transforms raw spectral data into actionable insights through a seamless 2D/3D visualization interface.

---

## 🚀 Vision
Cities evolve rapidly. Distinguishing between planned development and unauthorized anomalies that threaten environmental or historical heritage is critical. Our system automates this by performing time-series analysis on satellite imagery to visualize changes in seconds.

---

## 🏗️ Architectural Overview

The system utilizes a **Decoupled Client-Server Architecture** to optimize security and performance. The backend acts as a secure "Gatekeeper" and Proxy, while the frontend handles heavy lifting for image processing and 3D rendering.

```mermaid
graph LR
    subgraph Client_Side [Frontend - Browser]
        UI[Leaflet.js Map]
        AD[Analysis Engine - Pixel Comparison]
        TD[Three.js 3D Viewer]
    end

    subgraph Server_Side [FastAPI Backend]
        Auth[Auth/Token Proxy]
        ImageProxy[Copernicus Process API Proxy]
        Cache[(In-Memory Token Cache)]
    end

    subgraph External_APIs [External Data Providers]
        Cop[Copernicus CDSE]
        GMap[Google Street View]
    end

    UI --> Auth
    AD --> ImageProxy
    Auth --> Cache
    ImageProxy --> Cop
    TD --> GMap
```


---

## 🛠️ Technical Stack

### 🔹 Backend (Python & FastAPI)
- **Security:** Obfuscates Copernicus `client_secret` from the client-side.
- **Token Management:** Implements an in-memory caching strategy to reuse access tokens until expiry, drastically reducing latency.
- **Router Pattern:** Standardized `/api/v1` structure for scalable endpoint management.

### 🔹 Frontend (JavaScript & Geospatial)
- **Mapping:** **Leaflet.js** for high-performance 2D map interaction and AOI (Area of Interest) drawing.
- **Change Detection:** Custom `analysis.js` logic that compares multi-temporal pixels to identify clusters of change.
- **Visualization:** A hybrid approach using **Three.js** for 3D terrain and **Google Street View** for ground-truth verification.

---

## 🔄 Core Workflow (Sequence Diagram)

The journey from initial AOI selection to 3D anomaly validation:

```mermaid
sequenceDiagram
    participant User as Urban Analyst
    participant FE as Frontend (JS)
    participant BE as FastAPI Backend
    participant CDSE as Copernicus CDSE

    User->>FE: Draw AOI on Map (Baku)
    FE->>BE: Request Imagery (Before/After)
    BE->>BE: Check Token Cache
    alt Token Expired/None
        BE->>CDSE: Auth (Client Credentials)
        CDSE-->>BE: New JWT Token
    end
    BE->>CDSE: Fetch Sentinel-2 Tiles
    CDSE-->>BE: Raw Imagery Data
    BE-->>FE: Proxy Image Bytes
    FE->>FE: Run Pixel-Wise Change Detection
    FE-->>User: Display Heatmap & Anomaly Markers
    User->>FE: Click Marker for 3D View
    FE->>User: Launch Three.js Terrain + Street View
```


---

## 📊 Decision Logic (Activity Diagram)

Not every change is a "risk." The system intelligently filters anomalies based on predefined preservation zones.

```mermaid
stateDiagram-v2
    [*] --> AOI_Selected
    AOI_Selected --> Image_Fetch
    Image_Fetch --> Comparison
    Comparison --> Anomaly_Detected
    
    state Anomaly_Detected {
        [*] --> Check_Zones
        Check_Zones --> Risk_High: Inside Heritage/Preservation Zone
        Check_Zones --> Risk_Low: Outside Sensitive Zone
    }
    
    Risk_High --> Marker_Red
    Risk_Low --> Marker_Yellow
    Marker_Red --> User_Alert
```

---

## 💻 Setup & Installation

### Backend
```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
# Configure .env with CDSE_CLIENT_ID and CDSE_CLIENT_SECRET
uvicorn app.main:app --reload
```

### Frontend
The frontend is a static web application. Update the `API_BASE_URL` in `config.js` to point to your backend, then serve using any static web server (e.g., Live Server or Nginx).

---

*Developed for the Urban Innovation Hackathon 2026.*

# UrbanEyeHbYou are a senior software architect and UML expert.

Create a complete UML package for this project based on the following real codebase context. Do not invent features that do not exist. Keep the diagrams aligned with the actual implementation.

Project summary:
- Frontend: a static web app in HTML/CSS/JavaScript.
- Backend: FastAPI service in Python.
- Domain: AI-assisted urban anomaly detection using Copernicus Sentinel-2 imagery, AOI drawing on a map, change detection, and optional 3D Street View / Three.js visualization.
- The app is used in a browser.
- There is no database layer in the current implementation.
- Frontend and backend may be deployed separately, but the frontend calls the backend API over HTTP.
- Backend is responsible for authentication/token proxying and Copernicus process API requests.
- Frontend is responsible for UI, map interaction, AOI drawing, detection rendering, and 3D modal visualization.

Use these concrete system elements:
Frontend modules:
- index.html
- scripts/app.js
- scripts/map.js
- scripts/analysis.js
- scripts/viewer3d.js
- config.js

Backend modules:
- app/main.py
- app/core/config.py
- app/services/copernicus_service.py
- app/api/v1/endpoints/health.py
- app/api/v1/endpoints/auth.py
- app/api/v1/endpoints/copernicus.py
- app/schemas/common.py
- app/schemas/auth.py
- app/schemas/copernicus.py

Important runtime behavior:
- Frontend initializes a Leaflet map centered on Baku.
- User draws an AOI polygon/rectangle on the map.
- Frontend calls backend `/token` to get a Copernicus access token.
- Frontend may request Copernicus process imagery via backend proxy.
- Change detection compares before/after Sentinel-2 imagery.
- Detected items are shown as markers/dots and a results list.
- Some detections can be flagged as preservation risk based on predefined zones.
- Optional 3D Street View popup and a Three.js dual-3D modal can be opened.
- Backend caches the access token in memory and reuses it until expiry.
- Backend has backward-compatible endpoints `/health` and `/token`.
- Backend also exposes versioned endpoints under `/api/v1`.

What I want you to produce:
1. A Use Case Diagram for the whole system.
2. A Component Diagram showing frontend, backend, Copernicus, Google Maps/Street View, and browser interaction.
3. A Class Diagram for the backend domain and service layer, including:
   - Settings
   - CopernicusService
   - Request/response schemas
   - FastAPI app/router structure
4. A Sequence Diagram for the main user flow:
   - open app
   - initialize map
   - draw AOI
   - request token
   - fetch Copernicus imagery
   - run detection
   - display results
5. A Sequence Diagram for the token acquisition flow.
6. A Sequence Diagram for the Copernicus process image flow.
7. An Activity Diagram for AOI analysis and detection.
8. A Deployment Diagram for a separated frontend/backend deployment.
9. If useful, include a State Diagram for token cache lifecycle.
10. If useful, include a simple package/module diagram.

Modeling rules:
- Keep it faithful to the codebase.
- Do not add persistence, user accounts, payment flows, or admin systems because they do not exist.
- Do not invent microservices beyond the actual FastAPI app and frontend.
- Show the token cache as in-memory state inside CopernicusService.
- Show the frontend using a configurable API_BASE_URL from config.js.
- Show external dependencies as separate systems:
  - Copernicus CDSE token endpoint
  - Copernicus process API
  - Google Maps JS API / Street View
  - Leaflet
  - Three.js
- Include relationships such as:
  - FastAPI app includes routers
  - CopernicusService depends on external HTTP APIs
  - frontend app depends on map, analysis, and 3D modules
  - analysis module depends on token retrieval and process API
- Use clear stereotypes where appropriate, such as <<frontend>>, <<backend>>, <<external system>>, <<service>>, <<router>>, <<entity>>, <<schema>>, <<boundary>>, <<control>>.
- Use correct arrow semantics for UML.

Output format:
- First provide a short architecture overview.
- Then provide each UML diagram separately with a title.
- If rendering as PlantUML, output valid PlantUML code for each diagram.
- If rendering as Mermaid, output valid Mermaid syntax for each diagram.
- If you can choose, prefer PlantUML because it is better for detailed UML.
- Ensure diagrams are readable and professional.
- If a class/relationship is ambiguous, infer minimally and note the assumption briefly.

Project-specific details to include:
Frontend behavior:
- `app.js` manages token acquisition, UI state, and bootstrapping.
- `map.js` manages Leaflet map, AOI drawing, marker layers, clear/reset actions, and overlay switching.
- `analysis.js` manages Copernicus imagery requests, before/after comparison, change detection, clustering, marker generation, and result rendering.
- `viewer3d.js` manages 3D modal, Street View embed, and Three.js dual terrain visualization.
- `config.js` provides `API_BASE_URL`.
- `index.html` includes Leaflet, Three.js, Google Maps JS API, and the script modules.

Backend behavior:
- `main.py` creates the FastAPI app and registers CORS and routers.
- `health.py` returns service health.
- `auth.py` returns a Copernicus token through the service layer.
- `copernicus.py` exposes image proxy endpoints.
- `copernicus_service.py` handles:
  - token request
  - token cache
  - token expiry logic
  - process API request
  - HTTP error handling
- `config.py` reads env vars such as:
  - APP_ENV
  - APP_DEBUG
  - APP_HOST
  - PORT
  - FRONTEND_ORIGIN
  - CDSE_CLIENT_ID
  - CDSE_CLIENT_SECRET
  - CDSE_TOKEN_URL
  - CDSE_PROCESS_URL

Suggested classes/entities to show:
- FastAPIApp
- Settings
- CopernicusService
- HealthResponse
- TokenResponse
- ProcessProxyRequest
- ProcessProxyResponse
- Router modules or API router structure
- Possibly frontend logical modules as components rather than classes

Suggested flows:
A. User opens app
- Browser loads frontend assets.
- app.js initializes.
- map.js creates Leaflet map.
- frontend requests token from backend.
- backend token service fetches or reuses access token.
- user draws AOI.
- analysis module requests Copernicus process imagery.
- backend forwards request to Copernicus process API.
- images are returned, drawn on canvas/overlays.
- detection results are computed and rendered.
- optional 3D interaction is opened.

B. Token flow
- frontend -> backend `/token`
- backend service checks cache
- if expired, backend -> Copernicus token endpoint
- token returned and cached
- backend returns token to frontend

C. Process flow
- frontend builds Copernicus process payload
- frontend -> backend process endpoint
- backend obtains token
- backend -> Copernicus process endpoint
- backend returns image bytes or base64 to frontend
- frontend overlays imagery and performs analysis

Keep the diagrams as realistic as possible. The final diagrams should reflect the actual code, not a generic architecture.

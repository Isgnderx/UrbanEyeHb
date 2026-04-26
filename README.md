graph TD
%% ==================================================
%% 1. USE CASE DIAGRAM
%% ==================================================
subgraph Use_Case_Diagram [Use Case Diagram]
    direction TB
    User((Urban Analyst))
    CDSE_Actor((Copernicus CDSE))
    Google_Actor((Google Maps API))

    subgraph System_Boundary [Urban Anomaly Detection System]
        UC1(Draw AOI on Map)
        UC2(View Satellite Imagery)
        UC3(Perform Change Detection)
        UC4(View 3D Street/Terrain)
        UC5(Authenticate with Copernicus)
    end

    User --> UC1
    User --> UC2
    User --> UC3
    User --> UC4
    UC2 -.->|include| UC5
    UC5 --- CDSE_Actor
    UC2 --- CDSE_Actor
    UC4 --- Google_Actor
end

%% ==================================================
%% 2. COMPONENT DIAGRAM
%% ==================================================
subgraph Component_Diagram [Component Diagram]
    direction LR
    subgraph Browser_Frontend [Frontend - Browser]
        Index[index.html]
        AppJS[scripts/app.js]
        MapJS[scripts/map.js]
        AnalysisJS[scripts/analysis.js]
        Viewer3D[scripts/viewer3d.js]
        ConfigJS[config.js]
    end

    subgraph FastAPI_Backend [Backend - FastAPI]
        Main[app/main.py]
        Endpoints[app/api/v1/endpoints]
        CopSvc[app/services/copernicus_service.py]
        CoreConfig[app/core/config.py]
    end

    AppJS --> Index
    AppJS --> MapJS
    AppJS --> AnalysisJS
    AnalysisJS --> Viewer3D
    AnalysisJS -- "API_BASE_URL" --> Endpoints
    Endpoints --> CopSvc
    CopSvc --> CoreConfig
end

%% ==================================================
%% 3. CLASS DIAGRAM (BACKEND)
%% ==================================================
subgraph Backend_Class_Diagram [Backend Class Diagram]
    direction TB
    class FastAPIApp {
        +cors_middleware
        +include_router(auth)
        +include_router(copernicus)
    }
    class Settings {
        +CDSE_CLIENT_ID: str
        +CDSE_CLIENT_SECRET: str
        +CDSE_TOKEN_URL: str
    }
    class CopernicusService {
        -token_cache: dict
        +get_token()
        +process_request(payload)
        -is_token_expired()
    }
    class TokenResponse {
        +access_token: str
        +expires_in: int
    }

    FastAPIApp --> Settings
    FastAPIApp --> CopernicusService
    CopernicusService ..> TokenResponse
end

%% ==================================================
%% 4. SEQUENCE DIAGRAM (MAIN FLOW)
%% ==================================================
subgraph Sequence_Main_Flow [Sequence: Main Detection Flow]
    direction TB
    sq_User[User] -->|Open App| sq_App[app.js]
    sq_App -->|Init Map| sq_Map[map.js]
    sq_User -->|Draw AOI| sq_Map
    sq_Map -->|Coords| sq_Analysis[analysis.js]
    sq_Analysis -->|Request Token| sq_BE[Backend API]
    sq_BE -->|Proxy Request| sq_CDSE[Copernicus API]
    sq_CDSE -->>|Imagery Data| sq_Analysis
    sq_Analysis -->|Pixel Compare| sq_Analysis
    sq_Analysis -->|Render Markers| sq_Map
end

%% ==================================================
%% 5. ACTIVITY DIAGRAM (ANALYSIS)
%% ==================================================
subgraph Activity_Analysis [Activity: AOI Analysis]
    direction TB
    act_Start([Start]) --> act_Draw[User draws AOI]
    act_Draw --> act_Req[Request Imagery T1 & T2]
    act_Req --> act_Diff[Calculate Pixel Difference]
    act_Diff --> act_Cluster[Cluster Anomalies]
    act_Cluster --> act_Check{In Risk Zone?}
    act_Check -- Yes --> act_Flag[Flag as Preservation Risk]
    act_Check -- No --> act_Standard[Mark as Change]
    act_Flag --> act_Render[Display Results]
    act_Standard --> act_Render
    act_Render --> act_End([End])
end

%% ==================================================
%% 6. DEPLOYMENT DIAGRAM
%% ==================================================
subgraph Deployment_Diagram [Deployment Diagram]
    direction LR
    node_User[User Device] -- HTTPS --> node_Static[Static Web Host]
    node_User -- "API Calls" --> node_App[App Server / FastAPI]
    node_App -- Proxy --> node_Cop[Copernicus CDSE]
    node_User -- JS SDK --> node_Google[Google Maps API]
end

/* ======================================================
   CONFIG
====================================================== */
const API_BASE_URL = (window.__APP_CONFIG__ && window.__APP_CONFIG__.API_BASE_URL)
    ? window.__APP_CONFIG__.API_BASE_URL.replace(/\/$/, '')
    : 'http://localhost:8000';
const TOKEN_URL = `${API_BASE_URL}/token`;

let token = null, tokenExp = 0;
let map = null;

// Global State for UI toggles
let realDetections = [];
let detectionLayerGroup = null; // Holds all tiny markers
let overlayBefore = null;       // Leaflet ImageOverlay for past
let overlayAfter = null;        // Leaflet ImageOverlay for present
let overlayLive = null;         // Leaflet ImageOverlay for current viewport
let currentBeforeUrl = null;    // Blob URL
let currentAfterUrl = null;     // Blob URL
let currentLiveUrl = null;      // Blob URL
let areMarkersVisible = true;
let copernicusRefreshTimer = null;
const COPERNICUS_AUTO_ENABLED = false;

/* ======================================================
   CLOCK
====================================================== */
function tick() {
    const t = new Date().toUTCString().split(' ')[4] + ' UTC';
    document.getElementById('utc-time').textContent = t;
    document.getElementById('topbar-time').textContent = t;
}
setInterval(tick, 1000); tick();

/* ======================================================
   AUTH — Copernicus OAuth2
====================================================== */
async function getToken() {
    if (token && Date.now() < tokenExp) return token;

    document.getElementById('auth-status').textContent = 'Authenticating…';
    document.getElementById('auth-status').className = 'proxy-val warn-c';

    try {
        const res = await fetch(TOKEN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ grant_type: 'client_credentials' }),
        });

        if (!res.ok) throw new Error('HTTP ' + res.status);
        const d = await res.json();
        token = d.access_token;
        tokenExp = Date.now() + (d.expires_in - 60) * 1000;

        const expMin = Math.round((tokenExp - Date.now()) / 60000);
        const ttlEl = document.getElementById('proxy-ttl');
        if (ttlEl) ttlEl.textContent = expMin + ' min';
        document.getElementById('auth-status').textContent = 'Active ✓';
        document.getElementById('auth-status').className = 'proxy-val ok';

        return token;
    } catch (e) {
        document.getElementById('auth-status').textContent = 'Failed';
        document.getElementById('auth-status').className = 'proxy-val err-c';
        return null;
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    initMap();
    await getToken();
});

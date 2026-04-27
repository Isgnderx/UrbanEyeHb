/* ======================================================
   INIT MAIN MAP
====================================================== */
function initMap() {
    map = L.map('map', {
        center: [40.4093, 49.8671], // Baku
        zoom: 12,
        zoomControl: false,
    });

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    // Fallback Base map (Esri World Imagery)
    L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        { attribution: '© Esri', maxZoom: 19, opacity: 1 }
    ).addTo(map);

    map.on('mousemove', e => {
        document.getElementById('map-coords').textContent = `Lat ${e.latlng.lat.toFixed(4)} · Lon ${e.latlng.lng.toFixed(4)}`;
    });

    // Layer group to hold the tiny precise marker dots
    detectionLayerGroup = L.layerGroup().addTo(map);
}

/* ======================================================
   AOI DRAWING TOOL
====================================================== */
let aoiMode = false;
let aoiRect = null;
let aoiLayer = null;
let drawStart = null;

function toggleAOI() {
    aoiMode = !aoiMode;
    const btn = document.getElementById('aoi-draw-btn');
    const hint = document.getElementById('aoi-hint');

    if (aoiMode) {
        btn.classList.add('active');
        btn.textContent = '✕ Cancel Drawing';
        hint.classList.add('show');
        map.dragging.disable();
        map.getContainer().style.cursor = 'crosshair';
        map.on('mousedown', aoiMouseDown);
    } else {
        stopAOIDraw();
    }
}

function stopAOIDraw() {
    aoiMode = false;
    const btn = document.getElementById('aoi-draw-btn');
    const hint = document.getElementById('aoi-hint');
    btn.classList.remove('active');
    btn.textContent = '⬚ Draw Inspection Area';
    hint.classList.remove('show');
    map.dragging.enable();
    map.getContainer().style.cursor = '';
    map.off('mousedown', aoiMouseDown);
    map.off('mousemove', aoiMouseMove);
    map.off('mouseup', aoiMouseUp);
}

function aoiMouseDown(e) {
    drawStart = e.latlng;
    if (aoiLayer) { map.removeLayer(aoiLayer); aoiLayer = null; }
    map.on('mousemove', aoiMouseMove);
    map.on('mouseup', aoiMouseUp);
}

function aoiMouseMove(e) {
    if (!drawStart) return;
    if (aoiLayer) map.removeLayer(aoiLayer);
    const bounds = L.latLngBounds(drawStart, e.latlng);
    aoiLayer = L.rectangle(bounds, {
        color: 'var(--teal)', weight: 2, dashArray: '6 4', fillColor: 'rgba(45,212,191,0.08)', fillOpacity: 1,
    }).addTo(map);
}

function aoiMouseUp(e) {
    map.off('mousemove', aoiMouseMove);
    map.off('mouseup', aoiMouseUp);
    if (!drawStart || !aoiLayer) return;

    const bounds = aoiLayer.getBounds();
    aoiRect = { bounds, sw: bounds.getSouthWest(), ne: bounds.getNorthEast() };

    const latKm = Math.abs(aoiRect.ne.lat - aoiRect.sw.lat) * 111;
    const lngKm = Math.abs(aoiRect.ne.lng - aoiRect.sw.lng) * 111 * Math.cos((aoiRect.ne.lat + aoiRect.sw.lat) / 2 * Math.PI / 180);
    const areaKm2 = (latKm * lngKm).toFixed(2);

    const sizeEl = document.getElementById('aoi-size-val');
    const runBtn = document.querySelector('.aoi-run-btn');

    // Prevent users from drawing massive boxes that crash memory limits
    if (parseFloat(areaKm2) > 200) {
        sizeEl.innerHTML = `<span style="color:var(--red)">${areaKm2} km² (Max 200 for High-Res)</span>`;
        runBtn.style.opacity = '0.5';
        runBtn.style.pointerEvents = 'none';
    } else {
        sizeEl.innerHTML = `${areaKm2} km²`;
        runBtn.style.opacity = '1';
        runBtn.style.pointerEvents = 'auto';

        if (typeof refreshCopernicusForAOI === 'function') {
            refreshCopernicusForAOI();
        }
    }

    document.getElementById('aoi-bottom-bar').classList.add('show');
    document.getElementById('aoi-default-controls').style.display = 'flex';
    document.getElementById('aoi-post-controls').style.display = 'none';

    stopAOIDraw();
    drawStart = null;
}

function clearAOI() {
    if (aoiLayer) { map.removeLayer(aoiLayer); aoiLayer = null; }
    aoiRect = null;

    if (overlayBefore) map.removeLayer(overlayBefore);
    if (overlayAfter) map.removeLayer(overlayAfter);
    overlayBefore = null;
    overlayAfter = null;
    if (overlayLive) map.removeLayer(overlayLive);
    overlayLive = null;
    detectionLayerGroup.clearLayers();

    if (currentBeforeUrl) URL.revokeObjectURL(currentBeforeUrl);
    if (currentAfterUrl) URL.revokeObjectURL(currentAfterUrl);
    if (currentLiveUrl) URL.revokeObjectURL(currentLiveUrl);
    currentBeforeUrl = null;
    currentAfterUrl = null;
    currentLiveUrl = null;
    if (typeof lastAnalysisMeta !== 'undefined') {
        lastAnalysisMeta = null;
    }

    document.getElementById('aoi-bottom-bar').classList.remove('show');
    document.getElementById('aoi-results-sec').style.display = 'none';
    document.getElementById('live-det-list').innerHTML = '<div style="color:var(--text-3);font-size:12px;text-align:center;padding:10px 0;">Draw an Inspection Area on the map to run real-time change detection.</div>';
    document.getElementById('anomaly-chip').textContent = `⚠ 0 Anomalies in View`;
}

/* ======================================================
   NEW UI INTERACTION FUNCTIONS
====================================================== */
function toggleMapOverlay(type) {
    if (overlayBefore) map.removeLayer(overlayBefore);
    if (overlayAfter) map.removeLayer(overlayAfter);
    if (overlayLive) map.removeLayer(overlayLive);

    if (type === 'before' && overlayBefore) {
        map.addLayer(overlayBefore);
    } else if (type === 'after' && overlayAfter) {
        map.addLayer(overlayAfter);
    } else if (type === 'none' && overlayLive) {
        map.addLayer(overlayLive);
    }
}

function toggleMarkers() {
    areMarkersVisible = !areMarkersVisible;
    const btn = document.getElementById('toggle-dots-btn');

    if (areMarkersVisible) {
        map.addLayer(detectionLayerGroup);
        btn.textContent = "👁 Hide Dots";
        btn.style.opacity = '1';
    } else {
        map.removeLayer(detectionLayerGroup);
        btn.textContent = "👁 Show Dots";
        btn.style.opacity = '0.6';
    }
}

function plotRealDetections() {
    const list = document.getElementById('live-det-list');
    list.innerHTML = '';

    detectionLayerGroup.clearLayers();
    areMarkersVisible = true;

    if (realDetections.length === 0) {
        list.innerHTML = `<div style="color:var(--green);font-size:12px;text-align:center;padding:20px 0;">✅ No optical signatures of construction detected in this sector.</div>`;
        document.getElementById('anomaly-chip').textContent = `✅ 0 Anomalies in View`;
        document.getElementById('anomaly-chip').className = 'tb-chip';
        return;
    }

    document.getElementById('anomaly-chip').textContent = `⚠ ${realDetections.length} Signatures Found`;
    document.getElementById('anomaly-chip').className = 'tb-chip warn';

    realDetections.forEach((d, idx) => {
        const badgeClass = d.riskWarning ? 'badge-alert' : 'badge-warn';

        if (idx < 30) {
            list.innerHTML += `
        <div class="det-card ${d.riskWarning ? 'alert' : 'warn'}">
          <div class="det-hdr">
            <span class="det-id">${d.id}</span>
            <span class="det-badge ${badgeClass}">${d.conf > 90 ? 'High Confidence' : 'Medium Risk'}</span>
          </div>
          <div class="det-title">${d.label}</div>
          <div class="det-coords">${d.lat.toFixed(5)}° N, ${d.lng.toFixed(5)}° E</div>
          <div style="height:3px;background:var(--border);border-radius:2px;overflow:hidden;margin-bottom:4px;">
            <div style="height:100%;border-radius:2px;width:${d.conf}%;background:${d.color}"></div>
          </div>
          <div class="det-meta"><span>Conf: ${d.conf.toFixed(1)}%</span><span>Est Area: ~${d.pixels * 10} m²</span></div>
        </div>`;
        }

        let iconHtml = `<div style="width:6px;height:6px;border-radius:50%;background:${d.color};border:1px solid rgba(0,0,0,0.8);box-shadow: 0 0 4px ${d.color};"></div>`;
        let iSize = [6, 6], iAnchor = [3, 3];

        if (d.riskWarning) {
            iconHtml = `<div style="font-size:18px;line-height:1;display:flex;align-items:center;justify-content:center;filter:drop-shadow(0 0 4px rgba(244,63,94,0.8));">⚠️</div>`;
            iSize = [20, 20]; iAnchor = [10, 10];
        }

        const icon = L.divIcon({
            className: '',
            html: iconHtml,
            iconSize: iSize,
            iconAnchor: iAnchor,
        });

        const marker = L.marker([d.lat, d.lng], { icon })
            .bindPopup(`
        <div style="min-width:180px;color:var(--bg)">
          <div style="font-weight:700;color:${d.riskWarning ? 'var(--red)' : d.color};margin-bottom:4px;">${d.label}</div>
          <div style="font-size:11px;margin-bottom:2px;"><b>ID:</b> ${d.id}</div>
          <div style="font-size:11px;margin-bottom:2px;"><b>Coords:</b> ${d.lat.toFixed(5)}, ${d.lng.toFixed(5)}</div>
          <div style="font-size:11px;margin-bottom:6px;"><b>Confidence:</b> ${d.conf.toFixed(1)}%</div>
          ${d.riskWarning ? `
            <div style="font-size:11px;color:var(--red);font-weight:bold;margin-top:4px;margin-bottom:4px;">⚠️ ${d.riskWarning}</div>
            <button onclick="openDual3DView('${d.id}', '${d.riskWarning}')" style="width:100%;padding:6px;margin-top:4px;background:var(--red);color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:11px;font-weight:600;transition:opacity 0.2s;">🚨 2040 Impact Analysis (Dual 3D)</button>
          ` : ''}
          ${d.has3D ? `<button onclick="open3DView('${d.id}', ${d.lat}, ${d.lng}, '${d.label}')" style="width:100%;padding:6px;margin-top:4px;background:var(--blue);color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:11px;font-weight:600;transition:opacity 0.2s;">🌍 Evaluate in 3D</button>` : ''}
        </div>
      `);

        marker.addTo(detectionLayerGroup);
    });
}

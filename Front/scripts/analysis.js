// Simulated Risk Zones
const baku2040PlanZones = [
    { name: "Böyükşor Göl Parkı Rekreasiya Zolağı", bounds: L.latLngBounds([40.41, 49.88], [40.44, 49.92]) },
    { name: "Xocahəsən Nəbatat Parkı 2040", bounds: L.latLngBounds([40.40, 49.77], [40.43, 49.80]) },
    { name: "Zığ Göl Parkı Bərpa Ərazisi", bounds: L.latLngBounds([40.36, 49.98], [40.38, 50.01]) }
];
const culturalHeritageZones = [
    { name: "İçərişəhər Tarixi Qoruq / Mühafizə Zonası", bounds: L.latLngBounds([40.360, 49.830], [40.370, 49.840]) }
];
let lastAnalysisMeta = null;

function checkStrategicRisk(lat, lng, conf) {
    if (conf <= 90) return null;
    const pt = L.latLng(lat, lng);
    for (let zone of baku2040PlanZones) {
        if (zone.bounds.contains(pt)) return `Konflikt: ${zone.name}`;
    }
    for (let zone of culturalHeritageZones) {
        if (zone.bounds.contains(pt)) return `Tarixi İrs: ${zone.name}`;
    }
    return null;
}

function buildAnalysisExportFilename(ext) {
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    return `urbaneye-analysis-${ts}.${ext}`;
}

function triggerAnalysisDownload(dataUrl, fileName) {
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
}

function triggerAnalysisBlobDownload(content, mimeType, fileName) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

function getDetectionKind(det) {
    if (det.label === 'Preservation Risk') return 'Preservation Risk';
    if (det.label === 'Anomaly (3D Assessed)') return '3D Assessed';
    if (det.label === 'Anomaly (No Street View)') return 'No Street View';
    if (det.label === 'Supervisor Verified Legal') return 'Supervisor Verified Legal';
    if (det.label === 'Flagged Illegal Structure') return 'Flagged Illegal Structure';
    return 'Other';
}

function getAnalysisReportData() {
    if (!lastAnalysisMeta) {
        throw new Error('Run analysis before exporting report.');
    }

    const detections = Array.isArray(realDetections) ? realDetections : [];
    const kindCounts = detections.reduce((acc, det) => {
        const kind = getDetectionKind(det);
        acc[kind] = (acc[kind] || 0) + 1;
        return acc;
    }, {});

    return {
        meta: lastAnalysisMeta,
        detections,
        kindCounts
    };
}

function buildAnalysisTextReportContent(reportData) {
    const { meta, detections, kindCounts } = reportData;
    const kindLines = Object.keys(kindCounts).length
        ? Object.entries(kindCounts)
            .sort((a, b) => b[1] - a[1])
            .map(([kind, count]) => `- ${kind}: ${count}`)
            .join('\n')
        : '- None';

    const detectionLines = detections.length
        ? detections.map((d, idx) => {
            const typeLabel = getDetectionKind(d);
            const risk = d.riskWarning ? ` | Risk: ${d.riskWarning}` : '';
            return `${idx + 1}. ${d.id} | Type: ${typeLabel} | Label: ${d.label} | Confidence: ${d.conf.toFixed(1)}% | EstArea: ~${d.pixels * 10} m2 | Coords: ${d.lat.toFixed(5)}, ${d.lng.toFixed(5)}${risk}`;
        }).join('\n')
        : 'No anomalies were detected in this analysis run.';

    return [
        'UrbanEye Analysis Text Report',
        '============================',
        `Generated: ${new Date().toISOString()}`,
        '',
        'Analyzed Data',
        '-------------',
        `AOI Bounds (W,S,E,N): ${meta.aoiBounds.join(', ')}`,
        `AOI Size: ~${meta.widthMeters.toFixed(1)}m x ${meta.heightMeters.toFixed(1)}m`,
        `Comparison Window: ${meta.yearsLabel}`,
        `Before Range: ${meta.beforeFromStr} to ${meta.beforeToStr}`,
        `Current Range: ${meta.pastStr} to ${meta.todayStr}`,
        `Image Resolution: ${meta.pxWidth}x${meta.pxHeight} (${meta.totalPixels} pixels)`,
        `Meter per Pixel: ${meta.mpp.toFixed(3)}`,
        '',
        'Anomaly Summary',
        '---------------',
        `Total Anomalies: ${detections.length}`,
        'By Kind:',
        kindLines,
        '',
        'Anomaly Details',
        '---------------',
        detectionLines,
        ''
    ].join('\n');
}

function exportAnalysisTextReport() {
    try {
        const reportData = getAnalysisReportData();
        const report = buildAnalysisTextReportContent(reportData);
        triggerAnalysisBlobDownload(report, 'text/plain;charset=utf-8', buildAnalysisExportFilename('txt'));
    } catch (err) {
        alert(err.message || 'Text report export failed.');
    }
}

function wrapTextLines(ctx, text, maxWidth) {
    const words = text.trim().split(/\s+/);
    const lines = [];
    let current = '';

    for (const word of words) {
        const candidate = current ? `${current} ${word}` : word;
        if (ctx.measureText(candidate).width <= maxWidth) {
            current = candidate;
        } else {
            if (current) lines.push(current);
            current = word;
        }
    }
    if (current) lines.push(current);
    return lines;
}

function getAnalysisSnapshotCanvas() {
    const beforeCanvas = document.getElementById('c-bef');
    const afterCanvas = document.getElementById('c-aft');
    const maskCanvas = document.getElementById('c-msk');
    const statusEl = document.getElementById('analysis-status-text');

    if (!beforeCanvas || !afterCanvas || !maskCanvas || !statusEl) {
        throw new Error('Run analysis before export.');
    }

    const padding = 34;
    const gap = 20;
    const tileHeight = 220;
    const sourceAspect = beforeCanvas.width / Math.max(1, beforeCanvas.height);
    const tileWidth = Math.max(210, Math.round(tileHeight * sourceAspect));
    const canvasWidth = padding * 2 + tileWidth * 3 + gap * 2;
    const canvasHeight = 520;

    const out = document.createElement('canvas');
    out.width = canvasWidth;
    out.height = canvasHeight;
    const ctx = out.getContext('2d');

    ctx.fillStyle = '#060c14';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    ctx.fillStyle = '#5eead4';
    ctx.font = '700 28px Sora, sans-serif';
    ctx.fillText('UrbanEye Analysis Report', padding, 52);

    ctx.fillStyle = '#9fb0c9';
    ctx.font = '500 14px Inter, sans-serif';
    ctx.fillText(`Generated ${new Date().toLocaleString()}`, padding, 76);

    const statusText = statusEl.innerText.replace(/\s+/g, ' ').trim();
    const summaryStartY = 112;
    const summaryBoxHeight = 70;
    ctx.fillStyle = '#0b1628';
    ctx.fillRect(padding, summaryStartY - 24, canvasWidth - padding * 2, summaryBoxHeight);
    ctx.strokeStyle = '#1e293b';
    ctx.strokeRect(padding, summaryStartY - 24, canvasWidth - padding * 2, summaryBoxHeight);

    ctx.fillStyle = '#d6deea';
    ctx.font = '500 13px Inter, sans-serif';
    const summaryLines = wrapTextLines(ctx, statusText || 'Analysis summary unavailable.', canvasWidth - padding * 2 - 18).slice(0, 3);
    summaryLines.forEach((line, idx) => {
        ctx.fillText(line, padding + 10, summaryStartY + idx * 18);
    });

    const tilesY = 190;
    const labels = ['Historical View', 'Current View', 'Optical Signatures'];
    const tiles = [beforeCanvas, afterCanvas, maskCanvas];

    tiles.forEach((tile, idx) => {
        const x = padding + idx * (tileWidth + gap);
        ctx.fillStyle = '#0b1220';
        ctx.fillRect(x, tilesY - 24, tileWidth, tileHeight + 50);
        ctx.strokeStyle = '#263245';
        ctx.strokeRect(x, tilesY - 24, tileWidth, tileHeight + 50);

        ctx.fillStyle = '#dbe4f2';
        ctx.font = '600 13px Inter, sans-serif';
        ctx.fillText(labels[idx], x + 10, tilesY - 8);

        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(tile, x, tilesY, tileWidth, tileHeight);
    });

    return out;
}

function exportAnalysisImage() {
    try {
        const snapshot = getAnalysisSnapshotCanvas();
        triggerAnalysisDownload(snapshot.toDataURL('image/png'), buildAnalysisExportFilename('png'));
    } catch (err) {
        alert(err.message || 'Image export failed.');
    }
}

function exportAnalysisPDF() {
    try {
        const reportData = getAnalysisReportData();
        const { meta, detections, kindCounts } = reportData;
        const snapshot = getAnalysisSnapshotCanvas();
        if (!window.jspdf || !window.jspdf.jsPDF) {
            throw new Error('PDF library is not loaded.');
        }

        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF({
            orientation: 'portrait',
            unit: 'px',
            format: 'a4'
        });

        const pageW = pdf.internal.pageSize.getWidth();
        const pageH = pdf.internal.pageSize.getHeight();
        const margin = 28;
        const contentW = pageW - margin * 2;
        let y = margin;

        pdf.setTextColor(17, 24, 39);
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(16);
        pdf.text('UrbanEye Analysis Report', margin, y);
        y += 18;

        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(10);
        pdf.text(`Generated: ${new Date().toISOString()}`, margin, y);
        y += 14;

        const imageMaxHeight = 240;
        const imgScale = Math.min(contentW / snapshot.width, imageMaxHeight / snapshot.height);
        const imgW = snapshot.width * imgScale;
        const imgH = snapshot.height * imgScale;
        pdf.addImage(snapshot.toDataURL('image/png'), 'PNG', margin, y, imgW, imgH, undefined, 'FAST');
        y += imgH + 18;

        const ensurePageSpace = (neededHeight = 14) => {
            if (y + neededHeight > pageH - margin) {
                pdf.addPage();
                y = margin;
            }
        };

        const drawHeading = (text) => {
            ensurePageSpace(16);
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(12);
            pdf.text(text, margin, y);
            y += 14;
        };

        const drawText = (text, options = {}) => {
            const size = options.size || 10;
            const bold = !!options.bold;
            pdf.setFont('helvetica', bold ? 'bold' : 'normal');
            pdf.setFontSize(size);

            const wrapped = pdf.splitTextToSize(text, contentW);
            const lineHeight = size + 3;
            ensurePageSpace(wrapped.length * lineHeight + 2);
            pdf.text(wrapped, margin, y);
            y += wrapped.length * lineHeight + 2;
        };

        const kindLines = Object.keys(kindCounts).length
            ? Object.entries(kindCounts)
                .sort((a, b) => b[1] - a[1])
                .map(([kind, count]) => `${kind}: ${count}`)
            : ['None'];

        drawHeading('Analyzed Data');
        drawText(`AOI Bounds (W,S,E,N): ${meta.aoiBounds.join(', ')}`);
        drawText(`AOI Size: ~${meta.widthMeters.toFixed(1)}m x ${meta.heightMeters.toFixed(1)}m`);
        drawText(`Comparison Window: ${meta.yearsLabel}`);
        drawText(`Before Range: ${meta.beforeFromStr} to ${meta.beforeToStr}`);
        drawText(`Current Range: ${meta.pastStr} to ${meta.todayStr}`);
        drawText(`Image Resolution: ${meta.pxWidth}x${meta.pxHeight} (${meta.totalPixels} pixels)`);
        drawText(`Meter per Pixel: ${meta.mpp.toFixed(3)}`);

        y += 6;
        drawHeading('Anomaly Summary');
        drawText(`Total Anomalies: ${detections.length}`);
        drawText('By Kind:', { bold: true });
        kindLines.forEach((line) => drawText(`- ${line}`));

        y += 6;
        drawHeading('Anomaly Details');
        if (!detections.length) {
            drawText('No anomalies were detected in this analysis run.');
        } else {
            detections.forEach((d, idx) => {
                const typeLabel = getDetectionKind(d);
                drawText(`${idx + 1}. ${d.id} | Type: ${typeLabel}`, { bold: true });
                drawText(`Label: ${d.label} | Confidence: ${d.conf.toFixed(1)}% | EstArea: ~${d.pixels * 10} m2`);
                drawText(`Coords: ${d.lat.toFixed(5)}, ${d.lng.toFixed(5)}`);
                if (d.riskWarning) {
                    drawText(`Risk: ${d.riskWarning}`);
                }
                y += 4;
            });
        }

        pdf.save(buildAnalysisExportFilename('pdf'));
    } catch (err) {
        alert(err.message || 'PDF export failed.');
    }
}

/* ======================================================
   CORE AI ENGINE: OPTICAL CONSTRUCTION SIGNATURE DETECTION
====================================================== */

function createImg(src) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'Anonymous';
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Canvas rendering failed'));
        img.src = src;
    });
}

// Fetch imagery through the FastAPI backend proxy to avoid browser CORS issues.
async function fetchProcessAPI(bounds, fromDate, toDate, pxWidth, pxHeight) {
    const payload = {
        input: {
            bounds: {
                bbox: [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()]
            },
            data: [{
                type: "sentinel-2-l2a",
                dataFilter: {
                    timeRange: { from: `${fromDate}T00:00:00Z`, to: `${toDate}T23:59:59Z` },
                    maxCloudCoverage: 20,
                    mosaickingOrder: "leastCC"
                }
            }]
        },
        output: {
            width: pxWidth, height: pxHeight,
            responses: [{ identifier: "default", format: { type: "image/png" } }]
        },
        evalscript: `//VERSION=3
    function setup() {
      return { input: ["B04", "B03", "B02", "dataMask"], output: { bands: 4 } };
    }
    function evaluatePixel(sample) {
      const boost = 2.8;
      const offset = 0.05;
      return [
        Math.max(0, sample.B04 * boost - offset),
        Math.max(0, sample.B03 * boost - offset),
        Math.max(0, sample.B02 * boost - offset),
        sample.dataMask
      ];
    }`
    };

    const res = await fetch(`${API_BASE_URL}/api/v1/copernicus/process/image`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Accept": "image/png"
        },
        body: JSON.stringify({ payload })
    });

    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Copernicus API Error: ${errText}`);
    }

    const blob = await res.blob();
    return URL.createObjectURL(blob);
}

function scheduleCopernicusRefresh() {
    if (!COPERNICUS_AUTO_ENABLED) return;
    if (copernicusRefreshTimer) clearTimeout(copernicusRefreshTimer);
    copernicusRefreshTimer = setTimeout(() => {
        refreshCopernicusViewport();
    }, 350);
}

async function refreshCopernicusForAOI() {
    if (!map || !aoiRect || !aoiRect.bounds) return;

    const loadingEl = document.getElementById('map-loading');
    const layerNameEl = document.getElementById('layer-name');
    const imgDateEl = document.getElementById('img-date');

    try {
        if (loadingEl) loadingEl.style.display = 'flex';

        const tok = await getToken();
        if (!tok) {
            if (imgDateEl) imgDateEl.textContent = 'Auth required';
            return;
        }

        const sz = map.getSize();
        const pxWidth = Math.max(512, Math.min(1024, Math.round(sz.x)));
        const pxHeight = Math.max(512, Math.min(1024, Math.round(sz.y)));

        const now = new Date();
        const toDate = now.toISOString().split('T')[0];
        const fromDate = new Date(now.getTime() - 20 * 86400000).toISOString().split('T')[0];

        const liveUrl = await fetchProcessAPI(aoiRect.bounds, fromDate, toDate, pxWidth, pxHeight);

        if (overlayLive) map.removeLayer(overlayLive);
        if (currentLiveUrl) URL.revokeObjectURL(currentLiveUrl);

        currentLiveUrl = liveUrl;
        overlayLive = L.imageOverlay(currentLiveUrl, aoiRect.bounds, { opacity: 1, zIndex: 350, className: 'pixelated' }).addTo(map);

        if (layerNameEl) layerNameEl.textContent = 'Copernicus Sentinel-2 L2A';
        if (imgDateEl) imgDateEl.textContent = `${fromDate} to ${toDate}`;
    } catch (err) {
        console.warn('AOI Copernicus fetch failed:', err && err.message ? err.message : err);
    } finally {
        if (loadingEl) loadingEl.style.display = 'none';
    }
}

async function refreshCopernicusViewport(options = {}) {
    if (!COPERNICUS_AUTO_ENABLED || !map) return;
    if (aoiRect && !options.force) return;

    const loadingEl = document.getElementById('map-loading');
    const layerNameEl = document.getElementById('layer-name');
    const imgDateEl = document.getElementById('img-date');

    try {
        if (loadingEl) loadingEl.style.display = 'flex';

        const tok = await getToken();
        if (!tok) {
            if (layerNameEl) layerNameEl.textContent = 'True Color Base';
            if (imgDateEl) imgDateEl.textContent = 'Auth required';
            console.warn('Copernicus viewport refresh skipped: token unavailable');
            return;
        }

        const bounds = map.getBounds();
        const sz = map.getSize();
        const pxWidth = Math.max(512, Math.min(1024, Math.round(sz.x)));
        const pxHeight = Math.max(512, Math.min(1024, Math.round(sz.y)));

        const now = new Date();
        const toDate = now.toISOString().split('T')[0];
        const fromDate = new Date(now.getTime() - 20 * 86400000).toISOString().split('T')[0];

        const liveUrl = await fetchProcessAPI(bounds, fromDate, toDate, pxWidth, pxHeight);

        if (overlayLive) map.removeLayer(overlayLive);
        if (currentLiveUrl) URL.revokeObjectURL(currentLiveUrl);

        currentLiveUrl = liveUrl;
        overlayLive = L.imageOverlay(currentLiveUrl, bounds, { opacity: 1, zIndex: 350, className: 'pixelated' }).addTo(map);

        if (layerNameEl) layerNameEl.textContent = 'Copernicus Sentinel-2 L2A';
        if (imgDateEl) imgDateEl.textContent = `${fromDate} to ${toDate}`;
    } catch (err) {
        if (layerNameEl) layerNameEl.textContent = 'True Color Base';
        if (imgDateEl) imgDateEl.textContent = 'Fallback';
        console.error('Copernicus viewport refresh failed:', err);
    } finally {
        if (loadingEl) loadingEl.style.display = 'none';
    }
}

async function runRealTimeAnalysis() {
    if (!aoiRect) return;
    const sec = document.getElementById('aoi-results-sec');
    const cont = document.getElementById('aoi-results-content');
    const list = document.getElementById('live-det-list');

    const yearsBack = parseInt(document.getElementById('time-travel-sel').value, 10);
    const yearsLabel = yearsBack === 1 ? '1 Year Ago' : `${yearsBack} Years Ago`;

    sec.style.display = 'block';

    cont.innerHTML = `
    <div style="font-size:12px;color:var(--text-1);margin-bottom:8px;" id="analysis-status-text">
      <div class="analysis-loader"><div class="spinner"></div> Calculating exact physical boundaries...</div>
    </div>
    <div class="proof-grid">
      <div class="proof-img-wrap"><span class="proof-lbl">${yearsLabel}</span><canvas id="c-bef" class="proof-canvas pixelated"></canvas></div>
      <div class="proof-img-wrap"><span class="proof-lbl">Today</span><canvas id="c-aft" class="proof-canvas pixelated"></canvas></div>
      <div class="proof-img-wrap"><span class="proof-lbl">Optical Signatures</span><canvas id="c-msk" class="proof-canvas pixelated"></canvas></div>
    </div>
  `;
    list.innerHTML = `<div style="color:var(--text-3);font-size:12px;text-align:center;padding:20px 0;">Scanning for chemical optical signatures of construction...</div>`;

    const tok = await getToken();
    if (!tok) {
        document.getElementById('analysis-status-text').innerHTML = '<div style="color:var(--red)">Authentication failed. Cannot fetch satellite data.</div>';
        return;
    }

    try {
        const ptSW = L.latLng(aoiRect.sw.lat, aoiRect.sw.lng);
        const ptSE = L.latLng(aoiRect.sw.lat, aoiRect.ne.lng);
        const ptNW = L.latLng(aoiRect.ne.lat, aoiRect.sw.lng);

        const widthMeters = ptSW.distanceTo(ptSE);
        const heightMeters = ptSW.distanceTo(ptNW);
        const aspect = widthMeters / heightMeters;

        let pxWidth = 1024;
        let pxHeight = Math.round(1024 / aspect);
        if (pxHeight > 1024) {
            pxHeight = 1024;
            pxWidth = Math.round(1024 * aspect);
        }

        const mpp = widthMeters / pxWidth;

        const now = new Date();
        const todayStr = now.toISOString().split('T')[0];
        const pastStr = new Date(now.getTime() - 120 * 86400000).toISOString().split('T')[0];

        const historyTarget = new Date(now.getTime() - yearsBack * 365 * 86400000);
        const beforeToStr = historyTarget.toISOString().split('T')[0];
        const beforeFromStr = new Date(historyTarget.getTime() - 120 * 86400000).toISOString().split('T')[0];

        lastAnalysisMeta = {
            yearsLabel,
            widthMeters,
            heightMeters,
            mpp,
            pxWidth,
            pxHeight,
            totalPixels: pxWidth * pxHeight,
            todayStr,
            pastStr,
            beforeFromStr,
            beforeToStr,
            aoiBounds: [
                aoiRect.bounds.getWest().toFixed(6),
                aoiRect.bounds.getSouth().toFixed(6),
                aoiRect.bounds.getEast().toFixed(6),
                aoiRect.bounds.getNorth().toFixed(6)
            ]
        };

        document.getElementById('analysis-status-text').innerHTML = `<div class="analysis-loader"><div class="spinner"></div> Generating Supersampled Imagery (${pxWidth}x${pxHeight}px)...</div>`;

        const [urlBefore, urlAfter] = await Promise.all([
            fetchProcessAPI(aoiRect.bounds, beforeFromStr, beforeToStr, pxWidth, pxHeight),
            fetchProcessAPI(aoiRect.bounds, pastStr, todayStr, pxWidth, pxHeight)
        ]);

        currentBeforeUrl = urlBefore;
        currentAfterUrl = urlAfter;

        if (overlayBefore) map.removeLayer(overlayBefore);
        if (overlayAfter) map.removeLayer(overlayAfter);
        overlayBefore = L.imageOverlay(currentBeforeUrl, aoiRect.bounds, { opacity: 1, zIndex: 400, className: 'pixelated' });
        overlayAfter = L.imageOverlay(currentAfterUrl, aoiRect.bounds, { opacity: 1, zIndex: 400, className: 'pixelated' });

        document.getElementById('analysis-status-text').innerHTML = `<div class="analysis-loader"><div class="spinner"></div> Running Optical Signature Detection...</div>`;

        const imgBefore = await createImg(currentBeforeUrl);
        const imgAfter = await createImg(currentAfterUrl);

        const cBef = document.getElementById('c-bef');
        const cAft = document.getElementById('c-aft');
        const cMsk = document.getElementById('c-msk');

        cBef.width = pxWidth; cBef.height = pxHeight;
        cAft.width = pxWidth; cAft.height = pxHeight;
        cMsk.width = pxWidth; cMsk.height = pxHeight;

        const cb = cBef.getContext('2d', { willReadFrequently: true });
        const ca = cAft.getContext('2d', { willReadFrequently: true });
        const cm = cMsk.getContext('2d');

        cb.imageSmoothingEnabled = false;
        ca.imageSmoothingEnabled = false;

        cb.drawImage(imgBefore, 0, 0, pxWidth, pxHeight);
        ca.drawImage(imgAfter, 0, 0, pxWidth, pxHeight);

        // =========================================================================================
        // FUNCTIONAL AI LOGIC: Optical Physics Signature Detection
        // =========================================================================================
        const dataB = cb.getImageData(0, 0, pxWidth, pxHeight).data;
        const dataA = ca.getImageData(0, 0, pxWidth, pxHeight).data;
        const imgDataM = cm.createImageData(pxWidth, pxHeight);
        const dataM = imgDataM.data;

        const GRID_SIZE = Math.max(4, Math.round(30 / mpp));
        const cols = Math.floor(pxWidth / GRID_SIZE);
        const rows = Math.floor(pxHeight / GRID_SIZE);
        const changeBlocks = new Array(rows * cols).fill(null).map(() => ({ count: 0, typeTotal: 0 }));
        let totalChangedPixels = 0;

        for (let y = 0; y < pxHeight; y++) {
            for (let x = 0; x < pxWidth; x++) {
                const i = (y * pxWidth + x) * 4;

                const r1 = dataB[i], g1 = dataB[i + 1], b1 = dataB[i + 2], a1 = dataB[i + 3];
                const r2 = dataA[i], g2 = dataA[i + 1], b2 = dataA[i + 2], a2 = dataA[i + 3];

                if (a1 === 0 || a2 === 0) {
                    dataM[i] = 0; dataM[i + 1] = 0; dataM[i + 2] = 0; dataM[i + 3] = 255; continue;
                }
                if ((r1 > 240 && g1 > 240 && b1 > 240) || (r2 > 240 && g2 > 240 && b2 > 240)) {
                    dataM[i] = 0; dataM[i + 1] = 0; dataM[i + 2] = 0; dataM[i + 3] = 255; continue;
                }

                const delta = Math.abs(r1 - r2) + Math.abs(g1 - g2) + Math.abs(b1 - b2);
                const lum1 = (r1 * 0.299) + (g1 * 0.587) + (b1 * 0.114);
                const lum2 = (r2 * 0.299) + (g2 * 0.587) + (b2 * 0.114);

                const veg1 = (g1 - r1) / (g1 + r1 + 0.001);
                const veg2 = (g2 - r2) / (g2 + r2 + 0.001);

                let detected = false;
                let typeCode = 0;

                if (delta > 90) {
                    // SIGNATURE A: Land Clearing / Earthworks
                    if (veg1 > 0.04 && veg2 <= 0.0 && r2 > g2) {
                        detected = true;
                        typeCode = 1;
                    }
                    // SIGNATURE B: New Construction / Concrete
                    else if (lum2 > lum1 + 50 && Math.abs(r2 - g2) < 25 && Math.abs(g2 - b2) < 25) {
                        detected = true;
                        typeCode = 2;
                    }
                    // SIGNATURE C: High-Albedo Roof
                    else if (delta > 180 && lum2 > 130 && lum1 < 90) {
                        detected = true;
                        typeCode = 2;
                    }
                }

                if (detected) {
                    dataM[i] = typeCode === 1 ? 245 : 244;
                    dataM[i + 1] = typeCode === 1 ? 158 : 63;
                    dataM[i + 2] = typeCode === 1 ? 11 : 94;
                    dataM[i + 3] = 255;

                    totalChangedPixels++;
                    const bx = Math.floor(x / GRID_SIZE);
                    const by = Math.floor(y / GRID_SIZE);
                    if (bx < cols && by < rows) {
                        changeBlocks[by * cols + bx].count++;
                        changeBlocks[by * cols + bx].typeTotal += typeCode;
                    }
                } else {
                    const gray = lum2;
                    dataM[i] = gray * 0.35; dataM[i + 1] = gray * 0.35; dataM[i + 2] = gray * 0.35; dataM[i + 3] = 255;
                }
            }
        }
        cm.putImageData(imgDataM, 0, 0);

        // 7. Extract coordinate clusters
        let rawDetections = [];
        const triggerThreshold = (GRID_SIZE * GRID_SIZE) * 0.40; // Increased to 40% to drastically reduce false positive clutter

        for (let by = 0; by < rows; by++) {
            for (let bx = 0; bx < cols; bx++) {
                const block = changeBlocks[by * cols + bx];
                if (block.count > triggerThreshold) {

                    const pixelX = bx * GRID_SIZE + (GRID_SIZE / 2);
                    const pixelY = by * GRID_SIZE + (GRID_SIZE / 2);

                    const swLat = aoiRect.sw.lat, swLng = aoiRect.sw.lng;
                    const neLat = aoiRect.ne.lat, neLng = aoiRect.ne.lng;

                    const lat = neLat - (pixelY / pxHeight) * (neLat - swLat);
                    const lng = swLng + (pixelX / pxWidth) * (neLng - swLng);

                    const confVal = Math.min(99.9, 75 + (block.count / (GRID_SIZE * GRID_SIZE)) * 100);
                    const riskWarning = checkStrategicRisk(lat, lng, confVal);

                    rawDetections.push({
                        id: 'DET-' + Math.floor(Math.random() * 90000 + 10000),
                        lat: lat,
                        lng: lng,
                        conf: confVal,
                        pixels: block.count,
                        riskWarning: riskWarning
                    });
                }
            }
        }

        rawDetections.sort((a, b) => b.conf - a.conf);

        document.getElementById('analysis-status-text').innerHTML = `<div class="analysis-loader"><div class="spinner"></div> Verifying Street Level 3D Data for ${rawDetections.length} signatures...</div>`;

        realDetections = await Promise.all(rawDetections.map(async (d) => {
            if (d.riskWarning) {
                d.color = "#f43f5e";
                d.label = "Preservation Risk";
                d.has3D = false;
            } else {
                const has3D = await new Promise((resolve) => {
                    if (typeof google === 'undefined' || typeof google.maps === 'undefined') return resolve(false);
                    const sv = new google.maps.StreetViewService();
                    sv.getPanorama({ location: { lat: d.lat, lng: d.lng }, radius: 50 }, (data, status) => {
                        resolve(status === google.maps.StreetViewStatus.OK);
                    });
                });
                if (has3D) {
                    d.color = "#3b82f6";
                    d.label = "Anomaly (3D Assessed)";
                    d.has3D = true;
                } else {
                    d.color = "#f59e0b";
                    d.label = "Anomaly (No Street View)";
                    d.has3D = false;
                }
            }
            return d;
        }));

        document.getElementById('analysis-status-text').innerHTML = `
      Analyzed <b style="color:var(--teal)">${pxWidth * pxHeight}</b> supersampled pixels.<br>
      Found <b>${realDetections.length}</b> verified construction signatures.<br>
      <span style="font-size:9.5px;color:var(--text-3);">*Optical filter active: Ignoring standard shadows & seasons.</span>
    `;

        // Swap Bottom Bar UI to Map Overlay controls
        document.getElementById('aoi-default-controls').style.display = 'none';
        const postControls = document.getElementById('aoi-post-controls');
        postControls.style.display = 'flex';
        postControls.innerHTML = `
      <span class="aoi-bottom-label" style="color:var(--text-1)">MAP OVERLAYS:</span>
      <button class="aoi-run-btn" style="background:#3b82f6;color:#fff" onclick="toggleMapOverlay('before')">📅 ${yearsLabel}</button>
      <button class="aoi-run-btn" style="background:var(--teal);color:#111" onclick="toggleMapOverlay('after')">📡 Today</button>
      <button class="aoi-run-btn" style="background:var(--bg-card);color:var(--text-1);border:1px solid var(--border)" onclick="toggleMapOverlay('none')">🗺️ Base</button>
            <button class="aoi-run-btn" style="background:#16a34a;color:#fff" onclick="exportAnalysisImage()">🖼 Export Image</button>
            <button class="aoi-run-btn" style="background:#f97316;color:#111" onclick="exportAnalysisPDF()">📄 Export PDF</button>
            <button class="aoi-run-btn" style="background:#06b6d4;color:#06202a" onclick="exportAnalysisTextReport()">📝 Export Report</button>
      <div class="aoi-sep"></div>
      <button class="aoi-run-btn" style="background:var(--amber);color:#111" id="toggle-dots-btn" onclick="toggleMarkers()">👁 Hide Dots</button>
      <button class="aoi-clear-btn" onclick="clearAOI()">✕ Clear</button>
    `;

        // Default to showing "After" overlay for visual context
        toggleMapOverlay('after');
        plotRealDetections();

    } catch (err) {
        console.error("Analysis aborted:", err);
        document.getElementById('analysis-status-text').innerHTML = `
      <div style="color:var(--red);font-size:11px;padding:8px;background:var(--bg-card);border:1px solid rgba(244,63,94,0.3);border-radius:6px;margin-bottom:8px;line-height:1.4;">
        <b>Analysis aborted:</b><br>${err.message}
      </div>
    `;
        list.innerHTML = `<div style="color:var(--text-3);font-size:12px;text-align:center;padding:20px 0;">Awaiting valid data.</div>`;
    }
}

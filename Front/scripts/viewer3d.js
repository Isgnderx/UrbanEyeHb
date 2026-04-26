function open3DView(id, lat, lng, label) {
    document.getElementById('modal-coords').textContent = `${lat.toFixed(5)}° N, ${lng.toFixed(5)}° E`;
    const modal = document.getElementById('modal3d');
    modal.style.display = 'flex';
    const container = document.getElementById('viewer3d');

    container.innerHTML = `
    <iframe width="100%" height="100%" frameborder="0" style="border:0; width:100%; height:100%;" src="https://maps.google.com/maps?q=&layer=c&cbll=${lat},${lng}&cbp=11,0,0,0,0&output=svembed" allowfullscreen></iframe>
    <div style="position:absolute;bottom:20px;left:50%;transform:translateX(-50%);background:rgba(22,27,38,0.95);padding:14px;border:1px solid var(--border);border-radius:8px;box-shadow:0 10px 30px rgba(0,0,0,0.8);display:flex;flex-direction:column;gap:10px;z-index:100;min-width:300px;">
        <div style="font-size:12px;font-weight:600;color:var(--text-1);text-align:center;">Field Assessment: ${id}</div>
        <div style="font-size:11px;color:var(--text-3);text-align:center;margin-bottom:4px;">${label}</div>
        <div style="display:flex;gap:10px;">
            <button onclick="assessAnomaly('${id}', 'legal')" style="flex:1;padding:8px;background:rgba(16,185,129,0.15);color:var(--green);border:1px solid rgba(16,185,129,0.3);border-radius:6px;cursor:pointer;font-size:11px;font-weight:600;transition:opacity 0.2s;">✅ Verified Legal</button>
            <button onclick="assessAnomaly('${id}', 'illegal')" style="flex:1;padding:8px;background:rgba(244,63,94,0.15);color:var(--red);border:1px solid rgba(244,63,94,0.3);border-radius:6px;cursor:pointer;font-size:11px;font-weight:600;transition:opacity 0.2s;">⚠️ Flag Illegal</button>
        </div>
    </div>
  `;
}

function assessAnomaly(id, status) {
    const det = realDetections.find(d => d.id === id);
    if (!det) return;

    if (status === 'legal') {
        det.color = '#10b981'; // Green
        det.label = 'Supervisor Verified Legal';
        det.riskWarning = null;
    } else {
        det.color = '#f43f5e'; // Red
        det.label = 'Flagged Illegal Structure';
        det.riskWarning = 'Manual Supervisor Flag (High Priority)';
    }

    close3DView();
    plotRealDetections();
}

function openDual3DView(id, riskType) {
    document.getElementById('modal-coords').textContent = `[${id}] 2040 Master Plan Impact`;
    const modal = document.getElementById('modal3d');
    modal.style.display = 'flex';
    const container = document.getElementById('viewer3d');

    const cleanRiskInfo = riskType.replace('Konflikt: ', '').replace('Tarixi İrs: ', '');

    container.innerHTML = `
    <div style="display:flex; width:100%; height:100%;">
        <div id="dual-left" style="flex:1; border-right:2px solid var(--border); position:relative;">
            <div style="position:absolute;top:14px;left:14px;z-index:999;background:rgba(244,63,94,0.9);padding:8px 16px;border-radius:6px;color:#fff;font-weight:700;font-size:12px;box-shadow:0 6px 15px rgba(0,0,0,0.5);">🔴 PENDING: Current State (Illegal Anomaly)</div>
        </div>
        <div id="dual-right" style="flex:1; position:relative;">
            <div style="position:absolute;top:14px;right:14px;z-index:999;background:rgba(16,185,129,0.9);padding:8px 16px;border-radius:6px;color:#fff;font-weight:700;font-size:12px;box-shadow:0 6px 15px rgba(0,0,0,0.5);">🟢 2040 VISION: ${cleanRiskInfo}</div>
        </div>
    </div>
  `;

    renderDualTerrain('dual-left', 'illegal');
    renderDualTerrain('dual-right', '2040');
}

function renderDualTerrain(containerId, mode) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const width = container.clientWidth;
    const height = container.clientHeight;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(mode === '2040' ? 0x0f1a20 : 0x161b26);

    const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);
    camera.position.set(30, 40, 40);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    container.appendChild(renderer.domElement);

    const ambient = new THREE.AmbientLight(0xffffff, mode === '2040' ? 0.8 : 0.4);
    scene.add(ambient);
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(10, 50, 20);
    scene.add(dirLight);

    const grid = new THREE.GridHelper(100, 20, 0x313d55, 0x2a3347);
    scene.add(grid);
    const planeGeo = new THREE.PlaneGeometry(100, 100);
    const planeMat = new THREE.MeshLambertMaterial({ color: mode === '2040' ? 0x064e3b : 0x1c2333 });
    const plane = new THREE.Mesh(planeGeo, planeMat);
    plane.rotation.x = -Math.PI / 2;
    scene.add(plane);

    if (mode === 'illegal') {
        const bHeight = 25;
        const boxGeo = new THREE.BoxGeometry(10, bHeight, 10);
        const boxMat = new THREE.MeshLambertMaterial({ color: 0xf43f5e });
        const building = new THREE.Mesh(boxGeo, boxMat);
        building.position.y = bHeight / 2;
        scene.add(building);

        const edges = new THREE.EdgesGeometry(boxGeo);
        const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0xffffff }));
        building.add(line);
    } else if (mode === '2040') {
        for (let i = 0; i < 30; i++) {
            const trunkGeo = new THREE.CylinderGeometry(0.5, 0.5, 4);
            const trunkMat = new THREE.MeshLambertMaterial({ color: 0x78350f });
            const trunk = new THREE.Mesh(trunkGeo, trunkMat);

            const leavesGeo = new THREE.ConeGeometry(0, 5, 8);
            const leavesMat = new THREE.MeshLambertMaterial({ color: 0x10b981 });
            const leaves = new THREE.Mesh(leavesGeo, leavesMat);
            leaves.position.y = 4;

            const tree = new THREE.Group();
            tree.add(trunk);
            tree.add(leaves);

            tree.position.set((Math.random() - 0.5) * 40, 2, (Math.random() - 0.5) * 40);
            scene.add(tree);
        }

        const pavilionGeo = new THREE.BoxGeometry(15, 2, 8);
        const pavilionMat = new THREE.MeshLambertMaterial({ color: 0x9ca3af });
        const pavilion = new THREE.Mesh(pavilionGeo, pavilionMat);
        pavilion.position.set(0, 1, 0);
        scene.add(pavilion);
    }

    function animate() {
        if (!document.getElementById('modal3d') || document.getElementById('modal3d').style.display === 'none') {
            renderer.dispose();
            return;
        }
        requestAnimationFrame(animate);
        scene.rotation.y += 0.005;
        renderer.render(scene, camera);
    }
    animate();
}

function close3DView() {
    document.getElementById('modal3d').style.display = 'none';
}

document.addEventListener('DOMContentLoaded', () => {
    initAdminMap();
    fetchUrbanReports();
    setInterval(fetchUrbanReports, 60000);
});

let allReports = [];
let markers = [];
let map = null;

function initAdminMap() {
    map = L.map('map').setView([40.4093, 49.8671], 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);
}

async function fetchUrbanReports() {
    try {
        const response = await fetch('/api/reports');
        if (!response.ok) throw new Error('Network response was not ok');
        const result = await response.json();
        allReports = result.reports || [];
        renderDashboard(allReports);
    } catch (error) {
        console.error('Error fetching reports:', error);
        document.getElementById('report-list').innerHTML = '<p style="color:red; text-align:center; margin-top:30px;">API Connection Failed</p>';
    }
}

function renderDashboard(data) {
    const listContainer = document.getElementById('report-list');
    const totalLabel = document.getElementById('total-count');

    listContainer.innerHTML = '';
    markers.forEach(marker => map.removeLayer(marker));
    markers = [];

    totalLabel.innerText = data.length;

    if (data.length === 0) {
        listContainer.innerHTML = '<p style="color:#7f8c8d; text-align:center; margin-top:24px;">No active issues in this view.</p>';
        return;
    }

    data.forEach(report => {
        const marker = L.marker([report.latitude, report.longitude]).addTo(map);

        const popupHtml = `
            <div style="width:200px; font-family: 'Segoe UI', sans-serif; color: #222;">
                <strong style="color:#2980b9">${report.category}</strong>
                ${report.photoPath ? `<img src="${report.photoPath}" style="width:100%; border-radius:8px; margin:10px 0;" />` : ''}
                <p style="font-size:12px; color:#555; margin:0 0 10px;">${report.notes}</p>
                <button class="resolve-btn" onclick="resolveIssue(${report.id})">Resolve Issue</button>
            </div>
        `;

        marker.bindPopup(popupHtml);
        markers.push(marker);

        const item = document.createElement('div');
        item.className = 'report-item';
        item.innerHTML = `
            <strong>${report.category}</strong>
            <small>${new Date(report.submittedAt).toLocaleTimeString()}</small>
            <p style="font-size:0.85rem; color:#666; margin-top:8px;">${report.notes.substring(0, 80)}${report.notes.length > 80 ? '...' : ''}</p>
        `;

        item.onclick = () => {
            map.flyTo([report.latitude, report.longitude], 16);
            marker.openPopup();
        };

        listContainer.appendChild(item);
    });
}

function filterReports(category, btn) {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    if (category === 'All') {
        renderDashboard(allReports);
    } else {
        const filtered = allReports.filter(report => report.category === category);
        renderDashboard(filtered);
    }
}

function resolveIssue(id) {
    if (!confirm('Are you sure you want to mark this as resolved?')) return;

    alert('Issue #' + id + ' has been archived.');
    allReports = allReports.filter(report => report.id !== id);
    renderDashboard(allReports);
}

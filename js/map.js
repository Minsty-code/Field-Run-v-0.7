// ══════════════════════════════════════════
//  map.js — Field Run
// ══════════════════════════════════════════

// ── Variables ──────────────────────────────
let map;
let currentMarker;
let accuracyCircle;
let line;

// ── Initialisation carte ───────────────────
function initMap() {
    map = L.map('map', {
        dragging: true,
        zoomControl: true,
    }).setView([0, 0], 13);

    // Tuiles CartoDB Voyager — plus soignées qu'OSM standard
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 20
    }).addTo(map);
}

// ── Marqueur joueur (custom) ───────────────
function initMarker() {
    const icon = L.divIcon({
        className: '',
        html: `
            <div class="playerDot">
                <div class="playerDotCore"></div>
                <div class="playerDotRing"></div>
            </div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
    });

    currentMarker = L.marker([0, 0], { icon }).addTo(map);
}

// ── Ligne de tracé ─────────────────────────
function initTrackingLine() {
    line = L.polyline([], {
        color: '#F0C900',
        weight: 5,
        opacity: 0.95,
        lineCap: 'round',
        lineJoin: 'round',
    }).addTo(map);
}

// ── Update marqueur ────────────────────────
function updateMarker(lat, lon) {
    currentMarker.setLatLng([lat, lon]);
}

// ── Cercle de précision ────────────────────
function updateAccuracyCircle(lat, lon, accuracy) {
    const color = accuracy > 100 ? '#EB00CD' : '#F0C900';

    if (accuracyCircle) {
        accuracyCircle.setLatLng([lat, lon]).setRadius(accuracy);
        accuracyCircle.setStyle({ color });
    } else {
        accuracyCircle = L.circle([lat, lon], {
            radius: accuracy,
            color,
            weight: 1.5,
            fillColor: color,
            fillOpacity: 0.07,
        }).addTo(map);
    }
}

// ── Update / clear ligne ───────────────────
function updateLine(coords) {
    line.setLatLngs(coords);
}

function clearLine() {
    line.setLatLngs([]);
}

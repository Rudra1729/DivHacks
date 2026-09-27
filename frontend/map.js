/* ==========================================================================
   REAL NYC MAP ENGINE (Leaflet + OpenStreetMap tiles, no API key)

   Loaded before app.js. It uses PLACES and selectedNodeId from app.js, which
   are only read after the page has loaded.
   ========================================================================== */

const MAP_CENTER = [40.8085, -73.9505];
let realMap = null;
const placeMarkers = new Map();
const geofenceCircles = new Map();
let webLinesLayer = null;
let webThreadLayer = null;

// Which side of its marker each label sits on, so nearby labels do not overlap.
const LABEL_SIDE = {
  'apollo-theater': 'top',
  'studio-museum-harlem': 'right',
  'marcus-garvey-park': 'right',
  'hamilton-grange': 'top',
  'malcolm-shabazz-market': 'bottom',
  'morningside-park': 'left'
};
const LABEL_OFFSET = { top: [0, -18], bottom: [0, 18], left: [-18, 0], right: [18, 0] };

/** Build the map, the place markers and their geofence circles. */
function initRealMap() {
  const el = document.getElementById('realMap');
  if (!el) return;
  if (!window.L) {
    el.innerHTML = '<p class="map-error">The map library could not load. Check your internet connection and reload.</p>';
    return;
  }

  realMap = L.map(el, { scrollWheelZoom: false });
  // OpenStreetMap's own tiles need no key. They are light, so styles.css darkens them.
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19
  }).addTo(realMap);

  drawGeofences();
  webLinesLayer = L.layerGroup().addTo(realMap);
  webThreadLayer = L.layerGroup().addTo(realMap);

  PLACES.forEach(place => {
    const icon = L.divIcon({
      className: '',
      html: '<div class="place-marker"><span class="halo"></span><span class="dot"><span class="core"></span></span></div>',
      iconSize: [44, 44],
      iconAnchor: [22, 22]
    });
    const marker = L.marker([place.lat, place.lng], { icon, title: place.name }).addTo(realMap);
    const side = LABEL_SIDE[place.id] || 'bottom';
    marker.bindTooltip(place.name, { permanent: true, direction: side, offset: LABEL_OFFSET[side], className: 'place-label' });
    marker.on('click', () => selectNode(place.id));
    placeMarkers.set(place.id, marker);
  });

  realMap.fitBounds(L.latLngBounds(PLACES.map(p => [p.lat, p.lng])), { padding: [70, 70] });
  refreshMap();
  // The map can be sized before the layout settles, so fix its size shortly after load.
  setTimeout(() => realMap.invalidateSize(), 300);
  window.addEventListener('resize', () => realMap.invalidateSize());
}

/** Draw each place's geofence circle, using the radius the backend enforces. */
function drawGeofences() {
  PLACES.forEach(place => {
    const circle = L.circle([place.lat, place.lng], {
      radius: place.radius,
      color: '#8a8f99',
      weight: 1,
      dashArray: '4 4',
      fillColor: '#8a8f99',
      fillOpacity: 0.08,
      interactive: false
    }).addTo(realMap);
    geofenceCircles.set(place.id, circle);
  });
}

/** Repaint markers, geofence circles and web lines from the current state. */
function refreshMap() {
  if (!realMap) return;

  PLACES.forEach(place => {
    const marker = placeMarkers.get(place.id);
    const markerEl = marker?.getElement()?.querySelector('.place-marker');
    if (markerEl) {
      markerEl.classList.toggle('discovered', !!place.discovered);
      markerEl.classList.toggle('selected', place.id === selectedNodeId);
    }
    marker?.getTooltip()?.getElement()?.classList.toggle('discovered', !!place.discovered);

    geofenceCircles.get(place.id)?.setStyle(
      place.discovered
        ? { color: '#E52421', fillColor: '#E52421', fillOpacity: 0.15, weight: 2 }
        : { color: '#8a8f99', fillColor: '#8a8f99', fillOpacity: 0.08, weight: 1 }
    );
  });

  // The web: a red thread between every pair of explored places.
  webLinesLayer.clearLayers();
  const explored = PLACES.filter(place => place.discovered);
  for (let i = 0; i < explored.length; i++) {
    for (let j = i + 1; j < explored.length; j++) {
      L.polyline([[explored[i].lat, explored[i].lng], [explored[j].lat, explored[j].lng]], {
        color: '#E52421', weight: 2, opacity: 0.6, interactive: false
      }).addTo(webLinesLayer);
    }
  }
  saveDiscovered();
}

/** Animate a cyan web thread shooting from one point to another.

Args:
    from (number[]): [lat, lng] where the thread starts.
    to (number[]): [lat, lng] where it lands.
*/
function animateWebThread(from, to) {
  if (!realMap) return;
  const line = L.polyline([from, from], { color: '#00F0FF', weight: 4, interactive: false }).addTo(webThreadLayer);
  const head = L.circleMarker(from, {
    radius: 6, color: '#fff', fillColor: '#fff', fillOpacity: 1, weight: 0, interactive: false
  }).addTo(webThreadLayer);
  const startedAt = performance.now();
  const DURATION_MS = 700;

  function step(now) {
    const t = Math.min(1, (now - startedAt) / DURATION_MS);
    const point = [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t];
    line.setLatLngs([from, point]);
    head.setLatLng(point);
    if (t < 1) {
      requestAnimationFrame(step);
    } else {
      webThreadLayer.removeLayer(line);
      webThreadLayer.removeLayer(head);
    }
  }
  requestAnimationFrame(step);
}

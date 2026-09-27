/* ==========================================================================
   REAL NYC MAP ENGINE (Leaflet, free maps with no API key)

   Base maps: Streets (OpenFreeMap vector style, looks like Google Maps),
   Satellite (Esri imagery) and Classic (OpenStreetMap).

   Loaded before app.js. It uses PLACES and selectedNodeId from app.js, which
   are only read after the page has loaded.
   ========================================================================== */

const MAP_CENTER = [40.8085, -73.9505];
let realMap = null;
const placeMarkers = new Map();
const geofenceCircles = new Map();
let webLinesLayer = null;
let webThreadLayer = null;
let idleGeofenceColor = '#4b5563'; // white on satellite, where grey would vanish

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
  // The vector layer needs a view to exist before it is added. Places are fitted right after.
  realMap.setView(MAP_CENTER, 14);
  const baseMaps = buildBaseMaps();
  const defaultBase = baseMaps['Streets'] || baseMaps['Classic'];
  defaultBase.addTo(realMap);
  L.control.layers(baseMaps, null, { position: 'bottomright', collapsed: false }).addTo(realMap);
  realMap.on('baselayerchange', event => {
    idleGeofenceColor = event.name === 'Satellite' ? '#ffffff' : '#4b5563';
    refreshMap();
  });

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

  refreshMap();
  fitToPlaces();

  // The page layout can still be settling when the map is created, which used to leave it
  // zoomed far out. Re-fit whenever the container changes size, until the user moves the map.
  let userMovedMap = false;
  ['mousedown', 'touchstart', 'wheel'].forEach(type =>
    el.addEventListener(type, () => { userMovedMap = true; }, { passive: true }));
  const refit = () => { realMap.invalidateSize(); if (!userMovedMap) fitToPlaces(); };
  if (window.ResizeObserver) new ResizeObserver(refit).observe(el);
  window.addEventListener('load', refit);
  setTimeout(refit, 300);
}

/* ==========================================================================
   STREETS LOOK: a light, colourful, Google-Maps-style palette

   OpenFreeMap's style is open, so we recolour it after it loads: soft off-white
   land, white streets, yellow main roads, pastel parks, light blue water, and more
   icons (stations, shops, parks) visible at city zoom.
   ========================================================================== */

const STREETS_PALETTE = {
  land: '#f5f4f0',
  water: '#b6dbef',
  waterLabel: '#5b88a8',
  park: '#cde8bf',
  wood: '#c2e2b4',
  building: '#e9e6df',
  roadMinor: '#ffffff',
  roadMinorCasing: '#dedbd3',
  roadMain: '#fde293',
  roadMainCasing: '#eab84f',
  motorway: '#f9c862',
  motorwayCasing: '#e2a13a',
  rail: '#cfcfcf',
  text: '#5f6368',
  transit: '#2f6db5'
};

/** Recolour the loaded Streets style. Layers that a style version does not have are skipped.

Args:
    glMap (Object): The MapLibre map behind the Streets layer, with its style loaded.
*/
function applyStreetsPalette(glMap) {
  const P = STREETS_PALETTE;
  const set = (id, prop, value) => { if (glMap.getLayer(id)) glMap.setPaintProperty(id, prop, value); };

  set('background', 'background-color', P.land);
  set('water', 'fill-color', P.water);
  ['waterway_river', 'waterway_other', 'waterway_tunnel'].forEach(id => set(id, 'line-color', P.water));
  ['waterway_line_label', 'water_name_point_label', 'water_name_line_label'].forEach(id => set(id, 'text-color', P.waterLabel));

  set('park', 'fill-color', P.park);
  set('park_outline', 'line-color', P.park);
  set('landcover_grass', 'fill-color', P.park);
  set('landcover_wood', 'fill-color', P.wood);
  ['landuse_pitch', 'landuse_track'].forEach(id => set(id, 'fill-color', '#c9e7c0'));
  set('landuse_cemetery', 'fill-color', '#d3e6cb');
  set('landuse_hospital', 'fill-color', '#fbe6e6');
  set('building', 'fill-color', P.building);
  // Flat buildings, like Google Maps. The 3D blocks look grey and heavy next to the pastel colours.
  if (glMap.getLayer('building-3d')) glMap.setLayoutProperty('building-3d', 'visibility', 'none');
  set('building', 'fill-outline-color', '#dcd8d0');

  // Roads: white streets, yellow main roads, orange-yellow motorways. Bridges and tunnels match.
  for (const kind of ['road', 'bridge', 'tunnel']) {
    ['minor', 'street', 'service_track'].forEach(name => {
      set(`${kind}_${name}`, 'line-color', P.roadMinor);
      set(`${kind}_${name}_casing`, 'line-color', P.roadMinorCasing);
    });
    set(`${kind}_secondary_tertiary`, 'line-color', P.roadMinor);
    set(`${kind}_secondary_tertiary_casing`, 'line-color', P.roadMinorCasing);
    ['trunk_primary', 'link'].forEach(name => {
      set(`${kind}_${name}`, 'line-color', P.roadMain);
      set(`${kind}_${name}_casing`, 'line-color', P.roadMainCasing);
    });
    set(`${kind}_motorway`, 'line-color', P.motorway);
    set(`${kind}_motorway_casing`, 'line-color', P.motorwayCasing);
    set(`${kind}_motorway_link`, 'line-color', P.motorway);
    set(`${kind}_motorway_link_casing`, 'line-color', P.motorwayCasing);
    ['major_rail', 'transit_rail'].forEach(name => set(`${kind}_${name}`, 'line-color', P.rail));
  }

  // Softer, Google-like text
  ['poi_r20', 'poi_r7', 'poi_r1', 'highway-name-minor', 'highway-name-major', 'airport'].forEach(id => set(id, 'text-color', P.text));
  set('poi_transit', 'text-color', P.transit);

  // Subway and train stops are class "railway" in this data, but the style only listed "rail"
  if (glMap.getLayer('poi_transit')) {
    glMap.setFilter('poi_transit', ['match', ['get', 'class'], ['airport', 'bus', 'rail', 'railway', 'ferry_terminal'], true, false]);
  }

  // Show more icons at city zoom (defaults hide most of them until you zoom right in)
  const showFrom = { poi_transit: 13, poi_r20: 14, poi_r7: 14.5, poi_r1: 15 };
  Object.entries(showFrom).forEach(([id, zoom]) => {
    if (glMap.getLayer(id)) glMap.setLayerZoomRange(id, zoom, 24);
  });
}

/** Zoom the map so all places are visible, but never so far out that they clump together. */
function fitToPlaces() {
  realMap.fitBounds(L.latLngBounds(PLACES.map(p => [p.lat, p.lng])), { padding: [70, 70], maxZoom: 15, animate: false });
}

/** Whether this browser can draw the vector map, which needs WebGL. */
function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch (e) { return false; }
}

/** Build the switchable base maps. All are free and need no API key.

Returns:
    Object: Base map name to Leaflet layer. Streets is left out if vector maps cannot load here.
*/
function buildBaseMaps() {
  const osmCredit = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
  const maps = {};

  if (window.maplibregl && L.maplibreGL && webglAvailable()) {
    const streets = L.maplibreGL({
      style: 'https://tiles.openfreemap.org/styles/liberty',
      attribution: '<a href="https://openfreemap.org" target="_blank">OpenFreeMap</a> &copy; <a href="https://openmaptiles.org/" target="_blank">OpenMapTiles</a> Data from ' + osmCredit
    });
    // Recolour once the style has loaded, each time the layer is (re)added.
    streets.on('add', () => {
      const glMap = streets.getMaplibreMap ? streets.getMaplibreMap() : streets._glMap;
      if (!glMap) return;
      const apply = () => { try { applyStreetsPalette(glMap); } catch (e) { console.warn('Streets palette not applied:', e); } };
      if (glMap.isStyleLoaded()) apply(); else glMap.once('load', apply);
    });
    maps['Streets'] = streets;
  }

  maps['Satellite'] = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles &copy; Esri, Maxar, Earthstar Geographics, and the GIS User Community',
    maxZoom: 19
  });

  maps['Classic'] = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: osmCredit,
    maxZoom: 19
  });
  return maps;
}

/** Draw each place's geofence circle, using the radius the backend enforces. */
function drawGeofences() {
  PLACES.forEach(place => {
    const circle = L.circle([place.lat, place.lng], {
      radius: place.radius,
      color: '#4b5563',
      weight: 1.5,
      dashArray: '5 4',
      fillColor: '#4b5563',
      fillOpacity: 0.1,
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
        : { color: idleGeofenceColor, fillColor: idleGeofenceColor, fillOpacity: 0.1, weight: 1.5 }
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
  const line = L.polyline([from, from], { color: '#00A8C6', weight: 5, interactive: false }).addTo(webThreadLayer);
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

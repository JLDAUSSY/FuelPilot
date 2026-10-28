// Essence sur Autoroute - Application Waze-like
// Trajet point A à point B, étapes, alternatives, stations en ordre chronologique avec PK, enseignes et prix

let map;
let allStations = [];
let routeLayers = [];
let stationMarkers = [];
let activeRouteData = null;
let alternativeRoutes = [];
let currentWaypoints = []; // [{ id, text, coords: [lon, lat] }]
let startPoint = null;
let endPoint = null;
let selectedFuel = 'e10'; // Default to SP95
let selectedBrand = 'all';
let currentSort = 'route'; // 'route', 'price', 'dist'
let maxDistanceKm = 0.45; // 450m tolerance for highway service areas

// Helper to safely get fuel price with SP95/E10 equivalence
function getFuelPrice(prixObj, fuel) {
  if (!prixObj) return null;
  if (fuel === 'e10') {
    return (prixObj.e10 && prixObj.e10 > 0) ? prixObj.e10 : ((prixObj.sp95 && prixObj.sp95 > 0) ? prixObj.sp95 : null);
  }
  if (fuel === 'sp95') {
    return (prixObj.sp95 && prixObj.sp95 > 0) ? prixObj.sp95 : ((prixObj.e10 && prixObj.e10 > 0) ? prixObj.e10 : null);
  }
  return prixObj[fuel] || null;
}

// Global Mobile View Switcher
function setMobileView(view) {
  const btnMap = document.getElementById('btn-tab-map');
  const btnList = document.getElementById('btn-tab-list');

  if (view === 'map') {
    document.body.classList.remove('mobile-view-list');
    document.body.classList.add('mobile-view-map');
    if (btnMap) btnMap.classList.add('active');
    if (btnList) btnList.classList.remove('active');
    setTimeout(() => {
      if (map) map.invalidateSize();
    }, 150);
  } else {
    document.body.classList.remove('mobile-view-map');
    document.body.classList.add('mobile-view-list');
    if (btnList) btnList.classList.add('active');
    if (btnMap) btnMap.classList.remove('active');
  }
}

const FUEL_LABELS = {
  e10: 'SP95',
  gazole: 'Gazole',
  sp98: 'SP98',
  sp95: 'SP95 (Pur)',
  e85: 'E85',
  gplc: 'GPLc'
};

// Initialize Application
document.addEventListener('DOMContentLoaded', async () => {
  initMap();
  setupAutocomplete('input-start', 'dropdown-start', (coords, label) => {
    startPoint = { coords, label };
  });
  setupAutocomplete('input-end', 'dropdown-end', (coords, label) => {
    endPoint = { coords, label };
  });

  setupEventListeners();
  await loadStationsData();

  // Load a default preset (Paris -> Lyon) only if inputs are empty
  const startInput = document.getElementById('input-start');
  const endInput = document.getElementById('input-end');
  if (startInput && endInput && !startInput.value && !endInput.value) {
    applyPreset('Paris', [2.3522, 48.8566], 'Lyon', [4.8357, 45.7640]);
  }
});

// Initialize Leaflet Map
function initMap() {
  // Center of France
  map = L.map('map', {
    zoomControl: false
  }).setView([46.603354, 1.888334], 6);

  L.control.zoom({ position: 'topright' }).addTo(map);

  // Basemap 1: OpenStreetMap France (optimisé pour les autoroutes et routes françaises, 100% gratuit, sans filigrane ni clé)
  const osmFr = L.tileLayer('https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap France | &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 20
  });

  // Basemap 2: OpenStreetMap Standard international
  const osmStandard = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19
  });

  // Basemap 3: Vue Satellite ESRI
  const esriSat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles &copy; Esri',
    maxZoom: 18
  });

  // Add default layer
  osmFr.addTo(map);

  // Layer selector in top right
  const baseMaps = {
    "🗺️ Carte Routière": osmFr,
    "🌍 OpenStreetMap": osmStandard,
    "🛰️ Vue Satellite": esriSat
  };

  L.control.layers(baseMaps, null, { position: 'topright' }).addTo(map);
}

// Load stations from JSON
async function loadStationsData() {
  try {
    const res = await fetch('stations_autoroute.json');
    allStations = await res.json();
    populateBrandFilter();
    const badge = document.getElementById('total-stations-badge');
    if (badge) badge.textContent = `${allStations.length} aires répertoriées`;
  } catch (err) {
    console.error('Erreur chargement stations:', err);
  }
}

// Populate Brands Filter dropdown
function populateBrandFilter() {
  const brandSelect = document.getElementById('select-brand');
  const counts = {};
  allStations.forEach(s => {
    const b = s.enseigne || 'Indépendant';
    counts[b] = (counts[b] || 0) + 1;
  });

  const sortedBrands = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
  brandSelect.innerHTML = `<option value="all">Toutes les enseignes (${allStations.length})</option>`;
  sortedBrands.forEach(b => {
    brandSelect.innerHTML += `<option value="${b}">${b} (${counts[b]})</option>`;
  });
}

// Address Autocomplete: French BAN + European Photon (Spain, Italy, Belgium...)
function setupAutocomplete(inputId, dropdownId, onSelect) {
  const input = document.getElementById(inputId);
  const dropdown = document.getElementById(dropdownId);
  let debounceTimer;

  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    const q = input.value.trim();
    if (q.length < 2) {
      dropdown.style.display = 'none';
      return;
    }

    debounceTimer = setTimeout(async () => {
      try {
        let results = [];
        
        // 1. Try French BAN
        try {
          const res = await fetch(`https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(q)}&limit=5`);
          const data = await res.json();
          if (data.features) {
            data.features.forEach(f => {
              results.push({
                label: "🇫🇷 " + f.properties.label,
                cleanName: f.properties.label,
                coords: f.geometry.coordinates
              });
            });
          }
        } catch (e) {}

        // 2. Query European Photon geocoder for cross-border cities (Barcelona, Madrid, Milan, etc.)
        try {
          const resEur = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=5&lang=fr`);
          const dataEur = await resEur.json();
          if (dataEur.features) {
            dataEur.features.forEach(f => {
              const p = f.properties;
              const country = p.country || '';
              const flag = country.toLowerCase().includes('esp') ? '🇪🇸' :
                           country.toLowerCase().includes('ital') ? '🇮🇹' :
                           country.toLowerCase().includes('allem') || country.toLowerCase().includes('germ') ? '🇩🇪' :
                           country.toLowerCase().includes('belg') ? '🇧🇪' :
                           country.toLowerCase().includes('suis') ? '🇨🇭' :
                           country.toLowerCase().includes('lux') ? '🇱🇺' : '🌍';
              const nameParts = [p.name, p.state, country].filter(Boolean);
              const label = `${flag} ${nameParts.join(', ')}`;
              // avoid duplicate if same name already in results
              if (!results.some(r => r.cleanName.toLowerCase() === p.name.toLowerCase())) {
                results.push({
                  label: label,
                  cleanName: p.name,
                  coords: f.geometry.coordinates
                });
              }
            });
          }
        } catch (e) {}

        if (results.length > 0) {
          dropdown.innerHTML = '';
          results.slice(0, 6).forEach(itemData => {
            const item = document.createElement('div');
            item.className = 'autocomplete-item';
            item.textContent = itemData.label;
            item.addEventListener('click', () => {
              input.value = itemData.cleanName;
              dropdown.style.display = 'none';
              onSelect(itemData.coords, itemData.cleanName);
            });
            dropdown.appendChild(item);
          });
          dropdown.style.display = 'block';
        } else {
          dropdown.style.display = 'none';
        }
      } catch (e) {
        console.error(e);
      }
    }, 250);
  });

  document.addEventListener('click', (e) => {
    if (!input.contains(e.target) && !dropdown.contains(e.target)) {
      dropdown.style.display = 'none';
    }
  });
}

// Event Listeners for Filters and Controls
function setupEventListeners() {
  // Mobile tab buttons (floating bar)
  const urlParams = new URLSearchParams(window.location.search);
  const initialView = urlParams.get('view') === 'list' ? 'list' : 'map';
  setMobileView(initialView);
  const btnMap = document.getElementById('btn-tab-map');
  const btnList = document.getElementById('btn-tab-list');
  if (btnMap) btnMap.addEventListener('click', () => setMobileView('map'));
  if (btnList) btnList.addEventListener('click', () => setMobileView('list'));

  // Itinerary Collapse / Edit Button
  const btnToggleRoute = document.getElementById('btn-toggle-route-edit');
  if (btnToggleRoute) {
    btnToggleRoute.addEventListener('click', () => {
      const isCollapsed = document.body.classList.contains('mobile-route-collapsed');
      if (isCollapsed) {
        document.body.classList.remove('mobile-route-collapsed');
        btnToggleRoute.innerHTML = '<span>✖</span> Fermer';
      } else {
        document.body.classList.add('mobile-route-collapsed');
        btnToggleRoute.innerHTML = '<span>✏️</span> Modifier';
      }
    });
  }

  // Fuel selector dropdown
  const fuelSelect = document.getElementById('select-fuel');
  if (fuelSelect) {
    fuelSelect.value = selectedFuel;
    fuelSelect.addEventListener('change', (e) => {
      selectedFuel = e.target.value;
      renderCurrentRouteStations();
    });
  }

  // Fuel pills fallback
  document.querySelectorAll('.fuel-pill').forEach(pill => {
    pill.addEventListener('click', (e) => {
      document.querySelectorAll('.fuel-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      selectedFuel = pill.dataset.fuel;
      if (fuelSelect) fuelSelect.value = selectedFuel;
      renderCurrentRouteStations();
    });
  });

  // Brand dropdown
  document.getElementById('select-brand').addEventListener('change', (e) => {
    selectedBrand = e.target.value;
    renderCurrentRouteStations();
  });

  // Sort dropdown
  document.getElementById('select-sort').addEventListener('change', (e) => {
    currentSort = e.target.value;
    renderCurrentRouteStations();
  });

  // Calculate button
  document.getElementById('btn-calculate').addEventListener('click', () => {
    calculateItinerary();
  });

  // Add waypoint button
  document.getElementById('btn-add-waypoint').addEventListener('click', () => {
    addWaypointInput();
  });

  // Preset chips
  document.querySelectorAll('.preset-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const p = chip.dataset.preset;
      if (p === 'paris-lyon') applyPreset('Paris', [2.3522, 48.8566], 'Lyon', [4.8357, 45.7640]);
      if (p === 'paris-bordeaux') applyPreset('Paris', [2.3522, 48.8566], 'Bordeaux', [-0.5792, 44.8378]);
      if (p === 'marseille-nice') applyPreset('Marseille', [5.3698, 43.2965], 'Nice', [7.2620, 43.7102]);
      if (p === 'lille-paris') applyPreset('Lille', [3.0573, 50.6292], 'Paris', [2.3522, 48.8566]);
      if (p === 'lyon-marseille') applyPreset('Lyon', [4.8357, 45.7640], 'Marseille', [5.3698, 43.2965]);
    });
  });
}

// Helper to set preset route
function applyPreset(startLabel, startCoords, endLabel, endCoords) {
  document.getElementById('input-start').value = startLabel;
  startPoint = { coords: startCoords, label: startLabel };
  document.getElementById('input-end').value = endLabel;
  endPoint = { coords: endCoords, label: endLabel };
  currentWaypoints = [];
  document.getElementById('waypoints-container').innerHTML = '';
  calculateItinerary();
}

// Add a waypoint input dynamically
function addWaypointInput() {
  const container = document.getElementById('waypoints-container');
  const index = currentWaypoints.length;
  const wpId = `wp-${Date.now()}`;

  const row = document.createElement('div');
  row.className = 'waypoint-item';
  row.id = `row-${wpId}`;
  row.innerHTML = `
    <div class="input-group" style="flex:1; margin-bottom:0;">
      <span class="input-icon">📍</span>
      <input type="text" class="address-input" id="input-${wpId}" placeholder="Étape ${index + 1} (ex: Beaune, Orléans...)" />
      <div class="autocomplete-dropdown" id="dropdown-${wpId}"></div>
    </div>
    <button class="btn-remove-step" title="Supprimer l'étape">✕</button>
  `;

  container.appendChild(row);

  const wpObj = { id: wpId, coords: null, label: '' };
  currentWaypoints.push(wpObj);

  setupAutocomplete(`input-${wpId}`, `dropdown-${wpId}`, (coords, label) => {
    wpObj.coords = coords;
    wpObj.label = label;
  });

  row.querySelector('.btn-remove-step').addEventListener('click', () => {
    row.remove();
    currentWaypoints = currentWaypoints.filter(w => w.id !== wpId);
  });
}

// Calculate Itinerary with OSRM (supports alternatives)
async function calculateItinerary() {
  if (!startPoint || !endPoint) {
    alert("Veuillez renseigner un point de départ et un point d'arrivée.");
    return;
  }

  const btn = document.getElementById('btn-calculate');
  btn.innerHTML = `<span class="pulse-dot" style="background:#fff"></span> Calcul en cours...`;
  btn.disabled = true;

  try {
    // Construct coordinate list: start ; [waypoints] ; end
    const points = [startPoint.coords];
    currentWaypoints.forEach(w => {
      if (w.coords) points.push(w.coords);
    });
    points.push(endPoint.coords);

    const coordsStr = points.map(p => `${p[0]},${p[1]}`).join(';');
    const url = `https://router.project-osrm.org/route/v1/driving/${coordsStr}?overview=full&geometries=geojson&alternatives=3&steps=true`;

    const res = await fetch(url);
    const data = await res.json();

    if (!data.routes || data.routes.length === 0) {
      alert("Aucun itinéraire routier trouvé.");
      return;
    }

    alternativeRoutes = data.routes;
    selectRoute(0);
    renderRouteAlternatives();

    // Update and auto-collapse itinerary summary on mobile
    const startLbl = document.getElementById('sum-start-label');
    const endLbl = document.getElementById('sum-end-label');
    const metaLbl = document.getElementById('sum-route-meta');
    if (startLbl && startPoint) startLbl.textContent = startPoint.label.split(',')[0].trim();
    if (endLbl && endPoint) endLbl.textContent = endPoint.label.split(',')[0].trim();
    if (metaLbl && data.routes[0]) {
      const dist = (data.routes[0].distance / 1000).toFixed(0);
      metaLbl.textContent = `• ${dist} km`;
    }
    if (window.innerWidth <= 1080) {
      document.body.classList.add('mobile-route-collapsed');
      const btnToggle = document.getElementById('btn-toggle-route-edit');
      if (btnToggle) btnToggle.innerHTML = '<span>✏️</span> Modifier';
    }
  } catch (err) {
    console.error("Erreur calcul d'itinéraire:", err);
    alert("Impossible de joindre le serveur d'itinéraire. Veuillez réessayer.");
  } finally {
    btn.innerHTML = `<span>🚀</span> Calculer l'itinéraire`;
    btn.disabled = false;
  }
}

// Render Alternative Route Cards (like Waze)
function renderRouteAlternatives() {
  const container = document.getElementById('routes-container');
  if (alternativeRoutes.length <= 1) {
    container.style.display = 'none';
    return;
  }

  container.style.display = 'flex';
  container.innerHTML = '';

  alternativeRoutes.forEach((route, idx) => {
    const distKm = (route.distance / 1000).toFixed(0);
    const hours = Math.floor(route.duration / 3600);
    const mins = Math.round((route.duration % 3600) / 60);
    const timeStr = hours > 0 ? `${hours}h ${mins}min` : `${mins} min`;
    const summary = route.legs.map(l => l.summary).filter(Boolean).join(', ') || `Option ${idx + 1}`;

    const card = document.createElement('div');
    card.className = `route-card ${idx === 0 ? 'active' : ''}`;
    card.innerHTML = `
      <div class="route-card-header">
        <span class="route-badge">${idx === 0 ? 'Recommandé' : 'Alternative ' + (idx + 1)}</span>
        <span class="route-stats">${timeStr} • ${distKm} km</span>
      </div>
      <div class="route-desc">${summary}</div>
    `;

    card.addEventListener('click', () => {
      document.querySelectorAll('.route-card').forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      selectRoute(idx);
    });

    container.appendChild(card);
  });
}

// Select an active route and compute stations along it
function selectRoute(routeIndex) {
  activeRouteData = alternativeRoutes[routeIndex];
  drawRoutesOnMap(routeIndex);
  processStationsOnRoute(activeRouteData);
}

// Draw the routes on Leaflet (active in vibrant cyan, alternatives in semi-transparent)
function drawRoutesOnMap(activeIdx) {
  // Clear old route polylines
  routeLayers.forEach(l => map.removeLayer(l));
  routeLayers = [];

  // Draw alternative routes first (behind)
  alternativeRoutes.forEach((route, idx) => {
    if (idx === activeIdx) return;
    const latlngs = route.geometry.coordinates.map(c => [c[1], c[0]]);

    const polyline = L.polyline(latlngs, {
      color: '#64748b',
      weight: 5,
      opacity: 0.6,
      dashArray: '6, 8',
      lineJoin: 'round'
    }).addTo(map);

    polyline.on('click', () => {
      selectRoute(idx);
      document.querySelectorAll('.route-card').forEach((c, ci) => {
        c.classList.toggle('active', ci === idx);
      });
    });

    routeLayers.push(polyline);
  });

  // Draw active route with high-contrast outline (like Waze)
  if (alternativeRoutes[activeIdx]) {
    const latlngs = alternativeRoutes[activeIdx].geometry.coordinates.map(c => [c[1], c[0]]);

    // Outline
    const outline = L.polyline(latlngs, {
      color: '#0f172a',
      weight: 8,
      opacity: 0.8,
      lineJoin: 'round'
    }).addTo(map);
    routeLayers.push(outline);

    // Main line
    const mainLine = L.polyline(latlngs, {
      color: '#0284c7',
      weight: 5,
      opacity: 0.95,
      lineJoin: 'round'
    }).addTo(map);
    routeLayers.push(mainLine);

    map.fitBounds(mainLine.getBounds(), { padding: [40, 40] });
  }
}

// Haversine formula
function getDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371.0;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Project a point onto a line segment and return distance & projected progress
function distPointToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;

  if (lenSq === 0) {
    return { dist: getDistanceKm(py, px, y1, x1), t: 0 };
  }

  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));

  const projX = x1 + t * dx;
  const projY = y1 + t * dy;
  const dist = getDistanceKm(py, px, projY, projX);

  return { dist, t };
}

// Find all highway stations along the route, ordered chronologically
let currentRouteStations = [];

function processStationsOnRoute(route) {
  const coords = route.geometry.coordinates; // [[lon, lat], ...]

  // Pre-calculate cumulative distance along the route polyline
  const cumDist = [0];
  let totalKm = 0;
  for (let i = 1; i < coords.length; i++) {
    const d = getDistanceKm(coords[i-1][1], coords[i-1][0], coords[i][1], coords[i][0]);
    totalKm += d;
    cumDist.push(totalKm);
  }

  // Route bounding box for fast pre-filtering
  let minLon = 180, maxLon = -180, minLat = 90, maxLat = -90;
  coords.forEach(c => {
    if (c[0] < minLon) minLon = c[0];
    if (c[0] > maxLon) maxLon = c[0];
    if (c[1] < minLat) minLat = c[1];
    if (c[1] > maxLat) maxLat = c[1];
  });
  const bboxPad = 0.03; // ~3 km margin

  const matched = [];

  allStations.forEach(s => {
    // Fast bbox check
    if (s.lon < minLon - bboxPad || s.lon > maxLon + bboxPad ||
        s.lat < minLat - bboxPad || s.lat > maxLat + bboxPad) {
      return;
    }

    // Find nearest point on route polyline
    let minDist = 99999;
    let bestKmOnRoute = 0;

    for (let i = 0; i < coords.length - 1; i++) {
      const p1 = coords[i];
      const p2 = coords[i+1];
      const res = distPointToSegment(s.lon, s.lat, p1[0], p1[1], p2[0], p2[1]);
      if (res.dist < minDist) {
        minDist = res.dist;
        const segLen = cumDist[i+1] - cumDist[i];
        bestKmOnRoute = cumDist[i] + res.t * segLen;
      }
    }

    if (minDist <= maxDistanceKm) {
      // Station is along this highway route!
      // Compute highway Point Kilométrique (PK)
      let displayedPk = s.pk_text;
      if (!displayedPk) {
        // If station doesn't have an explicit text PK, use highway progression
        displayedPk = Math.round(bestKmOnRoute);
      }

      matched.push({
        ...s,
        distOnRoute: bestKmOnRoute,
        displayedPk: displayedPk,
        minDistToAxisM: Math.round(minDist * 1000)
      });
    }
  });

  currentRouteStations = matched;
  renderCurrentRouteStations();
}

// Render stations in sidebar and on map
function renderCurrentRouteStations() {
  // Clear map markers
  stationMarkers.forEach(m => map.removeLayer(m));
  stationMarkers = [];

  // Filter by brand
  let filtered = currentRouteStations;
  if (selectedBrand !== 'all') {
    filtered = filtered.filter(s => s.enseigne === selectedBrand);
  }

  // Find lowest price for selected fuel among candidate stations
  let lowestPrice = 999;
  if (selectedFuel !== 'all') {
    filtered.forEach(s => {
      const p = getFuelPrice(s.prix, selectedFuel);
      if (p && p < lowestPrice) lowestPrice = p;
    });
  }

  // Sort stations
  if (currentSort === 'route') {
    filtered.sort((a, b) => a.distOnRoute - b.distOnRoute);
  } else if (currentSort === 'price') {
    filtered.sort((a, b) => {
      const pa = getFuelPrice(a.prix, selectedFuel) || 999;
      const pb = getFuelPrice(b.prix, selectedFuel) || 999;
      return pa - pb;
    });
  } else if (currentSort === 'dist') {
    filtered.sort((a, b) => a.distOnRoute - b.distOnRoute);
  }

  // Update counter
  const countLabel = document.getElementById('stations-count-label');
  if (countLabel) {
    countLabel.textContent = `${filtered.length} station${filtered.length > 1 ? 's' : ''} sur le trajet`;
  }

  const mobileBadge = document.getElementById('mobile-badge-count');
  if (mobileBadge) {
    mobileBadge.textContent = filtered.length;
  }
  const hdrBadge = document.getElementById('hdr-badge-count');
  if (hdrBadge) {
    hdrBadge.textContent = filtered.length;
  }

  const listContainer = document.getElementById('stations-list');
  listContainer.innerHTML = '';

  if (filtered.length === 0) {
    listContainer.innerHTML = `
      <div style="text-align:center; padding: 40px 20px; color: var(--text-muted);">
        <p style="font-size: 2rem; margin-bottom: 8px;">⛽</p>
        <p>Aucune station d'autoroute trouvée avec ces critères.</p>
        <p style="font-size:0.8rem; margin-top:4px;">Essayez de sélectionner "Toutes les enseignes" ou un autre carburant.</p>
      </div>
    `;
    return;
  }

  // Render cards and map markers
  filtered.forEach((st, idx) => {
    const fuelPrice = (selectedFuel !== 'all') ? getFuelPrice(st.prix, selectedFuel) : (st.prix ? Object.values(st.prix)[0] : null);
    const isCheapest = fuelPrice && fuelPrice === lowestPrice;
    const brandClass = getBrandClass(st.enseigne);

    // Create Map Marker Pin
    const pinHtml = `
      <div class="custom-station-pin ${isCheapest ? 'cheapest' : ''}" id="pin-${st.id}">
        <span class="brand-badge ${brandClass}" style="padding:1px 4px; font-size:0.65rem;">${st.enseigne.substring(0, 5)}</span>
        <span>${fuelPrice ? fuelPrice.toFixed(3) + '€' : 'N/D'}</span>
      </div>
    `;

    const customIcon = L.divIcon({
      html: pinHtml,
      className: 'station-div-icon',
      iconSize: [80, 26],
      iconAnchor: [40, 13]
    });

    const marker = L.marker([st.lat, st.lon], { icon: customIcon }).addTo(map);

    // Popup content
    const flag = st.pays === 'ES' ? '🇪🇸' : '🇫🇷';
    const popupContent = `
      <div class="station-popup">
        <div class="popup-title"><span class="flag-icon">${flag}</span> ${st.enseigne} - ${st.nom}</div>
        <div class="popup-pk">📍 ${st.autoroute || 'Autoroute'} • Borne km ${st.displayedPk}</div>
        <div style="font-size:0.8rem; color:#cbd5e1; margin-bottom:6px;">${st.adresse} (${st.ville})</div>
        <div style="font-size:0.75rem; color:#38bdf8; margin-bottom:8px;">Sens : ${st.sens || 'Sens direct'} • À ${st.distOnRoute.toFixed(0)} km du départ</div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:4px; font-size:0.8rem;">
          ${renderPopupPrices(st.prix, selectedFuel)}
        </div>
      </div>
    `;
    marker.bindPopup(popupContent);
    stationMarkers.push(marker);

    // Create Sidebar Card
    const card = document.createElement('div');
    card.className = `station-card ${isCheapest ? 'highlighted' : ''}`;
    card.id = `card-${st.id}`;

    card.innerHTML = `
      ${isCheapest ? `<div class="best-price-ribbon">⭐ PRIX LE PLUS BAS</div>` : ''}
      <div class="card-top">
        <div style="display:flex; align-items:center;">
          <span class="station-rank">#${idx + 1}</span>
          <span class="flag-icon">${flag}</span>
          <span class="brand-badge ${brandClass}">${st.enseigne}</span>
        </div>
        <span class="pk-marker-badge">
          🛣️ ${st.autoroute || 'Autoroute'} • Borne km ${st.displayedPk}
        </span>
      </div>

      <div class="station-name">${st.nom}</div>
      <div class="station-details">
        <span class="distance-countdown">⏱️ À ${st.distOnRoute.toFixed(1)} km du départ</span>
        ${st.sens ? `<span class="sens-tag">${st.sens}</span>` : ''}
        <span>• ${st.ville}</span>
      </div>

      <div class="prices-container">
        ${renderCardPrices(st.prix, selectedFuel, isCheapest)}
      </div>

      ${st.ruptures && st.ruptures.length > 0 ? `
        <div>
          <span class="rupture-badge">⚠️ Rupture : ${st.ruptures.join(', ')}</span>
        </div>
      ` : ''}
    `;

    // Click card to zoom map to station
    card.addEventListener('click', () => {
      document.querySelectorAll('.station-card').forEach(c => c.classList.remove('highlighted'));
      card.classList.add('highlighted');
      
      // On mobile, switch back to map view automatically
      if (window.innerWidth <= 900) {
        setMobileView('map');
      }

      map.setView([st.lat, st.lon], 14, { animate: true });
      marker.openPopup();
    });

    listContainer.appendChild(card);
  });
}

// Render fuel prices inside card
function renderCardPrices(prices, featuredFuel, isCheapest) {
  if (!prices || Object.keys(prices).length === 0) {
    return `
      <div class="prices-single-row">
        <span class="single-fuel-label"><span class="fuel-icon">⛽</span><span class="fuel-name">Prix</span></span>
        <span class="price-val-unavail">Non communiqués</span>
      </div>
    `;
  }

  // When a specific fuel is filtered (default behavior: e10/sp95, gazole, sp98, etc.)
  if (featuredFuel && featuredFuel !== 'all') {
    const p = getFuelPrice(prices, featuredFuel);
    const fuelName = FUEL_LABELS[featuredFuel] || featuredFuel.toUpperCase();

    if (p && p > 0) {
      return `
        <div class="prices-single-row ${isCheapest ? 'cheapest' : 'featured'}">
          <div class="single-fuel-label">
            <span class="fuel-icon">⛽</span>
            <span class="fuel-name">${fuelName}</span>
          </div>
          <div class="single-fuel-price">
            <span class="price-val-large ${isCheapest ? 'cheapest' : ''}">${p.toFixed(3)} €</span>
          </div>
        </div>
      `;
    } else {
      return `
        <div class="prices-single-row unavailable">
          <div class="single-fuel-label">
            <span class="fuel-icon">⛽</span>
            <span class="fuel-name">${fuelName}</span>
          </div>
          <div class="single-fuel-price">
            <span class="price-val-unavail">⚠️ Non disponible</span>
          </div>
        </div>
      `;
    }
  }

  // If "Tous les carburants" (all) is selected, render standard multi-fuel grid
  const fuels = ['gazole', 'e10', 'sp98', 'sp95', 'e85', 'gplc'];
  let html = '<div class="prices-grid">';
  fuels.forEach(f => {
    if (prices[f]) {
      html += `
        <div class="price-item">
          <span class="price-name">${FUEL_LABELS[f]}</span>
          <span class="price-val">${prices[f].toFixed(3)} €</span>
        </div>
      `;
    }
  });
  html += '</div>';
  return html;
}

// Render prices in marker popup
function renderPopupPrices(prices, featuredFuel) {
  if (!prices) return '<span>Aucun prix disponible</span>';
  if (featuredFuel && featuredFuel !== 'all') {
    const p = getFuelPrice(prices, featuredFuel);
    const fuelName = FUEL_LABELS[featuredFuel] || featuredFuel.toUpperCase();
    if (p && p > 0) {
      return `
        <div style="grid-column: span 2; background: rgba(16, 185, 129, 0.15); border: 1.5px solid #10b981; padding: 6px 12px; border-radius: 8px; display:flex; justify-content:space-between; align-items:center;">
          <span style="color: #a7f3d0; font-size: 0.85rem; font-weight: 700;">⛽ ${fuelName}</span>
          <b style="color: #ffffff; font-size: 1.15rem; font-family: monospace;">${p.toFixed(3)} €</b>
        </div>
      `;
    } else {
      return `
        <div style="grid-column: span 2; background: rgba(239, 68, 68, 0.15); border: 1px solid #ef4444; padding: 6px 10px; border-radius: 6px; text-align:center; color:#fca5a5; font-size:0.8rem;">
          ⛽ ${fuelName} : Non disponible
        </div>
      `;
    }
  }
  return Object.keys(prices).map(f => `
    <div style="background:rgba(255,255,255,0.06); padding:3px 6px; border-radius:4px;">
      <span style="color:#94a3b8; font-size:0.7rem;">${FUEL_LABELS[f] || f}:</span>
      <b style="color:#fff;">${prices[f].toFixed(3)} €</b>
    </div>
  `).join('');
}

// Helper for brand badge CSS class
function getBrandClass(brand) {
  const b = (brand || '').toLowerCase();
  if (b.includes('total')) return 'badge-total';
  if (b.includes('shell')) return 'badge-shell';
  if (b.includes('avia')) return 'badge-avia';
  if (b.includes('esso')) return 'badge-esso';
  if (b.includes('eni')) return 'badge-eni';
  if (b.includes('leclerc')) return 'badge-leclerc';
  if (b.includes('bp')) return 'badge-bp';
  if (b.includes('fulli')) return 'badge-fulli';
  if (b.includes('repsol')) return 'badge-repsol';
  if (b.includes('cepsa')) return 'badge-cepsa';
  if (b.includes('galp')) return 'badge-galp';
  if (b.includes('petronor')) return 'badge-petronor';
  return 'badge-default';
}

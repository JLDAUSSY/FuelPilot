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

// Helper to format proper nouns / names with correct French & Spanish title casing
function formatProperName(text) {
  if (!text) return '';
  let t = String(text).trim();
  if (t.toLowerCase().startsWith('aide de')) t = 'Aire de' + t.substring(7);
  t = t.replace(/^aut(?:oroute)?\.?\s*([a-z0-9]+)\s*-\s*aire\s+de\s+(.*)/i, (m, g1, g2) => `${g1.toUpperCase()} - Aire de ${g2}`);
  t = t.replace(/^aut(?:oroute)?\s+([a-z])\s*(\d+)$/i, (m, g1, g2) => `Autoroute ${g1.toUpperCase()}${g2}`);
  t = t.replace(/^aut(?:oroute)?\s+([a-z])\s*(\d+)\s*[-:]?\s*(?:aire\s+)?(.*)/i, (m, g1, g2, g3) => `${g1.toUpperCase()}${g2} - Aire de ${g3}`);
  t = t.replace(/\bAire\s+de\s+([AEIOUYÀ-ÿ][a-zÀ-ÿ]+)/i, "Aire d'$1");

  const lowerWords = new Set([
    'de', 'du', 'des', 'en', 'sur', 'sous', 'et', 'au', 'aux', 'a', 'à', 'par', 'vers',
    'la', 'le', 'les', 'del', 'los', 'las', 'd', 'l', 'y',
    'di', 'della', 'delle', 'dei', 'degli', 'al', 'alla', 'alle', 'ai', 'agli',
    'sul', 'sulla', 'sulle', 'sui', 'sugli', 'da', 'in', 'con', 'per', 'tra', 'fra'
  ]);
  const acronyms = new Set([
    'rn', 'rd', 'cd', 'pk', 'km', 'bp', 'es', 'eni', 'q8', 'f6', 'cora', 'ip',
    'a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8', 'a9', 'a10', 'a11', 'a12', 'a13',
    'a14', 'a15', 'a16', 'a19', 'a20', 'a21', 'a22', 'a23', 'a24', 'a25', 'a26', 'a28',
    'a29', 'a30', 'a31', 'a32', 'a33', 'a34', 'a35', 'a36', 'a39', 'a40', 'a41', 'a42',
    'a43', 'a48', 'a50', 'a51', 'a52', 'a55', 'a56', 'a57', 'a61', 'a62', 'a63', 'a64',
    'a65', 'a71', 'a72', 'a75', 'a77', 'a81', 'a83', 'a84', 'a85', 'a86', 'a87', 'a89',
    't1', 't2', 't3', 't4', 'n104', 'rn104', 'rd104', 'cd419'
  ]);
  const accents = {
    'Macon': 'Mâcon',
    'Chatellerault': 'Châtellerault',
    'Vallee': 'Vallée',
    'Eloi': 'Éloi',
    'Beziers': 'Béziers',
    'Broceliande': 'Brocéliande',
    'Aerodrome': 'Aérodrome',
    'Peripherique': 'Périphérique',
    'Exterieur': 'Extérieur',
    'Interieur': 'Intérieur',
    'Chambery': 'Chambéry',
    'Mediterranee': 'Méditerranée',
    'Cote': 'Côté',
    'Etoile': 'Étoile',
    'Foret': 'Forêt',
    'Leman': 'Léman',
    'Epernay': 'Épernay',
    'Nimes': 'Nîmes',
    'Pyrenees': 'Pyrénées',
    'Etienne': 'Étienne',
    'Cevennes': 'Cévennes'
  };

  const parts = t.split(/([ \t\-\/\',.:()]+)/);
  let isStart = true;
  const res = [];

  for (const tok of parts) {
    if (!tok) continue;
    if (/^[ \t\-\/\',.:()]+$/.test(tok)) {
      res.push(tok);
      if (/[\-\/\':(]/.test(tok)) isStart = true;
      continue;
    }
    const low = tok.toLowerCase();
    let formatted;
    if (/^(a|rn|rd|cd|n|d|ss|sr|sp|ra|t)\d+[a-z]?$/i.test(low) || acronyms.has(low)) {
      formatted = low.toUpperCase();
    } else if (lowerWords.has(low) && !isStart) {
      formatted = low;
    } else if (low === 'ste') {
      formatted = 'Sainte';
    } else if (low === 'st') {
      formatted = 'Saint';
    } else {
      formatted = tok.charAt(0).toUpperCase() + tok.slice(1).toLowerCase();
      if (accents[formatted]) formatted = accents[formatted];
    }
    res.push(formatted);
    isStart = false;
  }

  let out = res.join('');
  out = out.replace(/\b([dDlL])\s*'\s*/g, "$1'");
  out = out.replace(/\b(Saint|Sainte)\s+([A-ZÀ-ÿ])/g, "$1-$2");
  out = out.replace(/d'\s+/gi, "d'").replace(/l'\s+/gi, "l'");
  if (out.startsWith("De ")) out = "De " + out.slice(3);
  return out;
}

// Global Mobile View Switcher
function setMobileView(view) {
  const btnMap = document.getElementById('btn-tab-map');
  const btnList = document.getElementById('btn-tab-list');
  const mapBar = document.getElementById('map-routes-bar');

  if (view === 'map') {
    document.body.classList.remove('mobile-view-list');
    document.body.classList.add('mobile-view-map');
    if (btnMap) btnMap.classList.add('active');
    if (btnList) btnList.classList.remove('active');
    if (mapBar && alternativeRoutes && alternativeRoutes.length > 1) {
      mapBar.style.display = 'flex';
      mapBar.style.position = 'fixed';
      mapBar.style.bottom = 'calc(82px + env(safe-area-inset-bottom, 0px))';
      mapBar.style.zIndex = '1950';
    }
    setTimeout(() => {
      if (map) {
        map.invalidateSize();
        // If no station popup is actively open, re-fit to show the entire route & stations
        if (!map._popup || !map._popup.isOpen()) {
          fitMapToRouteAndStations();
        }
      }
    }, 150);
  } else {
    document.body.classList.remove('mobile-view-map');
    document.body.classList.add('mobile-view-list');
    if (btnList) btnList.classList.add('active');
    if (btnMap) btnMap.classList.remove('active');
    if (mapBar) {
      mapBar.style.display = 'none';
    }
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

  const startInput = document.getElementById('input-start');
  const endInput = document.getElementById('input-end');

  setupAutocomplete('input-start', 'dropdown-start', (coords, label) => {
    startPoint = { coords, label };
    if (startInput) startInput.classList.remove('input-attention-pulse');
  });
  setupAutocomplete('input-end', 'dropdown-end', (coords, label) => {
    endPoint = { coords, label };
    if (endInput) endInput.classList.remove('input-attention-pulse');
  });

  if (startInput) {
    startInput.addEventListener('input', () => {
      if (startInput.value.trim().length > 0) {
        startInput.classList.remove('input-attention-pulse');
      }
    });
  }
  if (endInput) {
    endInput.addEventListener('input', () => {
      if (endInput.value.trim().length > 0) {
        endInput.classList.remove('input-attention-pulse');
      }
    });
  }

  setupEventListeners();
  await loadStationsData();
  await loadCoveredCountries();
});

// Initialize Leaflet Map
function initMap() {
  // Center to encompass France, Spain & Italy coverage
  const initialZoom = window.innerWidth <= 768 ? 4.8 : 5.2;
  map = L.map('map', {
    zoomControl: false
  }).setView([43.5, 4.5], initialZoom);

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

let coveredCountriesLayer = null;

// Load covered countries boundary overlay (France & Spain)
async function loadCoveredCountries() {
  try {
    const res = await fetch('pays_couverts.json');
    if (!res.ok) return;
    const geojsonData = await res.json();

    coveredCountriesLayer = L.geoJSON(geojsonData, {
      style: () => ({
        color: '#0284c7',        // Cyan-blue border
        weight: 2,               // Border width
        opacity: 0.85,
        fillColor: '#0ea5e9',    // Sky blue fill
        fillOpacity: 0.08,       // Subtle translucency
        dashArray: '6, 6'        // Dashed border for country limit
      }),
      onEachFeature: (feature, layer) => {
        const p = feature.properties;
        layer.bindTooltip(
          `<div style="font-weight:800; font-size:0.88rem; color:#fff;">${p.flag} ${p.name}</div><div style="font-size:0.75rem; color:#38bdf8;">${p.stationsCount} aires répertoriées • Prix en direct</div>`,
          { sticky: true, className: 'country-coverage-tooltip' }
        );
        layer.on({
          mouseover: () => {
            layer.setStyle({
              fillOpacity: 0.18,
              weight: 3,
              color: '#38bdf8'
            });
          },
          mouseout: () => {
            if (coveredCountriesLayer) coveredCountriesLayer.resetStyle(layer);
          }
        });
      }
    }).addTo(map);

    coveredCountriesLayer.bringToBack();

    // Central Country Badges (France, Spain & Italy)
    const countryLabels = [
      { coords: [46.6, 2.5], flag: '🇫🇷', name: 'France', count: '438 aires' },
      { coords: [40.2, -3.6], flag: '🇪🇸', name: 'Espagne', count: '833 aires' },
      { coords: [42.6, 12.8], flag: '🇮🇹', name: 'Italie', count: '615 aires' }
    ];

    countryLabels.forEach(c => {
      const icon = L.divIcon({
        className: 'country-badge-marker',
        html: `<div class="country-badge-pill">${c.flag} ${c.name} <span class="country-count-tag">• ${c.count}</span></div>`,
        iconSize: [140, 26],
        iconAnchor: [70, 13]
      });
      L.marker(c.coords, { icon, interactive: false }).addTo(map);
    });
  } catch (err) {
    console.warn('Erreur chargement pays couverts:', err);
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
              const formattedName = formatProperName(itemData.cleanName);
              input.value = formattedName;
              dropdown.style.display = 'none';
              onSelect(itemData.coords, formattedName);
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
  const initialView = urlParams.get('view') === 'map' ? 'map' : 'list';
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
      fuelSelect.classList.remove('input-attention-pulse');
      renderCurrentRouteStations();
    });
  }

  // Fuel pills fallback
  document.querySelectorAll('.fuel-pill').forEach(pill => {
    pill.addEventListener('click', (e) => {
      document.querySelectorAll('.fuel-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      selectedFuel = pill.dataset.fuel;
      if (fuelSelect) {
        fuelSelect.value = selectedFuel;
        fuelSelect.classList.remove('input-attention-pulse');
      }
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
    const fuelSel = document.getElementById('select-fuel');
    if (fuelSel) fuelSel.classList.remove('input-attention-pulse');
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
  const formattedStart = formatProperName(startLabel);
  const formattedEnd = formatProperName(endLabel);
  const inStart = document.getElementById('input-depart') || document.getElementById('input-start');
  if (inStart) {
    inStart.value = formattedStart;
    inStart.classList.remove('input-attention-pulse');
  }
  startPoint = { coords: startCoords, label: formattedStart };

  const inEnd = document.getElementById('input-arrivee') || document.getElementById('input-end');
  if (inEnd) {
    inEnd.value = formattedEnd;
    inEnd.classList.remove('input-attention-pulse');
  }
  endPoint = { coords: endCoords, label: formattedEnd };

  const fuelSel = document.getElementById('select-fuel');
  if (fuelSel) fuelSel.classList.remove('input-attention-pulse');

  currentWaypoints = [];
  const wpContainer = document.getElementById('waypoints-container');
  if (wpContainer) wpContainer.innerHTML = '';

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
    if (startLbl && startPoint) startLbl.textContent = formatProperName(startPoint.label.split(',')[0].trim());
    if (endLbl && endPoint) endLbl.textContent = formatProperName(endPoint.label.split(',')[0].trim());
    if (metaLbl && data.routes[0]) {
      const dist = (data.routes[0].distance / 1000).toFixed(0);
      metaLbl.textContent = `• ${dist} km`;
    }
    if (window.innerWidth <= 1080) {
      document.body.classList.add('mobile-route-collapsed');
      const btnToggle = document.getElementById('btn-toggle-route-edit');
      if (btnToggle) btnToggle.innerHTML = '<span>✏️</span> Modifier';
      // Switch to map view to display full route overview and stations
      setMobileView('map');
    }
  } catch (err) {
    console.error("Erreur calcul d'itinéraire:", err);
    alert("Impossible de joindre le serveur d'itinéraire. Veuillez réessayer.");
  } finally {
    btn.innerHTML = `<span>🚀</span> Calculer l'itinéraire`;
    btn.disabled = false;
  }
}

// Extract human-readable summary of highways and regions from OSRM steps
function getSmartRouteSummary(route) {
  const highways = [];
  const seen = new Set();
  const legs = route.legs || [];

  legs.forEach(leg => {
    (leg.steps || []).forEach(step => {
      const ref = (step.ref || '').trim();
      const name = (step.name || '').trim();
      if (ref) {
        const cleanRef = ref.split(';')[0].replace(/\s+/g, '').toUpperCase();
        if (!seen.has(cleanRef) && /^(A\d+|T\d+|AP\d+|SS\d+)/i.test(cleanRef)) {
          highways.push(cleanRef);
          seen.add(cleanRef);
        }
      } else if (name && !ref && /autoroute|autostrada/i.test(name) && !seen.has(name)) {
        const shortName = name.split('-')[0].trim();
        highways.push(shortName);
        seen.add(name);
      }
    });
  });

  const coords = route.geometry?.coordinates || [];
  const isSwiss = coords.some(c => c[0] >= 7.5 && c[0] <= 9.0 && c[1] >= 46.0 && c[1] <= 47.5);
  const isChamonix = coords.some(c => c[0] >= 6.0 && c[0] <= 7.2 && c[1] >= 45.8 && c[1] <= 46.2);

  const hwStr = highways.slice(0, 2).join(', ');
  const viaCountry = isSwiss ? 'Suisse' : (isChamonix ? 'France' : '');
  const parts = [hwStr, viaCountry].filter(Boolean);
  return parts.length > 0 ? 'via ' + parts.join(' • ') : (route.legs?.[0]?.summary ? 'via ' + route.legs[0].summary : 'Itinéraire direct');
}

// Render Alternative Route Selectors (both in sidebar/list & floating on the map)
function renderRouteAlternatives() {
  const container = document.getElementById('routes-container');
  const mapBar = document.getElementById('map-routes-bar');

  if (alternativeRoutes.length <= 1) {
    if (container) container.style.display = 'none';
    if (mapBar) mapBar.style.display = 'none';
    return;
  }

  // 1. Sidebar Container (Mode Liste)
  if (container) {
    container.style.display = 'flex';
    container.innerHTML = '';
  }

  // 2. Floating Map Bar (Mode Carte)
  if (mapBar) {
    mapBar.style.display = 'flex';
    mapBar.innerHTML = '';
    if (window.innerWidth <= 1080) {
      mapBar.style.position = 'fixed';
      mapBar.style.bottom = 'calc(82px + env(safe-area-inset-bottom, 0px))';
      mapBar.style.zIndex = '1950';
    } else {
      mapBar.style.position = '';
      mapBar.style.bottom = '';
      mapBar.style.zIndex = '';
    }
  }

  const baseDuration = alternativeRoutes[0]?.duration || 0;

  alternativeRoutes.forEach((route, idx) => {
    const distKm = (route.distance / 1000).toFixed(0);
    const hours = Math.floor(route.duration / 3600);
    const mins = Math.round((route.duration % 3600) / 60);
    const timeStr = hours > 0 ? `${hours}h ${mins}min` : `${mins} min`;
    const summary = getSmartRouteSummary(route);

    const diffMins = Math.round((route.duration - baseDuration) / 60);
    const diffStr = idx > 0 && diffMins > 0 ? `+${diffMins} min` : (idx > 0 && diffMins < 0 ? `${diffMins} min` : '');

    // A. Card in Sidebar
    if (container) {
      const card = document.createElement('div');
      const cardColorClass = idx === 0 ? 'route-card-blue' : 'route-card-orange';
      card.className = `route-card ${cardColorClass} ${idx === 0 ? 'active' : ''}`;
      card.id = `route-card-${idx}`;
      card.innerHTML = `
        <div class="route-card-header">
          <span class="route-badge ${idx === 0 ? 'badge-blue' : 'badge-orange'}">${idx === 0 ? '🔵 Recommandé' : '🟠 Option ' + (idx + 1)}</span>
          <span class="route-stats">${timeStr} ${diffStr ? `<span class="time-diff">(${diffStr})</span>` : ''} • ${distKm} km</span>
        </div>
        <div class="route-desc">${summary}</div>
      `;
      card.addEventListener('click', () => selectRoute(idx));
      container.appendChild(card);
    }

    // B. Floating Button on Map
    if (mapBar) {
      const btn = document.createElement('div');
      const btnColorClass = idx === 0 ? 'map-route-btn-blue' : 'map-route-btn-orange';
      btn.className = `map-route-btn ${btnColorClass} ${idx === 0 ? 'active' : ''}`;
      btn.id = `map-route-btn-${idx}`;
      btn.innerHTML = `
        <div class="map-route-btn-header">
          <span class="map-route-badge ${idx === 0 ? 'badge-blue' : 'badge-orange'}">${idx === 0 ? '🔵 Recommandé' : '🟠 Option ' + (idx + 1)}</span>
          <span class="map-route-time">${timeStr} ${diffStr ? `<span class="map-route-time-diff">${diffStr}</span>` : ''}</span>
        </div>
        <div class="map-route-meta">${distKm} km • ${summary}</div>
      `;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        selectRoute(idx);
      });
      mapBar.appendChild(btn);
    }
  });
}

// Select an active route and compute stations along it
function selectRoute(routeIndex) {
  activeRouteData = alternativeRoutes[routeIndex];

  // Update active state in sidebar cards and map floating pills
  document.querySelectorAll('.route-card').forEach((c, idx) => {
    c.classList.toggle('active', idx === routeIndex);
  });
  document.querySelectorAll('.map-route-btn').forEach((b, idx) => {
    b.classList.toggle('active', idx === routeIndex);
  });

  // Redraw map with prominent contrast for active vs alternative routes
  drawRoutesOnMap(routeIndex);

  // Re-match stations along the selected route
  processStationsOnRoute(activeRouteData);

  // Update summary bar metadata
  const metaLbl = document.getElementById('sum-route-meta');
  if (metaLbl && activeRouteData) {
    const dist = (activeRouteData.distance / 1000).toFixed(0);
    metaLbl.textContent = `• ${dist} km`;
  }
}

// Draw the routes on Leaflet (active in vibrant cyan, alternatives in glowing neon orange with clickable badges)
function drawRoutesOnMap(activeIdx) {
  // Clear old route polylines and markers
  routeLayers.forEach(l => map.removeLayer(l));
  routeLayers = [];

  // Draw alternative routes first (behind active route)
  alternativeRoutes.forEach((route, idx) => {
    if (idx === activeIdx) return;
    const latlngs = route.geometry.coordinates.map(c => [c[1], c[0]]);

    // 1. Glowing Sunset Orange Aura
    const altAura = L.polyline(latlngs, {
      color: '#ff6600',
      weight: 16,
      opacity: 0.35,
      lineJoin: 'round'
    }).addTo(map);

    // 2. High-contrast dark outline
    const altOutline = L.polyline(latlngs, {
      color: '#090d16',
      weight: 11,
      opacity: 0.95,
      lineJoin: 'round'
    }).addTo(map);

    // 3. Ultra-vibrant Neon Sunset Orange line (solid, thick, 100% visible)
    const altPolyline = L.polyline(latlngs, {
      color: '#ff6600',
      weight: 7,
      opacity: 1.0,
      lineJoin: 'round'
    }).addTo(map);

    const onAltClick = () => {
      selectRoute(idx);
    };

    altAura.on('click', onAltClick);
    altOutline.on('click', onAltClick);
    altPolyline.on('click', onAltClick);

    routeLayers.push(altAura);
    routeLayers.push(altOutline);
    routeLayers.push(altPolyline);

    // 4. Interactive Clickable Marker Pill placed at the maximum deviation point from the active route
    if (latlngs.length > 10) {
      const hours = Math.floor(route.duration / 3600);
      const mins = Math.round((route.duration % 3600) / 60);
      const timeStr = hours > 0 ? `${hours}h ${mins}min` : `${mins} min`;
      const distKm = (route.distance / 1000).toFixed(0);

      const diffSec = route.duration - (alternativeRoutes[activeIdx]?.duration || 0);
      const diffMins = Math.round(diffSec / 60);
      const diffText = diffMins > 0 ? `+${diffMins} min` : (diffMins < 0 ? `${diffMins} min` : '');

      // Find the optimal point along the first half of the alternative route
      // Prioritize points with high deviation from active route and good eastern clearance
      let bestPoint = latlngs[Math.floor(latlngs.length * 0.15)];
      const activeCoords = alternativeRoutes[activeIdx]?.geometry?.coordinates || [];
      if (activeCoords.length > 0) {
        const stepActive = Math.max(1, Math.floor(activeCoords.length / 80));
        const activeSample = [];
        for (let i = 0; i < activeCoords.length; i += stepActive) {
          activeSample.push([activeCoords[i][1], activeCoords[i][0]]);
        }

        let maxScore = -1;
        const startIdx = Math.floor(latlngs.length * 0.10);
        const endIdx = Math.floor(latlngs.length * 0.45);
        const stepAlt = Math.max(1, Math.floor((endIdx - startIdx) / 40));

        for (let i = startIdx; i < endIdx; i += stepAlt) {
          const pt = latlngs[i];
          let minDistToActive = Infinity;
          for (let j = 0; j < activeSample.length; j++) {
            const dLat = pt[0] - activeSample[j][0];
            const dLng = pt[1] - activeSample[j][1];
            const d2 = dLat * dLat + dLng * dLng;
            if (d2 < minDistToActive) {
              minDistToActive = d2;
            }
          }
          // Score balances route deviation while preferring mid latitudes for clean layout
          const score = minDistToActive * (1 + (pt[0] > 46.8 ? 0.4 : 0));
          if (score > maxScore) {
            maxScore = score;
            bestPoint = pt;
          }
        }
      }

      // Smart inward anchor: if the point is in the western half of the route bounds, float east;
      // if in the eastern half, float west. This guarantees zero edge clipping on mobile screens!
      let centerLng = 7.5;
      try {
        if (map && map.getBounds && map.getBounds().isValid()) {
          centerLng = map.getBounds().getCenter().lng;
        }
      } catch (e) {}
      const isWest = bestPoint[1] < centerLng;
      const anchorX = isWest ? -6 : 206;

      const altBadgeIcon = L.divIcon({
        className: 'route-midpoint-marker',
        html: `<div class="route-midpoint-pill" title="Cliquer pour choisir cet itinéraire">
          <span class="route-midpoint-tag">Option ${idx + 1}</span>
          <span class="route-midpoint-text">${timeStr} ${diffText ? `<span class="pill-diff">(${diffText})</span>` : ''}</span>
        </div>`,
        iconSize: [200, 32],
        iconAnchor: [anchorX, 16]
      });

      const altMarker = L.marker(bestPoint, { icon: altBadgeIcon, zIndexOffset: 1200 }).addTo(map);
      altMarker.on('click', onAltClick);
      routeLayers.push(altMarker);
    }
  });

  // Draw active route with high-contrast outline (like Waze)
  if (alternativeRoutes[activeIdx]) {
    const latlngs = alternativeRoutes[activeIdx].geometry.coordinates.map(c => [c[1], c[0]]);

    // Outline
    const outline = L.polyline(latlngs, {
      color: '#090d16',
      weight: 12,
      opacity: 0.9,
      lineJoin: 'round'
    }).addTo(map);
    routeLayers.push(outline);

    // Main line (vibrant cyan)
    const mainLine = L.polyline(latlngs, {
      color: '#0284c7',
      weight: 7.5,
      opacity: 1.0,
      lineJoin: 'round'
    }).addTo(map);
    routeLayers.push(mainLine);

    fitMapToRouteAndStations();
  }
}

// Fit map to show the entire route, alternative routes, departure, arrival, and all stations along it
function fitMapToRouteAndStations() {
  if (!map) return;

  const bounds = L.latLngBounds();

  // Include all routes (active + alternatives) so the whole comparison is visible on screen
  if (alternativeRoutes && alternativeRoutes.length > 0) {
    alternativeRoutes.forEach(r => {
      (r.geometry?.coordinates || []).forEach(c => bounds.extend([c[1], c[0]]));
    });
  } else if (activeRouteData && activeRouteData.geometry && activeRouteData.geometry.coordinates) {
    activeRouteData.geometry.coordinates.forEach(c => bounds.extend([c[1], c[0]]));
  } else if (startPoint && startPoint.coords && endPoint && endPoint.coords) {
    bounds.extend([startPoint.coords[1], startPoint.coords[0]]);
    bounds.extend([endPoint.coords[1], endPoint.coords[0]]);
  }

  // Also include all station coordinates
  if (currentRouteStations && currentRouteStations.length > 0) {
    currentRouteStations.forEach(st => {
      if (st.lat && st.lon) bounds.extend([st.lat, st.lon]);
    });
  }

  if (bounds.isValid()) {
    const isMobile = window.innerWidth <= 1080;
    const paddingOptions = isMobile
      ? { paddingTopLeft: [45, 25], paddingBottomRight: [25, 135], maxZoom: 15, animate: false }
      : { padding: [50, 50], maxZoom: 15, animate: false };

    map.fitBounds(bounds, paddingOptions);
    if (coveredCountriesLayer) coveredCountriesLayer.bringToBack();
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

// Project a point onto a line segment and return distance, progress t, and signed cross product
function distPointToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;

  if (lenSq === 0) {
    return { dist: getDistanceKm(py, px, y1, x1), t: 0, cross: 0 };
  }

  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));

  const projX = x1 + t * dx;
  const projY = y1 + t * dy;
  const dist = getDistanceKm(py, px, projY, projX);
  // Signed 2D cross product: dx*(py - y1) - dy*(px - x1)
  // cross < 0 -> Station is on the RIGHT side (driver's lane in France/Spain)
  // cross > 0 -> Station is on the LEFT side (opposing highway carriageway / sens inverse)
  const cross = dx * (py - y1) - dy * (px - x1);

  return { dist, t, cross };
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
    let bestCross = 0;

    for (let i = 0; i < coords.length - 1; i++) {
      const p1 = coords[i];
      const p2 = coords[i+1];
      const res = distPointToSegment(s.lon, s.lat, p1[0], p1[1], p2[0], p2[1]);
      if (res.dist < minDist) {
        minDist = res.dist;
        const segLen = cumDist[i+1] - cumDist[i];
        bestKmOnRoute = cumDist[i] + res.t * segLen;
        bestCross = res.cross;
      }
    }

    if (minDist <= maxDistanceKm) {
      // Directional check: in France/Spain, vehicles drive on the right.
      // Highway stations accessible in the direction of travel are on the RIGHT (bestCross < 0).
      // Stations on the opposite carriageway (bestCross >= 0) are excluded,
      // unless explicitly marked as bidirectional ("Double sens").
      const isDoubleSens = s.sens && s.sens.toLowerCase().includes('double');
      const isRightSide = bestCross < 0;

      if (!isRightSide && !isDoubleSens) {
        // Exclude twin station on opposing carriageway
        return;
      }

      // Station is along this highway route in the driver's direction of travel!
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
  fitMapToRouteAndStations();
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
    const flag = st.pays === 'ES' ? '🇪🇸' : (st.pays === 'IT' ? '🇮🇹' : '🇫🇷');
    const nomFormatted = formatProperName(st.nom);
    const villeFormatted = formatProperName(st.ville);
    const sensFormatted = st.sens ? formatProperName(st.sens) : '';
    const cleanPk = String(st.displayedPk || '').replace(/^km\s*/i, '').trim();

    const popupContent = `
      <div class="station-popup">
        <div class="popup-title"><span class="flag-icon">${flag}</span> ${st.enseigne} - ${nomFormatted}</div>
        <div class="popup-pk">📍 ${st.autoroute || 'Autoroute'} • Borne km ${cleanPk}</div>
        <div style="font-size:0.8rem; color:#cbd5e1; margin-bottom:6px;">${formatProperName(st.adresse)} (${villeFormatted})</div>
        <div style="font-size:0.75rem; color:#38bdf8; margin-bottom:8px;">Sens : ${sensFormatted || 'Sens direct'} • À ${st.distOnRoute.toFixed(0)} km du départ</div>
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
        <div class="card-top-right">
          <div class="station-logo-badge" title="${st.enseigne}">
            ${getBrandLogoSvg(st.enseigne)}
          </div>
          <span class="pk-marker-badge">
            🛣️ ${st.autoroute || 'Autoroute'} • Borne km ${cleanPk}
          </span>
        </div>
      </div>

      <div class="station-name">${nomFormatted}</div>
      <div class="station-details">
        <span class="distance-countdown">⏱️ À ${st.distOnRoute.toFixed(1)} km du départ</span>
        ${sensFormatted ? `<span class="sens-tag">${sensFormatted}</span>` : ''}
        <span>• ${villeFormatted}</span>
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
  if (b.includes('ip') || b.includes('api')) return 'badge-ip';
  if (b.includes('q8')) return 'badge-q8';
  if (b.includes('tamoil')) return 'badge-tamoil';
  if (b.includes('sarni')) return 'badge-sarni';
  return 'badge-default';
}

// Return official brand logo SVG badge
function getBrandLogoSvg(brand) {
  const b = (brand || '').toLowerCase().trim();

  // TotalEnergies
  if (b.includes('total')) {
    return `<svg viewBox="40 -85 480 480" class="brand-svg" xmlns="http://www.w3.org/2000/svg">
      <rect x="40" y="-85" width="480" height="480" rx="90" fill="#ffffff"/>
      <defs>
        <linearGradient id="teGrad1" x1="130.8" y1="29.7" x2="245" y2="153.7" gradientUnits="userSpaceOnUse"><stop style="stop-color:#0186f5" offset="0"/><stop style="stop-color:#35c2b0" offset="0.3"/><stop style="stop-color:#aad825" offset="0.67"/><stop style="stop-color:#fed700" offset="1"/></linearGradient>
        <linearGradient id="teGrad2" x1="133.8" y1="10.3" x2="260" y2="12.7" gradientUnits="userSpaceOnUse"><stop style="stop-color:#0186f5" offset="0"/><stop style="stop-color:#3156fd" offset="1"/></linearGradient>
        <linearGradient id="teGrad3" x1="266.8" y1="57.7" x2="278.5" y2="34.8" gradientUnits="userSpaceOnUse"><stop style="stop-color:#8434d5" offset="0"/><stop style="stop-color:#3156fd" offset="1"/></linearGradient>
        <linearGradient id="teGrad4" x1="253.9" y1="70.5" x2="157.1" y2="75.1" gradientUnits="userSpaceOnUse"><stop style="stop-color:#8434d5" offset="0"/><stop style="stop-color:#fe0201" offset="1"/></linearGradient>
        <linearGradient id="teGrad5" x1="37" y1="162.2" x2="38" y2="84.3" gradientUnits="userSpaceOnUse"><stop style="stop-color:#ff7f00" offset="0"/><stop style="stop-color:#fe0201" offset="1"/></linearGradient>
      </defs>
      <g transform="translate(179.4, 96.4)">
        <path style="fill:url(#teGrad1);stroke:none;" d="M 124.96,-5.78 C 111.3,5.1 98.2,19.5 90.6,35.28 74.98,67.68 83.64,97.47 90.34,116.8 c 9.12,26.32 27.58,39.61 49.6,49.31 31.38,13.84 70.83,14.77 106.64,5.52 12.63,-3.26 32.23,-10.04 36.51,-16.36 4.63,-6.85 5.36,-20.1 -4.59,-25.91 -9.71,-5.67 -10.65,-1.34 -39.56,5.08 -20.12,4.47 -42.09,5.24 -68.47,-6.15 -26.65,-11.58 -37.91,-22.61 -41.76,-37.68 -11.03,-43.22 12.81,-59.25 17.46,-62.18 Z" />
        <path style="fill:url(#teGrad5);stroke:none;" d="M 157.84,45.11 C 145.42,43.46 108.98,39.6 70.85,32.83 11.84,22.37 -57.53,7.85 -79.67,6.3 c -42.62,-2.98 -49.73,52.39 -15.7,61.86 19.27,5.36 72.3,-0.27 85.18,25.18 3.93,7.75 14.32,36.98 26.08,73.17 4.61,14.19 42.12,11.96 35.15,-18.27 -4.09,-17.27 -13.16,-63.9 -13.16,-63.9 0,0 107.59,11.41 116.35,12.17 z" />
        <path style="fill:url(#teGrad2);stroke:none;" d="m 214.5,16.63 c 13.66,0.36 37.44,3.87 48.14,11.03 l 59.71,11.77 c 0.57,-33.14 -17.61,-50.97 -37.97,-61.25 -15.46,-7.8 -37.15,-14.16 -69.69,-12.77 -31.12,1.33 -63.84,8.15 -89.94,28.94 l 31.19,38.68 c 14.72,-9.27 33.21,-17.07 58.56,-16.4 z" />
        <path style="fill:url(#teGrad3);stroke:none;" d="m 261.69,27.06 c 0,0 3.15,2.01 4.51,3.26 6.5,5.94 8.66,13.04 -11.07,16.3 l 15.6,48.25 c 35.5,-9.51 51.17,-30.46 51.61,-56.04 z" />
        <path style="fill:url(#teGrad4);stroke:none;" d="m 255.72,46.54 c -17.49,2.89 -51.4,4.76 -98.14,-1.43 l -3.52,51.4 c 75.92,6.57 102.61,2.09 117.26,-1.84 z" />
      </g>
    </svg>`;
  }

  // Shell
  if (b.includes('shell')) {
    return `<svg viewBox="0 0 100 100" class="brand-svg" xmlns="http://www.w3.org/2000/svg">
      <rect width="100" height="100" rx="18" fill="#ffde00"/>
      <path d="M22 75 L32 82 L68 82 L78 75 L86 52 L82 32 L68 20 L50 16 L32 20 L18 32 L14 52 Z" fill="#dd1d21"/>
      <path d="M26 72 L34 78 L66 78 L74 72 L81 51 L77 34 L65 24 L50 20 L35 24 L23 34 L19 51 Z" fill="#ffde00"/>
      <path d="M50 20 L50 78 M36 24 L43 78 M64 24 L57 78 M24 34 L35 78 M76 34 L65 78" stroke="#dd1d21" stroke-width="3.5" stroke-linecap="round"/>
    </svg>`;
  }

  // BP
  if (b.includes('bp')) {
    return `<svg viewBox="0 0 100 100" class="brand-svg" xmlns="http://www.w3.org/2000/svg">
      <rect width="100" height="100" rx="18" fill="#ffffff"/>
      <circle cx="50" cy="46" r="32" fill="#008837"/>
      <circle cx="50" cy="46" r="24" fill="#8bc53f"/>
      <circle cx="50" cy="46" r="16" fill="#fff200"/>
      <circle cx="50" cy="46" r="8" fill="#ffffff"/>
      <text x="50" y="89" font-family="'Plus Jakarta Sans', Arial, sans-serif" font-weight="900" font-size="17" fill="#008837" text-anchor="middle" letter-spacing="-0.5">bp</text>
    </svg>`;
  }

  // Esso
  if (b.includes('esso')) {
    return `<svg viewBox="0 0 100 100" class="brand-svg" xmlns="http://www.w3.org/2000/svg">
      <rect width="100" height="100" rx="18" fill="#003399"/>
      <ellipse cx="50" cy="50" rx="44" ry="26" fill="#ffffff" stroke="#003399" stroke-width="3"/>
      <text x="50" y="58" font-family="'Plus Jakarta Sans', Arial, sans-serif" font-weight="900" font-size="26" fill="#ed1c24" text-anchor="middle" letter-spacing="-1">Esso</text>
    </svg>`;
  }

  // Repsol
  if (b.includes('repsol')) {
    return `<svg viewBox="0 0 100 100" class="brand-svg" xmlns="http://www.w3.org/2000/svg">
      <rect width="100" height="100" rx="18" fill="#0a1d37"/>
      <path d="M16 42 A34 34 0 0 1 84 42 Z" fill="#e31b23"/>
      <rect x="12" y="44" width="76" height="18" rx="2" fill="#ffffff"/>
      <text x="50" y="58" font-family="'Plus Jakarta Sans', Arial, sans-serif" font-weight="900" font-size="13" fill="#0a1d37" text-anchor="middle" letter-spacing="1">REPSOL</text>
      <path d="M16 64 A34 34 0 0 0 84 64 Z" fill="#ff7900"/>
    </svg>`;
  }

  // Avia
  if (b.includes('avia')) {
    return `<svg viewBox="0 0 100 100" class="brand-svg" xmlns="http://www.w3.org/2000/svg">
      <rect width="100" height="100" rx="18" fill="#ffffff"/>
      <circle cx="50" cy="50" r="44" fill="#d9251d"/>
      <text x="50" y="58" font-family="'Plus Jakarta Sans', Arial, sans-serif" font-weight="900" font-size="22" fill="#ffffff" text-anchor="middle" font-style="italic">AVIA</text>
      <rect x="24" y="65" width="52" height="4" rx="2" fill="#ffffff"/>
    </svg>`;
  }

  // Cepsa
  if (b.includes('cepsa')) {
    return `<svg viewBox="0 0 100 100" class="brand-svg" xmlns="http://www.w3.org/2000/svg">
      <rect width="100" height="100" rx="18" fill="#c4122d"/>
      <text x="50" y="56" font-family="'Plus Jakarta Sans', Arial, sans-serif" font-weight="900" font-size="19" fill="#ffffff" text-anchor="middle" letter-spacing="0.5">CEPSA</text>
      <circle cx="28" cy="68" r="3.5" fill="#ffffff"/>
      <circle cx="50" cy="68" r="3.5" fill="#ffffff"/>
      <circle cx="72" cy="68" r="3.5" fill="#ffffff"/>
    </svg>`;
  }

  // Moeve (New Cepsa identity)
  if (b.includes('moeve')) {
    return `<svg viewBox="0 0 100 100" class="brand-svg" xmlns="http://www.w3.org/2000/svg">
      <rect width="100" height="100" rx="18" fill="#e11d48"/>
      <text x="50" y="58" font-family="'Plus Jakarta Sans', Arial, sans-serif" font-weight="900" font-size="20" fill="#ffffff" text-anchor="middle" letter-spacing="-0.5">moeve</text>
    </svg>`;
  }

  // Eni / Agip
  if (b.includes('eni') || b.includes('agip')) {
    return `<svg viewBox="0 0 100 100" class="brand-svg" xmlns="http://www.w3.org/2000/svg">
      <rect width="100" height="100" rx="18" fill="#ffde00"/>
      <path d="M40 30 C40 24 46 22 50 22 C54 22 60 26 56 32 L70 38 L66 46 L55 42 L55 60 L49 60 L49 46 L45 52 L37 44 L44 38 Z" fill="#000000"/>
      <path d="M57 26 Q65 22 63 30 Q59 28 57 26" fill="#e31b23"/>
      <circle cx="43" cy="66" r="3" fill="#000"/>
      <circle cx="51" cy="66" r="3" fill="#000"/>
      <circle cx="59" cy="66" r="3" fill="#000"/>
      <text x="50" y="85" font-family="'Plus Jakarta Sans', Arial, sans-serif" font-weight="900" font-size="16" fill="#000000" text-anchor="middle">eni</text>
    </svg>`;
  }

  // E.Leclerc
  if (b.includes('leclerc')) {
    return `<svg viewBox="0 0 100 100" class="brand-svg" xmlns="http://www.w3.org/2000/svg">
      <rect width="100" height="100" rx="18" fill="#005696"/>
      <circle cx="64" cy="34" r="10" fill="#f38b00"/>
      <path d="M38 24 L48 24 L48 66 L68 66 L68 76 L38 76 Z" fill="#ffffff"/>
    </svg>`;
  }

  // Galp
  if (b.includes('galp')) {
    return `<svg viewBox="0 0 100 100" class="brand-svg" xmlns="http://www.w3.org/2000/svg">
      <rect width="100" height="100" rx="18" fill="#ff5900"/>
      <path d="M30 40 Q45 20 65 35 Q75 45 60 65 Q45 75 35 60 Z" fill="none" stroke="#ffffff" stroke-width="7" stroke-linecap="round"/>
      <text x="50" y="84" font-family="'Plus Jakarta Sans', Arial, sans-serif" font-weight="900" font-size="17" fill="#ffffff" text-anchor="middle">galp</text>
    </svg>`;
  }

  // Fulli
  if (b.includes('fulli')) {
    return `<svg viewBox="0 0 100 100" class="brand-svg" xmlns="http://www.w3.org/2000/svg">
      <rect width="100" height="100" rx="18" fill="#008080"/>
      <circle cx="50" cy="50" r="38" fill="#00a3a6"/>
      <text x="50" y="58" font-family="'Plus Jakarta Sans', Arial, sans-serif" font-weight="900" font-size="22" fill="#ffff00" text-anchor="middle">fulli</text>
    </svg>`;
  }

  // Dyneff
  if (b.includes('dyneff')) {
    return `<svg viewBox="0 0 100 100" class="brand-svg" xmlns="http://www.w3.org/2000/svg">
      <rect width="100" height="100" rx="18" fill="#002b66"/>
      <path d="M30 30 L50 48 L70 30" fill="none" stroke="#e31b23" stroke-width="8" stroke-linecap="round"/>
      <text x="50" y="75" font-family="'Plus Jakarta Sans', Arial, sans-serif" font-weight="900" font-size="16" fill="#ffffff" text-anchor="middle">dyneff</text>
    </svg>`;
  }

  // Petronor
  if (b.includes('petronor')) {
    return `<svg viewBox="0 0 100 100" class="brand-svg" xmlns="http://www.w3.org/2000/svg">
      <rect width="100" height="100" rx="18" fill="#004b93"/>
      <path d="M32 30 L50 45 L68 30" fill="none" stroke="#e31b23" stroke-width="7" stroke-linecap="round"/>
      <text x="50" y="73" font-family="'Plus Jakarta Sans', Arial, sans-serif" font-weight="900" font-size="14" fill="#ffffff" text-anchor="middle">petronor</text>
    </svg>`;
  }

  // IP (Gruppo API / Italiana Petroli)
  if (b.includes('ip') || b.includes('api')) {
    return `<svg viewBox="0 0 100 100" class="brand-svg" xmlns="http://www.w3.org/2000/svg">
      <rect width="100" height="100" rx="18" fill="#002b80"/>
      <circle cx="36" cy="30" r="7" fill="#ff6a00"/>
      <rect x="29" y="42" width="14" height="34" rx="4" fill="#ffffff"/>
      <rect x="52" y="42" width="14" height="42" rx="4" fill="#ffffff"/>
      <path d="M56 42 Q78 42 78 57 Q78 72 56 72 Z" fill="#ffffff"/>
      <path d="M64 51 Q70 51 70 57 Q70 63 64 63 Z" fill="#002b80"/>
    </svg>`;
  }

  // Q8 (Kuwait Petroleum)
  if (b.includes('q8')) {
    return `<svg viewBox="0 0 100 100" class="brand-svg" xmlns="http://www.w3.org/2000/svg">
      <rect width="100" height="100" rx="18" fill="#ffffff"/>
      <path d="M30 44 C32 24 45 15 52 14 C50 24 46 37 30 44 Z" fill="#003882"/>
      <path d="M52 14 C58 23 62 34 60 44 C50 44 48 29 52 14 Z" fill="#ffcc00"/>
      <path d="M59 27 C64 33 68 39 68 44 C62 44 60 37 59 27 Z" fill="#dc2626"/>
      <text x="50" y="80" text-anchor="middle" font-family="'Segoe UI', Arial, sans-serif" font-weight="900" font-size="34" fill="#003882" letter-spacing="-1">Q8</text>
    </svg>`;
  }

  // Tamoil
  if (b.includes('tamoil')) {
    return `<svg viewBox="0 0 100 100" class="brand-svg" xmlns="http://www.w3.org/2000/svg">
      <rect width="100" height="100" rx="18" fill="#dc2626"/>
      <circle cx="50" cy="40" r="22" fill="#ffffff"/>
      <circle cx="50" cy="40" r="18" fill="#003399"/>
      <path d="M40 40 L60 40 L50 25 Z" fill="#ffffff"/>
      <text x="50" y="80" text-anchor="middle" font-family="'Segoe UI', Arial, sans-serif" font-weight="900" font-size="16" fill="#ffffff" letter-spacing="1">TAMOIL</text>
    </svg>`;
  }

  // Sarni Oil
  if (b.includes('sarni')) {
    return `<svg viewBox="0 0 100 100" class="brand-svg" xmlns="http://www.w3.org/2000/svg">
      <rect width="100" height="100" rx="18" fill="#059669"/>
      <text x="50" y="48" text-anchor="middle" font-family="'Segoe UI', Arial, sans-serif" font-weight="900" font-size="20" fill="#ffffff" letter-spacing="1">SARNI</text>
      <text x="50" y="72" text-anchor="middle" font-family="'Segoe UI', Arial, sans-serif" font-weight="800" font-size="14" fill="#facc15" letter-spacing="2">OIL</text>
    </svg>`;
  }

  // Default fallback
  const initial = (brand || 'S').substring(0, 3).toUpperCase();
  return `<svg viewBox="0 0 100 100" class="brand-svg" xmlns="http://www.w3.org/2000/svg">
    <rect width="100" height="100" rx="18" fill="#1e293b" stroke="#334155" stroke-width="3"/>
    <text x="50" y="46" font-size="24" text-anchor="middle">⛽</text>
    <text x="50" y="76" font-family="'Plus Jakarta Sans', Arial, sans-serif" font-weight="900" font-size="14" fill="#38bdf8" text-anchor="middle">${initial}</text>
  </svg>`;
}

// Global window bindings for navigation and testing
window.applyPreset = applyPreset;
window.calculateItinerary = calculateItinerary;
window.setMobileView = setMobileView;
window.fitMapToRouteAndStations = fitMapToRouteAndStations;
window.getCurrentRouteStations = () => currentRouteStations;

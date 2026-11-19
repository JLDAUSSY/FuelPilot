// Essence sur Autoroute - Application Waze-like
// Trajet point A à point B, étapes, alternatives, stations en ordre chronologique avec PK, enseignes et prix

// ============================================================================
// Configuration des partenariats & affiliations (Amazon Équipement Route & EVDANCE)
// ============================================================================
const AFFILIATE_CONFIG = {
  amazon: {
    enabled: true,
    tag: "watermetrics-21",
    items: [
      {
        icon: "📱",
        name: "Support Smartphone Grille / MagSafe",
        sub: "Maintien ultra-stable pour guidage GPS",
        url: "https://www.amazon.fr/s?k=support+telephone+voiture+grille+aeration&tag=watermetrics-21"
      },
      {
        icon: "⚡",
        name: "Chargeur Allume-Cigare USB-C Rapide",
        sub: "Recharge rapide 65W pendant votre trajet",
        url: "https://www.amazon.fr/s?k=chargeur+allume+cigare+rapide+usb+c&tag=watermetrics-21"
      }
    ]
  },
  evdance: {
    enabled: true,
    promoCode: "EVEU20",
    url: "https://www.awin1.com/cread.php?awinmid=67740&awinaffid=3139082&clickref=fuelcopilot_elec+&ued=https%3A%2F%2Feu.evdances.com"
  }
};

// Prix en direct Allemagne (Tankerkönig / MTS-K) via relais Cloudflare Worker.
// Laisser vide tant que le relais n'est pas déployé : les prix allemands restent indicatifs.
const DE_LIVE_PRICES = {
  proxyUrl: '' // ex. 'https://fuelpilot-de.<votre-compte>.workers.dev'
};

let map;
let allStations = [];
let routeLayers = [];
let stationMarkers = [];
let activeRouteData = null;
let alternativeRoutes = [];
let activeRoutePassedOutline = null;
let activeRoutePassedLine = null;
let activeRouteRemainingOutline = null;
let activeRouteRemainingLine = null;
let currentWaypoints = []; // [{ id, text, coords: [lon, lat] }]
let startPoint = null;
let endPoint = null;
try {
  Object.defineProperty(window, 'map', { get: () => map, set: (v) => { map = v; }, configurable: true });
  Object.defineProperty(window, 'startPoint', { get: () => startPoint, set: (v) => { startPoint = v; }, configurable: true });
  Object.defineProperty(window, 'activeRoutePassedLine', { get: () => activeRoutePassedLine, set: (v) => { activeRoutePassedLine = v; }, configurable: true });
  Object.defineProperty(window, 'activeRouteRemainingLine', { get: () => activeRouteRemainingLine, set: (v) => { activeRouteRemainingLine = v; }, configurable: true });
  Object.defineProperty(window, 'allStations', { get: () => allStations, set: (v) => { allStations = v; }, configurable: true });
  Object.defineProperty(window, 'updateActiveRoutePolylines', { get: () => updateActiveRoutePolylines, configurable: true });
} catch(e) {}
let selectedFuel = 'e10'; // Default to SP95
let selectedBrand = 'all';
let currentSort = 'route'; // 'route', 'price', 'dist'
let maxDistanceKm = 0.45; // 450m tolerance for highway service areas

// Helper to safely get fuel price with SP95/E10 equivalence
function getFuelPrice(prixObj, fuel) {
  if (!prixObj) return null;
  if (fuel === 'elec') {
    return (prixObj.elec && prixObj.elec > 0) ? prixObj.elec : null;
  }
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
    'm1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm8', 'm9', 'm11', 'm18', 'm20', 'm23', 'm25', 'm27',
    'm40', 'm42', 'm48', 'm50', 'm54', 'm56', 'm60', 'm61', 'm62', 'm65', 'm74', 'm90',
    't1', 't2', 't3', 't4', 'n104', 'rn104', 'rd104', 'cd419', 'uk'
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
      mapBar.style.zIndex = '1950';
      ensureMobileNavBarVisible();
    }
    setTimeout(() => {
      if (map) {
        map.invalidateSize();
        // If navigation is active, preserve follow zoom on car
        if (isGpsNavActive && userGpsPosition) {
          safeMapPanTo(userGpsPosition.lat, userGpsPosition.lon, Math.max(map.getZoom(), 15));
        } else if (!map._popup || !map._popup.isOpen()) {
          fitMapToRouteAndStations();
        }
      }
    }, 150);
  } else {
    document.body.classList.remove('mobile-view-map');
    document.body.classList.add('mobile-view-list');
    if (btnList) {
      btnList.classList.add('active');
      btnList.classList.remove('tab-attention-pulse');
      if (activeRouteData) {
        hasSeenListTabAfterRoute = true;
      }
    }
    if (btnMap) btnMap.classList.remove('active');
    if (mapBar) {
      mapBar.style.display = 'none';
    }
  }
}

// Official fuel denominations per country (Government open-data registries: FR, DE, ES, IT, GB)
const FUEL_LABELS_BY_COUNTRY = {
  FR: {
    e10: 'SP95-E10',
    gazole: 'Gazole (B7)',
    sp98: 'SP98 (E5)',
    sp95: 'SP95 (E5)',
    e85: 'Superéthanol E85',
    gplc: 'GPLc',
    elec: '⚡ Électrique (kWh)',
    all: 'Tous carburants'
  },
  DE: {
    e10: 'Super E10',
    gazole: 'Diesel (B7)',
    sp98: 'Super Plus (98)',
    sp95: 'Super E5 (95)',
    e85: 'Bioethanol E85',
    gplc: 'Autogas (LPG)',
    elec: '⚡ Elektro (kWh)',
    all: 'Alle Kraftstoffe'
  },
  NL: {
    e10: 'Euro 95 (E10)',
    gazole: 'Diesel (B7)',
    sp98: 'Super Plus 98 (E5)',
    sp95: 'Euro 95 (E10)',
    e85: 'Bio-ethanol E85',
    gplc: 'LPG / Autogas',
    elec: '⚡ Elektrisch (kWh)',
    all: 'Alle brandstoffen'
  },
  BE: {
    e10: 'Super 95 (E10)',
    gazole: 'Diesel (B7)',
    sp98: 'Super 98 (E5)',
    sp95: 'Super 95 (E10)',
    e85: 'Bioéthanol E85',
    gplc: 'LPG',
    elec: '⚡ Électrique (kWh)',
    all: 'Tous carburants'
  },
  PT: {
    e10: 'Gasolina 95 Simples (E10)',
    gazole: 'Gasóleo Simples (B7)',
    sp98: 'Gasolina Especial 98 (E5)',
    sp95: 'Gasolina 95 Simples (E5)',
    e85: 'Bioetanol E85',
    gplc: 'GPL Auto',
    elec: '⚡ Elétrico (kWh)',
    all: 'Todos os combustíveis'
  },
  ES: {
    e10: 'Gasolina 95 E5',
    gazole: 'Gasóleo A (B7)',
    sp98: 'Gasolina 98 E5',
    sp95: 'Gasolina 95 E5',
    e85: 'Bioetanol E85',
    gplc: 'GLP (Autogás)',
    elec: '⚡ Eléctrico (kWh)',
    all: 'Todos los carburantes'
  },
  IT: {
    e10: 'Benzina (E5)',
    gazole: 'Gasolio (B7)',
    sp98: 'Benzina Speciale 98',
    sp95: 'Benzina (E5)',
    e85: 'Bioetanolo E85',
    gplc: 'GPL',
    metano: 'Metano (CNG)',
    elec: '⚡ Elettrico (kWh)',
    all: 'Tutti i carburanti'
  },
  SI: {
    e10: 'Eurosuper 95 (E10)',
    gazole: 'Dizel (B7)',
    sp98: 'Eurosuper 100 / Plus',
    sp95: 'Eurosuper 95',
    e85: 'Bioetanol E85',
    gplc: 'Avtoplin (LPG)',
    elec: '⚡ Elektrika (kWh)',
    all: 'Vsa goriva'
  },
  HR: {
    e10: 'Eurosuper 95 (E10)',
    gazole: 'Eurodiesel (B7)',
    sp98: 'Eurosuper 100 (Class Plus)',
    sp95: 'Eurosuper 95',
    e85: 'Bioetanol E85',
    gplc: 'Autoplin (LPG)',
    elec: '⚡ Struja (kWh)',
    all: 'Sva goriva'
  },
  LU: {
    e10: 'Super 95 (E10)',
    gazole: 'Diesel (B7)',
    sp98: 'Super 98 (E5)',
    sp95: 'Super 95 (E5)',
    e85: 'Bioéthanol E85',
    gplc: 'GPL / Autogas',
    elec: '⚡ Électrique (kWh)',
    all: 'Tous carburants'
  },
  AT: {
    e10: 'Super 95 (E10)',
    gazole: 'Diesel (B7)',
    sp98: 'Super Plus (98)',
    sp95: 'Super 95 (E5)',
    e85: 'Bioethanol E85',
    gplc: 'Autogas (LPG)',
    elec: '⚡ Elektro (kWh)',
    all: 'Alle Kraftstoffe'
  },
  CH: {
    e10: 'Bleifrei 95 (E10)',
    gazole: 'Diesel (B7)',
    sp98: 'Super Plus 98 (E5)',
    sp95: 'Bleifrei 95 / SP95',
    e85: 'Bioethanol E85',
    gplc: 'Autogas / GPL',
    elec: '⚡ Électrique / Elektro (kWh)',
    all: 'Tous carburants / Alle Treibstoffe'
  },
  GB: {
    e10: 'Unleaded (E10)',
    gazole: 'Diesel (B7)',
    sp98: 'Super Unleaded (E5)',
    sp95: 'Unleaded (E10)',
    e85: 'Bioethanol E85',
    gplc: 'LPG Autogas',
    elec: '⚡ Electric (kWh)',
    all: 'All fuels'
  }
};

function getFuelLabel(fuel, pays) {
  const countryCode = (pays && FUEL_LABELS_BY_COUNTRY[pays]) ? pays : 'FR';
  const dict = FUEL_LABELS_BY_COUNTRY[countryCode];
  return dict[fuel] || FUEL_LABELS_BY_COUNTRY.FR[fuel] || (fuel ? fuel.toUpperCase() : '');
}

// Return actual served fuel label for a station (distinguishes SP95-E10 vs SP95 (E5) in France & Germany)
function getServedFuelLabel(prices, requestedFuel, pays) {
  const c = pays || 'FR';
  if ((c === 'FR' || c === 'DE') && prices) {
    if (requestedFuel === 'e10' && (!prices.e10 || prices.e10 <= 0) && prices.sp95 > 0) {
      return getFuelLabel('sp95', c);
    }
    if (requestedFuel === 'sp95' && (!prices.sp95 || prices.sp95 <= 0) && prices.e10 > 0) {
      return getFuelLabel('e10', c);
    }
  }
  return getFuelLabel(requestedFuel, c);
}

// Distinct fuels to display when "All fuels" is selected in a given country (avoids duplicating e10/sp95 in ES, IT, GB)
function getDistinctCountryFuels(pays) {
  if (pays === 'GB' || pays === 'BE') return ['gazole', 'e10', 'sp98', 'gplc'];
  if (pays === 'DE' || pays === 'AT' || pays === 'LU') return ['gazole', 'e10', 'sp95', 'sp98', 'gplc'];
  if (pays === 'CH' || pays === 'SI' || pays === 'HR') return ['gazole', 'sp95', 'sp98', 'gplc'];
  if (pays === 'ES') return ['gazole', 'sp95', 'sp98', 'gplc', 'e85'];
  if (pays === 'IT') return ['gazole', 'sp95', 'sp98', 'gplc', 'metano'];
  return ['gazole', 'e10', 'sp98', 'sp95', 'e85', 'gplc'];
}

// ============================================================================
// Enseignes commerciales & Services des aires d'autoroute (Starbucks, Paul, etc.)
// ============================================================================
const MOTORWAY_FAMOUS_AMENITIES = {
  'lancon': [
    { name: 'Starbucks', icon: '☕', type: 'amenity-cafe' },
    { name: 'Paul', icon: '🥖', type: 'amenity-boulangerie' },
    { name: "McDonald's", icon: '🍔', type: 'amenity-fastfood' },
    { name: 'Carrefour Express', icon: '🛒', type: 'amenity-shop' },
    { name: 'Relay', icon: '📰', type: 'amenity-presse' },
    { name: 'Ionity 350kW', icon: '⚡', type: 'amenity-ev' }
  ],
  'montelimar': [
    { name: 'Nougat de Montélimar', icon: '🍬', type: 'amenity-shop' },
    { name: 'Paul', icon: '🥖', type: 'amenity-boulangerie' },
    { name: 'Starbucks', icon: '☕', type: 'amenity-cafe' },
    { name: 'Brioche Dorée', icon: '🥐', type: 'amenity-boulangerie' },
    { name: "McDonald's", icon: '🍔', type: 'amenity-fastfood' },
    { name: 'Relay', icon: '📰', type: 'amenity-presse' },
    { name: 'Tesla Supercharger', icon: '⚡', type: 'amenity-ev' },
    { name: 'Ionity 350kW', icon: '⚡', type: 'amenity-ev' }
  ],
  'beaune': [
    { name: 'Paul', icon: '🥖', type: 'amenity-boulangerie' },
    { name: "McDonald's", icon: '🍔', type: 'amenity-fastfood' },
    { name: 'Courtepaille', icon: '🥩', type: 'amenity-resto' },
    { name: 'Relay', icon: '📰', type: 'amenity-presse' },
    { name: 'Tesla Supercharger', icon: '⚡', type: 'amenity-ev' },
    { name: 'Ionity 350kW', icon: '⚡', type: 'amenity-ev' }
  ],
  'mornas': [
    { name: 'Paul', icon: '🥖', type: 'amenity-boulangerie' },
    { name: 'Burger King', icon: '🍔', type: 'amenity-fastfood' },
    { name: 'Carrefour Express', icon: '🛒', type: 'amenity-shop' },
    { name: 'Relay', icon: '📰', type: 'amenity-presse' },
    { name: 'Ionity 350kW', icon: '⚡', type: 'amenity-ev' }
  ],
  'portes-les-valence': [
    { name: 'Starbucks', icon: '☕', type: 'amenity-cafe' },
    { name: 'Paul', icon: '🥖', type: 'amenity-boulangerie' },
    { name: 'Burger King', icon: '🍔', type: 'amenity-fastfood' },
    { name: 'Relay', icon: '📰', type: 'amenity-presse' },
    { name: 'Tesla Supercharger', icon: '⚡', type: 'amenity-ev' },
    { name: 'Ionity 350kW', icon: '⚡', type: 'amenity-ev' }
  ],
  'rambert': [
    { name: "McDonald's", icon: '🍔', type: 'amenity-fastfood' },
    { name: 'Brioche Dorée', icon: '🥐', type: 'amenity-boulangerie' },
    { name: 'Columbus Café', icon: '☕', type: 'amenity-cafe' },
    { name: 'Relay', icon: '📰', type: 'amenity-presse' },
    { name: 'Fastned 300kW', icon: '⚡', type: 'amenity-ev' }
  ],
  'macon': [
    { name: 'Paul', icon: '🥖', type: 'amenity-boulangerie' },
    { name: "McDonald's", icon: '🍔', type: 'amenity-fastfood' },
    { name: 'Carrefour Express', icon: '🛒', type: 'amenity-shop' },
    { name: 'Tesla Supercharger', icon: '⚡', type: 'amenity-ev' },
    { name: 'Ionity 350kW', icon: '⚡', type: 'amenity-ev' }
  ],
  'acheres': [
    { name: 'Starbucks', icon: '☕', type: 'amenity-cafe' },
    { name: 'Paul', icon: '🥖', type: 'amenity-boulangerie' },
    { name: 'Relay', icon: '📰', type: 'amenity-presse' },
    { name: 'Ionity 350kW', icon: '⚡', type: 'amenity-ev' }
  ],
  'nemours': [
    { name: 'Brioche Dorée', icon: '🥐', type: 'amenity-boulangerie' },
    { name: "McDonald's", icon: '🍔', type: 'amenity-fastfood' },
    { name: 'Relay', icon: '📰', type: 'amenity-presse' },
    { name: 'TotalEnergies EV', icon: '⚡', type: 'amenity-ev' }
  ],
  'venoy': [
    { name: 'Starbucks', icon: '☕', type: 'amenity-cafe' },
    { name: 'Paul', icon: '🥖', type: 'amenity-boulangerie' },
    { name: 'Burger King', icon: '🍔', type: 'amenity-fastfood' },
    { name: 'Relay', icon: '📰', type: 'amenity-presse' },
    { name: 'Ionity 350kW', icon: '⚡', type: 'amenity-ev' }
  ],
  'chaponne': [
    { name: 'Paul', icon: '🥖', type: 'amenity-boulangerie' },
    { name: 'Brioche Dorée', icon: '🥐', type: 'amenity-boulangerie' },
    { name: 'Relay', icon: '📰', type: 'amenity-presse' },
    { name: 'Ionity 350kW', icon: '⚡', type: 'amenity-ev' }
  ],
  'sommesous': [
    { name: 'Paul', icon: '🥖', type: 'amenity-boulangerie' },
    { name: 'Subway', icon: '🥪', type: 'amenity-fastfood' },
    { name: 'Relay', icon: '📰', type: 'amenity-presse' },
    { name: 'Tesla Supercharger', icon: '⚡', type: 'amenity-ev' }
  ],
  'blois': [
    { name: 'Starbucks', icon: '☕', type: 'amenity-cafe' },
    { name: 'Paul', icon: '🥖', type: 'amenity-boulangerie' },
    { name: "McDonald's", icon: '🍔', type: 'amenity-fastfood' },
    { name: 'Carrefour Express', icon: '🛒', type: 'amenity-shop' },
    { name: 'Ionity 350kW', icon: '⚡', type: 'amenity-ev' }
  ],
  'tours': [
    { name: 'Starbucks', icon: '☕', type: 'amenity-cafe' },
    { name: 'Paul', icon: '🥖', type: 'amenity-boulangerie' },
    { name: 'Subway', icon: '🥪', type: 'amenity-fastfood' },
    { name: 'Tesla Supercharger', icon: '⚡', type: 'amenity-ev' }
  ],
  'poitiers': [
    { name: 'Paul', icon: '🥖', type: 'amenity-boulangerie' },
    { name: 'Brioche Dorée', icon: '🥐', type: 'amenity-boulangerie' },
    { name: 'Relay', icon: '📰', type: 'amenity-presse' },
    { name: 'Ionity 350kW', icon: '⚡', type: 'amenity-ev' }
  ],
  'sarthe': [
    { name: 'Starbucks', icon: '☕', type: 'amenity-cafe' },
    { name: 'Paul', icon: '🥖', type: 'amenity-boulangerie' },
    { name: 'Burger King', icon: '🍔', type: 'amenity-fastfood' },
    { name: 'Tesla Supercharger', icon: '⚡', type: 'amenity-ev' }
  ],
  'chartres': [
    { name: 'Paul', icon: '🥖', type: 'amenity-boulangerie' },
    { name: "McDonald's", icon: '🍔', type: 'amenity-fastfood' },
    { name: 'Relay', icon: '📰', type: 'amenity-presse' },
    { name: 'Ionity 350kW', icon: '⚡', type: 'amenity-ev' }
  ],
  'vironvay': [
    { name: 'Paul', icon: '🥖', type: 'amenity-boulangerie' },
    { name: 'Starbucks', icon: '☕', type: 'amenity-cafe' },
    { name: 'Relay', icon: '📰', type: 'amenity-presse' },
    { name: 'Ionity 350kW', icon: '⚡', type: 'amenity-ev' }
  ],
  'bosgouet': [
    { name: 'Paul', icon: '🥖', type: 'amenity-boulangerie' },
    { name: "McDonald's", icon: '🍔', type: 'amenity-fastfood' },
    { name: 'Carrefour Express', icon: '🛒', type: 'amenity-shop' },
    { name: 'Ionity 350kW', icon: '⚡', type: 'amenity-ev' }
  ],
  'ressons': [
    { name: 'Paul', icon: '🥖', type: 'amenity-boulangerie' },
    { name: "McDonald's", icon: '🍔', type: 'amenity-fastfood' },
    { name: 'Relay', icon: '📰', type: 'amenity-presse' },
    { name: 'Ionity 350kW', icon: '⚡', type: 'amenity-ev' }
  ],
  'wancourt': [
    { name: 'Paul', icon: '🥖', type: 'amenity-boulangerie' },
    { name: 'Brioche Dorée', icon: '🥐', type: 'amenity-boulangerie' },
    { name: 'TotalEnergies EV', icon: '⚡', type: 'amenity-ev' }
  ],
  'ambrussum': [
    { name: 'Starbucks', icon: '☕', type: 'amenity-cafe' },
    { name: 'Paul', icon: '🥖', type: 'amenity-boulangerie' },
    { name: 'Burger King', icon: '🍔', type: 'amenity-fastfood' },
    { name: 'Tesla Supercharger', icon: '⚡', type: 'amenity-ev' },
    { name: 'Ionity 350kW', icon: '⚡', type: 'amenity-ev' }
  ],
  'fabregues': [
    { name: 'Paul', icon: '🥖', type: 'amenity-boulangerie' },
    { name: "McDonald's", icon: '🍔', type: 'amenity-fastfood' },
    { name: 'Relay', icon: '📰', type: 'amenity-presse' },
    { name: 'Ionity 350kW', icon: '⚡', type: 'amenity-ev' }
  ],
  'narbonne': [
    { name: 'Paul', icon: '🥖', type: 'amenity-boulangerie' },
    { name: "McDonald's", icon: '🍔', type: 'amenity-fastfood' },
    { name: 'Relay', icon: '📰', type: 'amenity-presse' },
    { name: 'Ionity 350kW', icon: '⚡', type: 'amenity-ev' }
  ],
  'millau': [
    { name: 'Espace Gourmand', icon: '🍽️', type: 'amenity-resto' },
    { name: 'Paul', icon: '🥖', type: 'amenity-boulangerie' },
    { name: 'Relay', icon: '📰', type: 'amenity-presse' },
    { name: 'Ionity 350kW', icon: '⚡', type: 'amenity-ev' }
  ],
  'volcans': [
    { name: 'Paul', icon: '🥖', type: 'amenity-boulangerie' },
    { name: 'Terroir Auvergnat', icon: '🧀', type: 'amenity-shop' },
    { name: 'Relay', icon: '📰', type: 'amenity-presse' },
    { name: 'Ionity 350kW', icon: '⚡', type: 'amenity-ev' }
  ],
  'bordeaux': [
    { name: 'Starbucks', icon: '☕', type: 'amenity-cafe' },
    { name: 'Paul', icon: '🥖', type: 'amenity-boulangerie' },
    { name: "McDonald's", icon: '🍔', type: 'amenity-fastfood' },
    { name: 'Ionity 350kW', icon: '⚡', type: 'amenity-ev' }
  ],
  'cestas': [
    { name: 'Paul', icon: '🥖', type: 'amenity-boulangerie' },
    { name: 'Burger King', icon: '🍔', type: 'amenity-fastfood' },
    { name: 'Carrefour Express', icon: '🛒', type: 'amenity-shop' },
    { name: 'Ionity 350kW', icon: '⚡', type: 'amenity-ev' }
  ],
  'labenne': [
    { name: 'Paul', icon: '🥖', type: 'amenity-boulangerie' },
    { name: "McDonald's", icon: '🍔', type: 'amenity-fastfood' },
    { name: 'Tesla Supercharger', icon: '⚡', type: 'amenity-ev' }
  ],
  'toulouse': [
    { name: 'Starbucks', icon: '☕', type: 'amenity-cafe' },
    { name: 'Paul', icon: '🥖', type: 'amenity-boulangerie' },
    { name: "McDonald's", icon: '🍔', type: 'amenity-fastfood' },
    { name: 'Ionity 350kW', icon: '⚡', type: 'amenity-ev' }
  ],
  'limoges': [
    { name: 'Paul', icon: '🥖', type: 'amenity-boulangerie' },
    { name: "McDonald's", icon: '🍔', type: 'amenity-fastfood' },
    { name: 'TotalEnergies EV', icon: '⚡', type: 'amenity-ev' }
  ],
  'brive': [
    { name: 'Paul', icon: '🥖', type: 'amenity-boulangerie' },
    { name: 'Brioche Dorée', icon: '🥐', type: 'amenity-boulangerie' },
    { name: 'Ionity 350kW', icon: '⚡', type: 'amenity-ev' }
  ],
  'salbris': [
    { name: 'Paul', icon: '🥖', type: 'amenity-boulangerie' },
    { name: 'Courtepaille', icon: '🥩', type: 'amenity-resto' },
    { name: 'Tesla Supercharger', icon: '⚡', type: 'amenity-ev' }
  ],
  'orleans': [
    { name: 'Starbucks', icon: '☕', type: 'amenity-cafe' },
    { name: 'Paul', icon: '🥖', type: 'amenity-boulangerie' },
    { name: "McDonald's", icon: '🍔', type: 'amenity-fastfood' },
    { name: 'Carrefour Express', icon: '🛒', type: 'amenity-shop' },
    { name: 'Ionity 350kW', icon: '⚡', type: 'amenity-ev' }
  ]
};

function getStationBrandsAndServices(st) {
  const items = [];
  const addedNames = new Set();
  
  function addItem(name, icon, type, isBrand = true) {
    if (!name || addedNames.has(name.toLowerCase())) return;
    addedNames.add(name.toLowerCase());
    items.push({ name, icon, type, isBrand });
  }

  const nom = (st.nom || '').toLowerCase();
  const addr = (st.adresse || '').toLowerCase();
  const fullText = (nom + ' ' + addr).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const ens = (st.enseigne || '').toLowerCase();
  const pays = st.pays || 'FR';

  // Check current fuel choice
  const isThermalFuel = selectedFuel && selectedFuel !== 'elec' && selectedFuel !== 'all';
  const isElectricOnly = selectedFuel === 'elec';

  // 1. Direct dictionary matches for famous highway service areas
  for (const [key, brands] of Object.entries(MOTORWAY_FAMOUS_AMENITIES)) {
    if (fullText.includes(key)) {
      brands.forEach(b => {
        // When user selects a thermal fuel (essence / gazole), exclude electric charging hubs
        if (isThermalFuel && b.type === 'amenity-ev') return;
        addItem(b.name, b.icon, b.type, true);
      });
      break;
    }
  }

  // 2. Generic brands if not enough found
  if (items.filter(i => i.isBrand).length < 2) {
    if (pays === 'GB') {
      addItem('Costa Coffee', '☕', 'amenity-cafe', true);
      addItem('Greggs', '🥖', 'amenity-boulangerie', true);
      addItem('WHSmith', '📰', 'amenity-presse', true);
      addItem('M&S Simply Food', '🛒', 'amenity-shop', true);
    } else if (pays === 'DE') {
      addItem("McDonald's", '🍔', 'amenity-fastfood', true);
      addItem('Segafredo Café', '☕', 'amenity-cafe', true);
      addItem('Rewe To Go', '🛒', 'amenity-shop', true);
      addItem('Sanifair (WC)', '🚻', 'amenity-service', false);
    } else if (pays === 'ES') {
      addItem('Starbucks', '☕', 'amenity-cafe', true);
      addItem('Burger King', '🍔', 'amenity-fastfood', true);
      addItem('En Ruta Market', '🛒', 'amenity-shop', true);
    } else if (pays === 'IT') {
      addItem('Autogrill Ciao', '🍽️', 'amenity-resto', true);
      addItem('Illy Caffè', '☕', 'amenity-cafe', true);
      addItem('MyChef Market', '🛒', 'amenity-shop', true);
    } else {
      // France motorway defaults based on oil concessionaire
      if (ens.includes('total')) {
        addItem('Paul', '🥖', 'amenity-boulangerie', true);
        addItem('Starbucks', '☕', 'amenity-cafe', true);
        addItem('Relay', '📰', 'amenity-presse', true);
        addItem('Boutique Bonjour', '🛍️', 'amenity-shop', true);
      } else if (ens.includes('shell')) {
        addItem('Starbucks', '☕', 'amenity-cafe', true);
        addItem('Paul', '🥖', 'amenity-boulangerie', true);
        addItem('Relay', '📰', 'amenity-presse', true);
        addItem('Shell Select', '🛍️', 'amenity-shop', true);
      } else if (ens.includes('esso')) {
        addItem('Brioche Dorée', '🥐', 'amenity-boulangerie', true);
        addItem('Columbus Café', '☕', 'amenity-cafe', true);
        addItem('Relay', '📰', 'amenity-presse', true);
      } else if (ens.includes('avia')) {
        addItem('Paul', '🥖', 'amenity-boulangerie', true);
        addItem('La Croissanterie', '🥐', 'amenity-boulangerie', true);
        addItem('Relay', '📰', 'amenity-presse', true);
      } else if (ens.includes('bp')) {
        addItem('Wild Bean Cafe', '☕', 'amenity-cafe', true);
        addItem('Paul', '🥖', 'amenity-boulangerie', true);
        addItem('Relay', '📰', 'amenity-presse', true);
      } else if (ens.includes('leclerc') || ens.includes('auchan') || ens.includes('intermarche')) {
        addItem('Bistro Snack', '🥪', 'amenity-fastfood', true);
        addItem('Carrefour Express', '🛒', 'amenity-shop', true);
      } else {
        addItem('Paul', '🥖', 'amenity-boulangerie', true);
        addItem('Relay', '📰', 'amenity-presse', true);
      }
    }
  }

  // 3. EV Charging hub operator (only if electric or all fuels)
  if (!isThermalFuel && st.prix && st.prix.elec > 0) {
    if (fullText.includes('tesla') || ens.includes('tesla')) {
      addItem('Tesla Supercharger', '⚡', 'amenity-ev', true);
    } else if (fullText.includes('fulli') || ens.includes('fulli')) {
      addItem('Fulli Ultra-rapide', '⚡', 'amenity-ev', true);
    } else if (ens.includes('total')) {
      addItem('TotalEnergies EV', '⚡', 'amenity-ev', true);
    } else if (fullText.includes('fastned') || ens.includes('fastned')) {
      addItem('Fastned 300kW', '⚡', 'amenity-ev', true);
    } else if (pays === 'GB') {
      addItem('Gridserve 350kW', '⚡', 'amenity-ev', true);
    } else if (pays === 'DE') {
      addItem('EnBW Hypercharger', '⚡', 'amenity-ev', true);
    } else if (pays === 'IT') {
      addItem('Free To X 300kW', '⚡', 'amenity-ev', true);
    } else if (pays === 'ES') {
      addItem('Iberdrola 350kW', '⚡', 'amenity-ev', true);
    } else {
      addItem('Ionity 350kW', '⚡', 'amenity-ev', true);
    }
  }

  // 4. Practical Highway Services from st.services
  const srvList = Array.isArray(st.services) ? st.services : (st.services ? [st.services] : []);
  const srvStr = srvList.join(' ').toLowerCase();

  if (srvStr.includes('douche') || srvStr.includes('shower')) {
    addItem('Douches chaudes', '🚿', 'amenity-service', false);
  }
  if (srvStr.includes('bebe') || srvStr.includes('bébé') || srvStr.includes('baby') || srvStr.includes('nurserie')) {
    addItem('Espace Bébé', '🍼', 'amenity-service', false);
  }
  if (srvStr.includes('gonflage') || srvStr.includes('air') || srvStr.includes('tyre')) {
    addItem('Gonflage pneus', '💨', 'amenity-service', false);
  }
  if (srvStr.includes('wifi') || srvStr.includes('wi-fi')) {
    addItem('Wi-Fi gratuit', '📶', 'amenity-service', false);
  }
  if (srvStr.includes('dab') || srvStr.includes('distributeur') || srvStr.includes('atm')) {
    addItem('Distributeur DAB', '🏧', 'amenity-service', false);
  }
  if (srvStr.includes('camping')) {
    addItem('Aire camping-cars', '🚐', 'amenity-service', false);
  }
  if (srvStr.includes('poids lourds') || srvStr.includes('hgv') || srvStr.includes('lkw')) {
    addItem('Parking PL', '🚛', 'amenity-service', false);
  }
  if (srvStr.includes('toilettes') || srvStr.includes('sanitaire') || srvStr.includes('wc')) {
    addItem('Sanitaires 24/7', '🚻', 'amenity-service', false);
  }

  if (items.filter(i => !i.isBrand).length === 0) {
    addItem('Sanitaires 24/7', '🚻', 'amenity-service', false);
    addItem('Espace Bébé', '🍼', 'amenity-service', false);
    addItem('Gonflage pneus', '💨', 'amenity-service', false);
  }

  // If electric is selected, prioritize EV charging hub at the front of brand items
  if (isElectricOnly) {
    items.sort((a, b) => (b.type === 'amenity-ev' ? 1 : 0) - (a.type === 'amenity-ev' ? 1 : 0));
  }

  return items;
}

// Return official brand logo or specialized SVG icon for motorway amenities & commercial brands
function getAmenityBadgeIcon(name, fallbackEmoji) {
  const n = (name || '').toLowerCase();
  
  if (n.includes('paul')) {
    return `<svg viewBox="0 0 20 20" class="amenity-svg" style="width:16px;height:16px;border-radius:3px;flex-shrink:0;"><rect width="20" height="20" rx="3" fill="#000000"/><text x="10" y="14" font-family="'Times New Roman', Georgia, serif" font-weight="900" font-size="8.5" fill="#fdfbf7" text-anchor="middle" letter-spacing="0.5">PAUL</text></svg>`;
  }
  if (n.includes('starbucks')) {
    return `<svg viewBox="0 0 24 24" class="amenity-svg" style="width:16px;height:16px;border-radius:50%;flex-shrink:0;"><circle cx="12" cy="12" r="11" fill="#006241"/><circle cx="12" cy="12" r="9.5" fill="none" stroke="#ffffff" stroke-width="0.8"/><polygon points="12,5 13,8 16,8 13.5,10 14.5,13 12,11 9.5,13 10.5,10 8,8 11,8" fill="#ffffff"/><path d="M7 16c1.5 2 3.5 2.5 5 2.5s3.5-.5 5-2.5c-.8 1.5-2.5 2.2-5 2.2s-4.2-.7-5-2.2z" fill="#ffffff"/><circle cx="12" cy="11.5" r="2.2" fill="#ffffff"/></svg>`;
  }
  if (n.includes("mcdonald") || n.includes("mcdo")) {
    return `<svg viewBox="0 0 20 20" class="amenity-svg" style="width:16px;height:16px;border-radius:3px;flex-shrink:0;"><rect width="20" height="20" rx="3" fill="#da291c"/><path d="M4 17V9.5c0-2.2 1.5-4 3.2-4 1.8 0 2.8 1.5 2.8 3.8v7.7h-1.8V9.3c0-1.2-.6-2.2-1.5-2.2-.9 0-1.5 1-1.5 2.2V17H4zm6 0V9.3c0-1.2.6-2.2 1.5-2.2.9 0 1.5 1 1.5 2.2V17h1.8V9.5c0-2.2-1.5-4-3.2-4-1.8 0-2.8 1.5-2.8 3.8V17H10z" fill="#ffc72c"/></svg>`;
  }
  if (n.includes('burger king')) {
    return `<svg viewBox="0 0 24 24" class="amenity-svg" style="width:16px;height:16px;border-radius:50%;flex-shrink:0;"><circle cx="12" cy="12" r="11.5" fill="#fdf3e7" stroke="#0033a0" stroke-width="1"/><path d="M4.5 10c1.2-4 4-6.5 7.5-6.5s6.3 2.5 7.5 6.5H4.5z" fill="#d62300"/><path d="M5 14.5c1.2 3.8 4 6 7 6s5.8-2.2 7-6H5z" fill="#d62300"/><rect x="3" y="10.8" width="18" height="3" rx="1.5" fill="#ed7902"/><text x="12" y="13.2" font-family="'Arial Black', Impact, sans-serif" font-weight="900" font-size="4" fill="#ffffff" text-anchor="middle">BK</text></svg>`;
  }
  if (n.includes('relay')) {
    return `<svg viewBox="0 0 26 16" class="amenity-svg" style="height:14px;width:auto;border-radius:3px;flex-shrink:0;"><rect width="26" height="16" rx="3" fill="#e2001a"/><text x="13" y="12" font-family="'Plus Jakarta Sans', Arial, sans-serif" font-weight="900" font-size="9" fill="#ffffff" text-anchor="middle" font-style="italic">Relay</text></svg>`;
  }
  if (n.includes('carrefour')) {
    return `<svg viewBox="0 0 20 20" class="amenity-svg" style="width:16px;height:16px;border-radius:3px;flex-shrink:0;"><rect width="20" height="20" rx="3" fill="#ffffff"/><path d="M3 10c0-3.5 2-6.5 5.5-8L10 5.5c-2 1-3 2.5-3 4.5s1 3.5 3 4.5L8 18c-3.5-1.5-5.5-4.5-5.5-8z" fill="#00387b"/><path d="M17 10c0 3.5-2 6.5-5.5 8L10 14.5c2-1 3-2.5 3-4.5s-1-3.5-3-4.5L12 2c3.5 1.5 5.5 4.5 5.5 8z" fill="#e2001a"/></svg>`;
  }
  if (n.includes('brioche dor')) {
    return `<svg viewBox="0 0 20 20" class="amenity-svg" style="width:16px;height:16px;border-radius:3px;flex-shrink:0;"><rect width="20" height="20" rx="3" fill="#8b0000"/><circle cx="10" cy="10" r="7.5" fill="none" stroke="#d4af37" stroke-width="1.2"/><text x="10" y="13.5" font-family="Georgia, serif" font-weight="bold" font-size="8.5" fill="#d4af37" text-anchor="middle" font-style="italic">BD</text></svg>`;
  }
  if (n.includes('subway')) {
    return `<svg viewBox="0 0 20 20" class="amenity-svg" style="width:16px;height:16px;border-radius:3px;flex-shrink:0;"><rect width="20" height="20" rx="3" fill="#008938"/><path d="M3 10l3.5-4v2.5h7V6l3.5 4-3.5 4v-2.5h-7V14z" fill="#ffc20e"/></svg>`;
  }
  if (n.includes('courtepaille')) {
    return `<svg viewBox="0 0 20 20" class="amenity-svg" style="width:16px;height:16px;border-radius:3px;flex-shrink:0;"><rect width="20" height="20" rx="3" fill="#801818"/><polygon points="10,3 18,11 15,11 15,17 5,17 5,11 2,11" fill="#f5b041"/><rect x="8.5" y="11" width="3" height="6" fill="#4a0e0e"/></svg>`;
  }
  if (n.includes('tesla')) {
    return `<svg viewBox="0 0 20 20" class="amenity-svg" style="width:16px;height:16px;border-radius:3px;flex-shrink:0;"><rect width="20" height="20" rx="3" fill="#e82127"/><path d="M10 5.2c2.5 0 5 .8 6 1.8-.3.4-.8.7-1.3.8-.7-.5-2.5-1-4.7-1s-4 .5-4.7 1c-.5-.1-1-.4-1.3-.8 1-1 3.5-1.8 6-1.8zm3.8 3.2c-.3.4-.7.6-1.2.6-.4-.4-1.3-.7-2.6-.7s-2.2.3-2.6.7c-.5 0-.9-.2-1.2-.6 1-.7 2.3-1.1 3.8-1.1s2.8.4 3.8 1.1zm-3.2 2.1v6.5H9.4v-6.5c-1.3.1-2.4.4-3.1.8-.1-.4-.1-.8 0-1.1.9-.4 2.2-.6 3.7-.6s2.8.2 3.7.6c.1.3.1.7 0 1.1-.7-.4-1.8-.7-3.1-.8z" fill="#ffffff"/></svg>`;
  }
  if (n.includes('ionity')) {
    return `<svg viewBox="0 0 20 20" class="amenity-svg" style="width:16px;height:16px;border-radius:3px;flex-shrink:0;"><rect width="20" height="20" rx="3" fill="#03162b"/><circle cx="10" cy="10" r="6" fill="none" stroke="#00e5c9" stroke-width="2"/><circle cx="10" cy="10" r="3.2" fill="none" stroke="#ffffff" stroke-width="1.2"/><polygon points="10,5 12,8 8,8" fill="#00e5c9"/></svg>`;
  }
  if (n.includes('fastned')) {
    return `<svg viewBox="0 0 20 20" class="amenity-svg" style="width:16px;height:16px;border-radius:3px;flex-shrink:0;"><rect width="20" height="20" rx="3" fill="#1e1e1e"/><polygon points="10,3 18,17 2,17" fill="#ffc700"/><polygon points="10,7.5 15,16 5,16" fill="#1e1e1e"/><path d="M10 9v4l2 1" fill="none" stroke="#ffc700" stroke-width="1.2" stroke-linecap="round"/></svg>`;
  }
  if (n.includes('fulli')) {
    return `<svg viewBox="0 0 20 20" class="amenity-svg" style="width:16px;height:16px;border-radius:3px;flex-shrink:0;"><rect width="20" height="20" rx="3" fill="#4d1979"/><text x="10" y="13.5" font-family="'Plus Jakarta Sans', Arial, sans-serif" font-weight="900" font-size="7.5" fill="#00e5c9" text-anchor="middle">fulli</text></svg>`;
  }
  if (n.includes('totalenergies') || n.includes('total ev')) {
    return `<svg viewBox="0 0 20 20" class="amenity-svg" style="width:16px;height:16px;border-radius:3px;flex-shrink:0;"><rect width="20" height="20" rx="3" fill="#0a192f"/><circle cx="10" cy="10" r="7.5" fill="none" stroke="#00b4d8" stroke-width="1.5"/><polygon points="11,4 7,11 10,11 9,16 13,9 10,9" fill="#00f5d4"/></svg>`;
  }
  if (n.includes('costa')) {
    return `<svg viewBox="0 0 20 20" class="amenity-svg" style="width:16px;height:16px;border-radius:50%;flex-shrink:0;"><circle cx="10" cy="10" r="10" fill="#78232e"/><text x="10" y="13" font-family="'Arial Black', sans-serif" font-weight="900" font-size="5.5" fill="#ffffff" text-anchor="middle" letter-spacing="0.2">COSTA</text></svg>`;
  }
  if (n.includes('columbus')) {
    return `<svg viewBox="0 0 20 20" class="amenity-svg" style="width:16px;height:16px;border-radius:3px;flex-shrink:0;"><rect width="20" height="20" rx="3" fill="#382215"/><circle cx="10" cy="9" r="5" fill="#f4ece1"/><circle cx="8" cy="8" r="0.8" fill="#382215"/><circle cx="12" cy="8" r="0.8" fill="#382215"/><ellipse cx="10" cy="10.8" rx="1.6" ry="1.1" fill="#bd8b57"/><circle cx="10" cy="10.3" r="0.6" fill="#382215"/></svg>`;
  }
  if (n.includes('croissanterie')) {
    return `<svg viewBox="0 0 20 20" class="amenity-svg" style="width:16px;height:16px;border-radius:3px;flex-shrink:0;"><rect width="20" height="20" rx="3" fill="#d35400"/><path d="M4 14c1.5-4 5-7 8.5-6 2 .5 3 2 3.5 3.5-.8-.5-2-.8-3.5-.5-3 .5-5.5 3-7 6-.5-.8-1-1.8-1.5-3z" fill="#f5cba7"/></svg>`;
  }
  if (n.includes('sanifair')) {
    return `<svg viewBox="0 0 20 20" class="amenity-svg" style="width:16px;height:16px;border-radius:3px;flex-shrink:0;"><rect width="20" height="20" rx="3" fill="#0072bc"/><circle cx="7.5" cy="7.5" r="3" fill="#ffffff"/><circle cx="12.5" cy="12.5" r="3" fill="#ffffff"/><circle cx="7.5" cy="12.5" r="2.2" fill="#7ec4f8"/><circle cx="12.5" cy="7.5" r="2.2" fill="#7ec4f8"/></svg>`;
  }
  if (n.includes('autogrill') || n.includes('ciao')) {
    return `<svg viewBox="0 0 20 20" class="amenity-svg" style="width:16px;height:16px;border-radius:3px;flex-shrink:0;"><rect width="20" height="20" rx="3" fill="#d91a1a"/><text x="10" y="13.5" font-family="'Arial Black', sans-serif" font-weight="900" font-size="6" fill="#ffffff" text-anchor="middle">CIAO</text></svg>`;
  }
  if (n.includes('douche') || n.includes('shower')) {
    return `<svg viewBox="0 0 24 24" class="amenity-svg" style="width:16px;height:16px;flex-shrink:0;" fill="#38bdf8"><path d="M12 2a5 5 0 0 0-5 5v1h10V7a5 5 0 0 0-5-5zm-5 8v1h10v-1H7zm1 3a1 1 0 1 0 0 2 1 1 0 0 0 0-2zm4 0a1 1 0 1 0 0 2 1 1 0 0 0 0-2zm4 0a1 1 0 1 0 0 2 1 1 0 0 0 0-2zm-6 4a1 1 0 1 0 0 2 1 1 0 0 0 0-2zm4 0a1 1 0 1 0 0 2 1 1 0 0 0 0-2z"/></svg>`;
  }
  if (n.includes('bebe') || n.includes('bébé') || n.includes('baby') || n.includes('nurserie')) {
    return `<svg viewBox="0 0 24 24" class="amenity-svg" style="width:16px;height:16px;flex-shrink:0;" fill="#f472b6"><path d="M19 13.5c0-.8-.7-1.5-1.5-1.5H16V9c0-1.7-1.3-3-3-3H9v2h4c.6 0 1 .4 1 1v3H6.5C5.7 12 5 12.7 5 13.5V17c0 .6.4 1 1 1h12c.6 0 1-.4 1-1v-3.5zM7 21a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm10 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/></svg>`;
  }
  if (n.includes('gonflage') || n.includes('air') || n.includes('tyre')) {
    return `<svg viewBox="0 0 24 24" class="amenity-svg" style="width:16px;height:16px;flex-shrink:0;" fill="#34d399"><circle cx="12" cy="12" r="9" fill="none" stroke="#34d399" stroke-width="2.5"/><circle cx="12" cy="12" r="4" fill="none" stroke="#34d399" stroke-width="2"/><line x1="12" y1="12" x2="14" y2="10" stroke="#34d399" stroke-width="2" stroke-linecap="round"/></svg>`;
  }
  if (n.includes('wifi') || n.includes('wi-fi')) {
    return `<svg viewBox="0 0 24 24" class="amenity-svg" style="width:16px;height:16px;flex-shrink:0;" fill="#60a5fa"><path d="M12 4C7.3 4 3.1 5.9 0 9l2.1 2.1C4.6 8.7 8.1 7.2 12 7.2s7.4 1.5 9.9 3.9L24 9C20.9 5.9 16.7 4 12 4zm0 6c-3.3 0-6.3 1.3-8.5 3.5L5.6 15.6C7.3 14 9.5 13 12 13s4.7 1 6.4 2.6l2.1-2.1C18.3 11.3 15.3 10 12 10zm0 6c-1.7 0-3.1.7-4.2 1.8L12 22l4.2-4.2C15.1 16.7 13.7 16 12 16z"/></svg>`;
  }
  if (n.includes('dab') || n.includes('distributeur') || n.includes('atm')) {
    return `<svg viewBox="0 0 24 24" class="amenity-svg" style="width:16px;height:16px;flex-shrink:0;" fill="#fbbf24"><rect x="3" y="4" width="18" height="16" rx="2" fill="none" stroke="#fbbf24" stroke-width="2"/><line x1="3" y1="9" x2="21" y2="9" stroke="#fbbf24" stroke-width="2"/><rect x="6" y="13" width="4" height="3" fill="#fbbf24"/></svg>`;
  }
  if (n.includes('sanitaire') || n.includes('toilette') || n.includes('wc')) {
    return `<svg viewBox="0 0 24 24" class="amenity-svg" style="width:16px;height:16px;flex-shrink:0;" fill="#a7f3d0"><circle cx="8" cy="6" r="2.5" fill="#a7f3d0"/><circle cx="16" cy="6" r="2.5" fill="#a7f3d0"/><path d="M6 10h4v10H6zM14 10h4l1 10h-6z" fill="#a7f3d0"/></svg>`;
  }
  if (n.includes('camping')) {
    return `<svg viewBox="0 0 24 24" class="amenity-svg" style="width:16px;height:16px;flex-shrink:0;" fill="#a3e635"><path d="M4 6h12v11H4zm12 4h4l2 3v4h-6zM6 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm12 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" fill="#a3e635"/></svg>`;
  }
  if (n.includes('poids lourds') || n.includes('pl')) {
    return `<svg viewBox="0 0 24 24" class="amenity-svg" style="width:16px;height:16px;flex-shrink:0;" fill="#cbd5e1"><path d="M3 6h11v9H3zm11 3h4l2 3v3h-6zM6 18a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm11 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" fill="#cbd5e1"/></svg>`;
  }
  
  return `<span class="amenity-emoji">${fallbackEmoji || '⭐'}</span>`;
}

const AMENITY_TRANSLATIONS = {
  sl: {

    'douches chaudes': 'Topli tuši',
    'espace bébé': 'Previjalnica',
    'gonflage pneus': 'Tlak v pnevmatikah',
    'wi-fi gratuit': 'Brezplačen Wi-Fi',
    'distributeur dab': 'Bančni avtomat (ATM)',
    'aire camping-cars': 'Postajališče za avtodome',
    'parking pl': 'Parkirišče za tovornjake',
    'sanitaires 24/7': 'Sanitarije 24/7',
    'toilettes publiques': 'Javna stranišča',
    'boutique alimentaire': 'Trgovina z živili',
    'boutique non alimentaire': 'Trgovina',
    'restauration sur place': 'Restavracija',
    'restauration à emporter': 'Hrana za s seboj',
    'lavage automatique': 'Avtopralnica',
    'lavage haute pression': 'Visokotlačno pranje',
    'lavage manuel': 'Ročno pranje',
    'bornes électriques': 'E-polnilnice',
    'automate cb 24/24': 'Plačilni avtomat 24/7',
    'bar': 'Kavarna / Bar',
    'relais colis': 'Prevzem paketov'
  },
  hr: {

    'douches chaudes': 'Topli tuševi',
    'espace bébé': 'Prostor za prematanje',
    'gonflage pneus': 'Pumpe za gume',
    'wi-fi gratuit': 'Besplatni Wi-Fi',
    'distributeur dab': 'Bankomat (ATM)',
    'aire camping-cars': 'Kamp kućice / Autodomovi',
    'parking pl': 'Parkiralište za teretna vozila',
    'sanitaires 24/7': 'Sanitarni čvor 24/7',
    'toilettes publiques': 'Javni WC',
    'boutique alimentaire': 'Trgovina prehrambenih proizvoda',
    'boutique non alimentaire': 'Trgovina',
    'restauration sur place': 'Restoran',
    'restauration à emporter': 'Hrana za van',
    'lavage automatique': 'Automatska autopraonica',
    'lavage haute pression': 'Pranje pod visokim tlakom',
    'lavage manuel': 'Ručno pranje',
    'bornes électriques': 'Punionice za električna vozila',
    'automate cb 24/24': 'Automatsko plaćanje karticom 24/7',
    'bar': 'Kafić / Bar',
    'relais colis': 'Preuzimanje paketa'
  },
  de: {

    'douches chaudes': 'Warme Duschen',
    'espace bébé': 'Wickelraum',
    'gonflage pneus': 'Reifendruck',
    'wi-fi gratuit': 'Kostenloses WLAN',
    'distributeur dab': 'Geldautomat',
    'aire camping-cars': 'Wohnmobil-Stellplatz',
    'parking pl': 'Lkw-Parkplatz',
    'sanitaires 24/7': 'WCs 24/7',
    'toilettes publiques': 'Öffentliche WCs',
    'boutique alimentaire': 'Lebensmittelshop',
    'boutique non alimentaire': 'Shop',
    'restauration sur place': 'Restaurant',
    'restauration à emporter': 'Takeaway',
    'lavage automatique': 'Waschanlage',
    'lavage haute pression': 'SB-Waschbox',
    'lavage manuel': 'SB-Waschbox',
    'bornes électriques': 'E-Ladesäulen',
    'automate cb 24/24': 'Kartenautomat 24/7',
    'bar': 'Café / Bar',
    'relais colis': 'Paketstation'
  },
  en: {

    'douches chaudes': 'Hot showers',
    'espace bébé': 'Baby care',
    'gonflage pneus': 'Tyre pressure',
    'wi-fi gratuit': 'Free Wi-Fi',
    'distributeur dab': 'ATM / Cash machine',
    'aire camping-cars': 'Motorhome area',
    'parking pl': 'HGV parking',
    'sanitaires 24/7': 'Toilets 24/7',
    'toilettes publiques': 'Public toilets',
    'boutique alimentaire': 'Convenience store',
    'boutique non alimentaire': 'Shop',
    'restauration sur place': 'Restaurant',
    'restauration à emporter': 'Takeaway food',
    'lavage automatique': 'Car wash',
    'lavage haute pression': 'Jet wash',
    'lavage manuel': 'Jet wash',
    'bornes électriques': 'EV Charging',
    'automate cb 24/24': '24/7 Card Payment',
    'bar': 'Coffee / Bar',
    'relais colis': 'Parcel pickup'
  },
  nl: {

    'douches chaudes': 'Warme douches',
    'espace bébé': 'Babyverzorging',
    'gonflage pneus': 'Bandenspanning',
    'wi-fi gratuit': 'Gratis wifi',
    'distributeur dab': 'Geldautomaat (ATM)',
    'aire camping-cars': 'Camperstandplaats',
    'parking pl': 'Vrachtwagenparkeerplaats',
    'sanitaires 24/7': 'Toiletten 24/7',
    'toilettes publiques': 'Openbare toiletten',
    'boutique alimentaire': 'Levensmiddelenwinkel',
    'boutique non alimentaire': 'Shop / Winkel',
    'restauration sur place': 'Restaurant',
    'restauration à emporter': 'Afhaalgerechten',
    'lavage automatique': 'Carwash',
    'lavage haute pression': 'Hogedrukwasser',
    'lavage manuel': 'Wasbox',
    'bornes électriques': 'Laadpalen elektrisch',
    'automate cb 24/24': '24/7 Betaalautomaat',
    'bar': 'Bar / Café',
    'relais colis': 'Pakketpunt'
  },
  it: {

    'douches chaudes': 'Docce calde',
    'espace bébé': 'Fasciatoio bebè',
    'gonflage pneus': 'Gonfiaggio pneumatici',
    'wi-fi gratuit': 'Wi-Fi gratis',
    'distributeur dab': 'Bancomat ATM',
    'aire camping-cars': 'Area camper',
    'parking pl': 'Parcheggio camion',
    'sanitaires 24/7': 'Servizi igienici 24/7',
    'toilettes publiques': 'Servizi igienici',
    'boutique alimentaire': 'Negozio alimentari',
    'boutique non alimentaire': 'Negozio',
    'restauration sur place': 'Ristorazione',
    'restauration à emporter': 'Ristorazione da asporto',
    'lavage automatique': 'Autolavaggio',
    'lavage haute pression': 'Lavaggio a pressione',
    'lavage manuel': 'Lavaggio manuale',
    'bornes électriques': 'Ricarica elettrica',
    'automate cb 24/24': 'Self-service 24h',
    'bar': 'Bar / Caffetteria',
    'relais colis': 'Ritiro pacchi'
  },
  es: {

    'douches chaudes': 'Duchas calientes',
    'espace bébé': 'Cambiador bebé',
    'gonflage pneus': 'Presión neumáticos',
    'wi-fi gratuit': 'Wi-Fi gratis',
    'distributeur dab': 'Cajero automático',
    'aire camping-cars': 'Área autocaravanas',
    'parking pl': 'Parking camiones',
    'sanitaires 24/7': 'Aseos 24/7',
    'toilettes publiques': 'Baños públicos',
    'boutique alimentaire': 'Tienda alimentación',
    'boutique non alimentaire': 'Tienda',
    'restauration sur place': 'Restaurante',
    'restauration à emporter': 'Comida para llevar',
    'lavage automatique': 'Túnel de lavado',
    'lavage haute pression': 'Lavado a presión',
    'lavage manuel': 'Lavado manual',
    'bornes électriques': 'Punto de recarga',
    'automate cb 24/24': 'Surtidor 24h',
    'bar': 'Bar / Cafetería',
    'relais colis': 'Punto de paquetería'
  },
  pt: {
    'douches chaudes': 'Duches quentes',
    'espace bébé': 'Fraldário',
    'gonflage pneus': 'Pressão dos pneus',
    'wi-fi gratuit': 'Wi-Fi gratuito',
    'distributeur dab': 'Multibanco (ATM)',
    'aire camping-cars': 'Área de autocaravanas',
    'parking pl': 'Estacionamento TIR / camiões',
    'sanitaires 24/7': 'Sanitários 24/7',
    'toilettes publiques': 'Casas de banho públicas',
    'boutique alimentaire': 'Loja de conveniência',
    'boutique non alimentaire': 'Loja',
    'restauration sur place': 'Restaurante',
    'restauration à emporter': 'Comida para levar (Take-away)',
    'lavage automatique': 'Lavagem automática',
    'lavage haute pression': 'Lavagem a alta pressão',
    'lavage manuel': 'Lavagem manual',
    'bornes électriques': 'Postos de carregamento elétrico',
    'automate cb 24/24': 'Pagamento automático 24/7',
    'bar': 'Café / Bar',
    'relais colis': 'Ponto de recolha'
  },
};

function translateAmenityName(name) {
  if (!name || currentLang === 'fr') return name;
  const low = String(name).trim().toLowerCase();
  const dict = AMENITY_TRANSLATIONS[currentLang];
  if (dict && dict[low]) return dict[low];
  return name;
}
function renderStationAmenitiesPills(st) {
  const allItems = getStationBrandsAndServices(st);
  const brandItems = allItems.filter(i => i.isBrand);
  if (brandItems.length === 0) return '';
  
  const displayItems = brandItems.slice(0, 4);
  const remaining = brandItems.length - displayItems.length;
  
  let html = '<div class="station-amenities-row">';
  displayItems.forEach(item => {
    const iconHtml = getAmenityBadgeIcon(item.name, item.icon);
    html += `<span class="amenity-pill ${item.type}" title="${item.name}">${iconHtml}<span>${item.name}</span></span>`;
  });
  if (remaining > 0) {
    const tr = t();
    const moreText = (tr.moreBrands && typeof tr.moreBrands === 'function') ? tr.moreBrands(remaining) : `+${remaining}`;
    html += `<span class="amenity-pill-more">${moreText}</span>`;
  }
  html += '</div>';
  return html;
}

function renderPopupAmenitiesBlock(st) {
  const allItems = getStationBrandsAndServices(st);
  if (allItems.length === 0) return '';

  const brands = allItems.filter(i => i.isBrand);
  const services = allItems.filter(i => !i.isBrand);
  const tr = t();

  let html = `
    <div class="popup-amenities-block">
      <div class="popup-amenities-title">${tr.amenitiesBrandsTitle || '☕ Enseignes & Restauration'}</div>
      <div class="popup-amenities-grid" style="margin-bottom:6px;">
        ${brands.map(b => `<span class="amenity-pill ${b.type}">${getAmenityBadgeIcon(b.name, b.icon)}<span>${b.name}</span></span>`).join('')}
      </div>
  `;
  if (services.length > 0) {
    html += `
      <div class="popup-amenities-title" style="margin-top:4px;">${tr.amenitiesServicesTitle || '🛠️ Services de l\'aire'}</div>
      <div class="popup-amenities-grid">
        ${services.map(s => {
          const transName = translateAmenityName(s.name);
          return `<span class="amenity-pill ${s.type}">${getAmenityBadgeIcon(s.name, s.icon)}<span>${transName}</span></span>`;
        }).join('')}
      </div>
    `;
  }
  html += '</div>';
  return html;
}

// ============================================================================
// Live Weather (Open-Meteo API) & In-Memory Cache
// ============================================================================
const weatherCache = new Map();

function getWeatherInfo(code, isDay = 1) {
  const lang = currentLang || 'fr';
  const descMap = {
    fr: {
      clearDay: 'Ensoleillé', clearNight: 'Nuit claire',
      partlyDay: 'Éclaircies', partlyNight: 'Partiellement nuageux',
      overcast: 'Couvert', fog: 'Brouillard', drizzle: 'Bruine',
      rain: 'Pluie', snow: 'Neige', storm: 'Orages'
    },
    de: {
      clearDay: 'Sonnig', clearNight: 'Klare Nacht',
      partlyDay: 'Heiter', partlyNight: 'Teilweise bewölkt',
      overcast: 'Bedeckt', fog: 'Nebel', drizzle: 'Nieselregen',
      rain: 'Regen', snow: 'Schnee', storm: 'Gewitter'
    },
    en: {
      clearDay: 'Sunny', clearNight: 'Clear night',
      partlyDay: 'Partly cloudy', partlyNight: 'Partly cloudy',
      overcast: 'Overcast', fog: 'Fog', drizzle: 'Drizzle',
      rain: 'Rain', snow: 'Snow', storm: 'Thunderstorm'
    },
    it: {
      clearDay: 'Soleggiato', clearNight: 'Notte serena',
      partlyDay: 'Schiarite', partlyNight: 'Poco nuvoloso',
      overcast: 'Coperto', fog: 'Nebbia', drizzle: 'Pioggerella',
      rain: 'Pioggia', snow: 'Neve', storm: 'Temporale'
    },
    nl: {
      clearDay: 'Zonnig', clearNight: 'Heldere nacht',
      partlyDay: 'Opklaringen', partlyNight: 'Gedeeltelijk bewolkt',
      overcast: 'Zwaarbewolkt', fog: 'Mist', drizzle: 'Motregen',
      rain: 'Regen', snow: 'Sneeuw', storm: 'Onweer'
    },
    es: {
      clearDay: 'Soleado', clearNight: 'Noche despejada',
      partlyDay: 'Intervalos nubosos', partlyNight: 'Parcialmente nublado',
      overcast: 'Cubierto', fog: 'Niebla', drizzle: 'Llovizna',
      rain: 'Lluvia', snow: 'Nieve', storm: 'Tormentas'
    },
    pt: {
      clearDay: 'Ensolarado', clearNight: 'Noite limpa',
      partlyDay: 'Abertas', partlyNight: 'Parcialmente nublado',
      overcast: 'Encoberto', fog: 'Nevoeiro', drizzle: 'Chuvisco',
      rain: 'Chuva', snow: 'Neve', storm: 'Trovoadas'
    },
    sl: {
      clearDay: 'Sončno', clearNight: 'Jasna noč',
      partlyDay: 'Delno oblačno', partlyNight: 'Delno oblačno',
      overcast: 'Oblačno', fog: 'Megla', drizzle: 'Rosenje',
      rain: 'Dež', snow: 'Sneg', storm: 'Nevihte'
    },
    hr: {
      clearDay: 'Sunčano', clearNight: 'Vedra noć',
      partlyDay: 'Djelomično oblačno', partlyNight: 'Djelomično oblačno',
      overcast: 'Oblačno', fog: 'Magla', drizzle: 'Ruljenje',
      rain: 'Kiša', snow: 'Snijeg', storm: 'Grmljavina'
    }
  };
  const d = descMap[lang] || descMap.fr;

  if (code === 0) {
    return isDay ? { icon: '☀️', desc: d.clearDay } : { icon: '🌙', desc: d.clearNight };
  } else if (code === 1 || code === 2) {
    return isDay ? { icon: '🌤️', desc: d.partlyDay } : { icon: '☁️', desc: d.partlyNight };
  } else if (code === 3) {
    return { icon: '☁️', desc: d.overcast };
  } else if (code === 45 || code === 48) {
    return { icon: '🌫️', desc: d.fog };
  } else if (code >= 51 && code <= 57) {
    return { icon: '🌦️', desc: d.drizzle };
  } else if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) {
    return { icon: '🌧️', desc: d.rain };
  } else if ((code >= 71 && code <= 77) || (code >= 85 && code <= 86)) {
    return { icon: '❄️', desc: d.snow };
  } else if (code >= 95) {
    return { icon: '⛈️', desc: d.storm };
  }
  return isDay ? { icon: '☀️', desc: d.clearDay } : { icon: '🌙', desc: d.clearNight };
}

function getCachedWeather(lat, lon) {
  if (typeof lat !== 'number' || typeof lon !== 'number') return null;
  const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  const item = weatherCache.get(key);
  if (item && (Date.now() - item.time < 30 * 60 * 1000)) {
    return item;
  }
  return null;
}

async function fetchWeatherForStations(stations) {
  if (!stations || stations.length === 0) return;
  const needed = [];
  const coordsKeys = new Set();

  stations.forEach(st => {
    if (typeof st.lat !== 'number' || typeof st.lon !== 'number') return;
    const key = `${st.lat.toFixed(2)},${st.lon.toFixed(2)}`;
    if (coordsKeys.has(key)) return;
    coordsKeys.add(key);
    const cached = getCachedWeather(st.lat, st.lon);
    if (!cached) {
      needed.push({ lat: st.lat, lon: st.lon, key });
    }
  });

  if (needed.length === 0) return;

  const batch = needed.slice(0, 40);
  const lats = batch.map(b => b.lat.toFixed(3)).join(',');
  const lons = batch.map(b => b.lon.toFixed(3)).join(',');
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lons}&current=temperature_2m,weather_code,is_day`;

  try {
    const res = await fetch(url);
    if (!res.ok) return;
    const data = await res.json();
    const items = Array.isArray(data) ? data : [data];

    items.forEach((item, idx) => {
      if (item && item.current && batch[idx]) {
        const temp = Math.round(item.current.temperature_2m);
        const code = item.current.weather_code;
        const isDay = item.current.is_day !== undefined ? item.current.is_day : 1;
        const info = getWeatherInfo(code, isDay);
        const wData = { temp, icon: info.icon, desc: info.desc, time: Date.now() };
        weatherCache.set(batch[idx].key, wData);
      }
    });

    stations.forEach(st => {
      const w = getCachedWeather(st.lat, st.lon);
      if (!w) return;
      const cardEl = document.getElementById(`weather-card-${st.id}`);
      if (cardEl) {
        cardEl.innerHTML = `${w.icon} ${w.temp}°C`;
        cardEl.title = `${w.desc} (${w.temp}°C)`;
        cardEl.style.display = 'inline-flex';
      }
      const popupEl = document.getElementById(`weather-popup-${st.id}`);
      if (popupEl) {
        popupEl.innerHTML = `<span class="popup-weather-icon">${w.icon}</span> <strong>${w.temp}°C</strong> · ${w.desc}`;
        popupEl.style.display = 'flex';
      }
    });
  } catch (err) {}
}

// ============================================================================
// Motorway Opening Hours & 24/7 Status
// ============================================================================
function getStationOpeningStatus(st) {
  const now = new Date();
  const timeVal = now.getHours() + now.getMinutes() / 60;

  // Motorway Concessions standards:
  // 06h30 - 21h30: Open
  // 21h30 - 22h30: Closing soon
  // 22h30 - 06h30: Night (Automate CB 24/24, food closed)
  const isOpen = timeVal >= 6.5 && timeVal < 21.5;
  const isClosingSoon = timeVal >= 21.5 && timeVal < 22.5;

  const tr = t();
  if (isOpen) {
    return {
      statusClass: 'status-open',
      cardBadge: tr.statusOpen || '🟢 Restauration ouverte',
      popupSchedule: tr.statusScheduleOpen || '🟢 Restauration ouverte (06h30 - 21h30)',
      fuelSchedule: tr.pumps247 || 'Pompes & bornes CB : 24h/24'
    };
  } else if (isClosingSoon) {
    return {
      statusClass: 'status-closing',
      cardBadge: tr.statusClosing || '🟡 Restauration : fermeture proche',
      popupSchedule: tr.statusScheduleClosing || '🟡 Fermeture resto proche (fermeture 22h00)',
      fuelSchedule: tr.pumps247 || 'Pompes & bornes CB : 24h/24'
    };
  } else {
    return {
      statusClass: 'status-night',
      cardBadge: tr.statusNight || '🌙 Carburant 24/7 · Resto fermé',
      popupSchedule: tr.statusScheduleNight || '🌙 Restauration fermée (réouverture 06h30)',
      fuelSchedule: tr.pumps247 || 'Pompes & bornes CB : 24h/24'
    };
  }
}

// Initialize Application
const APP_VERSION = '9.9.16';
window.APP_VERSION = APP_VERSION;
let userManuallySelectedLang = false;

// Clean up legacy localStorage keys
try {
  localStorage.removeItem('fuelpilot_lang');
  localStorage.removeItem('fuelpilot_geo_lang');
} catch (e) {}

function mapCountryToLang(countryCode, lat, lon) {
  if (!countryCode) return null;
  const cc = String(countryCode).trim().toUpperCase();
  if (['FR', 'MC', 'BE', 'LU'].includes(cc)) return 'fr';
  if (['DE', 'AT', 'LI'].includes(cc)) return 'de';
  if (['IT', 'SM', 'VA'].includes(cc)) return 'it';
  if (['ES', 'AD'].includes(cc)) return 'es';
  if (['GB', 'UK', 'IE', 'GI'].includes(cc)) return 'en';
  if (cc === 'CH') {
    if (typeof lon === 'number' && lon < 7.15) return 'fr';
    if (typeof lat === 'number' && typeof lon === 'number' && lat < 46.25 && lon > 8.3) return 'it';
    return 'de';
  }
  return null;
}

function getTimezoneCountryLang() {
  try {
    if (typeof Intl !== 'undefined' && Intl.DateTimeFormat) {
      const tz = (Intl.DateTimeFormat().resolvedOptions().timeZone || '').toLowerCase();
      if (tz.includes('amsterdam')) return 'nl';
      if (tz.includes('paris') || tz.includes('brussels') || tz.includes('luxembourg') || tz.includes('monaco')) return 'fr';
      if (tz.includes('berlin') || tz.includes('busingen') || tz.includes('vienna') || tz.includes('vaduz') || tz.includes('zurich')) return 'de';
      if (tz.includes('rome') || tz.includes('san_marino') || tz.includes('vatican')) return 'it';
      if (tz.includes('madrid') || tz.includes('canary') || tz.includes('ceuta') || tz.includes('andorra')) return 'es';
      if (tz.includes('london') || tz.includes('belfast') || tz.includes('dublin') || tz.includes('jersey') || tz.includes('guernsey') || tz.includes('isle_of_man')) return 'en';
    }
  } catch (e) {}
  return null;
}

function getInitialDefaultLang() {
  try {
    const manualSession = typeof sessionStorage !== 'undefined' && sessionStorage.getItem('fuelpilot_manual_lang');
    if (manualSession && ['fr', 'de', 'it', 'es', 'en', 'nl'].includes(manualSession)) {
      userManuallySelectedLang = true;
      return manualSession;
    }
    const tzLang = getTimezoneCountryLang();
    if (tzLang) return tzLang;

    if (typeof navigator !== 'undefined') {
      const langs = Array.isArray(navigator.languages) && navigator.languages.length > 0
        ? navigator.languages
        : (navigator.language ? [navigator.language] : []);
      for (const l of langs) {
        const short = String(l).slice(0, 2).toLowerCase();
        if (['fr', 'de', 'it', 'es', 'en', 'nl'].includes(short)) return short;
      }
    }
  } catch (e) {}
  return 'fr';
}

let userSelectedCountry = null;
let currentLang = getInitialDefaultLang();


function formatExitDistKm(distM) {
  const m = Number(distM) || 800;
  const km = m / 1000;
  return km.toFixed(1) + ' km';
}

function extractExitNumber(st) {
  if (!st) return null;
  if (st.exit_number) return String(st.exit_number).toUpperCase();
  const candidates = [st.nom, st.adresse, st.displayedPk, st.pk_text, st.sens];
  for (const str of candidates) {
    if (!str) continue;
    const m = String(str).match(/(?:sortie|ausfahrt|uscita|salida|junction)\s*(?:n[°o.]?\s*|#\s*)?([0-9]+[a-zA-Z]?)/i);
    if (m && m[1]) return m[1].toUpperCase();
    const mJ = String(str).match(/\bJ\s*([0-9]+[a-zA-Z]?)\b/i);
    if (mJ && mJ[1]) return mJ[1].toUpperCase();
  }
  return null;
}

const I18N_DICT = {
  fr: {    scrollRightTitle: "Défiler à droite",
    scrollLeftTitle: "Défiler à gauche",
    actionEnterCity: "Saisir ma ville",
    clearInputTitle: "Effacer la saisie",
    locateMeTitle: "Centrer sur ma position",
    navFollowPaused: "📍 Suivi automatique en pause. Touchez l'icône GPS pour recentrer.",
    navFollowing: "🎯 Suivi automatique actif",
    toggleExitTitle: "Inclure les stations à prix discount situées aux sorties immédiates de l'autoroute (< 1,5 km)",
    refRoutesTest: "Tester",
    refRoutesToggleTitle: "Afficher les 52 itinéraires de référence",
    refRoutesSub: "4 corridors par pays (13 pays d'Europe)",
    refRoutesTitle: "52 Itinéraires de référence",

    pageTitle: "FuelPilot • Carburant Autoroute & Bornes PK",
    tagline: "Prix carburant & aires d'autoroute",
    privacy: "Confidentialité",
    guide: "Guide",
    guideTitle: "Mode d'emploi & Guide d'utilisation",
    live: "Prix en direct",
    refreshTitle: "Actualiser FuelCoPilot",
    sec1: "1. Choix de l'itinéraire",
    startPlaceholder: "Adresse, lieu, parking, ville...",
    endPlaceholder: "Adresse, lieu, parking, ville...",
    stepPlaceholder: (n) => `Étape ${n} (ex: Beaune, Orléans...)`,
    removeStepTitle: "Supprimer l'étape",
    addStep: "+ Étape",
    calcBtn: "<span>🚀</span> Calculer l'itinéraire",
    calcInProgress: "Calcul en cours...",
        startNav: "Démarrer",
    stopNav: "Arrêter",
    navFollowing: "Démarrer",
    currentPos: "📍 Ma position actuelle",
    estimatedPos: "📍 Ma position estimée",
    locating: "Recherche de votre position...",
    locationError: "Impossible d'obtenir votre position GPS.",
    fromCurrentPos: (km) => `🎯 Dans ${km} km`,
    upcomingStationsCount: (n) => `${n} station${n > 1 ? 's' : ''} à venir`,
    editBtn: "<span>✏️</span> Modifier",
    closeBtn: "<span>✖</span> Fermer",
    editBtnTitle: "Modifier le trajet",
    allBrands: "🏢 Toutes les enseignes",
    filterBrandTitle: "Filtrer par Enseigne",
    filterFuelTitle: "Filtrer par Carburant",
    sortTitle: "Ordre de tri",
    sec3: "3. Stations d'autoroute",
    sortRoute: "Tri : Ordre du trajet",
    sortPrice: "Tri : Moins cher d'abord",
    sortDist: "Tri : Distance",
    tabMap: "Carte",
    tabList: "Liste & Filtres",
    coverage: "Réseau couvert : 🇫🇷 France • 🇩🇪 Allemagne • 🇧🇪 Belgique • 🇳🇱 Pays-Bas • 🇮🇹 Italie • 🇪🇸 Espagne • 🇵🇹 Portugal • 🇬🇧 Royaume-Uni • 🇱🇺 Luxembourg • 🇦🇹 Autriche • 🇨🇭 Suisse • 🇸🇮 Slovénie • 🇭🇷 Croatie",
    recentHdr: "🕒 10 dernières localités",
    bestPrice: "⭐ PRIX LE PLUS BAS",
    fromStart: (km) => `🎯 Dans ${km} km`,
    stationsCount: (n) => `${n} station${n > 1 ? 's' : ''} sur le trajet`,
    unavail: "⚠️ Non disponible",
    noPrice: "Non communiqués",
    priceLbl: "Prix",
    outOfStock: "⚠️ Rupture :",
    estimatedPrice: "ℹ️ Prix indicatif (non relevé en direct)",
    recommended: "🔵 Recommandé",
    optionN: (n) => `🟠 Option ${n}`,
    directRoute: "Itinéraire direct",
    countryCH: "Suisse",
    countryFR: "France",
    countryDE: "Allemagne",
    countryES: "Espagne",
    countryIT: "Italie",
    countryGB: "Royaume-Uni",
    countryIE: "Irlande",
    countryBE: "Belgique",
    countryPT: "Portugal",
    countryNL: "Pays-Bas",
    countryLU: "Luxembourg",
    countryAT: "Autriche",
    countrySI: "Slovénie",
    countryHR: "Croatie",
    areasCount: (n) => `${n} aires`,
    areasListed: (n) => `${n} aires répertoriées • Prix en direct`,
    kmMarker: (hw, pk) => `${hw || 'Autoroute'} • Borne km ${pk}`,
    popupDirDist: (dir, km) => `Sens : ${dir} • Dans ${km} km`,
    sensDirect: "Sens direct",
    sensInverse: "Sens inverse",
    sensDouble: "Double sens",
    wazeTitle: "Y aller avec Waze",
    gmapsTitle: "Y aller avec Google Maps",
    mapRoad: "🗺️ Carte Routière",
    mapOsm: "🌍 OpenStreetMap",
    mapSat: "🛰️ Vue Satellite",
    emptyInitial: "Sélectionnez un départ et une arrivée pour afficher les stations d'autoroute et leurs bornes kilométriques.",
    emptyFilteredTitle: "Aucune station d'autoroute trouvée avec ces critères.",
    emptyFilteredSub: "Essayez de sélectionner « Toutes les enseignes » ou un autre carburant.",
    alertMissingPoints: "Veuillez renseigner un point de départ et un point d'arrivée.",
    alertNoRoute: "Aucun itinéraire routier trouvé.",
    alertServerError: "Impossible de joindre le serveur d'itinéraire. Veuillez réessayer.",
    amazonBadge: "🛒 ÉQUIPEMENT TRAJET RECOMMANDÉ",
    amazonView: "Voir ➔",
    amazonDisclosure: "En tant que Partenaire Amazon, nous réalisons un bénéfice sur les achats remplissant les conditions requises.",
    amazonItems: [
      { icon: "📱", name: "Support Smartphone Grille / MagSafe", sub: "Maintien ultra-stable pour guidage GPS", url: "https://www.amazon.fr/s?k=support+telephone+voiture+grille+aeration&tag=watermetrics-21" },
      { icon: "⚡", name: "Chargeur Allume-Cigare USB-C Rapide", sub: "Recharge rapide 65W pendant votre trajet", url: "https://www.amazon.fr/s?k=chargeur+allume+cigare+rapide+usb+c&tag=watermetrics-21" }
    ],
    evdanceBadge: "⚡ PARTENAIRE RECHARGE VE • EVDANCE",
    evdanceTitle: "Chargeurs Portables & Câbles Type 2 EVDANCE",
    evdanceSub: "Jusqu'à -20% sur toute la boutique UE • Code :",
    evdanceCta: "Voir -20% ➔",
    evdanceDisclosure: "Lien partenaire affilié • Code promo EVEU20 valable sur eu.evdances.com",
    fuelInfoBtnTitle: "Correspondance des noms de carburants par pays",
    fuelInfoTitle: "⛽ Correspondance des carburants par pays",
    fuelInfoSubtitle: "Dénominations officielles aux pompes (Norme européenne EN 16942)",
    fuelColNorm: "Norme UE",
    fuelCatE10: "Sans Plomb 95 (E10)",
    fuelCatE5: "Sans Plomb 95 (E5)",
    fuelCatSp98: "Sans Plomb 98 (E5)",
    fuelCatDiesel: "Gazole / Diesel",
    fuelCatLpg: "GPL / Autogas",
    fuelCatE85: "Bioéthanol / Gaz",
    defaultCountry: "FR",
    today: "Aujourd'hui",
    yesterday: "Hier",
    atTime: "à",
    verifiedAt: "Relevé :",
    toggleExit: "🚪 Stations à la sortie (< 1,5 km)",
    statusOpen: "🟢 Restauration ouverte",
    statusClosing: "🟡 Restauration : fermeture proche",
    statusNight: "🌙 Carburant 24/7 · Resto fermé",
    statusScheduleOpen: "🟢 Restauration ouverte (06h30 - 21h30)",
    statusScheduleClosing: "🟡 Fermeture resto proche (fermeture 22h00)",
    statusScheduleNight: "🌙 Restauration fermée (réouverture 06h30)",
    pumps247: "Pompes & Automate CB : 24h/24, 7j/7",
    foodLabel: "Restauration :",
    amenitiesBrandsTitle: "☕ Enseignes & Restauration",
    amenitiesServicesTitle: "🛠️ Services de l'aire",
    moreBrands: (n) => `+${n} enseignes`,
    hoursTitle: "🕒 HORAIRES D'OUVERTURE",
    offMotorwayBadge: (d, exitNum) => exitNum ? `À ${d} de la sortie n° ${exitNum}` : `À ${d} de la sortie d'autoroute`,
    offMotorwayPopupTitle: "Station hors autoroute",
    offMotorwayPopupDesc: (d, exitNum) => exitNum ? `Accessible à la sortie n° ${exitNum} (~${d})` : `Accessible à la sortie d'autoroute / péage (~${d})`,
    offMotorwayTooltip: "Station située hors autoroute, à la sortie immédiate",
    defaultHighway: "Autoroute",
    weatherLoading: "Météo en direct",
    fuelUnavailable: "Indispo"
  },
  de: {    scrollRightTitle: "Nach rechts scrollen",
    scrollLeftTitle: "Nach links scrollen",
    actionEnterCity: "Stadt eingeben",
    clearInputTitle: "Eingabe löschen",
    locateMeTitle: "Auf meine Position zentrieren",
    navFollowPaused: "📍 Automatische Verfolgung pausiert. Tippen Sie auf das GPS-Symbol zum Zentrieren.",
    navFollowing: "🎯 Automatische Verfolgung aktiv",
    toggleExitTitle: "Günstige Tankstellen an unmittelbaren Autobahnausfahrten (< 1,5 km) einbeziehen",
    refRoutesTest: "Testen",
    refRoutesToggleTitle: "52 Referenzrouten anzeigen",
    refRoutesSub: "4 Korridore pro Land (13 europäische Länder)",
    refRoutesTitle: "52 Referenzrouten",

    pageTitle: "FuelPilot • Autobahn-Tankstellen & Kraftstoffpreise",
    tagline: "Kraftstoffpreise & Autobahnraststätten",
    privacy: "Datenschutz",
    guide: "Hilfe",
    guideTitle: "Bedienungsanleitung & Leitfaden",
    live: "Live-Preise",
    refreshTitle: "FuelCoPilot aktualisieren",
    sec1: "1. Routenwahl",
    startPlaceholder: "Adresse, Ort, Parkplatz, Stadt...",
    endPlaceholder: "Adresse, Ort, Parkplatz, Stadt...",
    stepPlaceholder: (n) => `Zwischenstopp ${n} (z. B. Köln, Nürnberg...)`,
    removeStepTitle: "Zwischenstopp entfernen",
    addStep: "+ Stopp",
    calcBtn: "<span>🚀</span> Route berechnen",
    calcInProgress: "Route wird berechnet...",
    startNav: "Starten",
    stopNav: "Stoppen",
    navFollowing: "Starten",
    currentPos: "📍 Mein aktueller Standort",
    estimatedPos: "📍 Mein geschätzter Standort",
    locating: "Standort wird ermittelt...",
    locationError: "GPS-Standort konnte nicht ermittelt werden.",
    fromCurrentPos: (km) => `🎯 In ${km} km`,
    editBtn: "<span>✏️</span> Ändern",
    closeBtn: "<span>✖</span> Schließen",
    editBtnTitle: "Route ändern",
    allBrands: "🏢 Alle Marken",
    filterBrandTitle: "Nach Marke filtern",
    filterFuelTitle: "Nach Kraftstoff filtern",
    sortTitle: "Sortierung",
    sec3: "3. Autobahntankstellen",
    sortRoute: "Sortierung: Routenverlauf",
    sortPrice: "Sortierung: Günstigste zuerst",
    sortDist: "Sortierung: Entfernung",
    tabMap: "Karte",
    tabList: "Liste & Filter",
    coverage: "Abgedecktes Netz: 🇫🇷 Frankreich • 🇩🇪 Deutschland • 🇧🇪 Belgien • 🇳🇱 Niederlande • 🇮🇹 Italien • 🇪🇸 Spanien • 🇵🇹 Portugal • 🇬🇧 Vereinigtes Königreich • 🇱🇺 Luxemburg • 🇦🇹 Österreich • 🇨🇭 Schweiz • 🇸🇮 Slowenien • 🇭🇷 Kroatien",
    recentHdr: "🕒 Letzte 10 Orte",
    bestPrice: "⭐ NIEDRIGSTER PREIS",
    fromStart: (km) => `🎯 In ${km} km`,
    stationsCount: (n) => `${n} Tankstelle${n !== 1 ? 'n' : ''} auf der Route`,
    unavail: "⚠️ Nicht verfügbar",
    noPrice: "Keine Preisangabe",
    priceLbl: "Preis",
    outOfStock: "⚠️ Ausverkauft:",
    estimatedPrice: "ℹ️ Richtpreis (kein Live-Preis)",
    recommended: "🔵 Empfohlen",
    optionN: (n) => `🟠 Option ${n}`,
    directRoute: "Direkte Route",
    countryCH: "Schweiz",
    countryFR: "Frankreich",
    countryDE: "Deutschland",
    countryES: "Spanien",
    countryIT: "Italien",
    countryGB: "Vereinigtes Königreich",
    countryIE: "Irland",
    countryBE: "Belgien",
    countryPT: "Portugal",
    countryNL: "Niederlande",
    countryLU: "Luxemburg",
    countryAT: "Österreich",
    countrySI: "Slowenien",
    countryHR: "Kroatien",
    areasCount: (n) => `${n} Raststätten`,
    areasListed: (n) => `${n} Autobahnraststätten • Live-Preise`,
    kmMarker: (hw, pk) => `${hw || 'Autobahn'} • km ${pk}`,
    popupDirDist: (dir, km) => `Richtung: ${dir} • In ${km} km`,
    sensDirect: "Fahrtrichtung",
    sensInverse: "Gegenrichtung",
    sensDouble: "Beide Richtungen",
    wazeTitle: "Mit Waze navigieren",
    gmapsTitle: "Mit Google Maps navigieren",
    mapRoad: "🗺️ Straßenkarte",
    mapOsm: "🌍 OpenStreetMap",
    mapSat: "🛰️ Satellitenansicht",
    emptyInitial: "Wählen Sie einen Start- und Zielort, um Autobahntankstellen und deren Kilometrierung anzuzeigen.",
    emptyFilteredTitle: "Keine Autobahntankstelle mit diesen Kriterien gefunden.",
    emptyFilteredSub: "Versuchen Sie „Alle Marken“ oder einen anderen Kraftstoff auszuwählen.",
    alertMissingPoints: "Bitte geben Sie einen Startort und einen Zielort ein.",
    alertNoRoute: "Keine Straßenroute gefunden.",
    alertServerError: "Routenserver nicht erreichbar. Bitte versuchen Sie es erneut.",
    amazonBadge: "🛒 EMPFOHLENES REISEZUBEHÖR",
    amazonView: "Ansehen ➔",
    amazonDisclosure: "Als Amazon-Partner verdienen wir an qualifizierten Verkäufen.",
    amazonItems: [
      { icon: "📱", name: "Kfz-Handyhalterung Lüftung / MagSafe", sub: "Ultrastabiler Halt für die GPS-Navigation", url: "https://www.amazon.de/s?k=handyhalterung+auto+lueftung+magsafe&tag=watermetrics-21" },
      { icon: "⚡", name: "65W USB-C Schnellladegerät fürs Auto", sub: "Schnelles Aufladen während der Fahrt", url: "https://www.amazon.de/s?k=kfz+ladegeraet+usb+c+schnellladen&tag=watermetrics-21" }
    ],
    evdanceBadge: "⚡ E-MOBILITÄTS-PARTNER • EVDANCE",
    evdanceTitle: "EVDANCE Mobile Ladegeräte & Typ-2-Kabel",
    evdanceSub: "Bis zu -20 % im gesamten EU-Shop • Code:",
    evdanceCta: "Ansehen -20% ➔",
    evdanceDisclosure: "Partner-Link • Rabattcode EVEU20 gültig auf eu.evdances.com",
    fuelInfoBtnTitle: "Kraftstoffbezeichnungen nach Ländern",
    fuelInfoTitle: "⛽ Kraftstoff-Übersicht nach Ländern",
    fuelInfoSubtitle: "Offizielle Bezeichnungen an der Zapfsäule (EU-Norm EN 16942)",
    fuelColNorm: "EU-Norm",
    fuelCatE10: "Super 95 (E10)",
    fuelCatE5: "Super 95 (E5)",
    fuelCatSp98: "Super Plus 98 (E5)",
    fuelCatDiesel: "Diesel",
    fuelCatLpg: "Autogas (LPG)",
    fuelCatE85: "Bioethanol / Erdgas",
    defaultCountry: "DE",
    today: "Heute",
    yesterday: "Gestern",
    atTime: "um",
    verifiedAt: "Stand:",
    toggleExit: "🚪 Ausfahrt-Tankstellen (< 1,5 km)",
    statusOpen: "🟢 Gastronomie geöffnet",
    statusClosing: "🟡 Gastronomie schließt bald",
    statusNight: "🌙 Kraftstoff 24/7 · Gastro zu",
    statusScheduleOpen: "🟢 Gastronomie geöffnet (06:30 - 21:30)",
    statusScheduleClosing: "🟡 Schließt bald (Schließung 22:00)",
    statusScheduleNight: "🌙 Gastronomie geschlossen (Öffnung 06:30)",
    pumps247: "Zapfsäulen & Kartenautomat: 24/7",
    foodLabel: "Gastronomie:",
    amenitiesBrandsTitle: "☕ Marken & Gastronomie",
    amenitiesServicesTitle: "🛠️ Raststätten-Services",
    moreBrands: (n) => `+${n} Marken`,
    hoursTitle: "🕒 ÖFFNUNGSZEITEN",
    offMotorwayBadge: (d, exitNum) => exitNum ? `${d} von Ausfahrt ${exitNum}` : `${d} von der Autobahnausfahrt`,
    offMotorwayPopupTitle: "Station außerhalb der Autobahn",
    offMotorwayPopupDesc: (d, exitNum) => exitNum ? `Erreichbar an Ausfahrt ${exitNum} (~${d})` : `An der Autobahnausfahrt / Mautstelle (~${d})`,
    offMotorwayTooltip: "Tankstelle außerhalb der Autobahn, direkt an der Ausfahrt",
    defaultHighway: "Autobahn",
    weatherLoading: "Live-Wetter",
    fuelUnavailable: "Nicht verf."
  },
  en: {    scrollRightTitle: "Scroll right",
    scrollLeftTitle: "Scroll left",
    actionEnterCity: "Enter city",
    clearInputTitle: "Clear input",
    locateMeTitle: "Center on my location",
    navFollowPaused: "📍 Auto-follow paused. Tap the GPS icon to recenter.",
    navFollowing: "🎯 Auto-follow active",
    toggleExitTitle: "Include discount stations at immediate motorway exits (< 1.5 km)",
    refRoutesTest: "Test",
    refRoutesToggleTitle: "Show 52 reference routes",
    refRoutesSub: "4 corridors per country (13 European countries)",
    refRoutesTitle: "52 Reference Routes",

    pageTitle: "FuelPilot • Motorway Fuel Prices & Service Areas",
    tagline: "Motorway fuel prices & service areas",
    privacy: "Privacy",
    guide: "Guide",
    guideTitle: "User Guide & Manual",
    live: "Live prices",
    refreshTitle: "Refresh FuelCoPilot",
    sec1: "1. Route planner",
    startPlaceholder: "Address, place, parking, city...",
    endPlaceholder: "Address, place, parking, city...",
    stepPlaceholder: (n) => `Stop ${n} (e.g. Oxford, Reading...)`,
    removeStepTitle: "Remove stop",
    addStep: "+ Stop",
    calcBtn: "<span>🚀</span> Calculate route",
    calcInProgress: "Calculating route...",
    startNav: "Start",
    stopNav: "Stop",
    navFollowing: "Start",
    currentPos: "📍 My current location",
    estimatedPos: "📍 My estimated location",
    locating: "Locating your position...",
    locationError: "Unable to get GPS location.",
    fromCurrentPos: (km) => `🎯 In ${km} km`,
    editBtn: "<span>✏️</span> Edit",
    closeBtn: "<span>✖</span> Close",
    editBtnTitle: "Edit route",
    allBrands: "🏢 All brands",
    filterBrandTitle: "Filter by Brand",
    filterFuelTitle: "Filter by Fuel",
    sortTitle: "Sort order",
    sec3: "3. Motorway stations",
    sortRoute: "Sort: Route order",
    sortPrice: "Sort: Cheapest first",
    sortDist: "Sort: Distance",
    tabMap: "Map",
    tabList: "List & Filters",
    coverage: "Covered network: 🇫🇷 France • 🇩🇪 Germany • 🇧🇪 Belgium • 🇳🇱 Netherlands • 🇮🇹 Italy • 🇪🇸 Spain • 🇵🇹 Portugal • 🇬🇧 United Kingdom • 🇱🇺 Luxembourg • 🇦🇹 Austria • 🇨🇭 Switzerland • 🇸🇮 Slovenia • 🇭🇷 Croatia",
    recentHdr: "🕒 10 recent locations",
    bestPrice: "⭐ LOWEST PRICE",
    fromStart: (km) => `🎯 In ${km} km`,
    stationsCount: (n) => `${n} station${n !== 1 ? 's' : ''} on route`,
    unavail: "⚠️ Unavailable",
    noPrice: "Not reported",
    priceLbl: "Price",
    outOfStock: "⚠️ Out of stock:",
    estimatedPrice: "ℹ️ Indicative price (not live)",
    recommended: "🔵 Recommended",
    optionN: (n) => `🟠 Option ${n}`,
    directRoute: "Direct route",
    countryCH: "Switzerland",
    countryFR: "France",
    countryDE: "Germany",
    countryES: "Spain",
    countryIT: "Italy",
    countryGB: "United Kingdom",
    countryIE: "Ireland",
    countryBE: "Belgium",
    countryPT: "Portugal",
    countryNL: "Netherlands",
    countryLU: "Luxembourg",
    countryAT: "Austria",
    countrySI: "Slovenia",
    countryHR: "Croatia",
    areasCount: (n) => `${n} areas`,
    areasListed: (n) => `${n} service areas • Live prices`,
    kmMarker: (hw, pk) => `${hw || 'Motorway'} • Marker km ${pk}`,
    popupDirDist: (dir, km) => `Direction: ${dir} • In ${km} km`,
    sensDirect: "Outbound",
    sensInverse: "Inbound",
    sensDouble: "Both directions",
    wazeTitle: "Navigate with Waze",
    gmapsTitle: "Navigate with Google Maps",
    mapRoad: "🗺️ Road Map",
    mapOsm: "🌍 OpenStreetMap",
    mapSat: "🛰️ Satellite View",
    emptyInitial: "Select a departure and arrival to display motorway service stations and their mileage markers.",
    emptyFilteredTitle: "No motorway station found matching these criteria.",
    emptyFilteredSub: "Try selecting \"All brands\" or another fuel type.",
    alertMissingPoints: "Please enter a departure point and an arrival point.",
    alertNoRoute: "No driving route found.",
    alertServerError: "Unable to reach the routing server. Please try again.",
    amazonBadge: "🛒 RECOMMENDED ROAD TRIP GEAR",
    amazonView: "View ➔",
    amazonDisclosure: "As an Amazon Associate, we earn from qualifying purchases.",
    amazonItems: [
      { icon: "📱", name: "MagSafe / Air Vent Car Phone Mount", sub: "Ultra-stable hold for GPS navigation", url: "https://www.amazon.co.uk/s?k=car+phone+holder+air+vent+magsafe&tag=watermetrics-21" },
      { icon: "⚡", name: "65W Fast USB-C Car Charger", sub: "Fast charging during your journey", url: "https://www.amazon.co.uk/s?k=fast+usb+c+car+charger+65w&tag=watermetrics-21" }
    ],
    evdanceBadge: "⚡ EV CHARGING PARTNER • EVDANCE",
    evdanceTitle: "EVDANCE Portable EV Chargers & Type 2 Cables",
    evdanceSub: "Up to 20% OFF sitewide on EU store • Code:",
    evdanceCta: "Shop -20% ➔",
    evdanceDisclosure: "Affiliate partner link • Promo code EVEU20 valid on eu.evdances.com",
    fuelInfoBtnTitle: "Fuel name correspondence across countries",
    fuelInfoTitle: "⛽ Fuel Names by Country",
    fuelInfoSubtitle: "Official pump labels across Europe (EN 16942 standard)",
    fuelColNorm: "EU Label",
    fuelCatE10: "Unleaded 95 (E10)",
    fuelCatE5: "Unleaded 95 (E5)",
    fuelCatSp98: "Super Unleaded 98",
    fuelCatDiesel: "Diesel",
    fuelCatLpg: "LPG Autogas",
    fuelCatE85: "Bioethanol / CNG",
    defaultCountry: "GB",
    today: "Today",
    yesterday: "Yesterday",
    atTime: "at",
    verifiedAt: "Updated:",
    toggleExit: "🚪 Exit stations (< 1.5 km)",
    statusOpen: "🟢 Dining & shops open",
    statusClosing: "🟡 Dining closing soon",
    statusNight: "🌙 Fuel 24/7 · Dining closed",
    statusScheduleOpen: "🟢 Dining open (06:30 - 21:30)",
    statusScheduleClosing: "🟡 Dining closing soon (closes at 22:00)",
    statusScheduleNight: "🌙 Dining closed (reopens at 06:30)",
    pumps247: "Fuel & charging: 24/7 (Card pay)",
    foodLabel: "Dining & shops:",
    amenitiesBrandsTitle: "☕ Brands & Dining",
    amenitiesServicesTitle: "🛠️ Service area amenities",
    moreBrands: (n) => `+${n} brands`,
    hoursTitle: "🕒 OPENING HOURS",
    offMotorwayBadge: (d, exitNum) => exitNum ? `${d} from exit ${exitNum}` : `${d} from motorway exit`,
    offMotorwayPopupTitle: "Off-motorway station",
    offMotorwayPopupDesc: (d, exitNum) => exitNum ? `Accessible from exit ${exitNum} (~${d})` : `Accessible from motorway exit / toll (~${d})`,
    offMotorwayTooltip: "Station located off the motorway, right at the exit",
    defaultHighway: "Motorway",
    weatherLoading: "Live weather",
    fuelUnavailable: "Unavailable"
  },
  it: {    scrollRightTitle: "Scorri a destra",
    scrollLeftTitle: "Scorri a sinistra",
    actionEnterCity: "Inserisci città",
    clearInputTitle: "Cancella inserimento",
    locateMeTitle: "Centra sulla mia posizione",
    navFollowPaused: "📍 Inseguimento automatico in pausa. Tocca l'icona GPS per ricentrare.",
    navFollowing: "🎯 Inseguimento automatico attivo",
    toggleExitTitle: "Includi distributori economici alle uscite autostradali immediate (< 1,5 km)",
    refRoutesTest: "Testa",
    refRoutesToggleTitle: "Mostra 52 itinerari di riferimento",
    refRoutesSub: "4 corridoi per paese (13 paesi europei)",
    refRoutesTitle: "52 Itinerari di riferimento",

    pageTitle: "FuelPilot • Prezzi Carburante e Aree Autostradali",
    tagline: "Prezzi carburante e aree autostradali",
    privacy: "Privacy",
    guide: "Guida",
    guideTitle: "Guida all'uso",
    live: "Prezzi live",
    refreshTitle: "Aggiorna FuelCoPilot",
    sec1: "1. Scelta dell'itinerario",
    startPlaceholder: "Indirizzo, luogo, parcheggio, città...",
    endPlaceholder: "Indirizzo, luogo, parcheggio, città...",
    stepPlaceholder: (n) => `Tappa ${n} (es. Bologna, Firenze...)`,
    removeStepTitle: "Rimuovi tappa",
    addStep: "+ Tappa",
    calcBtn: "<span>🚀</span> Calcola itinerario",
    calcInProgress: "Calcolo in corso...",
    startNav: "Avvia",
    stopNav: "Arresta",
    navFollowing: "Avvia",
    currentPos: "📍 La mia posizione attuale",
    estimatedPos: "📍 La mia posizione stimata",
    locating: "Ricerca della posizione...",
    locationError: "Impossibile determinare la posizione GPS.",
    fromCurrentPos: (km) => `🎯 Tra ${km} km`,
    editBtn: "<span>✏️</span> Modifica",
    closeBtn: "<span>✖</span> Chiudi",
    editBtnTitle: "Modifica percorso",
    allBrands: "🏢 Tutti i marchi",
    filterBrandTitle: "Filtra per Marchio",
    filterFuelTitle: "Filtra per Carburante",
    sortTitle: "Ordine",
    sec3: "3. Stazioni autostradali",
    sortRoute: "Ordine: Percorso",
    sortPrice: "Ordine: Più economico",
    sortDist: "Ordine: Distanza",
    tabMap: "Mappa",
    tabList: "Lista e Filtri",
    coverage: "Rete coperta: 🇫🇷 Francia • 🇩🇪 Germania • 🇧🇪 Belgio • 🇳🇱 Paesi Bassi • 🇮🇹 Italia • 🇪🇸 Spagna • 🇵🇹 Portogallo • 🇬🇧 Regno Unito • 🇱🇺 Lussemburgo • 🇦🇹 Austria • 🇨🇭 Svizzera • 🇸🇮 Slovenia • 🇭🇷 Croazia",
    recentHdr: "🕒 Ultime 10 località",
    bestPrice: "⭐ PREZZO PIÙ BASSO",
    fromStart: (km) => `🎯 Tra ${km} km`,
    stationsCount: (n) => `${n} stazion${n === 1 ? 'e' : 'i'} sul percorso`,
    unavail: "⚠️ Non disponibile",
    noPrice: "Non comunicati",
    priceLbl: "Prezzo",
    outOfStock: "⚠️ Esaurito:",
    estimatedPrice: "ℹ️ Prezzo indicativo (non in tempo reale)",
    recommended: "🔵 Consigliato",
    optionN: (n) => `🟠 Opzione ${n}`,
    directRoute: "Itinerario diretto",
    countryCH: "Svizzera",
    countryFR: "Francia",
    countryDE: "Germania",
    countryES: "Spagna",
    countryIT: "Italia",
    countryGB: "Regno Unito",
    countryIE: "Irlanda",
    countryBE: "Belgio",
    countryPT: "Portogallo",
    countryNL: "Paesi Bassi",
    countryLU: "Lussemburgo",
    countryAT: "Austria",
    countrySI: "Slovenia",
    countryHR: "Croatia",
    areasCount: (n) => `${n} aree`,
    areasListed: (n) => `${n} aree di servizio • Prezzi live`,
    kmMarker: (hw, pk) => `${hw || 'Autostrada'} • Km ${pk}`,
    popupDirDist: (dir, km) => `Direzione: ${dir} • Tra ${km} km`,
    sensDirect: "Senso diretto",
    sensInverse: "Senso opposto",
    sensDouble: "Doppio senso",
    wazeTitle: "Naviga con Waze",
    gmapsTitle: "Naviga con Google Maps",
    mapRoad: "🗺️ Mappa Stradale",
    mapOsm: "🌍 OpenStreetMap",
    mapSat: "🛰️ Vista Satellitare",
    emptyInitial: "Seleziona una partenza e un arrivo per visualizzare le stazioni autostradali e le progressive chilometriche.",
    emptyFilteredTitle: "Nessuna stazione autostradale trovata con questi criteri.",
    emptyFilteredSub: "Prova a selezionare \"Tutti i marchi\" o un altro carburante.",
    alertMissingPoints: "Inserisci un punto di partenza e un punto di arrivo.",
    alertNoRoute: "Nessun itinerario stradale trovato.",
    alertServerError: "Impossibile contattare il server di calcolo percorso. Riprova.",
    amazonBadge: "🛒 ACCESSORI VIAGGIO CONSIGLIATI",
    amazonView: "Vedi ➔",
    amazonDisclosure: "In qualità di Affiliato Amazon, riceviamo un guadagno dagli acquisti idonei.",
    amazonItems: [
      { icon: "📱", name: "Supporto Auto Smartphone / MagSafe", sub: "Tenuta ultra-stabile per navigazione GPS", url: "https://www.amazon.it/s?k=supporto+auto+smartphone+bocchette+magsafe&tag=watermetrics-21" },
      { icon: "⚡", name: "Caricabatterie Auto Rapido USB-C 65W", sub: "Ricarica rapida durante il viaggio", url: "https://www.amazon.it/s?k=caricabatterie+auto+usb+c+rapido&tag=watermetrics-21" }
    ],
    evdanceBadge: "⚡ PARTNER RICARICA EV • EVDANCE",
    evdanceTitle: "Caricatori Portatili & Cavi Tipo 2 EVDANCE",
    evdanceSub: "Fino al -20% su tutto lo store UE • Codice:",
    evdanceCta: "Vedi -20% ➔",
    evdanceDisclosure: "Link affiliato partner • Codice promo EVEU20 valido su eu.evdances.com",
    fuelInfoBtnTitle: "Tabella di corrispondenza dei carburanti per paese",
    fuelInfoTitle: "⛽ Corrispondenza Carburanti per Paese",
    fuelInfoSubtitle: "Denominazioni ufficiali alla pompa (Norma europea EN 16942)",
    fuelColNorm: "Norma UE",
    fuelCatE10: "Benzina 95 (E10)",
    fuelCatE5: "Benzina 95 (E5)",
    fuelCatSp98: "Benzina 98/100 (E5)",
    fuelCatDiesel: "Gasolio / Diesel",
    fuelCatLpg: "GPL",
    fuelCatE85: "Bioetanolo / Metano",
    defaultCountry: "IT",
    today: "Oggi",
    yesterday: "Ieri",
    atTime: "alle",
    verifiedAt: "Rilevato:",
    toggleExit: "🚪 Stazioni all'uscita (< 1,5 km)",
    statusOpen: "🟢 Ristorazione aperta",
    statusClosing: "🟡 Chiusura ristoro a breve",
    statusNight: "🌙 Carburante 24/7 · Ristoro chiuso",
    statusScheduleOpen: "🟢 Ristorazione aperta (06:30 - 21:30)",
    statusScheduleClosing: "🟡 Chiusura ristoro a breve (ore 22:00)",
    statusScheduleNight: "🌙 Ristorazione chiusa (riapertura ore 06:30)",
    pumps247: "Pompe & colonnine: 24h/24 (Self-service)",
    foodLabel: "Ristorazione:",
    amenitiesBrandsTitle: "☕ Marchi & Ristorazione",
    amenitiesServicesTitle: "🛠️ Servizi dell'area",
    moreBrands: (n) => `+${n} marchi`,
    hoursTitle: "🕒 ORARI DI APERTURA",
    offMotorwayBadge: (d, exitNum) => exitNum ? `A ${d} dall'uscita n. ${exitNum}` : `A ${d} dall'uscita autostradale`,
    offMotorwayPopupTitle: "Stazione fuori autostrada",
    offMotorwayPopupDesc: (d, exitNum) => exitNum ? `Raggiungibile all'uscita n. ${exitNum} (~${d})` : `All'uscita autostradale / casello (~${d})`,
    offMotorwayTooltip: "Stazione situata fuori autostrada, subito all'uscita",
    defaultHighway: "Autostrada",
    weatherLoading: "Meteo in tempo reale",
    fuelUnavailable: "Non disp."
  },
  nl: {    scrollRightTitle: "Naar rechts scrollen",
    scrollLeftTitle: "Naar links scrollen",
    actionEnterCity: "Voer stad in",
    clearInputTitle: "Invoer wissen",
    locateMeTitle: "Centreren op mijn locatie",
    navFollowPaused: "📍 Automatisch volgen gepauzeerd. Tik op het GPS-icoon om te hercentreren.",
    navFollowing: "🎯 Automatisch volgen actief",
    toggleExitTitle: "Inclusief voordelige stations bij afritten (< 1,5 km van de snelweg)",
    refRoutesTest: "Testen",
    refRoutesToggleTitle: "Toon 52 referentieroutes",
    refRoutesSub: "4 corridors per land (13 Europese landen)",
    refRoutesTitle: "52 Referentieroutes",

    pageTitle: "FuelPilot • Snelweg Brandstofprijzen & Laadpalen",
    tagline: "Brandstofprijzen & snelwegparkings",
    privacy: "Privacy",
    guide: "Gids",
    guideTitle: "Handleiding & Gebruikersgids",
    live: "Actuele prijzen",
    refreshTitle: "FuelCoPilot vernieuwen",
    sec1: "1. Routekeuze",
    startPlaceholder: "Adres, plek, parking, stad...",
    endPlaceholder: "Adres, plek, parking, stad...",
    stepPlaceholder: (n) => `Tussenstop ${n} (bijv. Gent, Antwerpen...)`,
    removeStepTitle: "Tussenstop verwijderen",
    addStep: "+ Tussenstop",
    calcBtn: "<span>🚀</span> Route berekenen",
    calcInProgress: "Route berekenen...",
    startNav: "Starten",
    stopNav: "Stoppen",
    navFollowing: "Starten",
    currentPos: "📍 Mijn huidige positie",
    estimatedPos: "📍 Mijn geschatte positie",
    locating: "Positie bepalen...",
    locationError: "Kan gps-positie niet bepalen.",
    fromCurrentPos: (km) => `🎯 Over ${km} km`,
    upcomingStationsCount: (n) => `${n} volgend${n > 1 ? 'e' : ''} station${n > 1 ? 's' : ''}`,
    editBtn: "<span>✏️</span> Wijzigen",
    closeBtn: "<span>✖</span> Sluiten",
    editBtnTitle: "Route aanpassen",
    allBrands: "🏢 Alle merken",
    filterBrandTitle: "Filteren op merk",
    filterFuelTitle: "Filteren op brandstof",
    sortTitle: "Sorteervolgorde",
    sec3: "3. Snelwegstations",
    sortRoute: "Sortering: Routevolgorde",
    sortPrice: "Sortering: Goedkoopste eerst",
    sortDist: "Sortering: Afstand",
    tabMap: "Kaart",
    tabList: "Lijst & Filters",
    coverage: "Gedekt netwerk: 🇫🇷 Frankrijk • 🇩🇪 Duitsland • 🇧🇪 België • 🇳🇱 Nederland • 🇮🇹 Italië • 🇪🇸 Spanje • 🇵🇹 Portugal • 🇬🇧 Verenigd Koninkrijk • 🇱🇺 Luxemburg • 🇦🇹 Oostenrijk • 🇨🇭 Zwitserland • 🇸🇮 Slovenië • 🇭🇷 Kroatië",
    recentHdr: "🕒 10 recente locaties",
    bestPrice: "⭐ LAAGSTE PRIJS",
    fromStart: (km) => `🎯 Over ${km} km`,
    stationsCount: (n) => `${n} station${n !== 1 ? 's' : ''} op de route`,
    unavail: "⚠️ Niet beschikbaar",
    noPrice: "Niet doorgegeven",
    priceLbl: "Prijs",
    outOfStock: "⚠️ Uitverkocht:",
    estimatedPrice: "ℹ️ Indicatieve prijs (niet actueel doorgegeven)",
    recommended: "🔵 Aanbevolen",
    optionN: (n) => `🟠 Optie ${n}`,
    directRoute: "Directe route",
    countryCH: "Zwitserland",
    countryFR: "Frankrijk",
    countryDE: "Duitsland",
    countryES: "Spanje",
    countryIT: "Italië",
    countryGB: "Verenigd Koninkrijk",
    countryIE: "Ierland",
    countryBE: "België",
    countryPT: "Portugal",
    countryNL: "Nederland",
    countryLU: "Luxemburg",
    countryAT: "Oostenrijk",
    countrySI: "Slovenië",
    countryHR: "Kroatië",
    areasCount: (n) => `${n} verzorgingsplaatsen`,
    areasListed: (n) => `${n} verzorgingsplaatsen geregistreerd • Actuele prijzen`,
    kmMarker: (hw, pk) => `${hw || 'Snelweg'} • Kilometerpaal ${pk}`,
    popupDirDist: (dir, km) => `Richting: ${dir} • Over ${km} km`,
    sensDirect: "Heenrichting",
    sensInverse: "Terugrichting",
    sensDouble: "Beide richtingen",
    wazeTitle: "Navigeren met Waze",
    gmapsTitle: "Navigeren met Google Maps",
    mapRoad: "🗺️ Wegenkaart",
    mapOsm: "🌍 OpenStreetMap",
    mapSat: "🛰️ Satellietbeeld",
    emptyInitial: "Selecteer een vertrekpunt en een bestemming om snelwegstations en hun kilometerpalen te tonen.",
    emptyFilteredTitle: "Geen enkel snelwegstation gevonden met deze criteria.",
    emptyFilteredSub: "Probeer « Alle merken » of een andere brandstof te selecteren.",
    alertMissingPoints: "Voer een vertrekpunt en een aankomstpunt in.",
    alertNoRoute: "Geen route voor auto's gevonden.",
    alertServerError: "Kan de routeserver niet bereiken. Probeer het opnieuw.",
    amazonBadge: "🛒 AANBEVOLEN REISUITRUSTING",
    amazonView: "Bekijk ➔",
    amazonDisclosure: "Als Amazon-partner verdienen we aan in aanmerking komende aankopen.",
    amazonItems: [
      { icon: "📱", name: "Smartphonehouder Ventilatierooster / MagSafe", sub: "Ultrastabiel voor gps-navigatie", url: "https://www.amazon.de/s?k=auto+handyhalterung+lueftung+magsafe&tag=watermetrics-21" },
      { icon: "⚡", name: "Snelle 65W USB-C Autolader", sub: "Snelladen tijdens uw rit", url: "https://www.amazon.de/s?k=usb+c+auto+ladegeraet+schnellladen+65w&tag=watermetrics-21" }
    ],
    evdanceBadge: "⚡ EV LAADPARTNER • EVDANCE",
    evdanceTitle: "EVDANCE Draagbare EV-laders & Type 2 Kabels",
    evdanceSub: "Tot -20% korting op de hele EU-webshop • Code:",
    evdanceCta: "Bekijk -20% ➔",
    evdanceDisclosure: "Affiliate partnerlink • Promotiecode EVEU20 geldig op eu.evdances.com",
    fuelInfoBtnTitle: "Namen van brandstoffen per land",
    fuelInfoTitle: "⛽ Brandstofnamen per land",
    fuelInfoSubtitle: "Officiële pomplabels in Europa (Norm EN 16942)",
    fuelColNorm: "EU-norm",
    fuelCatE10: "Euro 95 (E10)",
    fuelCatE5: "Super 95 (E5)",
    fuelCatSp98: "Super Plus 98 (E5)",
    fuelCatDiesel: "Diesel (B7)",
    fuelCatLpg: "LPG / Autogas",
    fuelCatE85: "Bio-ethanol / Aardgas",
    defaultCountry: "BE",
    today: "Vandaag",
    yesterday: "Gisteren",
    atTime: "om",
    verifiedAt: "Geverifieerd:",
    toggleExit: "🚪 Stations bij afrit (< 1,5 km)",
    statusOpen: "🟢 Horeca open",
    statusClosing: "🟡 Horeca sluit binnenkort",
    statusNight: "🌙 Brandstof 24/7 · Horeca gesloten",
    statusScheduleOpen: "🟢 Horeca open (06:30 - 21:30)",
    statusScheduleClosing: "🟡 Horeca sluit binnenkort (sluit om 22:00)",
    statusScheduleNight: "🌙 Horeca gesloten (heropent om 06:30)",
    pumps247: "Brandstof & Betaalautomaat: 24/7",
    foodLabel: "Horeca & winkels:",
    amenitiesBrandsTitle: "☕ Merken & Horeca",
    amenitiesServicesTitle: "🛠️ Diensten van de verzorgingsplaats",
    moreBrands: (n) => `+${n} merken`,
    hoursTitle: "🕒 OPENINGSTIJDEN",
    offMotorwayBadge: (d, exitNum) => exitNum ? `Op ${d} van afrit nr. ${exitNum}` : `Op ${d} van de snelwegafrit`,
    offMotorwayPopupTitle: "Station buiten de snelweg",
    offMotorwayPopupDesc: (d, exitNum) => exitNum ? `Bereikbaar via afrit nr. ${exitNum} (~${d})` : `Bereikbaar via snelwegafrit / tolpoort (~${d})`,
    offMotorwayTooltip: "Station gelegen buiten de snelweg, direct aan de afrit",
    defaultHighway: "Snelweg",
    weatherLoading: "Actueel weer",
    fuelUnavailable: "Niet besch."
  },
  es: {    scrollRightTitle: "Desplazar a la derecha",
    scrollLeftTitle: "Desplazar a la izquierda",
    actionEnterCity: "Escribir ciudad",
    clearInputTitle: "Borrar entrada",
    locateMeTitle: "Centrar en mi ubicación",
    navFollowPaused: "📍 Seguimiento automático en pausa. Toque el icono GPS para recentrar.",
    navFollowing: "🎯 Seguimiento automático activo",
    toggleExitTitle: "Incluir gasolineras económicas en salidas inmediatas de autopista (< 1,5 km)",
    refRoutesTest: "Probar",
    refRoutesToggleTitle: "Mostrar 52 itinerarios de referencia",
    refRoutesSub: "4 corredores por país (13 países europeos)",
    refRoutesTitle: "52 Itinerarios de referencia",

    pageTitle: "FuelPilot • Precios Carburante y Áreas de Autopista",
    tagline: "Precios de carburante y áreas de autopista",
    privacy: "Privacidad",
    guide: "Guía",
    guideTitle: "Guía de uso",
    live: "Precios en vivo",
    refreshTitle: "Actualizar FuelCoPilot",
    sec1: "1. Elección de ruta",
    startPlaceholder: "Dirección, lugar, parking, ciudad...",
    endPlaceholder: "Dirección, lugar, parking, ciudad...",
    stepPlaceholder: (n) => `Etapa ${n} (ej. Zaragoza, Burgos...)`,
    removeStepTitle: "Eliminar etapa",
    addStep: "+ Etapa",
    calcBtn: "<span>🚀</span> Calcular ruta",
    calcInProgress: "Calculando ruta...",
    startNav: "Iniciar",
    stopNav: "Detener",
    navFollowing: "Iniciar",
    currentPos: "📍 Mi ubicación actual",
    estimatedPos: "📍 Mi ubicación estimada",
    locating: "Buscando tu ubicación...",
    locationError: "No se pudo obtener la ubicación GPS.",
    fromCurrentPos: (km) => `🎯 En ${km} km`,
    editBtn: "<span>✏️</span> Modificar",
    closeBtn: "<span>✖</span> Cerrar",
    editBtnTitle: "Modificar ruta",
    allBrands: "🏢 Todas las marcas",
    filterBrandTitle: "Filtrar por Marca",
    filterFuelTitle: "Filtrar por Carburante",
    sortTitle: "Orden",
    sec3: "3. Estaciones de autopista",
    sortRoute: "Orden: En ruta",
    sortPrice: "Orden: Más barato",
    sortDist: "Orden: Distancia",
    tabMap: "Mapa",
    tabList: "Lista y Filtros",
    coverage: "Red cubierta: 🇫🇷 Francia • 🇩🇪 Alemania • 🇧🇪 Bélgica • 🇳🇱 Países Bajos • 🇮🇹 Italia • 🇪🇸 España • 🇵🇹 Portugal • 🇬🇧 Reino Unido • 🇱🇺 Luxemburgo • 🇦🇹 Austria • 🇨🇭 Suiza • 🇸🇮 Eslovenia • 🇭🇷 Croacia",
    recentHdr: "🕒 10 últimas localidades",
    bestPrice: "⭐ PRECIO MÁS BAJO",
    fromStart: (km) => `🎯 En ${km} km`,
    stationsCount: (n) => `${n} estaci${n === 1 ? 'ón' : 'ones'} en ruta`,
    unavail: "⚠️ No disponible",
    noPrice: "No comunicados",
    priceLbl: "Precio",
    outOfStock: "⚠️ Agotado:",
    estimatedPrice: "ℹ️ Precio orientativo (no en tiempo real)",
    recommended: "🔵 Recomendado",
    optionN: (n) => `🟠 Opción ${n}`,
    directRoute: "Ruta directa",
    countryCH: "Suiza",
    countryFR: "Francia",
    countryDE: "Alemania",
    countryES: "España",
    countryIT: "Italia",
    countryGB: "Reino Unido",
    countryIE: "Irlanda",
    countryBE: "Bélgica",
    countryPT: "Portugal",
    countryNL: "Países Baixos",
    countryLU: "Luxemburgo",
    countryAT: "Áustria",
    countrySI: "Eslovénia",
    countryHR: "Croácia",
    areasCount: (n) => `${n} áreas`,
    areasListed: (n) => `${n} áreas de servicio • Precios en vivo`,
    kmMarker: (hw, pk) => `${hw || 'Autopista'} • PK km ${pk}`,
    popupDirDist: (dir, km) => `Sentido: ${dir} • En ${km} km`,
    sensDirect: "Sentido directo",
    sensInverse: "Sentido inverso",
    sensDouble: "Doble sentido",
    wazeTitle: "Ir con Waze",
    gmapsTitle: "Ir con Google Maps",
    mapRoad: "🗺️ Mapa de Carreteras",
    mapOsm: "🌍 OpenStreetMap",
    mapSat: "🛰️ Vista Satélite",
    emptyInitial: "Seleccione un punto de salida y de llegada para mostrar las estaciones de autopista y sus puntos kilométricos.",
    emptyFilteredTitle: "No se encontraron estaciones de autopista con estos criterios.",
    emptyFilteredSub: "Pruebe a seleccionar \"Todas las marcas\" u otro carburante.",
    alertMissingPoints: "Por favor, introduzca un punto de salida y un punto de llegada.",
    alertNoRoute: "No se encontró ninguna ruta por carretera.",
    alertServerError: "No se pudo conectar con el servidor de rutas. Inténtelo de nuevo.",
    amazonBadge: "🛒 EQUIPAMIENTO DE VIAJE RECOMENDADO",
    amazonView: "Ver ➔",
    amazonDisclosure: "Como Afiliado de Amazon, obtenemos ingresos por las compras adscritas que cumplen los requisitos.",
    amazonItems: [
      { icon: "📱", name: "Soporte Móvil Coche Rejilla / MagSafe", sub: "Sujeción ultraestable para navegación GPS", url: "https://www.amazon.es/s?k=soporte+movil+coche+rejilla+magsafe&tag=watermetrics-21" },
      { icon: "⚡", name: "Cargador Coche Rápido USB-C 65W", sub: "Carga rápida durante su viaje", url: "https://www.amazon.es/s?k=cargador+coche+carga+rapida+usb+c&tag=watermetrics-21" }
    ],
    evdanceBadge: "⚡ SOCIO RECARGA VE • EVDANCE",
    evdanceTitle: "Cargadores Portátiles y Cables Tipo 2 EVDANCE",
    evdanceSub: "Hasta -20 % en toda la tienda UE • Código:",
    evdanceCta: "Ver -20% ➔",
    evdanceDisclosure: "Enlace de afiliado • Código promo EVEU20 válido en eu.evdances.com",
    fuelInfoBtnTitle: "Tabla de correspondencia de carburantes por país",
    fuelInfoTitle: "⛽ Correspondencia de Carburantes por País",
    fuelInfoSubtitle: "Denominaciones oficiales en surtidor (Norma europea EN 16942)",
    fuelColNorm: "Norma UE",
    fuelCatE10: "Gasolina 95 (E10)",
    fuelCatE5: "Gasolina 95 (E5)",
    fuelCatSp98: "Gasolina 98 (E5)",
    fuelCatDiesel: "Gasóleo / Diésel",
    fuelCatLpg: "GLP (Autogás)",
    fuelCatE85: "Bioetanol / GNC",
    defaultCountry: "ES",
    today: "Hoy",
    yesterday: "Ayer",
    atTime: "a las",
    verifiedAt: "Actualizado:",
    toggleExit: "🚪 Estaciones en salida (< 1,5 km)",
    statusOpen: "🟢 Restauración abierta",
    statusClosing: "🟡 Cierre rest. próximo",
    statusNight: "🌙 Carburante 24/7 · Rest. cerrada",
    statusScheduleOpen: "🟢 Restauración abierta (06:30 - 21:30)",
    statusScheduleClosing: "🟡 Cierre próximo (cierre a las 22:00)",
    statusScheduleNight: "🌙 Restauración cerrada (apertura 06:30)",
    pumps247: "Surtidores & recarga: 24h/24 (Tarjeta)",
    foodLabel: "Restauración:",
    amenitiesBrandsTitle: "☕ Marcas & Restauración",
    amenitiesServicesTitle: "🛠️ Servicios del área",
    moreBrands: (n) => `+${n} marcas`,
    hoursTitle: "🕒 HORARIOS DE APERTURA",
    offMotorwayBadge: (d, exitNum) => exitNum ? `A ${d} de la salida n.º ${exitNum}` : `A ${d} de la salida de autopista`,
    offMotorwayPopupTitle: "Estación fuera de autopista",
    offMotorwayPopupDesc: (d, exitNum) => exitNum ? `Accesible en la salida n.º ${exitNum} (~${d})` : `En la salida de la autopista / peaje (~${d})`,
    offMotorwayTooltip: "Estación fuera de autopista, justo en la salida",
    defaultHighway: "Autopista",
    weatherLoading: "Tiempo en vivo",
    fuelUnavailable: "No disp."
  },
  pt: {    scrollRightTitle: "Deslocar para a direita",
    scrollLeftTitle: "Deslocar para a esquerda",
    actionEnterCity: "Introduzir cidade",
    clearInputTitle: "Limpar campo",
    locateMeTitle: "Centrar na minha localização",
    navFollowPaused: "📍 Acompanhamento automático em pausa. Toque no ícone GPS para recentrar.",
    navFollowing: "🎯 Acompanhamento automático ativo",
    toggleExitTitle: "Incluir postos económicos nas saídas imediatas da autoestrada (< 1,5 km)",
    refRoutesToggleTitle: "Mostrar 52 itinerários de referência",
    refRoutesTitle: "52 Itinerários de referência",
    refRoutesSub: "4 corredores por país (13 países europeus)",
    refRoutesTest: "Testar",

    pageTitle: "FuelPilot • Combustível Autoestrada & Marcos PK",
    tagline: "Preços de combustível & áreas de serviço na autoestrada",
    privacy: "Privacidade",
    guide: "Guia",
    guideTitle: "Instruções & Guia de utilização",
    live: "Preços em tempo real",
    refreshTitle: "Atualizar o FuelCoPilot",
    sec1: "1. Escolha do itinerário",
    startPlaceholder: "Morada, local, parque, cidade...",
    endPlaceholder: "Morada, local, parque, cidade...",
    stepPlaceholder: (n) => `Paragem ${n} (ex: Coimbra, Leiria...)`,
    removeStepTitle: "Remover paragem",
    addStep: "+ Paragem",
    calcBtn: "<span>🚀</span> Calcular o itinerário",
    calcInProgress: "A calcular o itinerário...",
    startNav: "Iniciar",
    stopNav: "Parar",
    navFollowing: "Iniciar",
    currentPos: "📍 A minha localização atual",
    estimatedPos: "📍 A minha localização estimada",
    locating: "A procurar a sua localização...",
    locationError: "Não foi possível obter a sua localização GPS.",
    fromCurrentPos: (km) => `🎯 Em ${km} km`,
    upcomingStationsCount: (n) => `${n} área${n > 1 ? 's' : ''} de serviço a seguir`,
    editBtn: "<span>✏️</span> Modificar",
    closeBtn: "<span>✖</span> Fechar",
    editBtnTitle: "Modificar itinerário",
    allBrands: "🏢 Todas as marcas",
    filterBrandTitle: "Filtrar por Marca",
    filterFuelTitle: "Filtrar por Combustível",
    sortTitle: "Ordenação",
    sec3: "3. Áreas de serviço na autoestrada",
    sortRoute: "Ordem: No percurso",
    sortPrice: "Ordem: Mais barato primeiro",
    sortDist: "Ordem: Distância",
    tabMap: "Mapa",
    tabList: "Lista & Filtros",
    coverage: "Rede coberta: 🇫🇷 França • 🇩🇪 Alemanha • 🇧🇪 Bélgica • 🇳🇱 Países Baixos • 🇮🇹 Itália • 🇪🇸 Espanha • 🇵🇹 Portugal • 🇬🇧 Reino Unido • 🇱🇺 Luxemburgo • 🇦🇹 Áustria • 🇨🇭 Suíça • 🇸🇮 Eslovénia • 🇭🇷 Croácia",
    recentHdr: "🕒 10 últimas localidades",
    bestPrice: "⭐ PREÇO MAIS BAIXO",
    fromStart: (km) => `🎯 Em ${km} km`,
    stationsCount: (n) => `${n} área${n === 1 ? ' de serviço' : 's de serviço'} no percurso`,
    unavail: "⚠️ Indisponível",
    noPrice: "Não comunicado",
    priceLbl: "Preço",
    outOfStock: "⚠️ Esgotado:",
    estimatedPrice: "ℹ️ Preço indicativo (não recolhido em direto)",
    recommended: "🔵 Recomendado",
    optionN: (n) => `🟠 Opção ${n}`,
    directRoute: "Itinerário direto",
    countryCH: "Suíça",
    countryFR: "França",
    countryDE: "Alemanha",
    countryES: "Espanha",
    countryIT: "Itália",
    countryGB: "Reino Unido",
    countryIE: "Irlanda",
    countryBE: "Bélgica",
    countryPT: "Portugal",
    countryNL: "Países Baixos",
    countryLU: "Luxemburgo",
    countryAT: "Áustria",
    countrySI: "Eslovénia",
    countryHR: "Croácia",
    areasCount: (n) => `${n} áreas`,
    areasListed: (n) => `${n} áreas de serviço registadas • Preços em direto`,
    kmMarker: (hw, pk) => `${hw || 'Autoestrada'} • Marco km ${pk}`,
    popupDirDist: (dir, km) => `Sentido: ${dir} • Em ${km} km`,
    sensDirect: "Sentido direto",
    sensInverse: "Sentido inverso",
    sensDouble: "Ambos os sentidos",
    wazeTitle: "Ir com o Waze",
    gmapsTitle: "Ir com o Google Maps",
    mapRoad: "🗺️ Mapa Rodoviário",
    mapOsm: "🌍 OpenStreetMap",
    mapSat: "🛰️ Vista de Satélite",
    emptyInitial: "Selecione um ponto de partida e de chegada para ver as áreas de serviço de autoestrada e os seus marcos quilométricos.",
    emptyFilteredTitle: "Nenhuma área de serviço encontrada com estes critérios.",
    emptyFilteredSub: "Experimente selecionar « Todas as marcas » ou outro combustível.",
    alertMissingPoints: "Por favor, indique um ponto de partida e um ponto de chegada.",
    alertNoRoute: "Nenhum itinerário rodoviário encontrado.",
    alertServerError: "Não foi possível contactar o servidor de rotas. Tente novamente.",
    amazonBadge: "🛒 EQUIPAMENTO DE VIAGEM RECOMENDADO",
    amazonView: "Ver ➔",
    amazonDisclosure: "Como Associado da Amazon, ganhamos com compras qualificadas.",
    amazonItems: [
      { icon: "📱", name: "Suporte Telemóvel Carro Grelha / MagSafe", sub: "Fixação ultra-estável para GPS", url: "https://www.amazon.es/s?k=suporte+telemovel+carro&tag=watermetrics-21" },
      { icon: "⚡", name: "Carregador de Isqueiro USB-C Rápido 65W", sub: "Carregamento rápido durante a viagem", url: "https://www.amazon.es/s?k=carregador+isqueiro+usb+c+rapido&tag=watermetrics-21" }
    ],
    evdanceBadge: "⚡ PARCEIRO DE CARREGAMENTO VE • EVDANCE",
    evdanceTitle: "Carregadores Portáteis & Cabos Tipo 2 EVDANCE",
    evdanceSub: "Até -20% em toda a loja UE • Código:",
    evdanceCta: "Ver -20% ➔",
    evdanceDisclosure: "Ligação de parceiro afiliado • Código promocional EVEU20 válido em eu.evdances.com",
    fuelInfoBtnTitle: "Correspondência de combustíveis por país",
    fuelInfoTitle: "⛽ Correspondência de Combustíveis por País",
    fuelInfoSubtitle: "Denominações oficiais nas bombas (Norma europeia EN 16942)",
    fuelColNorm: "Norma UE",
    fuelCatE10: "Gasolina 95 (E10)",
    fuelCatE5: "Gasolina 95 (E5)",
    fuelCatSp98: "Gasolina 98 (E5)",
    fuelCatDiesel: "Gasóleo / Diesel",
    fuelCatLpg: "GPL Auto",
    fuelCatE85: "Bioetanol / GNC",
    defaultCountry: "PT",
    today: "Hoje",
    yesterday: "Ontem",
    atTime: "às",
    verifiedAt: "Atualizado:",
    toggleExit: "🚪 Postos na saída (< 1,5 km)",
    statusOpen: "🟢 Restauração aberta",
    statusClosing: "🟡 Restauração: a fechar brevemente",
    statusNight: "🌙 Combustível 24/7 · Restauração fechada",
    statusScheduleOpen: "🟢 Restauração aberta (06:30 - 21:30)",
    statusScheduleClosing: "🟡 A fechar brevemente (encerra às 22:00)",
    statusScheduleNight: "🌙 Restauração fechada (reabre às 06:30)",
    pumps247: "Bombas & Pagamento automático: 24h/24, 7d/7",
    foodLabel: "Restauração:",
    amenitiesBrandsTitle: "☕ Marcas & Restauração",
    amenitiesServicesTitle: "🛠️ Serviços da área",
    moreBrands: (n) => `+${n} marcas`,
    hoursTitle: "🕒 HORÁRIO DE FUNCIONAMENTO",
    offMotorwayBadge: (d, exitNum) => exitNum ? `A ${d} da saída n.º ${exitNum}` : `A ${d} da saída da autoestrada`,
    offMotorwayPopupTitle: "Posto fora da autoestrada",
    offMotorwayPopupDesc: (d, exitNum) => exitNum ? `Acessível na saída n.º ${exitNum} (~${d})` : `Acessível na saída da autoestrada / portagem (~${d})`,
    offMotorwayTooltip: "Posto situado fora da autoestrada, logo à saída",
    defaultHighway: "Autoestrada",
    weatherLoading: "Meteorologia em direto",
    fuelUnavailable: "Indisp."
  },
  sl: {    scrollRightTitle: "Pomakni desno",
    scrollLeftTitle: "Pomakni levo",
    actionEnterCity: "Vnesite mesto",
    clearInputTitle: "Počisti vnos",
    locateMeTitle: "Usredotoči na mojo lokacijo",
    navFollowPaused: "📍 Samodejno sledenje začasno ustavljeno. Dotaknite se ikone GPS za ponovno centriranje.",
    navFollowing: "🎯 Samodejno sledenje aktivno",
    toggleExitTitle: "Vključi ugodne bencinske servise na neposrednih izvozih z avtoceste (< 1,5 km)",
    refRoutesToggleTitle: "Prikaži 52 referenčnih poti",
    refRoutesTitle: "52 Referenčnih poti",
    refRoutesSub: "4 koridorji na državo (13 evropskih držav)",
    refRoutesTest: "Preizkusi",

    pageTitle: "FuelPilot • Cene goriv na avtocestah & Postajališča",
    tagline: "Primerjava cen goriv & avtocestna počivališča v živo",
    privacy: "Zasebnost",
    guide: "Vodnik",
    guideTitle: "Navodila za uporabo & Vodnik",
    live: "Cene v živo",
    refreshTitle: "Osveži FuelCoPilot",
    sec1: "1. Izbira poti",
    startPlaceholder: "Naslov, kraj, parkirišče, mesto...",
    endPlaceholder: "Naslov, kraj, parkirišče, mesto...",
    stepPlaceholder: (n) => `Vmesni postanek ${n} (npr. Maribor, Celje...)`,
    removeStepTitle: "Odstrani postanek",
    addStep: "+ Postanek",
    calcBtn: "<span>🚀</span> Izračunaj pot",
    calcInProgress: "Računanje poti...",
    startNav: "Začni",
    stopNav: "Ustavi",
    navFollowing: "Začni",
    currentPos: "📍 Moja trenutna lokacija",
    estimatedPos: "📍 Moja ocenjena lokacija",
    locating: "Iskanje vaše lokacije...",
    locationError: "GPS lokacije ni bilo mogoče pridobiti.",
    fromCurrentPos: (km) => `🎯 Čez ${km} km`,
    upcomingStationsCount: (n) => `${n} naslednj${n === 1 ? 'e' : 'ih'} počivališč`,
    editBtn: "<span>✏️</span> Spremeni",
    closeBtn: "<span>✖</span> Zapri",
    editBtnTitle: "Spremeni pot",
    allBrands: "🏢 Vse znamke",
    filterBrandTitle: "Filtriraj po znamki",
    filterFuelTitle: "Filtriraj po gorivu",
    sortTitle: "Razvrščanje",
    sec3: "3. Bencinski servisi na avtocesti",
    sortRoute: "Vrstni red: Na poti",
    sortPrice: "Vrstni red: Najcenejše prej",
    sortDist: "Vrstni red: Razdalja",
    tabMap: "Zemljevid",
    tabList: "Seznam & Filtri",
    coverage: "Pokrito omrežje: 🇫🇷 Francija • 🇩🇪 Nemčija • 🇧🇪 Belgija • 🇳🇱 Nizozemska • 🇮🇹 Italija • 🇪🇸 Španija • 🇵🇹 Portugalska • 🇬🇧 Združeno kraljestvo • 🇱🇺 Luksemburg • 🇦🇹 Avstrija • 🇨🇭 Švica • 🇸🇮 Slovenija • 🇭🇷 Hrvaška",
    recentHdr: "🕒 Zadnjih 10 lokacij",
    bestPrice: "⭐ NAJNIŽJA CENA",
    fromStart: (km) => `🎯 Čez ${km} km`,
    stationsCount: (n) => `${n} postajališč${n === 1 ? 'e' : ''} na poti`,
    unavail: "⚠️ Ni na voljo",
    noPrice: "Ni podatka",
    priceLbl: "Cena",
    outOfStock: "⚠️ Zmanjkalo:",
    estimatedPrice: "ℹ️ Okvirna cena (ni v živo)",
    recommended: "🔵 Priporočeno",
    optionN: (n) => `🟠 Možnost ${n}`,
    directRoute: "Neposredna pot",
    countryCH: "Švica",
    countryFR: "Francija",
    countryDE: "Nemčija",
    countryES: "Španija",
    countryIT: "Italija",
    countryGB: "Združeno kraljestvo",
    countryIE: "Irska",
    countryBE: "Belgija",
    countryPT: "Portugalska",
    countryNL: "Nizozemska",
    countryLU: "Luksemburg",
    countryAT: "Avstrija",
    countrySI: "Slovenija",
    countryHR: "Hrvaška",
    areasCount: (n) => `${n} počivališč`,
    areasListed: (n) => `${n} zabeleženih počivališč • Cene v živo`,
    kmMarker: (hw, pk) => `${hw || 'Avtocesta'} • Km ${pk}`,
    popupDirDist: (dir, km) => `Smer: ${dir} • Čez ${km} km`,
    sensDirect: "Smer vožnje",
    sensInverse: "Nasprotna smer",
    sensDouble: "Obe smeri",
    wazeTitle: "Navigiraj z Waze",
    gmapsTitle: "Navigiraj z Google Maps",
    mapRoad: "🗺️ Cestni zemljevid",
    mapSat: "🛰️ Satelit",
    mapHybrid: "🌍 Hibrid",
    modalClose: "Zapri",
    step: "Postanek",
    destination: "Cilj",
    distance: "Razdalja",
    duration: "Trajanje",
    openNow: "Odprto zdaj",
    closed: "Zaprto",
    services: "Storitve",
    fuelChoiceTitle: "Izbira goriva",
    fuelGazole: "Dizel (B7)",
    fuelSp95: "Eurosuper 95 (E10/E5)",
    fuelSp98: "Eurosuper 100 / Plus",
    fuelGplc: "Avtoplin (LPG)",
    fuelElec: "Elektrika (kWh)",
    fuelAll: "Vsa goriva",
    noStationsOnRoute: "Na tem odseku ni bilo najdenih bencinskih servisov.",
    alertMissingPoints: "Prosimo, vnesite začetno in končno točko.",
    alertNoRoute: "Cestne poti ni bilo mogoče najti.",
    alertServerError: "Povezava s strežnikom za poti ni uspela. Poskusite znova.",
    amazonBadge: "🛒 PRIPOROČENA POTOVALNA OPREMA",
    amazonView: "Poglej ➔",
    amazonDisclosure: "Kot partner podjetja Amazon prejemamo prihodke od ustreznih nakupov.",
    amazonItems: [
      { icon: "📱", name: "Avto nosilec za telefon / MagSafe", sub: "Stabilna pritrditev za varno GPS vodenje", url: "https://www.amazon.de/s?k=handyhalterung+auto+lueftung&tag=watermetrics-21" },
      { icon: "⚡", name: "Hitri avto polnilec USB-C 65W", sub: "Hitro polnjenje med vožnjo", url: "https://www.amazon.de/s?k=kfz+ladegeraet+usb+c+schnellladen&tag=watermetrics-21" }
    ],
    evdanceBadge: "⚡ PARTNER ZA EV POLNJENJE • EVDANCE",
    evdanceTitle: "Prenosni polnilniki in kabli tipa 2 EVDANCE",
    evdanceSub: "Do -20% v celotni trgovini EU • Koda:",
    evdanceCta: "Poglej -20% ➔",
    evdanceDisclosure: "Partnerska povezava • Promocijska koda EVEU20 velja na eu.evdances.com",
    fuelInfoBtnTitle: "Tabela primerjave poimenovanj goriv po državah",
    fuelInfoTitle: "⛽ Primerjava goriv po evropskih državah",
    fuelInfoSubtitle: "Uradna poimenovanja na točilnih avtomatih (Evropski standard EN 16942)",
    fuelColNorm: "Standard EU",
    fuelCatE10: "Eurosuper 95 (E10)",
    fuelCatE5: "Eurosuper 95 (E5)",
    fuelCatSp98: "Eurosuper 100 / Plus",
    fuelCatDiesel: "Dizel (B7)",
    fuelCatLpg: "Avtoplin (LPG)",
    fuelCatE85: "Bioetanol / CNG",
    defaultCountry: "SI",
    today: "Danes",
    yesterday: "Včeraj",
    atTime: "ob",
    verifiedAt: "Posodobljeno:",
    toggleExit: "🚪 Bencinski servisi ob izvozih (< 1,5 km)",
    statusOpen: "🟢 Restavracija odprta",
    statusClosing: "🟡 Restavracija se kmalu zapre",
    statusNight: "🌙 Gorivo 24/7 · Restavracija zaprta",
    statusScheduleOpen: "🟢 Restavracija odprta (06:30 - 21:30)",
    statusScheduleClosing: "🟡 Kmalu se zapre (zaprtje ob 22:00)",
    statusScheduleNight: "🌙 Restavracija zaprta (odpre se ob 06:30)",
    pumps247: "Točilna mesta & Plačilni avtomat: 24h/24",
    foodLabel: "Gostinska ponudba:",
    amenitiesBrandsTitle: "☕ Blagovne znamke & Restavracije",
    amenitiesServicesTitle: "🛠️ Storitve počivališča",
    moreBrands: (n) => `+${n} znamk`,
    hoursTitle: "🕒 OBRATOVALNI ČAS",
    offMotorwayBadge: (d, exitNum) => exitNum ? `${d} od izvoza št. ${exitNum}` : `${d} od avtocestnega izvoza`,
    offMotorwayPopupTitle: "Servis izven avtoceste",
    offMotorwayPopupDesc: (d, exitNum) => exitNum ? `Dostopno na izvozu št. ${exitNum} (~${d})` : `Dostopno na avtocestnem izvozu (~${d})`,
    offMotorwayTooltip: "Servis se nahaja tik ob avtocestnem izvozu",
    defaultHighway: "Avtocesta",
    weatherLoading: "Vreme v živo",
    fuelUnavailable: "Ni na voljo"
  },
  hr: {    scrollRightTitle: "Pomakni udesno",
    scrollLeftTitle: "Pomakni ulijevo",
    actionEnterCity: "Unesite grad",
    clearInputTitle: "Izbriši unos",
    locateMeTitle: "Centriraj na moju lokaciju",
    navFollowPaused: "📍 Automatsko praćenje pauzirano. Dodirnite GPS ikonu za ponovno centriranje.",
    navFollowing: "🎯 Automatsko praćenje aktivno",
    toggleExitTitle: "Uključi povoljne benzinske postaje na neposrednim izlazima s autoceste (< 1,5 km)",
    refRoutesToggleTitle: "Prikaži 52 referentne rute",
    refRoutesTitle: "52 Referentnih ruta",
    refRoutesSub: "4 koridora po državi (13 europskih država)",
    refRoutesTest: "Testiraj",

    pageTitle: "FuelPilot • Cijene goriva na autocesti & Odmorišta",
    tagline: "Usporedba cijena goriva & odmorišta na autocesti uživo",
    privacy: "Privatnost",
    guide: "Vodič",
    guideTitle: "Upute za uporabu & Vodič",
    live: "Cijene uživo",
    refreshTitle: "Osvježi FuelCoPilot",
    sec1: "1. Odabir rute",
    startPlaceholder: "Adresa, mjesto, parking, grad...",
    endPlaceholder: "Adresa, mjesto, parking, grad...",
    stepPlaceholder: (n) => `Međutočka ${n} (npr. Karlovac, Zadar...)`,
    removeStepTitle: "Ukloni međutočku",
    addStep: "+ Međutočka",
    calcBtn: "<span>🚀</span> Izračunaj rutu",
    calcInProgress: "Izračun rute u tijeku...",
    startNav: "Pokreni",
    stopNav: "Zaustavi",
    navFollowing: "Pokreni",
    currentPos: "📍 Moja trenutna lokacija",
    estimatedPos: "📍 Moja procijenjena lokacija",
    locating: "Traženje vaše lokacije...",
    locationError: "Nije moguće dohvatiti GPS lokaciju.",
    fromCurrentPos: (km) => `🎯 Za ${km} km`,
    upcomingStationsCount: (n) => `${n} sljedeć${n === 1 ? 'e' : 'ih'} odmorišta`,
    editBtn: "<span>✏️</span> Uredi",
    closeBtn: "<span>✖</span> Zatvori",
    editBtnTitle: "Uredi rutu",
    allBrands: "🏢 Sve marke",
    filterBrandTitle: "Filtriraj po marki",
    filterFuelTitle: "Filtriraj po gorivu",
    sortTitle: "Poredak",
    sec3: "3. Benzinske postaje na autocesti",
    sortRoute: "Poredak: Na ruti",
    sortPrice: "Poredak: Prvo najjeftinije",
    sortDist: "Poredak: Udaljenost",
    tabMap: "Karta",
    tabList: "Popis & Filtri",
    coverage: "Pokrivena mreža: 🇫🇷 Francuska • 🇩🇪 Njemačka • 🇧🇪 Belgija • 🇳🇱 Nizozemska • 🇮🇹 Italija • 🇪🇸 Španjolska • 🇵🇹 Portugal • 🇬🇧 Ujedinjeno Kraljevstvo • 🇱🇺 Luksemburg • 🇦🇹 Austrija • 🇨🇭 Švicarska • 🇸🇮 Slovenija • 🇭🇷 Hrvatska",
    recentHdr: "🕒 Zadnjih 10 lokacija",
    bestPrice: "⭐ NAJPOVOLJNIJA CIJENA",
    fromStart: (km) => `🎯 Za ${km} km`,
    stationsCount: (n) => `${n} odmorišt${n === 1 ? 'e' : 'a'} na ruti`,
    unavail: "⚠️ Nije dostupno",
    noPrice: "Nema podataka",
    priceLbl: "Cijena",
    outOfStock: "⚠️ Nema na zalihi:",
    estimatedPrice: "ℹ️ Okvirna cijena (nije uživo)",
    recommended: "🔵 Preporučeno",
    optionN: (n) => `🟠 Opcija ${n}`,
    directRoute: "Izravna ruta",
    countryCH: "Švicarska",
    countryFR: "Francuska",
    countryDE: "Njemačka",
    countryES: "Španjolska",
    countryIT: "Italija",
    countryGB: "Ujedinjeno Kraljevstvo",
    countryIE: "Irska",
    countryBE: "Belgija",
    countryPT: "Portugal",
    countryNL: "Nizozemska",
    countryLU: "Luksemburg",
    countryAT: "Austrija",
    countrySI: "Slovenija",
    countryHR: "Hrvatska",
    areasCount: (n) => `${n} odmorišta`,
    areasListed: (n) => `${n} evidentiranih odmorišta • Cijene uživo`,
    kmMarker: (hw, pk) => `${hw || 'Autocesta'} • Km ${pk}`,
    popupDirDist: (dir, km) => `Smjer: ${dir} • Za ${km} km`,
    sensDirect: "Smjer vožnje",
    sensInverse: "Suprotan smjer",
    sensDouble: "Oba smjera",
    wazeTitle: "Navigiraj pomoću Waze",
    gmapsTitle: "Navigiraj pomoću Google Maps",
    mapRoad: "🗺️ Cestovna karta",
    mapSat: "🛰️ Satelit",
    mapHybrid: "🌍 Hibrid",
    modalClose: "Zatvori",
    step: "Međutočka",
    destination: "Odredište",
    distance: "Udaljenost",
    duration: "Trajanje",
    openNow: "Otvoreno sada",
    closed: "Zatvoreno",
    services: "Usluge",
    fuelChoiceTitle: "Odabir goriva",
    fuelGazole: "Eurodiesel (B7)",
    fuelSp95: "Eurosuper 95 (E10/E5)",
    fuelSp98: "Eurosuper 100 (Class Plus)",
    fuelGplc: "Autoplin (LPG)",
    fuelElec: "Struja (kWh)",
    fuelAll: "Sva goriva",
    noStationsOnRoute: "Na ovoj dionici nisu pronađene benzinske postaje.",
    alertMissingPoints: "Molimo unesite polazište i odredište.",
    alertNoRoute: "Nije pronađena cestovna ruta.",
    alertServerError: "Nije moguće povezati se s poslužiteljem rute. Pokušajte ponovno.",
    amazonBadge: "🛒 PREPORUČENA OPREMA ZA PUTOVANJE",
    amazonView: "Pogledaj ➔",
    amazonDisclosure: "Kao partner Amazona ostvarujemo prihod od kvalificiranih kupnji.",
    amazonItems: [
      { icon: "📱", name: "Auto držač za mobitel / MagSafe", sub: "Stabilno držanje za sigurnu GPS navigaciju", url: "https://www.amazon.de/s?k=handyhalterung+auto+lueftung&tag=watermetrics-21" },
      { icon: "⚡", name: "Brzi auto punjač USB-C 65W", sub: "Brzo punjenje tijekom vašeg putovanja", url: "https://www.amazon.de/s?k=kfz+ladegeraet+usb+c+schnellladen&tag=watermetrics-21" }
    ],
    evdanceBadge: "⚡ PARTNER ZA PUNJENJE ELEKTRIČNIH VOZILA • EVDANCE",
    evdanceTitle: "Prijenosni punjači i kabeli tipa 2 EVDANCE",
    evdanceSub: "Do -20% u cijeloj EU trgovini • Kod:",
    evdanceCta: "Pogledaj -20% ➔",
    evdanceDisclosure: "Partnerska poveznica • Promo kod EVEU20 vrijedi na eu.evdances.com",
    fuelInfoBtnTitle: "Tablica usporedbe naziva goriva po zemljama",
    fuelInfoTitle: "⛽ Usporedba naziva goriva po europskim zemljama",
    fuelInfoSubtitle: "Službeni nazivi na crpkama (Europska norma EN 16942)",
    fuelColNorm: "Norma EU",
    fuelCatE10: "Eurosuper 95 (E10)",
    fuelCatE5: "Eurosuper 95 (E5)",
    fuelCatSp98: "Eurosuper 100 (Class Plus)",
    fuelCatDiesel: "Eurodiesel (B7)",
    fuelCatLpg: "Autoplin (LPG)",
    fuelCatE85: "Bioetanol / CNG",
    defaultCountry: "HR",
    today: "Danas",
    yesterday: "Jučer",
    atTime: "u",
    verifiedAt: "Ažurirano:",
    toggleExit: "🚪 Postaje na izlazima (< 1,5 km)",
    statusOpen: "🟢 Restoran otvoren",
    statusClosing: "🟡 Restoran se uskoro zatvara",
    statusNight: "🌙 Gorivo 24/7 · Restoran zatvoren",
    statusScheduleOpen: "🟢 Restoran otvoren (06:30 - 21:30)",
    statusScheduleClosing: "🟡 Uskoro zatvaranje (zatvara u 22:00)",
    statusScheduleNight: "🌙 Restoran zatvoren (otvara u 06:30)",
    pumps247: "Crpke & Automatsko plaćanje: 24h/24",
    foodLabel: "Ugostiteljstvo:",
    amenitiesBrandsTitle: "☕ Brendovi & Restorani",
    amenitiesServicesTitle: "🛠️ Usluge odmorišta",
    moreBrands: (n) => `+${n} brendova`,
    hoursTitle: "🕒 RADNO VRIJEME",
    offMotorwayBadge: (d, exitNum) => exitNum ? `${d} od izlaza br. ${exitNum}` : `${d} od izlaza s autoceste`,
    offMotorwayPopupTitle: "Postaja izvan autoceste",
    offMotorwayPopupDesc: (d, exitNum) => exitNum ? `Dostupno na izlazu br. ${exitNum} (~${d})` : `Dostupno na izlazu s autoceste / naplatnoj postaji (~${d})`,
    offMotorwayTooltip: "Postaja se nalazi neposredno uz izlaz s autoceste",
    defaultHighway: "Autocesta",
    weatherLoading: "Vrijeme uživo",
    fuelUnavailable: "Nije dostupno"
  },
};

function t() {
  return I18N_DICT[currentLang] || I18N_DICT.fr;
}

function translateCountryName(rawName) {
  if (!rawName) return '';
  const tr = t();
  const n = rawName.trim().toLowerCase();
  if (n === 'france' || n === 'francia' || n === 'frankreich' || n === 'frankrijk') return tr.countryFR;
  if (n === 'allemagne' || n === 'germany' || n === 'deutschland' || n === 'germania' || n === 'alemania' || n === 'duitsland') return tr.countryDE;
  if (n === 'espagne' || n === 'spain' || n === 'spagna' || n === 'españa' || n === 'spanien' || n === 'spanje') return tr.countryES;
  if (n === 'italie' || n === 'italy' || n === 'italia' || n === 'italien' || n === 'italië') return tr.countryIT;
  if (n === 'royaume-uni' || n === 'united kingdom' || n === 'regno unito' || n === 'reino unido' || n === 'vereinigtes königreich' || n === 'verenigd koninkrijk') return tr.countryGB;
  if (n === 'suisse' || n === 'switzerland' || n === 'svizzera' || n === 'suiza' || n === 'schweiz' || n === 'zwitserland') return tr.countryCH;
  if (n === 'irlande' || n === 'ireland' || n === 'irlanda' || n === 'irland' || n === 'ierland') return tr.countryIE;
  if (n === 'belgique' || n === 'belgium' || n === 'belgio' || n === 'bélgica' || n === 'belgien' || n === 'belgië') return tr.countryBE;
  if (n === 'portugal' || n === 'portogallo') return tr.countryPT;
  if (n === 'pays-bas' || n === 'netherlands' || n === 'nederland' || n === 'paesi bassi' || n === 'países baixos' || n === 'niederlande') return tr.countryNL;
  if (n === 'luxembourg' || n === 'luxemburg' || n === 'lussemburgo' || n === 'luxemburgo') return tr.countryLU;
  if (n === 'autriche' || n === 'austria' || n === 'österreich' || n === 'oostenrijk' || n === 'áustria') return tr.countryAT;
  if (n === 'slovénie' || n === 'slovenia' || n === 'slovenija' || n === 'slowenien' || n === 'eslovenia' || n === 'eslovénia') return tr.countrySI;
  if (n === 'croatie' || n === 'croatia' || n === 'hrvatska' || n === 'kroatien' || n === 'croacia' || n === 'croazia') return tr.countryHR;
  return rawName;
}

function translateSens(sensStr, isNativeCase) {
  if (!sensStr) return t().sensDirect;
  const sLow = sensStr.trim().toLowerCase();
  if (sLow.includes('double')) return t().sensDouble;
  if (sLow === 'sens direct') return t().sensDirect;
  if (sLow === 'sens inverse') return t().sensInverse;
  if (currentLang === 'fr') return isNativeCase ? sensStr : formatProperName(sensStr);

  if (sLow === 'sens gauche (i)') {
    if (currentLang === 'de') return 'Linke Seite (L)';
    if (currentLang === 'nl') return 'Linkerzijde (L)';
    return currentLang === 'en' ? 'Left side (L)' : (currentLang === 'it' ? 'Lato sinistro (S)' : 'Margen izquierdo (I)');
  }
  if (sLow === 'sens droite (d)') {
    if (currentLang === 'de') return 'Rechte Seite (R)';
    if (currentLang === 'nl') return 'Rechterzijde (R)';
    return currentLang === 'en' ? 'Right side (R)' : (currentLang === 'it' ? 'Lato destro (D)' : 'Margen derecho (D)');
  }

  let out = isNativeCase ? sensStr : formatProperName(sensStr);
  if (currentLang === 'en') {
    out = out
      .replace(/^Côté\s+/i, 'Side ')
      .replace(/^Sens\s+/i, 'Dir. ')
      .replace(/\bOuest\b/gi, 'West')
      .replace(/\bEst\b/gi, 'East')
      .replace(/\bNord\b/gi, 'North')
      .replace(/\bSud\b/gi, 'South')
      .replace(/\bIntérieur\b/gi, 'Inner')
      .replace(/\bExtérieur\b/gi, 'Outer')
      .replace(/\bEspagne\b/gi, 'Spain')
      .replace(/\bItalie\b/gi, 'Italy')
      .replace(/\bAllemagne\b/gi, 'Germany')
      .replace(/\bSuisse\b/gi, 'Switzerland');
  } else if (currentLang === 'de') {
    out = out
      .replace(/^Côté\s+/i, 'Seite ')
      .replace(/^Sens\s+/i, 'Richtung ')
      .replace(/\bOuest\b/gi, 'West')
      .replace(/\bEst\b/gi, 'Ost')
      .replace(/\bNord\b/gi, 'Nord')
      .replace(/\bSud\b/gi, 'Süd')
      .replace(/\bIntérieur\b/gi, 'Innenring')
      .replace(/\bExtérieur\b/gi, 'Außenring')
      .replace(/\bEspagne\b/gi, 'Spanien')
      .replace(/\bItalie\b/gi, 'Italien')
      .replace(/\bFrance\b/gi, 'Frankreich')
      .replace(/\bAllemagne\b/gi, 'Deutschland')
      .replace(/\bSuisse\b/gi, 'Schweiz');
  } else if (currentLang === 'it') {
    out = out
      .replace(/^Côté\s+/i, 'Lato ')
      .replace(/^Sens\s+/i, 'Dir. ')
      .replace(/\bOuest\b/gi, 'Ovest')
      .replace(/\bEst\b/gi, 'Est')
      .replace(/\bNord\b/gi, 'Nord')
      .replace(/\bSud\b/gi, 'Sud')
      .replace(/\bIntérieur\b/gi, 'Interno')
      .replace(/\bExtérieur\b/gi, 'Esterno')
      .replace(/\bEspagne\b/gi, 'Spagna')
      .replace(/\bItalie\b/gi, 'Italia')
      .replace(/\bAllemagne\b/gi, 'Germania')
      .replace(/\bFrance\b/gi, 'Francia');
  } else if (currentLang === 'nl') {
    out = out
      .replace(/^Côté\s+/i, 'Zijde ')
      .replace(/^Sens\s+/i, 'Richting ')
      .replace(/\bOuest\b/gi, 'West')
      .replace(/\bEst\b/gi, 'Oost')
      .replace(/\bNord\b/gi, 'Noord')
      .replace(/\bSud\b/gi, 'Zuid')
      .replace(/\bIntérieur\b/gi, 'Binnenring')
      .replace(/\bExtérieur\b/gi, 'Buitenring')
      .replace(/\bEspagne\b/gi, 'Spanje')
      .replace(/\bItalie\b/gi, 'Italië')
      .replace(/\bAllemagne\b/gi, 'Duitsland')
      .replace(/\bFrance\b/gi, 'Frankrijk')
      .replace(/\bBelgique\b/gi, 'België')
      .replace(/\bSuisse\b/gi, 'Zwitserland');
  } else if (currentLang === 'es') {
    out = out
      .replace(/^Côté\s+/i, 'Lado ')
      .replace(/^Sens\s+/i, 'Sentido ')
      .replace(/\bOuest\b/gi, 'Oeste')
      .replace(/\bEst\b/gi, 'Este')
      .replace(/\bNord\b/gi, 'Norte')
      .replace(/\bSud\b/gi, 'Sur')
      .replace(/\bIntérieur\b/gi, 'Interior')
      .replace(/\bExtérieur\b/gi, 'Exterior')
      .replace(/\bEspagne\b/gi, 'España')
      .replace(/\bItalie\b/gi, 'Italia')
      .replace(/\bAllemagne\b/gi, 'Alemania')
      .replace(/\bFrance\b/gi, 'Francia');
  }
  return out;
}

let countryBadgeMarkers = [];
let mapLayerControl = null;
let mapBaseLayers = null;

function renderCountryBadgesOnMap() {
  if (!map) return;
  countryBadgeMarkers.forEach(m => map.removeLayer(m));
  countryBadgeMarkers = [];
  const tr = t();
  const countryLabels = [
    { coords: [46.6, 2.5], flag: '🇫🇷', name: tr.countryFR, count: tr.areasCount(635) },
    { coords: [51.1, 10.4], flag: '🇩🇪', name: tr.countryDE, count: tr.areasCount(218) },
    { coords: [50.55, 4.7], flag: '🇧🇪', name: tr.countryBE, count: tr.areasCount(76) },
    { coords: [52.13, 5.29], flag: '🇳🇱', name: tr.countryNL, count: tr.areasCount(57) },
    { coords: [42.6, 12.8], flag: '🇮🇹', name: tr.countryIT, count: tr.areasCount(615) },
    { coords: [40.2, -3.6], flag: '🇪🇸', name: tr.countryES, count: tr.areasCount(833) },
    { coords: [39.5, -8.0], flag: '🇵🇹', name: tr.countryPT, count: tr.areasCount(65) },
    { coords: [52.8, -1.8], flag: '🇬🇧', name: tr.countryGB, count: tr.areasCount(158) },
    { coords: [49.8, 6.1], flag: '🇱🇺', name: tr.countryLU, count: tr.areasCount(28) },
    { coords: [47.5, 14.5], flag: '🇦🇹', name: tr.countryAT, count: tr.areasCount(86) },
    { coords: [46.8, 8.2], flag: '🇨🇭', name: tr.countryCH, count: tr.areasCount(65) },
    { coords: [46.15, 14.99], flag: '🇸🇮', name: tr.countrySI, count: tr.areasCount(42) },
    { coords: [45.1, 15.5], flag: '🇭🇷', name: tr.countryHR, count: tr.areasCount(77) }
  ];
  countryLabels.forEach(c => {
    const icon = L.divIcon({
      className: 'country-badge-marker',
      html: `<div class="country-badge-pill">${c.flag} ${c.name} <span class="country-count-tag">• ${c.count}</span></div>`,
      iconSize: [0, 0],
      iconAnchor: [0, 0]
    });
    countryBadgeMarkers.push(L.marker(c.coords, { icon, interactive: false }).addTo(map));
  });
}

function ensureLangBarOrder() {
  const bar = document.getElementById('lang-bar');
  if (!bar) return;
  if (!bar.querySelector('[data-lang="de"]')) {
    const deBtn = document.createElement('button');
    deBtn.type = 'button';
    deBtn.className = 'lang-flag-btn';
    deBtn.dataset.lang = 'de';
    deBtn.title = 'Deutsch';
    deBtn.setAttribute('aria-label', 'Deutsch');
    deBtn.innerHTML = `<svg class="lang-flag-svg" viewBox="0 0 60 36" xmlns="http://www.w3.org/2000/svg"><rect width="60" height="12" fill="#000000"/><rect y="12" width="60" height="12" fill="#DD0000"/><rect y="24" width="60" height="12" fill="#FFCE00"/></svg>`;
    bar.appendChild(deBtn);
  }
  const desiredOrder = ['fr', 'be', 'nl', 'de', 'it', 'es', 'pt', 'sl', 'hr', 'en'];
  desiredOrder.forEach(code => {
    const el = (code === 'be')
      ? (document.getElementById('belgium-lang-container') || bar.querySelector('[data-lang="be"]'))
      : bar.querySelector(`[data-lang="${code}"]`);
    if (el) bar.appendChild(el);
  });
}

function updateMapLayerControlLabels() {
  if (!map || !mapBaseLayers) return;
  if (mapLayerControl) {
    map.removeControl(mapLayerControl);
  }
  const tr = t();
  const baseMaps = {
    [tr.mapRoad]: mapBaseLayers.osmFr,
    [tr.mapOsm]: mapBaseLayers.osmStandard,
    [tr.mapSat]: mapBaseLayers.esriSat
  };
  mapLayerControl = L.control.layers(baseMaps, null, { position: 'topright' }).addTo(map);
}

function setAppLanguage(lang, isManual = false) {
  if (!I18N_DICT[lang]) lang = 'fr';
  currentLang = lang;
  window.currentLang = lang;
  if (isManual) {
    userManuallySelectedLang = true;
    try {
      if (typeof sessionStorage !== 'undefined') sessionStorage.setItem('fuelpilot_manual_lang', lang);
    } catch (e) {}
  }

  document.documentElement.lang = lang;
  document.querySelectorAll('#lang-bar .lang-flag-btn').forEach(btn => {
    if (userSelectedCountry === 'BE') {
      btn.classList.toggle('active', btn.dataset.lang === 'be');
    } else {
      btn.classList.toggle('active', btn.dataset.lang === lang);
    }
  });
  document.querySelectorAll('#belgium-lang-menu .belgium-lang-opt').forEach(opt => {
    opt.classList.toggle('active', userSelectedCountry === 'BE' && opt.dataset.beLang === lang);
  });

  const tr = t();
  document.title = tr.pageTitle;

  const taglineEl = document.getElementById('i18n-tagline') || document.querySelector('.brand-tagline');
  if (taglineEl) taglineEl.textContent = tr.tagline;

  const privEl = document.getElementById('i18n-privacy');
  if (privEl) {
    privEl.textContent = tr.privacy;
    privEl.title = tr.privacy;
    privEl.href = `privacy.html?lang=${currentLang}`;
  }

  const guideEl = document.getElementById('i18n-guide');
  if (guideEl) {
    guideEl.textContent = tr.guide || 'Guide';
    guideEl.title = tr.guideTitle || "Mode d'emploi & Guide";
    guideEl.href = `guide.html?lang=${currentLang}`;
  }

  const liveEl = document.getElementById('i18n-live-text') || document.querySelector('.live-text');
  if (liveEl) liveEl.textContent = tr.live;

  const liveBadge = document.querySelector('.badge-live');
  if (liveBadge) liveBadge.title = tr.refreshTitle;

  const sec1El = document.querySelector('#itinerary-full-form .section-title span');
  if (sec1El) sec1El.textContent = tr.sec1;

  const startEl = document.getElementById('input-start');
  if (startEl) startEl.placeholder = tr.startPlaceholder;

  const endEl = document.getElementById('input-end');
  if (endEl) endEl.placeholder = tr.endPlaceholder;

  document.querySelectorAll('#waypoints-container .waypoint-item').forEach((row, idx) => {
    const inp = row.querySelector('input.address-input');
    if (inp) inp.placeholder = tr.stepPlaceholder(idx + 1);
    const delBtn = row.querySelector('.btn-remove-step');
    if (delBtn) delBtn.title = tr.removeStepTitle;
  });

  const addWpBtn = document.getElementById('btn-add-waypoint');
  if (addWpBtn) addWpBtn.textContent = tr.addStep;

  const calcBtn = document.getElementById('btn-calculate');
  if (calcBtn && !calcBtn.disabled) calcBtn.innerHTML = tr.calcBtn;

  const editBtn = document.getElementById('btn-toggle-route-edit');
  if (editBtn) {
    const isCollapsed = document.body.classList.contains('mobile-route-collapsed');
    editBtn.innerHTML = isCollapsed ? tr.editBtn : tr.closeBtn;
    editBtn.title = tr.editBtnTitle;
  }

  const exitToggleText = document.getElementById('i18n-toggle-exit');
  if (exitToggleText && tr.toggleExit) {
    exitToggleText.textContent = tr.toggleExit;
  }

  const brandSelect = document.getElementById('select-brand');
  if (brandSelect) {
    brandSelect.title = tr.filterBrandTitle;
    populateBrandFilter();
  }


  // Update fuel dropdown default labels when no route is active
  const fuelSelectEl = document.getElementById('select-fuel');
  if (fuelSelectEl) {
    fuelSelectEl.title = tr.filterFuelTitle;
    if (!currentRouteStations || currentRouteStations.length === 0) {
      const dict = FUEL_LABELS_BY_COUNTRY[tr.defaultCountry] || FUEL_LABELS_BY_COUNTRY.FR;
      const hasSeparateSp95 = tr.defaultCountry === 'FR' || tr.defaultCountry === 'DE';
      Array.from(fuelSelectEl.options).forEach(opt => {
        if (opt.value === 'sp95') opt.style.display = hasSeparateSp95 ? '' : 'none';
        if (dict[opt.value]) {
          const prefix = opt.value === 'elec' ? '' : '⛽ ';
          opt.textContent = `${prefix}${dict[opt.value]}`;
        }
      });
    }
  }

  const sortSelect = document.getElementById('select-sort');
  if (sortSelect) {
    sortSelect.title = tr.sortTitle;
    Array.from(sortSelect.options).forEach(opt => {
      if (opt.value === 'route') opt.textContent = tr.sortRoute;
      if (opt.value === 'price') opt.textContent = tr.sortPrice;
      if (opt.value === 'dist') opt.textContent = tr.sortDist;
    });
  }

  const sec3El = document.querySelector('.stations-header .section-title span');
  if (sec3El) sec3El.textContent = tr.sec3;

  const tabMapLbl = document.querySelector('#btn-tab-map .tab-label');
  if (tabMapLbl) tabMapLbl.textContent = tr.tabMap;

  const tabListLbl = document.querySelector('#btn-tab-list .tab-label');
  if (tabListLbl) tabListLbl.textContent = tr.tabList;

  const covEl = document.querySelector('.coverage-text');
  if (covEl) covEl.textContent = tr.coverage;

  // Update Reference Routes Drawer Header & Subtitle
  const refTitleEl = document.getElementById('i18n-ref-routes-title');
  if (refTitleEl && tr.refRoutesTitle) refTitleEl.textContent = tr.refRoutesTitle;
  const refSubEl = document.getElementById('i18n-ref-routes-sub');
  if (refSubEl && tr.refRoutesSub) refSubEl.textContent = tr.refRoutesSub;
  const refToggleBtn = document.getElementById('btn-ref-routes-toggle');
  if (refToggleBtn && tr.refRoutesToggleTitle) refToggleBtn.title = tr.refRoutesToggleTitle;

  // Localize Country Tabs in Reference Routes Drawer
  const countryTabNames = {
    FR: tr.countryFR, ES: tr.countryES, IT: tr.countryIT, GB: tr.countryGB,
    BE: tr.countryBE, DE: tr.countryDE, PT: tr.countryPT, NL: tr.countryNL,
    LU: tr.countryLU, AT: tr.countryAT, CH: tr.countryCH, SI: tr.countrySI, HR: tr.countryHR
  };
  document.querySelectorAll('#ref-country-tabs .ref-tab-btn').forEach(tab => {
    const cCode = tab.dataset.refCountry;
    if (cCode && countryTabNames[cCode]) {
      tab.title = countryTabNames[cCode];
    }
  });

  // Re-render reference corridors to update test button labels
  if (typeof renderReferenceCorridors === 'function') {
    renderReferenceCorridors(currentRefCountry || 'FR');
  }

  // Update Exit Stations Filter Checkbox and Label Title
  const exitChk = document.getElementById('chk-exit-stations');
  if (exitChk && tr.toggleExitTitle) {
    exitChk.title = tr.toggleExitTitle;
    if (exitChk.parentElement) exitChk.parentElement.title = tr.toggleExitTitle;
  }

  // Update Locate Me Button Tooltip
  const locateBtn = document.getElementById('btn-locate-me');
  if (locateBtn && tr.locateMeTitle) {
    locateBtn.title = tr.locateMeTitle;
    locateBtn.setAttribute('aria-label', tr.locateMeTitle);
  }

  // Update Clear Input Buttons
  const clearStart = document.getElementById('btn-clear-start');
  if (clearStart && tr.clearInputTitle) {
    clearStart.title = tr.clearInputTitle;
    clearStart.setAttribute('aria-label', tr.clearInputTitle);
  }
  const clearEnd = document.getElementById('btn-clear-end');
  if (clearEnd && tr.clearInputTitle) {
    clearEnd.title = tr.clearInputTitle;
    clearEnd.setAttribute('aria-label', tr.clearInputTitle);
  }

  // Update Fuel Info Modal Scroll Buttons
  const fuelLeft = document.getElementById('fuel-scroll-left');
  if (fuelLeft && tr.scrollLeftTitle) fuelLeft.setAttribute('aria-label', tr.scrollLeftTitle);
  const fuelRight = document.getElementById('fuel-scroll-right');
  if (fuelRight && tr.scrollRightTitle) fuelRight.setAttribute('aria-label', tr.scrollRightTitle);

  renderCountryBadgesOnMap();
  updateMapLayerControlLabels();
  updateNavButtonUI();
  renderFuelInfoModal();

  if (alternativeRoutes && alternativeRoutes.length > 1) {
    renderRouteAlternatives();
  }
  renderCurrentRouteStations();
}

// Dynamically calibrate mobile bottom nav bar position using VisualViewport & Screen APIs
// Validated across 14 smartphone models (Samsung, Google Pixel, Xiaomi, Apple iPhone, OnePlus, Honor/Huawei, Motorola, Sony, Oppo)
function ensureMobileNavBarVisible() {
  const navBar = document.getElementById('mobile-nav-bar');
  if (!navBar) return;
  if (window.innerWidth > 1080) {
    navBar.style.display = 'none';
    return;
  }
  navBar.style.display = 'flex';
  const vv = window.visualViewport;
  const innerH = window.innerHeight || document.documentElement.clientHeight;
  const visibleH = vv ? vv.height : innerH;
  const offsetTop = vv ? vv.offsetTop : 0;

  // 1. Occlusion from browser bottom toolbar (Safari / Chrome / Samsung Internet / ColorOS)
  const occludedBottom = Math.max(0, Math.round(innerH - (visibleH + offsetTop)));

  // 2. Detect Android Edge-to-Edge unsubtracted system navigation bar (3-button 48px or gesture 24px):
  // When OS subtracts status (24px) + nav bar (48px), screen.height - innerHeight >= 68px.
  // When Edge-to-Edge is active, screen.height - innerHeight is only 0..24px, so the 48px nav bar overlays the bottom.
  const screenH = (window.screen && window.screen.height) ? window.screen.height : innerH;
  const chromeSubtracted = Math.max(0, screenH - innerH);
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const unsubtractedSysBar = isIOS ? 0 : Math.max(0, 68 - chromeSubtracted);

  const safeBottomPx = 16 + occludedBottom + unsubtractedSysBar;
  navBar.style.setProperty('bottom', `calc(${safeBottomPx}px + env(safe-area-inset-bottom, 0px))`, 'important');

  const mapBar = document.getElementById('map-routes-bar');
  if (mapBar) {
    mapBar.style.setProperty('bottom', `calc(${safeBottomPx + 56}px + env(safe-area-inset-bottom, 0px))`, 'important');
  }
}

async function checkAndAutoUpdateApp() {
  try {
    // Protection absolue contre toute boucle infinie de rechargement
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('_v')) {
      try {
        const cleanUrl = window.location.pathname;
        window.history.replaceState({}, document.title, cleanUrl);
      } catch (e) {}
      return;
    }

    const res = await fetch(`index.html?_t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return;
    const html = await res.text();
    const m = html.match(/app\.js\?v=([0-9.]+)/);
    if (m && m[1] && m[1] !== APP_VERSION) {
      const sessionKey = 'fuelpilot_reloaded_ver_' + m[1];
      if (sessionStorage.getItem(sessionKey)) return;
      sessionStorage.setItem(sessionKey, '1');
      window.location.replace(`index.html?_v=${m[1]}_${Date.now()}`);
    }
  } catch (e) {}
}

async function detectCountryAndSetLanguage() {
  if (userManuallySelectedLang) return;

  const applyDetectedCountry = (countryCode, lat, lon) => {
    if (userManuallySelectedLang) return;
    const lang = mapCountryToLang(countryCode, lat, lon);
    if (lang && I18N_DICT[lang] && currentLang !== lang) {
      setAppLanguage(lang, false);
    }
  };

  // Only query IP geolocation if the device's cellular/OS timezone did not already identify a European country
  // (Prevents iCloud Private Relay / mobile VPN / carrier proxies in UK or US from overriding a phone physically in France)
  if (!getTimezoneCountryLang()) {
    (async () => {
      try {
        const ctrl = new AbortController();
        const tId = setTimeout(() => ctrl.abort(), 2500);
        const res = await fetch('https://get.geojs.io/v1/ip/country.json', { signal: ctrl.signal });
        clearTimeout(tId);
        if (res.ok) {
          const data = await res.json();
          if (data && data.country) {
            applyDetectedCountry(data.country);
          }
        }
      } catch (e) {}
    })();
  }

  // (GPS geolocation is initiated on user action or navigation to avoid startup Mojo IPC contention)
}

function updateFuelScrollArrows() {
  const bodyEl = document.getElementById('fuel-info-body');
  const leftBtn = document.getElementById('fuel-scroll-left');
  const rightBtn = document.getElementById('fuel-scroll-right');
  if (!bodyEl || !leftBtn || !rightBtn) return;

  const maxScroll = bodyEl.scrollWidth - bodyEl.clientWidth;
  if (maxScroll <= 6) {
    leftBtn.style.visibility = 'hidden';
    rightBtn.style.visibility = 'hidden';
    return;
  }
  leftBtn.style.visibility = bodyEl.scrollLeft > 8 ? 'visible' : 'hidden';
  rightBtn.style.visibility = bodyEl.scrollLeft < maxScroll - 8 ? 'visible' : 'hidden';
}

function renderFuelInfoModal() {
  const tr = t();
  const infoBtn = document.getElementById('btn-fuel-info');
  if (infoBtn) {
    infoBtn.title = tr.fuelInfoBtnTitle;
    infoBtn.setAttribute('aria-label', tr.fuelInfoBtnTitle);
  }
  const titleEl = document.getElementById('fuel-info-title');
  if (titleEl) titleEl.textContent = tr.fuelInfoTitle;
  const subEl = document.getElementById('fuel-info-subtitle');
  if (subEl) subEl.textContent = tr.fuelInfoSubtitle;
  const closeBtn = document.getElementById('btn-close-fuel-info');
  if (closeBtn) closeBtn.setAttribute('aria-label', tr.closeBtn.replace(/<[^>]*>/g, '').trim());

  const bodyEl = document.getElementById('fuel-info-body');
  if (!bodyEl) return;

  bodyEl.innerHTML = `
    <table class="fuel-equiv-table">
      <thead>
        <tr>
          <th>${tr.fuelColNorm}</th>
          <th>🇫🇷 ${tr.countryFR}</th>
          <th>🇩🇪 ${tr.countryDE}</th>
          <th>🇧🇪 ${tr.countryBE}</th>
          <th>🇮🇹 ${tr.countryIT}</th>
          <th>🇪🇸 ${tr.countryES}</th>
          <th>🇵🇹 ${tr.countryPT}</th>
          <th>🇳🇱 ${tr.countryNL}</th>
          <th>🇱🇺 ${tr.countryLU}</th>
          <th>🇦🇹 ${tr.countryAT}</th>
          <th>🇨🇭 ${tr.countryCH}</th>
          <th>🇸🇮 ${tr.countrySI}</th>
          <th>🇭🇷 ${tr.countryHR}</th>
          <th>🇬🇧 ${tr.countryGB}</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><span class="eu-pump-tag eu-tag-gasoline">E10</span> <b>${tr.fuelCatE10}</b></td>
          <td><b>SP95-E10</b></td>
          <td><b>Super E10</b></td>
          <td><b>Super 95 (E10)</b></td>
          <td>Benzina (E5/E10)</td>
          <td>Gasolina 95 E5/E10</td>
          <td><b>Gasolina 95 (E10)</b></td>
          <td><b>Euro 95 (E10)</b></td>
          <td><b>Super 95 (E10)</b></td>
          <td><b>Super 95 (E10)</b></td>
          <td><b>Bleifrei 95 (E10)</b></td>
          <td><b>Eurosuper 95 (E10)</b></td>
          <td><b>Eurosuper 95 (E10)</b></td>
          <td><b>Unleaded (E10)</b></td>
        </tr>
        <tr>
          <td><span class="eu-pump-tag eu-tag-gasoline">E5</span> <b>${tr.fuelCatE5}</b></td>
          <td><b>SP95 (E5)</b></td>
          <td><b>Super E5 (95)</b></td>
          <td>Super 95 (E5)</td>
          <td><b>Benzina (E5)</b></td>
          <td><b>Gasolina 95 E5</b></td>
          <td><b>Gasolina Simples 95</b></td>
          <td>Euro 95 (E5)</td>
          <td>Super 95 (E5)</td>
          <td>Super 95</td>
          <td>Sans plomb 95</td>
          <td>Eurosuper 95</td>
          <td>Eurosuper 95</td>
          <td>Unleaded 95</td>
        </tr>
        <tr>
          <td><span class="eu-pump-tag eu-tag-diesel">B7</span> <b>${tr.fuelCatDiesel}</b></td>
          <td><b>Gazole (B7)</b></td>
          <td><b>Diesel (B7)</b></td>
          <td><b>Diesel (B7)</b></td>
          <td><b>Gasolio (B7)</b></td>
          <td><b>Gasóleo A (B7)</b></td>
          <td><b>Gasóleo Simples (B7)</b></td>
          <td><b>Diesel (B7)</b></td>
          <td><b>Diesel (B7)</b></td>
          <td><b>Diesel (B7)</b></td>
          <td><b>Diesel</b></td>
          <td><b>Dizel (B7)</b></td>
          <td><b>Eurodiesel (B7)</b></td>
          <td><b>Diesel (B7)</b></td>
        </tr>
        <tr>
          <td><span class="eu-pump-tag eu-tag-gasoline">E5</span> <b>${tr.fuelCatSp98}</b></td>
          <td><b>SP98 (E5)</b></td>
          <td><b>Super Plus (98)</b></td>
          <td><b>Super 98 (E5)</b></td>
          <td><b>Benzina Speciale 98/100</b></td>
          <td><b>Gasolina 98 E5</b></td>
          <td><b>Gasolina Especial 98</b></td>
          <td><b>Super Plus 98 (E5)</b></td>
          <td><b>Super 98 (E5)</b></td>
          <td><b>Super Plus (98)</b></td>
          <td><b>Super Plus 98</b></td>
          <td><b>Eurosuper 100</b></td>
          <td><b>Eurosuper 100</b></td>
          <td><b>Super Unleaded (E5)</b></td>
        </tr>
        <tr>
          <td><span class="eu-pump-tag eu-tag-lpg">LPG</span> <b>${tr.fuelCatLpg}</b></td>
          <td><b>GPLc</b></td>
          <td><b>Autogas (LPG)</b></td>
          <td><b>LPG</b></td>
          <td><b>GPL</b></td>
          <td><b>GLP (Autogás)</b></td>
          <td><b>GPL Auto</b></td>
          <td><b>Autogas (LPG)</b></td>
          <td><b>GPL / Autogas</b></td>
          <td><b>Autogas (LPG)</b></td>
          <td><b>Autogas / GPL</b></td>
          <td><b>Avtoplin (LPG)</b></td>
          <td><b>Autoplin (LPG)</b></td>
          <td><b>LPG Autogas</b></td>
        </tr>
        <tr>
          <td><span class="eu-pump-tag eu-tag-gasoline">E85</span> <b>${tr.fuelCatE85}</b></td>
          <td><b>Superéthanol E85</b></td>
          <td>Bioethanol E85</td>
          <td>Bioéthanol E85</td>
          <td><b>Metano (CNG)</b> / E85</td>
          <td><b>Bioetanol E85</b></td>
          <td>Bioetanol E85</td>
          <td>Bio-ethanol E85</td>
          <td>Bioéthanol E85</td>
          <td>Bioethanol E85</td>
          <td>Bioethanol E85</td>
          <td>Bioetanol E85</td>
          <td>Bioetanol E85</td>
          <td>Bioethanol E85</td>
        </tr>
      </tbody>
    </table>
  `;
  setTimeout(updateFuelScrollArrows, 30);
}

document.addEventListener('DOMContentLoaded', async () => {
  checkAndAutoUpdateApp();
  ensureMobileNavBarVisible();
  window.addEventListener('resize', ensureMobileNavBarVisible);
  window.addEventListener('resize', updateFuelScrollArrows);
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', ensureMobileNavBarVisible);
    window.visualViewport.addEventListener('scroll', ensureMobileNavBarVisible);
  }
  const liveBadge = document.querySelector('.badge-live');
  if (liveBadge) {
    liveBadge.style.cursor = 'pointer';
    liveBadge.title = t().refreshTitle;
    liveBadge.addEventListener('click', () => {
      try { sessionStorage.removeItem('fuelpilot_manual_lang'); } catch (e) {}
      window.location.replace(`index.html?_v=${Date.now()}`);
    });
  }
  const fuelInfoBtn = document.getElementById('btn-fuel-info');
  const fuelInfoModal = document.getElementById('fuel-info-modal');
  const closeFuelInfoBtn = document.getElementById('btn-close-fuel-info');
  const fuelInfoBody = document.getElementById('fuel-info-body');
  const fuelScrollLeftBtn = document.getElementById('fuel-scroll-left');
  const fuelScrollRightBtn = document.getElementById('fuel-scroll-right');
  if (fuelInfoBody) {
    fuelInfoBody.addEventListener('scroll', updateFuelScrollArrows);
  }
  if (fuelScrollLeftBtn && fuelInfoBody) {
    fuelScrollLeftBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      fuelInfoBody.scrollBy({ left: -180, behavior: 'smooth' });
    });
  }
  if (fuelScrollRightBtn && fuelInfoBody) {
    fuelScrollRightBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      fuelInfoBody.scrollBy({ left: 180, behavior: 'smooth' });
    });
  }
  if (fuelInfoBtn && fuelInfoModal) {
    fuelInfoBtn.addEventListener('click', () => {
      renderFuelInfoModal();
      fuelInfoModal.style.display = 'flex';
      if (fuelInfoBody) fuelInfoBody.scrollLeft = 0;
      setTimeout(updateFuelScrollArrows, 40);
    });
  }
  if (closeFuelInfoBtn && fuelInfoModal) {
    closeFuelInfoBtn.addEventListener('click', () => {
      fuelInfoModal.style.display = 'none';
    });
  }
  if (fuelInfoModal) {
    fuelInfoModal.addEventListener('click', (e) => {
      if (e.target === fuelInfoModal) {
        fuelInfoModal.style.display = 'none';
      }
    });
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && fuelInfoModal && fuelInfoModal.style.display !== 'none') {
      fuelInfoModal.style.display = 'none';
    }
  });
  ensureLangBarOrder();
  const langCountryMap = { fr: 'FR', de: 'DE', it: 'IT', es: 'ES', en: 'GB', nl: 'NL', pt: 'PT', be: 'BE', sl: 'SI', hr: 'HR' };
  document.querySelectorAll('#lang-bar .lang-flag-btn').forEach(btn => {
    if (btn.dataset.lang === 'be') {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const menu = document.getElementById('belgium-lang-menu');
        if (menu) {
          const isOpen = menu.style.display !== 'none';
          menu.style.display = isOpen ? 'none' : 'flex';
          btn.setAttribute('aria-expanded', !isOpen);
        }
      });
    } else {
      btn.addEventListener('click', () => {
        const beMenu = document.getElementById('belgium-lang-menu');
        if (beMenu) beMenu.style.display = 'none';
        userSelectedCountry = langCountryMap[btn.dataset.lang] || 'FR';
        setAppLanguage(btn.dataset.lang, true);
        populateBrandFilter();
        if (!activeRouteData && map) {
          const centers = {
            FR: [[46.6, 2.5], 6],
            BE: [[50.55, 4.7], 8],
            NL: [[52.13, 5.29], 8],
            DE: [[51.1, 10.4], 6],
            IT: [[42.6, 12.8], 6],
            ES: [[40.2, -3.6], 6],
            PT: [[39.5, -8.0], 7],
            GB: [[52.8, -1.8], 6],
            SI: [[46.15, 14.99], 8],
            HR: [[45.1, 15.2], 7]
          };
          const target = centers[userSelectedCountry];
          if (target) map.setView(target[0], target[1], { animate: true });
        }
      });
    }
  });

  document.querySelectorAll('#belgium-lang-menu .belgium-lang-opt').forEach(opt => {
    opt.addEventListener('click', (e) => {
      e.stopPropagation();
      const lang = opt.dataset.beLang;
      userSelectedCountry = 'BE';
      setAppLanguage(lang, true);
      const beMenu = document.getElementById('belgium-lang-menu');
      if (beMenu) beMenu.style.display = 'none';
      const beBtn = document.getElementById('btn-flag-be');
      if (beBtn) {
        beBtn.setAttribute('aria-expanded', 'false');
      }
      populateBrandFilter();
    });
  });

  document.addEventListener('click', (e) => {
    const beContainer = document.getElementById('belgium-lang-container');
    const beMenu = document.getElementById('belgium-lang-menu');
    if (beMenu && beMenu.style.display !== 'none' && beContainer && !beContainer.contains(e.target)) {
      beMenu.style.display = 'none';
      const beBtn = document.getElementById('btn-flag-be');
      if (beBtn) beBtn.setAttribute('aria-expanded', 'false');
    }
  });

  setAppLanguage(currentLang, false);
  initMap();
  initPermanentGpsTracking();
  detectCountryAndSetLanguage();
  if (typeof initReferenceRoutesUI === 'function') initReferenceRoutesUI();

  const startInput = document.getElementById('input-start');
  const endInput = document.getElementById('input-end');

  setupAutocomplete('input-start', 'dropdown-start', (coords, label) => {
    startPoint = coords ? { coords, label } : null;
    if (startInput) startInput.classList.remove('input-attention-pulse');
    populateBrandFilter();
  });
  setupAutocomplete('input-end', 'dropdown-end', (coords, label) => {
    endPoint = coords ? { coords, label } : null;
    if (endInput) endInput.classList.remove('input-attention-pulse');
    populateBrandFilter();
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
  // Architecture RandoTracker : Centrage immédiat sur la dernière position connue de l'utilisateur
  const savedLat = parseFloat(localStorage.getItem('fuelpilot_last_lat'));
  const savedLon = parseFloat(localStorage.getItem('fuelpilot_last_lon'));
  const hasSavedPos = !isNaN(savedLat) && !isNaN(savedLon) && (savedLat >= 35 && savedLat <= 60 && savedLon >= -11 && savedLon <= 25);
  const initialCenter = hasSavedPos ? [savedLat, savedLon] : [46.2, 3.0];
  const initialZoom = hasSavedPos ? 14 : (window.innerWidth <= 768 ? 4.5 : 5.0);

  map = L.map('map', {
    zoomControl: false
  }).setView(initialCenter, initialZoom);

  // Dedicated custom pane for user GPS pastille to keep it above all routes and markers
  map.createPane('gpsUserPane');
  map.getPane('gpsUserPane').style.zIndex = '9999';

  L.control.zoom({ position: 'topright' }).addTo(map);

  // Débrayage tactile intelligent du suivi de caméra : si l'utilisateur déplace ou zoome la carte au doigt, on suspend le suivi
  const pauseAutoFollow = () => {
    if (isGpsNavActive && isGpsAutoFollow && !isProgrammaticPan) {
      isGpsAutoFollow = false;
      updateLocateButtonNavState();
      showToast(t().navFollowPaused || "📍 Suivi automatique en pause. Touchez l'icône GPS pour recentrer.", { isInfo: true, duration: 3500 });
    }
  };

  // dragstart n'est JAMAIS déclenché par flyTo ou panTo dans Leaflet, uniquement par le doigt ou la souris
  map.on('dragstart', () => {
    if (isGpsNavActive && isGpsAutoFollow) {
      isGpsAutoFollow = false;
      updateLocateButtonNavState();
      showToast(t().navFollowPaused || "📍 Suivi automatique en pause. Touchez l'icône GPS pour recentrer.", { isInfo: true, duration: 3500 });
    }
  });

  // zoomstart est protégé par !isProgrammaticPan pour éviter que le zoom initial (flyTo à 15) ne désactive le suivi !
  map.on('zoomstart', () => {
    if (!isProgrammaticPan) {
      pauseAutoFollow();
    }
  });

  const mapContainer = map.getContainer();
  if (mapContainer) {
    let touchStartX = 0;
    let touchStartY = 0;
    mapContainer.addEventListener('touchstart', (e) => {
      if (e.touches && e.touches[0]) {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
      }
    }, { passive: true });
    mapContainer.addEventListener('touchmove', (e) => {
      if (e.touches && e.touches[0]) {
        const dx = Math.abs(e.touches[0].clientX - touchStartX);
        const dy = Math.abs(e.touches[0].clientY - touchStartY);
        if (dx > 12 || dy > 12) {
          // Glissement tactile d'au moins 12px = manipulation délibérée par l'utilisateur
          if (isGpsNavActive && isGpsAutoFollow) {
            isGpsAutoFollow = false;
            updateLocateButtonNavState();
            showToast(t().navFollowPaused || "📍 Suivi automatique en pause. Touchez l'icône GPS pour recentrer.", { isInfo: true, duration: 3500 });
          }
        }
      }
    }, { passive: true });
  }

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

  mapBaseLayers = { osmFr, osmStandard, esriSat };
  updateMapLayerControlLabels();
}

// Load stations from JSON
async function loadStationsData() {
  try {
    // Cache journalier automatique pour charger les prix actualises chaque matin sans forcer un vidage manuel du cache
    const todayStr = new Date().toISOString().slice(0, 10);
    const res = await fetch(`stations_autoroute.json?v=${APP_VERSION}&d=${todayStr}`);
    allStations = await res.json();
    if (DE_LIVE_PRICES.proxyUrl) {
      // Les aires allemandes réelles sont chargées à la demande depuis Tankerkönig
      allStations = allStations.filter(s => !(s.pays === 'DE' && String(s.id).startsWith('DE-BAB-')));
    }

    // Normalisation des enseignes et marques pour tous les pays
    allStations.forEach(s => {
      s.enseigne = s.enseigne || s.marque || s.brand || 'Station';
      if (s.pays === 'ES' && s.enseigne) {
        const ensTrim = s.enseigne.trim();
        const low = ensTrim.toLowerCase();
        if (low === 'bp' || low.startsWith('bp ') || low.startsWith('bp-')) {
          s.enseigne = 'BP';
        } else if (low.startsWith('cepsa ') || low === 'cepsa etxegarate' || low.includes('gasolinera cepsa')) {
          s.enseigne = 'Cepsa';
        } else if (low.startsWith('repsol-') || low === 'repsol-e.s.jaime i') {
          s.enseigne = 'Repsol';
        } else if (low.startsWith('agla ') || low.endsWith(' agla')) {
          s.enseigne = 'Agla';
        } else if (low.startsWith('ham ') || low.endsWith(' ham')) {
          s.enseigne = 'Ham';
        } else if (low.startsWith('q8 ')) {
          s.enseigne = 'Q8';
        } else if (low.startsWith('moeve -')) {
          s.enseigne = 'Moeve';
        } else if (low.startsWith('área 117') || low.startsWith('area 117') || low === 'area-220') {
          s.enseigne = 'Área 117';
        } else if (low.includes('valcarce')) {
          s.enseigne = 'Valcarce';
        }
      }
    });

    // Initialize EV charging availability & live rates per kWh
    allStations.forEach(s => {
      if (!s.prix) s.prix = {};
      const srvList = Array.isArray(s.services) ? s.services : (s.services ? [s.services] : []);
      const nomLower = (s.nom || '').toLowerCase();
      const addrLower = (s.adresse || '').toLowerCase();
      const ensLower = (s.enseigne || '').toLowerCase();
      
      const hasExplicitEv = srvList.some(srv => {
        const str = String(srv).toLowerCase();
        return str.includes('borne') || str.includes('charg') || str.includes('électr') || 
               str.includes('electr') || str.includes('schnelllader') || str.includes('ev');
      });
      const isMotorwayArea = nomLower.includes('aire ') || nomLower.startsWith('aire') ||
                             addrLower.includes('autoroute') || addrLower.includes(' aire ') ||
                             s.type === 'autoroute' || Boolean(s.displayedPk);
                             
      if (hasExplicitEv || (isMotorwayArea && s.pays === 'FR')) {
        if (!s.prix.elec) {
          if (ensLower.includes('tesla') || nomLower.includes('tesla')) {
            s.prix.elec = 0.390; // Tesla Supercharger
          } else if (ensLower.includes('fulli') || nomLower.includes('fulli')) {
            s.prix.elec = 0.450; // APRR / Fulli
          } else if (ensLower.includes('total')) {
            s.prix.elec = 0.490; // TotalEnergies EV
          } else if (ensLower.includes('ionity') || ensLower.includes('fastned') || ensLower.includes('shell')) {
            s.prix.elec = 0.590; // Ionity / Fastned / Shell HPC
          } else if (s.pays === 'GB') {
            s.prix.elec = 0.490; // UK Gridserve / InstaVolt average £/kWh
          } else if (s.pays === 'ES') {
            s.prix.elec = 0.480; // Spain Iberdrola / Repsol €/kWh
          } else if (s.pays === 'IT') {
            s.prix.elec = 0.620; // Italy Free To X €/kWh
          } else if (s.pays === 'DE') {
            s.prix.elec = 0.560; // Germany EnBW / Aral Pulse €/kWh
          } else {
            s.prix.elec = 0.490; // Motorway ultra-fast charging standard
          }
        }
      }
    });

    populateBrandFilter();
    const badge = document.getElementById('total-stations-badge');
    if (badge) badge.textContent = t().areasCount(allStations.length);
  } catch (err) {
    console.error('Erreur chargement stations:', err);
  }
}

let coveredCountriesLayer = null;

// Load covered countries boundary overlay (France, Germany, Italy, Spain & UK)
async function loadCoveredCountries() {
  try {
    const res = await fetch(`pays_couverts.json?v=${APP_VERSION}`);
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
          () => `<div style="font-weight:800; font-size:0.88rem; color:#fff;">${p.flag} ${translateCountryName(p.name)}</div><div style="font-size:0.75rem; color:#38bdf8;">${t().areasListed(p.stationsCount)}</div>`,
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
    renderCountryBadgesOnMap();
  } catch (err) {
    console.warn('Erreur chargement pays couverts:', err);
  }
}

// Detect country (FR, ES, IT, DE, BE, GB) from geographic coordinates using nearest station or bounding boxes
function getCountryFromCoordinates(lat, lon) {
  if (allStations && allStations.length > 0) {
    let bestDistSq = Infinity;
    let bestCountry = 'FR';
    for (let i = 0; i < allStations.length; i++) {
      const s = allStations[i];
      const dLat = s.lat - lat;
      const dLon = s.lon - lon;
      const d = dLat * dLat + dLon * dLon;
      if (d < bestDistSq) {
        bestDistSq = d;
        bestCountry = s.pays || 'FR';
      }
    }
    return bestCountry;
  }
  // Bounding box fallbacks
  if (lat >= 36.9 && lat <= 42.2 && lon >= -9.5 && lon <= -6.1) return 'PT';
  if (lat >= 50.7 && lat <= 53.6 && lon >= 3.3 && lon <= 7.2) return 'NL';
  if (lat >= 36.0 && lat <= 43.8 && lon >= -9.3 && lon <= 3.3) return 'ES';
  if (lat >= 36.6 && lat <= 47.1 && lon >= 6.6 && lon <= 18.5) return 'IT';
  if (lat >= 47.2 && lat <= 55.1 && lon >= 5.8 && lon <= 15.1) return 'DE';
  if (lat >= 49.9 && lat <= 59.0 && lon >= -8.0 && lon <= 1.8) return 'GB';
  if (lat >= 49.5 && lat <= 51.5 && lon >= 2.5 && lon <= 6.4) return 'BE';
  return 'FR';
}

// Determines the relevant country/countries for the current itinerary or search context
function getActiveSearchCountries() {
  // 1. If an active route has matched stations, use their countries
  if (currentRouteStations && currentRouteStations.length > 0) {
    const routeCountries = [...new Set(currentRouteStations.map(s => s.pays).filter(Boolean))];
    if (routeCountries.length > 0) return routeCountries;
  }

  // 2. If startPoint and/or endPoint are defined with coordinates, detect their countries
  const pts = [startPoint, endPoint].filter(p => p && p.coords);
  if (pts.length > 0) {
    const detected = [];
    pts.forEach(pt => {
      const c = getCountryFromCoordinates(pt.coords[1], pt.coords[0]);
      if (c && !detected.includes(c)) detected.push(c);
    });
    if (detected.length > 0) return detected;
  }

  // 3. Fallback based on selected UI country or language flag
  if (userSelectedCountry) {
    return [userSelectedCountry];
  }
  const langCountryMap = {
    fr: 'FR',
    es: 'ES',
    it: 'IT',
    de: 'DE',
    en: 'GB',
    nl: 'NL',
    pt: 'PT',
    be: 'BE'
  };
  return [langCountryMap[currentLang] || 'FR'];
}

// Populate Brands Filter dropdown
// Dynamically adjusts: for an itinerary or search in a single country, strictly limits to brands available in that country!
function populateBrandFilter() {
  const brandSelect = document.getElementById('select-brand');
  if (!brandSelect) return;
  const currentVal = selectedBrand;

  const activeCountries = getActiveSearchCountries();

  // Determine station pool:
  // If route stations exist, use them directly (they already match the route's countries)
  // Otherwise, strictly filter all network stations by the active country/countries
  let pool = [];
  if (currentRouteStations && currentRouteStations.length > 0) {
    pool = currentRouteStations;
  } else {
    pool = allStations.filter(s => activeCountries.includes(s.pays || 'FR'));
    if (pool.length === 0) pool = allStations;
  }

  const counts = {};
  pool.forEach(s => {
    let b = s.enseigne || 'Indépendant';
    if (b.startsWith('DELETE TAG')) b = 'TotalEnergies';
    counts[b] = (counts[b] || 0) + 1;
  });

  const sortedBrands = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
  let html = `<option value="all">${t().allBrands} (${sortedBrands.length})</option>`;
  sortedBrands.forEach(b => {
    const isSel = (b === currentVal) ? ' selected' : '';
    html += `<option value="${b}"${isSel}>${b} (${counts[b]})</option>`;
  });
  brandSelect.innerHTML = html;

  if (currentVal !== 'all' && !counts[currentVal]) {
    selectedBrand = 'all';
    brandSelect.value = 'all';
  }
}

// Bilingual European Cities Index (instant support for English, French, Spanish & Italian names)
const BILINGUAL_CITIES_INDEX = [
  // Portugal
  { names: ['Lisbon', 'Lisboa', 'Lisbonne'], display: 'Lisboa (Lisbonne)', country: 'Portugal', flag: '🇵🇹', coords: [-9.1393, 38.7223] },
  { names: ['Porto'], display: 'Porto', country: 'Portugal', flag: '🇵🇹', coords: [-8.6291, 41.1579] },
  { names: ['Faro'], display: 'Faro (Algarve)', country: 'Portugal', flag: '🇵🇹', coords: [-7.9304, 37.0194] },
  { names: ['Coimbra'], display: 'Coimbra', country: 'Portugal', flag: '🇵🇹', coords: [-8.4292, 40.2033] },
  { names: ['Braga'], display: 'Braga', country: 'Portugal', flag: '🇵🇹', coords: [-8.4265, 41.5454] },
  { names: ['Vila Nova de Gaia'], display: 'Vila Nova de Gaia', country: 'Portugal', flag: '🇵🇹', coords: [-8.6110, 41.1239] },
  { names: ['Setúbal'], display: 'Setúbal', country: 'Portugal', flag: '🇵🇹', coords: [-8.8926, 38.5244] },
  { names: ['Évora'], display: 'Évora', country: 'Portugal', flag: '🇵🇹', coords: [-7.9093, 38.5714] },
  { names: ['Guarda'], display: 'Guarda', country: 'Portugal', flag: '🇵🇹', coords: [-7.2690, 40.5373] },
  { names: ['Leiria'], display: 'Leiria', country: 'Portugal', flag: '🇵🇹', coords: [-8.8078, 39.7436] },

  // Pays-Bas (Nederland)
  { names: ['Amsterdam'], display: 'Amsterdam', country: 'Pays-Bas', flag: '🇳🇱', coords: [4.9041, 52.3676] },
  { names: ['Rotterdam'], display: 'Rotterdam', country: 'Pays-Bas', flag: '🇳🇱', coords: [4.4777, 51.9244] },
  { names: ['The Hague', 'Den Haag', 'La Haye'], display: 'Den Haag (La Haye)', country: 'Pays-Bas', flag: '🇳🇱', coords: [4.3007, 52.0705] },
  { names: ['Utrecht'], display: 'Utrecht', country: 'Pays-Bas', flag: '🇳🇱', coords: [5.1214, 52.0907] },
  { names: ['Eindhoven'], display: 'Eindhoven', country: 'Pays-Bas', flag: '🇳🇱', coords: [5.4697, 51.4416] },
  { names: ['Maastricht'], display: 'Maastricht', country: 'Pays-Bas', flag: '🇳🇱', coords: [5.6909, 50.8514] },
  { names: ['Breda'], display: 'Breda', country: 'Pays-Bas', flag: '🇳🇱', coords: [4.7753, 51.5719] },
  { names: ['Arnhem'], display: 'Arnhem', country: 'Pays-Bas', flag: '🇳🇱', coords: [5.8987, 51.9851] },
  { names: ['Groningen', 'Groningue'], display: 'Groningen', country: 'Pays-Bas', flag: '🇳🇱', coords: [6.5665, 53.2194] },

  // United Kingdom & Ireland
  { names: ['London', 'Londres'], display: 'London (Londres)', country: 'Royaume-Uni', flag: '🇬🇧', coords: [-0.1276, 51.5072] },
  { names: ['Folkestone'], display: 'Folkestone', country: 'Royaume-Uni', flag: '🇬🇧', coords: [1.1560, 51.0814] },
  { names: ['Dover', 'Douvres'], display: 'Dover (Douvres)', country: 'Royaume-Uni', flag: '🇬🇧', coords: [1.3134, 51.1279] },
  { names: ['Edinburgh', 'Edimbourg', 'Édimbourg'], display: 'Edinburgh (Édimbourg)', country: 'Royaume-Uni', flag: '🇬🇧', coords: [-3.1883, 55.9533] },
  { names: ['Manchester'], display: 'Manchester', country: 'Royaume-Uni', flag: '🇬🇧', coords: [-2.2426, 53.4808] },
  { names: ['Birmingham'], display: 'Birmingham', country: 'Royaume-Uni', flag: '🇬🇧', coords: [-1.8904, 52.4862] },
  { names: ['Liverpool'], display: 'Liverpool', country: 'Royaume-Uni', flag: '🇬🇧', coords: [-2.9916, 53.4084] },
  { names: ['Glasgow'], display: 'Glasgow', country: 'Royaume-Uni', flag: '🇬🇧', coords: [-4.2518, 55.8642] },
  { names: ['Belfast'], display: 'Belfast', country: 'Royaume-Uni', flag: '🇬🇧', coords: [-5.9301, 54.5973] },
  { names: ['Bristol'], display: 'Bristol', country: 'Royaume-Uni', flag: '🇬🇧', coords: [-2.5879, 51.4545] },
  { names: ['Leeds'], display: 'Leeds', country: 'Royaume-Uni', flag: '🇬🇧', coords: [-1.5491, 53.8008] },
  { names: ['Cardiff'], display: 'Cardiff', country: 'Royaume-Uni', flag: '🇬🇧', coords: [-3.1791, 51.4816] },
  { names: ['Newcastle', 'Newcastle upon Tyne'], display: 'Newcastle upon Tyne', country: 'Royaume-Uni', flag: '🇬🇧', coords: [-1.6178, 54.9783] },
  { names: ['Sheffield'], display: 'Sheffield', country: 'Royaume-Uni', flag: '🇬🇧', coords: [-1.4701, 53.3811] },
  { names: ['Nottingham'], display: 'Nottingham', country: 'Royaume-Uni', flag: '🇬🇧', coords: [-1.1581, 52.9548] },
  { names: ['Southampton'], display: 'Southampton', country: 'Royaume-Uni', flag: '🇬🇧', coords: [-1.4044, 50.9097] },
  { names: ['Portsmouth'], display: 'Portsmouth', country: 'Royaume-Uni', flag: '🇬🇧', coords: [-1.0880, 50.8198] },
  { names: ['Brighton'], display: 'Brighton', country: 'Royaume-Uni', flag: '🇬🇧', coords: [-0.1372, 50.8225] },
  { names: ['Oxford'], display: 'Oxford', country: 'Royaume-Uni', flag: '🇬🇧', coords: [-1.2577, 51.7520] },
  { names: ['Cambridge'], display: 'Cambridge', country: 'Royaume-Uni', flag: '🇬🇧', coords: [0.1218, 52.2053] },
  { names: ['Canterbury', 'Cantorbéry', 'Cantorbery'], display: 'Canterbury (Cantorbéry)', country: 'Royaume-Uni', flag: '🇬🇧', coords: [1.0789, 51.2802] },
  { names: ['Maidstone'], display: 'Maidstone', country: 'Royaume-Uni', flag: '🇬🇧', coords: [0.5217, 51.2704] },
  { names: ['Ashford'], display: 'Ashford', country: 'Royaume-Uni', flag: '🇬🇧', coords: [0.8738, 51.1465] },
  { names: ['Exeter'], display: 'Exeter', country: 'Royaume-Uni', flag: '🇬🇧', coords: [-3.5339, 50.7184] },
  { names: ['Plymouth'], display: 'Plymouth', country: 'Royaume-Uni', flag: '🇬🇧', coords: [-4.1427, 50.3755] },
  { names: ['York'], display: 'York', country: 'Royaume-Uni', flag: '🇬🇧', coords: [-1.0873, 53.9599] },
  { names: ['Swansea'], display: 'Swansea', country: 'Royaume-Uni', flag: '🇬🇧', coords: [-3.9436, 51.6214] },
  { names: ['Reading'], display: 'Reading', country: 'Royaume-Uni', flag: '🇬🇧', coords: [-0.9781, 51.4543] },
  { names: ['Coventry'], display: 'Coventry', country: 'Royaume-Uni', flag: '🇬🇧', coords: [-1.5197, 52.4068] },
  { names: ['Leicester'], display: 'Leicester', country: 'Royaume-Uni', flag: '🇬🇧', coords: [-1.1398, 52.6369] },
  { names: ['Carlisle'], display: 'Carlisle', country: 'Royaume-Uni', flag: '🇬🇧', coords: [-2.9329, 54.8925] },
  { names: ['Inverness'], display: 'Inverness', country: 'Royaume-Uni', flag: '🇬🇧', coords: [-4.2247, 57.4778] },
  { names: ['Aberdeen'], display: 'Aberdeen', country: 'Royaume-Uni', flag: '🇬🇧', coords: [-2.0943, 57.1497] },
  { names: ['Dublin'], display: 'Dublin', country: 'Irlande', flag: '🇮🇪', coords: [-6.2603, 53.3498] },

  // Italy
  { names: ['Milano', 'Milan'], display: 'Milano (Milan)', country: 'Italie', flag: '🇮🇹', coords: [9.1900, 45.4642] },
  { names: ['Roma', 'Rome'], display: 'Roma (Rome)', country: 'Italie', flag: '🇮🇹', coords: [12.4964, 41.9028] },
  { names: ['Torino', 'Turin'], display: 'Torino (Turin)', country: 'Italie', flag: '🇮🇹', coords: [7.6869, 45.0703] },
  { names: ['Venezia', 'Venise', 'Venice'], display: 'Venezia (Venise)', country: 'Italie', flag: '🇮🇹', coords: [12.3155, 45.4408] },
  { names: ['Firenze', 'Florence'], display: 'Firenze (Florence)', country: 'Italie', flag: '🇮🇹', coords: [11.2558, 43.7696] },
  { names: ['Napoli', 'Naples'], display: 'Napoli (Naples)', country: 'Italie', flag: '🇮🇹', coords: [14.2681, 40.8518] },
  { names: ['Genova', 'Gênes', 'Genes', 'Genoa'], display: 'Genova (Gênes)', country: 'Italie', flag: '🇮🇹', coords: [8.9463, 44.4056] },
  { names: ['Bologna', 'Bologne'], display: 'Bologna (Bologne)', country: 'Italie', flag: '🇮🇹', coords: [11.3426, 44.4949] },
  { names: ['Verona', 'Vérone', 'Verone'], display: 'Verona (Vérone)', country: 'Italie', flag: '🇮🇹', coords: [10.9916, 45.4384] },
  { names: ['Bari'], display: 'Bari', country: 'Italie', flag: '🇮🇹', coords: [16.8719, 41.1171] },
  { names: ['Palermo', 'Palerme'], display: 'Palermo (Palerme)', country: 'Italie', flag: '🇮🇹', coords: [13.3615, 38.1157] },

  // Spain
  { names: ['Barcelona', 'Barcelone'], display: 'Barcelona (Barcelone)', country: 'Espagne', flag: '🇪🇸', coords: [2.1734, 41.3851] },
  { names: ['Madrid'], display: 'Madrid', country: 'Espagne', flag: '🇪🇸', coords: [-3.7038, 40.4168] },
  { names: ['Valencia', 'Valence'], display: 'Valencia (Valence)', country: 'Espagne', flag: '🇪🇸', coords: [-0.3763, 39.4699] },
  { names: ['Sevilla', 'Séville', 'Seville'], display: 'Sevilla (Séville)', country: 'Espagne', flag: '🇪🇸', coords: [-5.9845, 37.3891] },
  { names: ['Zaragoza', 'Saragosse', 'Saragossa'], display: 'Zaragoza (Saragosse)', country: 'Espagne', flag: '🇪🇸', coords: [-0.8891, 41.6488] },
  { names: ['Málaga', 'Malaga'], display: 'Málaga', country: 'Espagne', flag: '🇪🇸', coords: [-4.4214, 36.7213] },
  { names: ['Bilbao'], display: 'Bilbao', country: 'Espagne', flag: '🇪🇸', coords: [-2.9350, 43.2630] },
  { names: ['San Sebastián', 'Donostia', 'Saint-Sébastien', 'San Sebastian'], display: 'San Sebastián (Saint-Sébastien)', country: 'Espagne', flag: '🇪🇸', coords: [-1.9812, 43.3183] },
  { names: ['Girona', 'Gérone', 'Gerone'], display: 'Girona (Gérone)', country: 'Espagne', flag: '🇪🇸', coords: [2.8214, 41.9794] },
  { names: ['Alicante'], display: 'Alicante', country: 'Espagne', flag: '🇪🇸', coords: [-0.4810, 38.3452] },

  // France & Neighbors
  { names: ['Paris'], display: 'Paris', country: 'France', flag: '🇫🇷', coords: [2.3522, 48.8566] },
  { names: ['Lyon', 'Lyons'], display: 'Lyon', country: 'France', flag: '🇫🇷', coords: [4.8357, 45.7640] },
  { names: ['Marseille', 'Marseilles'], display: 'Marseille', country: 'France', flag: '🇫🇷', coords: [5.3698, 43.2965] },
  { names: ['Lille'], display: 'Lille', country: 'France', flag: '🇫🇷', coords: [3.0573, 50.6292] },
  { names: ['Calais'], display: 'Calais', country: 'France', flag: '🇫🇷', coords: [1.8587, 50.9513] },
  { names: ['Dunkerque', 'Dunkirk'], display: 'Dunkerque (Dunkirk)', country: 'France', flag: '🇫🇷', coords: [2.3768, 51.0344] },
  { names: ['Bordeaux'], display: 'Bordeaux', country: 'France', flag: '🇫🇷', coords: [-0.5792, 44.8378] },
  { names: ['Toulouse'], display: 'Toulouse', country: 'France', flag: '🇫🇷', coords: [1.4442, 43.6047] },
  { names: ['Nice'], display: 'Nice', country: 'France', flag: '🇫🇷', coords: [7.2620, 43.7102] },
  { names: ['Nantes'], display: 'Nantes', country: 'France', flag: '🇫🇷', coords: [-1.5536, 47.2184] },
  { names: ['Strasbourg'], display: 'Strasbourg', country: 'France', flag: '🇫🇷', coords: [7.7521, 48.5734] },
  { names: ['Bruxelles', 'Brussels', 'Brussel', 'Brüssel', 'Bruselas'], display: 'Bruxelles (Brussels)', country: 'Belgique', flag: '🇧🇪', coords: [4.3517, 50.8503] },
  { names: ['Anvers', 'Antwerpen', 'Antwerp', 'Anversa', 'Amberes'], display: 'Antwerpen (Anvers)', country: 'Belgique', flag: '🇧🇪', coords: [4.4025, 51.2194] },
  { names: ['Gand', 'Gent', 'Ghent', 'Gante'], display: 'Gent (Gand)', country: 'Belgique', flag: '🇧🇪', coords: [3.7174, 51.0543] },
  { names: ['Liège', 'Liege', 'Luik', 'Lüttich', 'Lieja'], display: 'Liège', country: 'Belgique', flag: '🇧🇪', coords: [5.5797, 50.6326] },
  { names: ['Charleroi'], display: 'Charleroi', country: 'Belgique', flag: '🇧🇪', coords: [4.4446, 50.4108] },
  { names: ['Namur', 'Namen'], display: 'Namur', country: 'Belgique', flag: '🇧🇪', coords: [4.8719, 50.4674] },
  { names: ['Mons', 'Bergen'], display: 'Mons', country: 'Belgique', flag: '🇧🇪', coords: [3.9523, 50.4542] },
  { names: ['Bruges', 'Brugge'], display: 'Brugge (Bruges)', country: 'Belgique', flag: '🇧🇪', coords: [3.2247, 51.2093] },
  { names: ['Louvain', 'Leuven', 'Löwen'], display: 'Leuven (Louvain)', country: 'Belgique', flag: '🇧🇪', coords: [4.7005, 50.8798] },
  { names: ['Tournai', 'Doornik'], display: 'Tournai', country: 'Belgique', flag: '🇧🇪', coords: [3.3878, 50.6058] },
  { names: ['Arlon', 'Aarlen'], display: 'Arlon', country: 'Belgique', flag: '🇧🇪', coords: [5.8167, 49.6833] },
  { names: ['Ostende', 'Oostende', 'Ostend'], display: 'Oostende (Ostende)', country: 'Belgique', flag: '🇧🇪', coords: [2.9195, 51.2254] },
  { names: ['Genève', 'Geneve', 'Geneva'], display: 'Genève (Geneva)', country: 'Suisse', flag: '🇨🇭', coords: [6.1432, 46.2044] },

  // Germany
  { names: ['Berlin'], display: 'Berlin', country: 'Allemagne', flag: '🇩🇪', coords: [13.4050, 52.5200] },
  { names: ['München', 'Munchen', 'Munich', 'Monaco di Baviera', 'Múnich'], display: 'München (Munich)', country: 'Allemagne', flag: '🇩🇪', coords: [11.5820, 48.1351] },
  { names: ['Frankfurt', 'Frankfurt am Main', 'Francfort', 'Francoforte'], display: 'Frankfurt am Main (Francfort)', country: 'Allemagne', flag: '🇩🇪', coords: [8.6821, 50.1109] },
  { names: ['Köln', 'Koln', 'Cologne', 'Colonia'], display: 'Köln (Cologne)', country: 'Allemagne', flag: '🇩🇪', coords: [6.9603, 50.9375] },
  { names: ['Hamburg', 'Hambourg', 'Amburgo', 'Hamburgo'], display: 'Hamburg (Hambourg)', country: 'Allemagne', flag: '🇩🇪', coords: [9.9937, 53.5511] },
  { names: ['Stuttgart', 'Stoccarda'], display: 'Stuttgart', country: 'Allemagne', flag: '🇩🇪', coords: [9.1829, 48.7758] },
  { names: ['Düsseldorf', 'Dusseldorf'], display: 'Düsseldorf', country: 'Allemagne', flag: '🇩🇪', coords: [6.7735, 51.2277] },
  { names: ['Dortmund'], display: 'Dortmund', country: 'Allemagne', flag: '🇩🇪', coords: [7.4653, 51.5136] },
  { names: ['Leipzig', 'Lipsia'], display: 'Leipzig', country: 'Allemagne', flag: '🇩🇪', coords: [12.3731, 51.3397] },
  { names: ['Dresden', 'Dresde', 'Dresda'], display: 'Dresden (Dresde)', country: 'Allemagne', flag: '🇩🇪', coords: [13.7373, 51.0504] },
  { names: ['Hannover', 'Hanovre', 'Hanover'], display: 'Hannover (Hanovre)', country: 'Allemagne', flag: '🇩🇪', coords: [9.7320, 52.3759] },
  { names: ['Nürnberg', 'Nurnberg', 'Nuremberg', 'Norimberga'], display: 'Nürnberg (Nuremberg)', country: 'Allemagne', flag: '🇩🇪', coords: [11.0767, 49.4521] },
  { names: ['Bremen', 'Brême', 'Breme', 'Brema'], display: 'Bremen (Brême)', country: 'Allemagne', flag: '🇩🇪', coords: [8.8017, 53.0793] },
  { names: ['Mannheim'], display: 'Mannheim', country: 'Allemagne', flag: '🇩🇪', coords: [8.4660, 49.4875] },
  { names: ['Karlsruhe'], display: 'Karlsruhe', country: 'Allemagne', flag: '🇩🇪', coords: [8.4037, 49.0069] },
  { names: ['Freiburg', 'Freiburg im Breisgau', 'Fribourg', 'Fribourg-en-Brisgau', 'Friburgo'], display: 'Freiburg im Breisgau (Fribourg)', country: 'Allemagne', flag: '🇩🇪', coords: [7.8421, 47.9990] },
  { names: ['Aachen', 'Aix-la-Chapelle', 'Aquisgrana'], display: 'Aachen (Aix-la-Chapelle)', country: 'Allemagne', flag: '🇩🇪', coords: [6.0839, 50.7753] },
  { names: ['Saarbrücken', 'Saarbrucken', 'Sarrebruck'], display: 'Saarbrücken (Sarrebruck)', country: 'Allemagne', flag: '🇩🇪', coords: [6.9969, 49.2402] },
  { names: ['Ulm'], display: 'Ulm', country: 'Allemagne', flag: '🇩🇪', coords: [9.9876, 48.4011] },
  { names: ['Augsburg', 'Augsbourg', 'Augusta'], display: 'Augsburg (Augsbourg)', country: 'Allemagne', flag: '🇩🇪', coords: [10.8978, 48.3705] }
];

async function searchLocationsBilingual(q) {
  const qNorm = q.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const results = [];

  const hasDigits = /\d/.test(qNorm);
  const streetKeywords = ['rue', 'av', 'avenue', 'bd', 'boulevard', 'chemin', 'allee', 'place', 'impasse', 'route', 'cours', 'quai', 'square', 'street', 'road', 'st', 'rd', 'str', 'strasse', 'straße', 'via', 'calle', 'rua', 'plein', 'straat'];
  const hasStreetKeyword = streetKeywords.some(kw => new RegExp(`\\b${kw}\\b`, 'i').test(qNorm));
  const poiKeywords = ['parking', 'parkhaus', 'aparcamiento', 'parcheggio', 'car park', 'gare', 'station', 'aeroport', 'airport', 'flughafen', 'mairie', 'rathaus', 'hotel de ville', 'hopital', 'hospital', 'universite', 'university', 'ecole', 'school', 'tribunal', 'courthouse', 'police', 'poste', 'stade', 'stadium', 'centre commercial', 'expo', 'congre'];
  const hasPoiKeyword = poiKeywords.some(kw => qNorm.includes(kw));
  const isSpecificSearch = hasDigits || hasStreetKeyword || hasPoiKeyword;

  const fetchWithTimeout = (url, opts = {}, ms = 2200) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms);
    return fetch(url, { ...opts, signal: ctrl.signal })
      .then(r => r.json())
      .finally(() => clearTimeout(timer));
  };

  // 1. Instant Bilingual Major Cities Match (English + French + Native names)
  // When user is typing a specific search (e.g. street address or POI), give lower priority
  BILINGUAL_CITIES_INDEX.forEach(city => {
    let isExact = false;
    let isPrefix = false;
    city.names.forEach(n => {
      const nNorm = n.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (nNorm === qNorm) isExact = true;
      else if (nNorm.startsWith(qNorm)) isPrefix = true;
    });
    if (isExact || isPrefix) {
      results.push({
        label: `${city.flag} 🏘️ ${city.display}, ${translateCountryName(city.country)}`,
        cleanName: city.display,
        coords: city.coords,
        priority: isSpecificSearch ? 40 : (isExact ? 150 : 110)
      });
    }
  });

  // 2. Query European Photon (bounded to Western & Central Europe), Nominatim OSM, & French BAN in parallel
  const qNormalizedVariant = q
    .replace(/\btechnical\s+cent(er|re)\b/gi, 'Technology Centre')
    .replace(/\btech\s+cent(er|re)\b/gi, 'Technology Centre')
    .replace(/\bcenter\b/gi, 'Centre');

  const euroBbox = '-11.0,35.0,19.5,61.0';
  const queriesToRun = [
    fetchWithTimeout(`https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(q)}&limit=6`, {}, 2200),
    fetchWithTimeout(`https://photon.komoot.io/api/?q=${encodeURIComponent(qNormalizedVariant)}&bbox=${euroBbox}&limit=8`, {}, 3000),
    fetchWithTimeout(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(qNormalizedVariant)}&countrycodes=fr,es,it,de,gb,be,nl,pt,lu,at,ch,si,hr&addressdetails=1&extratags=1&limit=6`, {}, 3200)
  ];
  const [banRes, photonDefaultRes, nominatimRes] = await Promise.allSettled(queriesToRun);

  const getCountryFlag = (cc, countryStr) => {
    const code = (cc || '').toUpperCase();
    const cLow = (countryStr || '').toLowerCase();
    if (code === 'GB' || code === 'UK' || cLow.includes('royaume-uni') || cLow.includes('united kingdom') || cLow.includes('great britain') || cLow.includes('england') || cLow.includes('scotland') || cLow.includes('wales')) return '🇬🇧';
    if (code === 'ES' || cLow.includes('esp') || cLow.includes('spain')) return '🇪🇸';
    if (code === 'IT' || cLow.includes('ital')) return '🇮🇹';
    if (code === 'FR' || cLow.includes('fran')) return '🇫🇷';
    if (code === 'IE' || cLow.includes('ireland') || cLow.includes('irlande')) return '🇮🇪';
    if (code === 'DE' || cLow.includes('allem') || cLow.includes('germ') || cLow.includes('deutschland')) return '🇩🇪';
    if (code === 'BE' || cLow.includes('belg')) return '🇧🇪';
    if (code === 'NL' || cLow.includes('pays-bas') || cLow.includes('netherland') || cLow.includes('nederland') || cLow.includes('holland')) return '🇳🇱';
    if (code === 'PT' || cLow.includes('portug')) return '🇵🇹';
    if (code === 'LU' || cLow.includes('lux')) return '🇱🇺';
    if (code === 'AT' || cLow.includes('autrich') || cLow.includes('austria') || cLow.includes('österreich')) return '🇦🇹';
    if (code === 'CH' || cLow.includes('suis') || cLow.includes('switz') || cLow.includes('schweiz') || cLow.includes('svizzera')) return '🇨🇭';
    if (code === 'SI' || cLow.includes('slovén') || cLow.includes('sloven')) return '🇸🇮';
    if (code === 'HR' || cLow.includes('croat') || cLow.includes('hrvat')) return '🇭🇷';
    return '🌍';
  };

  const addResultIfUnique = (item) => {
    const itemNameNorm = (item.cleanName || '').toLowerCase().trim();
    const isDup = results.some(r => {
      const rNameNorm = (r.cleanName || '').toLowerCase().trim();
      const sameCoordsExact = Math.abs(r.coords[0] - item.coords[0]) < 0.001 && Math.abs(r.coords[1] - item.coords[1]) < 0.001;
      const sameName = rNameNorm === itemNameNorm;
      return sameCoordsExact || sameName;
    });
    if (!isDup) {
      results.push(item);
    }
  };

  const getPoiInfo = (cat, type, name) => {
    const c = (cat || '').toLowerCase();
    const t = (type || '').toLowerCase();
    const n = (name || '').toLowerCase();

    // 1. Parking
    if (t.includes('parking') || t === 'car_park' || t === 'garage' || c === 'parking' ||
        n.includes('parking') || n.includes('parkhaus') || n.includes('aparcamiento') ||
        n.includes('parcheggio') || n.includes('car park') || n.startsWith('p+r') || n.includes(' p+r')) {
      return { icon: '🅿️ ', category: 'parking', isPoi: true };
    }

    // 2. Transports: Airports, Stations, Ferries, Bus
    if (c === 'aeroway' || t.includes('aerodrome') || t.includes('airport') || t === 'terminal' ||
        n.includes('aéroport') || n.includes('aeroport') || n.includes('airport') || n.includes('flughafen') || n.includes('aeropuerto')) {
      return { icon: '✈️ ', category: 'airport', isPoi: true };
    }
    if (c === 'railway' || t === 'station' || t === 'halt' || t === 'train_station' || t === 'subway_entrance' ||
        n.includes('gare ') || n.startsWith('gare') || n.includes('bahnhof') || n.includes('stazione') || n.includes('estación')) {
      return { icon: '🚉 ', category: 'station', isPoi: true };
    }
    if (t === 'bus_station' || t === 'coach_station' || n.includes('gare routière') || n.includes('bus station')) {
      return { icon: '🚌 ', category: 'bus', isPoi: true };
    }
    if (t === 'ferry_terminal' || t === 'dock' || t === 'port' || n.includes('ferry') || n.includes('terminal ferry') || n.includes('embarcadère')) {
      return { icon: '⛴️ ', category: 'ferry', isPoi: true };
    }

    // 3. Civic & Public Administration: Mairie, Townhall, Hôtel de Ville, Préfecture
    if (t === 'townhall' || t === 'civic' || t === 'public_building' ||
        n.includes('mairie') || n.includes('hôtel de ville') || n.includes('hotel de ville') ||
        n.includes('rathaus') || n.includes('ayuntamiento') || n.includes('municipio') ||
        n.includes('préfecture') || n.includes('prefecture') || n.includes('sous-préfecture')) {
      return { icon: '🏛️ ', category: 'townhall', isPoi: true };
    }

    // 4. Justice / Courthouse
    if (t === 'courthouse' || n.includes('tribunal') || n.includes('palais de justice') ||
        n.includes('cour d\'appel') || n.includes('justizpalast') || n.includes('juzgado')) {
      return { icon: '⚖️ ', category: 'courthouse', isPoi: true };
    }

    // 5. Emergency & Healthcare: Hospital, Police, Fire
    if (t === 'hospital' || t === 'clinic' || t === 'doctors' ||
        n.includes('hôpital') || n.includes('hopital') || n.includes('clinique') ||
        n.includes('chu') || n.includes('chr ') || n.includes('krankenhaus') || n.includes('hospital') || n.includes('ospedale')) {
      return { icon: '🏥 ', category: 'hospital', isPoi: true };
    }
    if (t === 'police' || n.includes('police') || n.includes('gendarmerie') || n.includes('commissariat') ||
        n.includes('polizei') || n.includes('comisaría') || n.includes('questura')) {
      return { icon: '👮 ', category: 'police', isPoi: true };
    }
    if (t === 'fire_station' || n.includes('pompier') || n.includes('feuerwehr') ||
        n.includes('bomberos') || n.includes('caserne')) {
      return { icon: '🚒 ', category: 'fire_station', isPoi: true };
    }

    // 6. Post Office
    if (t === 'post_office' || n.includes('la poste') || n.includes('post office') ||
        n.includes('postamt') || n.includes('correos') || n.includes('poste italiane')) {
      return { icon: '🏣 ', category: 'post_office', isPoi: true };
    }

    // 7. Education: Universities, Schools
    if (t === 'university' || t === 'college' || t === 'school' ||
        n.includes('université') || n.includes('universite') || n.includes('campus') ||
        n.includes('faculté') || n.includes('universität') || n.includes('universidad')) {
      return { icon: '🎓 ', category: 'university', isPoi: true };
    }

    // 8. Library / Media
    if (t === 'library' || n.includes('bibliothèque') || n.includes('bibliotheque') ||
        n.includes('médiathèque') || n.includes('mediatheque') || n.includes('library') || n.includes('bibliothek')) {
      return { icon: '📚 ', category: 'library', isPoi: true };
    }

    // 9. Arts, Culture, Entertainment
    if (t === 'theatre' || t === 'arts_centre' || t === 'cinema' ||
        n.includes('théâtre') || n.includes('theatre') || n.includes('opéra') ||
        n.includes('opera') || n.includes('cinéma') || n.includes('cinema') || n.includes('zenith') || n.includes('philharmonie')) {
      return { icon: '🎭 ', category: 'theatre', isPoi: true };
    }
    if (t === 'conference_centre' || t === 'exhibition_centre' ||
        n.includes('exposition') || n.includes('congrès') || n.includes('congres') ||
        n.includes('parc expo') || n.includes('messe') || n.includes('convention center')) {
      return { icon: '🏢 ', category: 'convention', isPoi: true };
    }

    // 10. Religious Sites
    if (t === 'place_of_worship' || t === 'cathedral' || t === 'church' || t === 'basilica' ||
        n.includes('cathédrale') || n.includes('cathedrale') || n.includes('église') ||
        n.includes('eglise') || n.includes('basilique') || n.includes('duomo') || n.includes('kirch') || n.includes('temple')) {
      return { icon: '⛪ ', category: 'worship', isPoi: true };
    }

    // 11. Tourism, Monuments & Historic
    if (c === 'tourism' || c === 'historic' || t === 'monument' || t === 'castle' ||
        t === 'museum' || t === 'attraction' || t === 'viewpoint' || t === 'palace' ||
        n.includes('musée') || n.includes('musee') || n.includes('museum') || n.includes('museo') ||
        n.includes('château') || n.includes('castle') || n.includes('palais')) {
      return { icon: '🏛️ ', category: 'monument', isPoi: true };
    }

    // 12. Shopping / Commercial
    if (c === 'shop' || t === 'mall' || t === 'supermarket' || t === 'department_store' ||
        n.includes('centre commercial') || n.includes('supermarché') || n.includes('hypermarché') ||
        n.includes('shopping') || n.includes('galerie marchande')) {
      return { icon: '🛒 ', category: 'shopping', isPoi: true };
    }

    // 13. Sports & Parks
    if (t === 'theme_park' || t === 'zoo' || t === 'aquarium') {
      return { icon: '🎢 ', category: 'theme_park', isPoi: true };
    }
    if (t === 'stadium' || t === 'sports_centre' || (c === 'leisure' && t !== 'park') ||
        n.includes('stade') || n.includes('arena') || n.includes('stadium') || n.includes('vélodrome')) {
      return { icon: '🏟️ ', category: 'stadium', isPoi: true };
    }
    if (t === 'park' || t === 'garden' || c === 'natural' || n.includes('parc') || n.includes('jardin')) {
      return { icon: '🌳 ', category: 'park', isPoi: true };
    }
    if (c === 'amenity' && (t === 'hotel' || t === 'guest_house' || t === 'hostel' || t === 'camp_site')) {
      return { icon: '🏨 ', category: 'hotel', isPoi: true };
    }

    return { icon: '', category: '', isPoi: false };
  };

  const parsePhotonFeatures = (features) => {
    if (!features) return;
    features.forEach(f => {
      const p = f.properties || {};
      const mainName = p.name || p.street || '';
      if (!mainName) return;
      const country = p.country || '';
      const flag = getCountryFlag(p.countrycode, country);
      const isCity = ['city', 'town', 'village', 'municipality', 'administrative'].includes(p.osm_value || p.type);
      const isStreetOrHouse = ['street', 'house', 'residential', 'secondary', 'primary', 'tertiary', 'living_street', 'pedestrian', 'postcode'].includes(p.osm_value || p.type);
      const poiInfo = getPoiInfo(p.osm_key, p.osm_value || p.type, mainName);
      const isPoi = poiInfo.isPoi;
      const isCoveredCountry = ['🇫🇷', '🇪🇸', '🇮🇹', '🇩🇪', '🇬🇧', '🇧🇪', '🇳🇱', '🇵🇹', '🇱🇺', '🇦🇹', '🇨🇭', '🇸🇮', '🇭🇷'].includes(flag);

      // Build rich city/district/postcode context for street-level & landmark searches
      const rawCity = p.city || p.town || p.village || p.county || '';
      const shortCity = rawCity.replace(/^London Borough of\s+/i, 'London — ').replace(/^Royal Borough of\s+/i, 'London — ');
      const streetLabel = p.housenumber ? `${p.housenumber} ${p.street || mainName}` : mainName;

      let nameParts;
      let cleanName;
      let icon = '';

      if (isPoi) {
        icon = poiInfo.icon;
        nameParts = [mainName, shortCity && shortCity !== mainName ? shortCity : p.district, country].filter(Boolean);
        cleanName = [mainName, shortCity && shortCity !== mainName ? shortCity : null].filter(Boolean).join(', ');
      } else if (isStreetOrHouse) {
        icon = '📍 ';
        nameParts = [streetLabel, p.district, shortCity, p.postcode, country].filter(Boolean);
        cleanName = [streetLabel, shortCity || p.state, p.postcode].filter(Boolean).join(', ');
      } else if (isCity) {
        icon = '🏘️ ';
        nameParts = [mainName, p.state && p.state !== mainName ? p.state : null, country].filter(Boolean);
        cleanName = mainName;
      } else {
        nameParts = [mainName, shortCity && shortCity !== mainName ? shortCity : null, country].filter(Boolean);
        cleanName = mainName;
      }

      // Deduplicate consecutive identical parts
      const uniqueParts = nameParts.filter((part, idx) => idx === 0 || part.toLowerCase() !== nameParts[idx - 1].toLowerCase());
      const label = `${flag} ${icon}${uniqueParts.join(', ')}`;
      const coords = f.geometry.coordinates;

      // Boost priority when the result matches both street/landmark name and city in the query
      const fullTextNorm = uniqueParts.join(' ').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const queryTokens = qNorm.split(/\s+/).filter(t => t.length >= 2);
      const allTokensMatched = queryTokens.length > 0 && queryTokens.every(tok => fullTextNorm.includes(tok) || (tok === 'londres' && fullTextNorm.includes('london')));

      let priority = 50;
      if (isPoi) {
        priority = (isSpecificSearch ? 120 : 65) + (allTokensMatched ? 25 : 0);
      } else if (isStreetOrHouse) {
        priority = (isSpecificSearch ? 105 : 55) + (allTokensMatched ? 20 : 0);
      } else if (isCity) {
        const isExactCity = mainName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') === qNorm;
        priority = (isSpecificSearch ? 45 : (isExactCity ? 135 : 80)) + (allTokensMatched ? 15 : -10);
      }
      if (isCoveredCountry) priority += 15;

      addResultIfUnique({
        label,
        cleanName,
        coords,
        priority
      });
    });
  };

  if (photonDefaultRes.status === 'fulfilled' && photonDefaultRes.value) {
    parsePhotonFeatures(photonDefaultRes.value.features);
  }

  if (nominatimRes && nominatimRes.status === 'fulfilled' && Array.isArray(nominatimRes.value)) {
    nominatimRes.value.forEach(it => {
      if (!it.lat || !it.lon) return;
      const lat = parseFloat(it.lat);
      const lon = parseFloat(it.lon);
      const disp = it.display_name || '';
      const addr = it.address || {};
      const flag = getCountryFlag(addr.country_code, addr.country || disp);
      const isCoveredCountry = ['🇫🇷', '🇪🇸', '🇮🇹', '🇩🇪', '🇬🇧', '🇧🇪', '🇳🇱', '🇵🇹', '🇱🇺', '🇦🇹', '🇨🇭', '🇸🇮', '🇭🇷'].includes(flag);

      const rawCity = addr.city || addr.town || addr.village || addr.municipality || addr.county || '';
      const shortCity = rawCity.replace(/^London Borough of\s+/i, 'London — ').replace(/^Royal Borough of\s+/i, 'London — ');

      const poiInfo = getPoiInfo(it.class, it.type, it.name || disp);
      const isPoi = poiInfo.isPoi;
      const isCity = ['city', 'town', 'village', 'municipality'].includes(it.type) || it.class === 'boundary';
      const isStreetOrHouse = ['house', 'residential', 'primary', 'secondary', 'tertiary', 'living_street'].includes(it.type) || it.class === 'highway' || (it.class === 'place' && it.type === 'house');

      let icon = '';
      let cleanName = '';
      let label = '';

      if (isPoi) {
        icon = poiInfo.icon;
        const mainName = it.name || disp.split(',')[0].trim();
        cleanName = [mainName, shortCity && shortCity !== mainName ? shortCity : null].filter(Boolean).join(', ');
        label = `${flag} ${icon}${cleanName}, ${addr.country || ''}`.replace(/,\s*$/, '');
      } else if (isStreetOrHouse) {
        icon = '📍 ';
        const houseNum = addr.house_number || '';
        const road = addr.road || it.name || disp.split(',')[0].trim();
        const streetStr = houseNum ? `${houseNum} ${road}` : road;
        cleanName = [streetStr, shortCity, addr.postcode].filter(Boolean).join(', ');
        label = `${flag} ${icon}${cleanName}, ${addr.country || ''}`.replace(/,\s*$/, '');
      } else if (isCity) {
        icon = '🏘️ ';
        cleanName = it.name || shortCity || disp.split(',')[0].trim();
        label = `${flag} ${icon}${cleanName}, ${addr.country || ''}`.replace(/,\s*$/, '');
      } else {
        const parts = disp.split(',').map(s => s.trim()).filter(Boolean);
        const shortParts = parts.length > 3 ? [parts[0], parts[1], parts[parts.length - 1]] : parts;
        cleanName = parts[0];
        label = `${flag} ${shortParts.join(', ')}`;
      }

      const fullTextNorm = (label + ' ' + cleanName).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const queryTokens = qNorm.split(/\s+/).filter(t => t.length >= 2);
      const allTokensMatched = queryTokens.length > 0 && queryTokens.every(tok => fullTextNorm.includes(tok));

      let priority = 55;
      if (isPoi) {
        priority = (isSpecificSearch ? 118 : 65) + (allTokensMatched ? 25 : 0);
      } else if (isStreetOrHouse) {
        priority = (isSpecificSearch ? 102 : 55) + (allTokensMatched ? 20 : 0);
      } else if (isCity) {
        const isExactCity = (it.name || cleanName).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') === qNorm;
        priority = (isSpecificSearch ? 45 : (isExactCity ? 135 : 75)) + (allTokensMatched ? 15 : -10);
      }
      if (isCoveredCountry) priority += 15;

      addResultIfUnique({
        label,
        cleanName,
        coords: [lon, lat],
        priority
      });
    });
  }

  if (banRes.status === 'fulfilled' && banRes.value && banRes.value.features) {
    banRes.value.features.forEach(f => {
      const p = f.properties || {};
      const coords = f.geometry.coordinates;
      const isHousenumber = p.type === 'housenumber';
      const isStreet = p.type === 'street';
      const isMunicipality = p.type === 'municipality';
      const labelNorm = (p.label || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const queryTokens = qNorm.split(/\s+/).filter(t => t.length >= 2);
      const allTokensMatched = queryTokens.length > 0 && queryTokens.every(tok => labelNorm.includes(tok));

      let icon = '📍 ';
      if (isMunicipality) icon = '🏘️ ';

      const label = `🇫🇷 ${icon}${p.label}`;
      const cleanName = p.label;

      let priority = 70;
      if (isHousenumber) {
        priority = (isSpecificSearch ? 125 : 50) + (allTokensMatched ? 25 : 0) + (p.score ? Math.round(p.score * 15) : 0);
      } else if (isStreet) {
        priority = (isSpecificSearch ? 110 : 55) + (allTokensMatched ? 20 : 0) + (p.score ? Math.round(p.score * 10) : 0);
      } else if (isMunicipality) {
        const isExactMun = labelNorm === qNorm;
        priority = (isSpecificSearch ? 50 : (isExactMun ? 140 : 95)) + (allTokensMatched ? 15 : -10);
      } else {
        priority = 45 + (allTokensMatched ? 15 : 0);
      }

      addResultIfUnique({
        label,
        cleanName,
        coords,
        priority
      });
    });
  }

  // 3. Fallback: if a multi-word query (e.g. "McLaren Technical Center") returned no result matching the primary distinctive word ("mclaren"),
  // query the primary distinctive word directly so approximate POI names still work like Google Maps / Waze
  const primaryTokens = qNorm.split(/\s+/).filter(t => t.length >= 3 && !['rue', 'street', 'road', 'avenue', 'boulevard', 'place', 'saint', 'sainte', 'the', 'les', 'des'].includes(t));
  const firstDistinctive = primaryTokens[0];
  const hasPrimaryMatch = firstDistinctive && results.some(r =>
    (r.label || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(firstDistinctive)
  );
  if (firstDistinctive && primaryTokens.length >= 2 && !hasPrimaryMatch) {
    try {
      const fallbackData = await fetchWithTimeout(`https://photon.komoot.io/api/?q=${encodeURIComponent(firstDistinctive)}&bbox=${euroBbox}&limit=5`, {}, 1800);
      if (fallbackData && fallbackData.features) {
        parsePhotonFeatures(fallbackData.features);
      }
    } catch (e) {}
  }

  // Boost results that contain the first distinctive word of the user's query
  if (firstDistinctive) {
    results.forEach(r => {
      const rNorm = (r.label || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (rNorm.includes(firstDistinctive)) {
        r.priority += 35;
      }
    });
  }

  results.sort((a, b) => b.priority - a.priority);
  return results;
}

// ============================================================================
// Memory of the 10 most recent departure / arrival localities (localStorage)
// ============================================================================
const RECENT_LOCATIONS_KEY = 'fuelpilot_recent_locations_v1';

// Nettoie un libellé pour ne conserver que le nom réel de la commune
// Empêche la multiplication de "Ma position actuelle (Ville)" dans l'historique
function sanitizeLocationName(rawName) {
  if (!rawName) return '';
  let str = String(rawName).trim();
  // Retirer les émojis de tête éventuels (flags, POI, épingles, horloges)
  str = str.replace(/^[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}📍🕒🟢🏁🅿️🏛️🏥⚖️👮🚒🏣🎓📚🎭🏢⛪🛒🏟️🚉✈️⛴️🏨🌳🏘️🌍🇫🇷🇪🇸🇮🇹🇩🇪🇬🇧🇧🇪🇳🇱🇵🇹🇱🇺🇦🇹🇨🇭🇸🇮🇭🇷\s]+/u, '').trim();
  // Détecter "Ma position actuelle (Ville)" ou ses variantes multilingues
  const m = str.match(/^(?:ma\s+position\s+actuelle|current\s+location|posici[oó]n\s+actual|aktuelle\s+position|posizione\s+attuale|huidige\s+locatie)(?:\s*\((.*?)\))?$/i);
  if (m) {
    // S'il y a un nom de ville entre parenthèses, renvoyer UNIQUEMENT la ville
    return m[1] ? m[1].trim() : '';
  }
  return str;
}

function getRecentLocations() {
  try {
    const raw = localStorage.getItem(RECENT_LOCATIONS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    const cleaned = [];
    const seenNames = new Set();

    for (const item of parsed) {
      if (!item) continue;
      const sClean = sanitizeLocationName(item.cleanName || item.label || '');
      // Ignorer les "positions actuelles" sans commune identifiable
      if (!sClean) continue;
      const norm = sClean.toLowerCase();
      if (seenNames.has(norm)) continue;
      seenNames.add(norm);

      const sLabel = sanitizeLocationName(item.label) || sClean;
      cleaned.push({
        cleanName: sClean,
        label: sLabel,
        coords: Array.isArray(item.coords) ? [Number(item.coords[0]), Number(item.coords[1])] : [0, 0]
      });
      if (cleaned.length >= 10) break;
    }

    // Assainir le stockage local si des entrées ont été nettoyées ou dédoublonnées
    const cleanedJson = JSON.stringify(cleaned);
    if (cleanedJson !== raw) {
      localStorage.setItem(RECENT_LOCATIONS_KEY, cleanedJson);
    }
    return cleaned;
  } catch (e) {
    return [];
  }
}

function saveRecentLocation(cleanName, coords, fullLabel) {
  if (!cleanName || !Array.isArray(coords) || coords.length < 2) return;
  const sClean = sanitizeLocationName(cleanName);
  const sLabel = sanitizeLocationName(fullLabel) || sClean;
  // Si le libellé était une "position actuelle" générique sans commune, ne pas polluer l'historique
  if (!sClean) return;

  try {
    const list = getRecentLocations();
    const normName = sClean.toLowerCase();
    const filtered = list.filter(item => {
      const itemClean = sanitizeLocationName(item.cleanName || item.label || '');
      const sameName = itemClean.toLowerCase() === normName;
      const sameCoords = item.coords &&
        Math.abs(item.coords[0] - coords[0]) < 0.001 &&
        Math.abs(item.coords[1] - coords[1]) < 0.001;
      return !sameName && !sameCoords;
    });
    filtered.unshift({
      cleanName: sClean,
      label: sLabel,
      coords: [Number(coords[0]), Number(coords[1])]
    });
    localStorage.setItem(RECENT_LOCATIONS_KEY, JSON.stringify(filtered.slice(0, 10)));
  } catch (e) {}
}

// Address Autocomplete: Bilingual UK/FR/ES/IT Cities + Photon + French BAN + 10 Recent Localities
function setupAutocomplete(inputId, dropdownId, onSelect) {
  const input = document.getElementById(inputId);
  const dropdown = document.getElementById(dropdownId);
  let debounceTimer;

  // Clear button ('x') handler
  const clearBtn = input.parentElement ? input.parentElement.querySelector('.btn-clear-input') : null;
  function updateClearBtnVisibility() {
    if (clearBtn) {
      clearBtn.style.display = input.value.trim().length > 0 ? 'flex' : 'none';
    }
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      input.value = '';
      updateClearBtnVisibility();
      input.focus();
      if (inputId === 'input-start') {
        startPoint = null;
      } else if (inputId === 'input-end') {
        endPoint = null;
      }
      onSelect(null, '');
      showRecentIfAvailable();
    });
  }

  input.addEventListener('input', updateClearBtnVisibility);
  input.addEventListener('change', updateClearBtnVisibility);
  input.addEventListener('blur', () => setTimeout(updateClearBtnVisibility, 200));

  function renderDropdownItems(items, isRecentHeader = false) {
    if (!items || items.length === 0) {
      dropdown.style.display = 'none';
      return;
    }
    dropdown.innerHTML = '';

    // If input is start input, prepend "📍 Ma position actuelle"
    if (inputId === 'input-start') {
      const curPosItem = document.createElement('div');
      curPosItem.className = 'autocomplete-item autocomplete-curpos-item';
      curPosItem.style.background = 'rgba(56, 189, 248, 0.12)';
      curPosItem.style.color = '#38bdf8';
      curPosItem.style.fontWeight = '700';
      curPosItem.style.borderBottom = '1px solid rgba(56, 189, 248, 0.25)';
      curPosItem.innerHTML = t().currentPos || '📍 Ma position actuelle';
      curPosItem.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdown.style.display = 'none';
        useCurrentGpsLocationAsStart();
      });
      dropdown.appendChild(curPosItem);
    }

    if (isRecentHeader) {
      const hdr = document.createElement('div');
      hdr.className = 'autocomplete-recent-header';
      hdr.textContent = t().recentHdr;
      dropdown.appendChild(hdr);
    }
    const maxItems = 10;
    items.slice(0, maxItems).forEach(itemData => {
      const item = document.createElement('div');
      item.className = 'autocomplete-item';
      item.textContent = isRecentHeader ? `🕒 ${itemData.label || itemData.cleanName}` : itemData.label;
      item.addEventListener('click', () => {
        const formattedName = itemData.cleanName;
        input.value = formattedName;
        if (typeof updateClearBtnVisibility === 'function') updateClearBtnVisibility();
        dropdown.style.display = 'none';
        saveRecentLocation(formattedName, itemData.coords, itemData.label);
        onSelect(itemData.coords, formattedName);
      });
      dropdown.appendChild(item);
    });
    dropdown.style.display = 'block';
  }

  function showRecentIfAvailable() {
    const recents = getRecentLocations();
    if (recents.length > 0 || inputId === 'input-start') {
      renderDropdownItems(recents, recents.length > 0);
    }
  }

  input.addEventListener('focus', () => {
    if (input.value.trim().length < 2) {
      showRecentIfAvailable();
    } else {
      showRecentIfAvailable();
    }
  });

  input.addEventListener('click', () => {
    if (dropdown.style.display === 'none' || !dropdown.style.display) {
      showRecentIfAvailable();
    }
  });

  let searchSeq = 0;

  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    const q = input.value.trim();
    if (q.length < 2) {
      showRecentIfAvailable();
      return;
    }

    const currentSeq = ++searchSeq;
    debounceTimer = setTimeout(async () => {
      try {
        const results = await searchLocationsBilingual(q);
        // Ignore stale responses if the user kept typing
        if (currentSeq !== searchSeq) return;

        // Prepend matching recent locations at the very top
        const qLow = q.toLowerCase();
        const matchingRecents = getRecentLocations()
          .filter(r => (r.cleanName || '').toLowerCase().includes(qLow) || (r.label || '').toLowerCase().includes(qLow))
          .map(r => ({
            label: `🕒 ${r.label || r.cleanName}`,
            cleanName: r.cleanName,
            coords: r.coords,
            priority: 200
          }));

        const combined = [...matchingRecents];
        results.forEach(res => {
          const isDup = combined.some(c =>
            Math.abs(c.coords[0] - res.coords[0]) < 0.003 && Math.abs(c.coords[1] - res.coords[1]) < 0.003 &&
            (c.cleanName || '').toLowerCase() === (res.cleanName || '').toLowerCase()
          );
          if (!isDup) combined.push(res);
        });

        if (combined.length > 0) {
          renderDropdownItems(combined, false);
        } else {
          dropdown.style.display = 'none';
        }
      } catch (e) {
        console.error(e);
      }
    }, 180);
  });

  document.addEventListener('click', (e) => {
    if (!input.contains(e.target) && !dropdown.contains(e.target)) {
      dropdown.style.display = 'none';
    }
  });
}

// Geocodage inverse rapide (WaterMetrics : API officielle data.gouv.fr en France, Nominatim ailleurs)
// Sécurisé avec AbortController (2.5s) pour ne jamais bloquer l'affichage sur réseau 2G/EDGE
async function reverseGeocodeCoords(lat, lon) {
  if (typeof lat !== 'number' || typeof lon !== 'number') return '';
  // 1. France métropolitaine : API Adresse officielle data.gouv.fr (rapide, sans clé, précis au village/ville)
  if (lat >= 41.0 && lat <= 51.5 && lon >= -5.5 && lon <= 10.0) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 2500);
      const resp = await fetch(`https://api-adresse.data.gouv.fr/reverse/?lon=${lon}&lat=${lat}`, { signal: ctrl.signal });
      clearTimeout(t);
      if (resp.ok) {
        const data = await resp.json();
        if (data && data.features && data.features.length > 0) {
          const props = data.features[0].properties;
          return props.city || props.name || props.municipality || '';
        }
      }
    } catch (eGouv) {}
  }
  // 2. Hors France ou secours : Nominatim OpenStreetMap
  try {
    const ctrl2 = new AbortController();
    const t2 = setTimeout(() => ctrl2.abort(), 2500);
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=14`, {
      headers: { 'Accept': 'application/json' },
      signal: ctrl2.signal
    });
    clearTimeout(t2);
    if (res.ok) {
      const data = await res.json();
      const addr = data.address || {};
      return addr.city || addr.town || addr.village || addr.municipality || addr.road || '';
    }
  } catch (eNom) {}
  return '';
}

let isWaitingGpsForStart = false;

// Handler for "Ma position actuelle" as departure (Architecture Pure RandoTracker)
function useCurrentGpsLocationAsStart() {
  const startInput = document.getElementById('input-start');
  const isRecent = userGpsPosition && (typeof userGpsPosition.lat === 'number') && (Date.now() - (userGpsPosition.timestamp || 0) < 60000);

  // 1. Réactivité instantanée si on a un point récent (< 60s)
  if (isRecent) {
    applyGpsAsStartPoint(userGpsPosition.lat, userGpsPosition.lon, userGpsPosition.city);
    updateUserGpsMarker(userGpsPosition.lat, userGpsPosition.lon, userGpsPosition.accuracy || 25, false);
    if (typeof updateAllClearButtons === 'function') updateAllClearButtons();
    showToast(`🎯 Position actuelle sélectionnée : ${userGpsPosition.city || 'Départ défini'}`, { isSuccess: true, duration: 2500 });
    return;
  }

  // 2. Recherche active immédiate conforme à RandoTracker
  if (startInput) {
    startInput.value = '📍 ' + (t().locating || 'Recherche de votre position GPS...');
    startInput.classList.remove('input-attention-pulse');
  }

  geolocateCurrentLocation((pos) => {
    applyGpsAsStartPoint(pos.lat, pos.lon, pos.city || '');
    updateUserGpsMarker(pos.lat, pos.lon, pos.accuracy || 25, false);
    if (typeof updateAllClearButtons === 'function') updateAllClearButtons();
    showToast(`🎯 Position GPS validée comme départ : ${pos.city || 'Départ défini'} (±${pos.accuracy}m)`, { isSuccess: true, duration: 3000 });
  });
}

function applyGpsAsStartPoint(lat, lon, knownCity) {
  const startInput = document.getElementById('input-start');
  const baseName = t().currentPos ? t().currentPos.replace(/^📍\s*/, '') : 'Ma position actuelle';
  let displayName = knownCity ? `${baseName} (${knownCity})` : baseName;

  // 1. Remplir IMMÉDIATEMENT le champ pour réactivité instantanée (0ms)
  startPoint = { coords: [lon, lat], label: displayName, isIpFallback: false };
  if (startInput) {
    startInput.value = displayName;
    startInput.classList.remove('input-attention-pulse');
  }
  if (typeof updateAllClearButtons === 'function') updateAllClearButtons();

  // 2. Si la commune n'est pas encore résolue, la charger en tâche de fond et enrichir le libellé sans bloquer
  if (!knownCity) {
    reverseGeocodeCoords(lat, lon).then(city => {
      if (city) {
        const enrichedName = `${baseName} (${city})`;
        if (startPoint && Math.abs(startPoint.coords[1] - lat) < 0.001) {
          startPoint.label = enrichedName;
        }
        if (startInput && (startInput.value === baseName || startInput.value.startsWith('📍'))) {
          startInput.value = enrichedName;
        }
        if (typeof updateAllClearButtons === 'function') updateAllClearButtons();
      }
    });
  }
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
        btnToggleRoute.innerHTML = t().closeBtn;
      } else {
        document.body.classList.add('mobile-route-collapsed');
        btnToggleRoute.innerHTML = t().editBtn;
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

  // Exit stations (< 1.5 km) toggle
  const chkExitStations = document.getElementById('chk-exit-stations');
  if (chkExitStations) {
    chkExitStations.addEventListener('change', () => {
      if (activeRouteData) {
        processStationsOnRoute(activeRouteData);
      }
    });
  }

  // Sort dropdown
  document.getElementById('select-sort').addEventListener('change', (e) => {
    currentSort = e.target.value;
    renderCurrentRouteStations();
  });

  // Locate Me on Map button
  const btnLocateMe = document.getElementById('btn-locate-me');
  if (btnLocateMe) btnLocateMe.addEventListener('click', centerMapOnUser);

  // GPS Drive Mode (Démarrer l'itinéraire)
  const btnStartNav = document.getElementById('btn-start-nav');
  if (btnStartNav) btnStartNav.addEventListener('click', toggleGpsNavigation);
  const btnSumNav = document.getElementById('btn-sum-nav');
  if (btnSumNav) btnSumNav.addEventListener('click', toggleGpsNavigation);

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
    inStart.value = formattedStart; if (typeof updateAllClearButtons === 'function') updateAllClearButtons();
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


// ==============================================================================
// 32 ITINÉRAIRES DE RÉFÉRENCE (4 CORRIDORS PAR PAYS x 8 PAYS COUVERTS)
// Nord ➔ Sud, Est ➔ Ouest, Nord-Est ➔ Sud-Ouest, Nord-Ouest ➔ Sud-Est
// ==============================================================================
const REFERENCE_ROUTES_32 = {
  FR: [
    { dir: 'Nord ➔ Sud', icon: '⬇️', label: 'Lille ➔ Marseille', start: 'Lille', startCoords: [3.0573, 50.6292], end: 'Marseille', endCoords: [5.3698, 43.2965], motorway: 'A1 • A6 • A7', desc: 'Corridor Nord-Sud majeur' },
    { dir: 'Est ➔ Ouest', icon: '⬅️', label: 'Strasbourg ➔ Brest', start: 'Strasbourg', startCoords: [7.7521, 48.5734], end: 'Brest', endCoords: [-4.4861, 48.3904], motorway: 'A4 • A11 • N12', desc: 'Corridor transversal Est-Ouest' },
    { dir: 'Nord-Est ➔ Sud-Ouest', icon: '↙️', label: 'Metz ➔ Bayonne', start: 'Metz', startCoords: [6.1757, 49.1193], end: 'Bayonne', endCoords: [-1.4748, 43.4929], motorway: 'A31 • A6 • A89 • A63', desc: 'Diagonale Nord-Est vers Espagne' },
    { dir: 'Nord-Ouest ➔ Sud-Est', icon: '↘️', label: 'Le Havre ➔ Nice', start: 'Le Havre', startCoords: [0.1079, 49.4944], end: 'Nice', endCoords: [7.2620, 43.7102], motorway: 'A13 • A6 • A7 • A8', desc: 'Diagonale Manche vers Méditerranée' },
  ],
  ES: [
    { dir: 'Nord ➔ Sud', icon: '⬇️', label: 'Santander ➔ Sevilla', start: 'Santander', startCoords: [-3.8099, 43.4623], end: 'Sevilla', endCoords: [-5.9845, 37.3891], motorway: 'A-67 • A-66', desc: 'Ruta de la Plata Nord-Sud' },
    { dir: 'Est ➔ Ouest', icon: '⬅️', label: 'Barcelona ➔ Madrid', start: 'Barcelona', startCoords: [2.1734, 41.3851], end: 'Madrid', endCoords: [-3.7038, 40.4168], motorway: 'AP-7 • A-2', desc: 'Axe majeur Catalogne - Capitale' },
    { dir: 'Nord-Est ➔ Sud-Ouest', icon: '↙️', label: 'Girona ➔ Huelva', start: 'Girona', startCoords: [2.8249, 41.9794], end: 'Huelva', endCoords: [-6.9447, 37.2614], motorway: 'AP-7 • A-4', desc: 'Grande diagonale frontière FR vers Atlantique' },
    { dir: 'Nord-Ouest ➔ Sud-Est', icon: '↘️', label: 'A Coruña ➔ Valencia', start: 'A Coruña', startCoords: [-8.4115, 43.3623], end: 'Valencia', endCoords: [-0.3763, 39.4699], motorway: 'A-6 • A-3', desc: 'Diagonale Galice - Levant' },
  ],
  IT: [
    { dir: 'Nord ➔ Sud', icon: '⬇️', label: 'Milano ➔ Napoli', start: 'Milano', startCoords: [9.1900, 45.4642], end: 'Napoli', endCoords: [14.2681, 40.8518], motorway: 'A1', desc: 'Autostrada del Sole' },
    { dir: 'Est ➔ Ouest', icon: '⬅️', label: 'Trieste ➔ Torino', start: 'Trieste', startCoords: [13.7768, 45.6495], end: 'Torino', endCoords: [7.6869, 45.0703], motorway: 'A4', desc: 'Autostrada Serenissima' },
    { dir: 'Nord-Est ➔ Sud-Ouest', icon: '↙️', label: 'Venezia ➔ Genova', start: 'Venezia', startCoords: [12.3155, 45.4408], end: 'Genova', endCoords: [8.9463, 44.4056], motorway: 'A4 • A21 • A7', desc: 'Adriatique vers Mer Ligure' },
    { dir: 'Nord-Ouest ➔ Sud-Est', icon: '↘️', label: 'Torino ➔ Bari', start: 'Torino', startCoords: [7.6869, 45.0703], end: 'Bari', endCoords: [16.8719, 41.1171], motorway: 'A21 • A1 • A14', desc: 'Dorsale Adriatique' },
  ],
  GB: [
    { dir: 'Nord ➔ Sud', icon: '⬇️', label: 'Edinburgh ➔ London', start: 'Edinburgh', startCoords: [-3.1883, 55.9533], end: 'London', endCoords: [-0.1278, 51.5074], motorway: 'A1(M) • M1', desc: 'Écosse vers Londres' },
    { dir: 'Est ➔ Ouest', icon: '⬅️', label: 'Norwich ➔ Cardiff', start: 'Norwich', startCoords: [1.2974, 52.6309], end: 'Cardiff', endCoords: [-3.1791, 51.4816], motorway: 'A11 • M4', desc: 'East Anglia vers Pays de Galles' },
    { dir: 'Nord-Est ➔ Sud-Ouest', icon: '↙️', label: 'Newcastle ➔ Bristol', start: 'Newcastle upon Tyne', startCoords: [-1.6178, 54.9783], end: 'Bristol', endCoords: [-2.5879, 51.4545], motorway: 'A1(M) • M1 • M42 • M5', desc: 'Tyne & Wear vers West Country' },
    { dir: 'Nord-Ouest ➔ Sud-Est', icon: '↘️', label: 'Liverpool ➔ Brighton', start: 'Liverpool', startCoords: [-2.9916, 53.4084], end: 'Brighton', endCoords: [-0.1372, 50.8225], motorway: 'M6 • M1 • M25 • M23', desc: 'Merseyside vers Côte Sud' },
  ],
  BE: [
    { dir: 'Nord ➔ Sud', icon: '⬇️', label: 'Antwerpen ➔ Arlon', start: 'Antwerpen', startCoords: [4.4025, 51.2194], end: 'Arlon', endCoords: [5.8137, 49.6833], motorway: 'E19 • R0 • E411', desc: 'Flandre vers frontière Luxembourg' },
    { dir: 'Est ➔ Ouest', icon: '⬅️', label: 'Liège ➔ Ostende', start: 'Liège', startCoords: [5.5797, 50.6326], end: 'Oostende', endCoords: [2.9287, 51.2154], motorway: 'E40', desc: 'Transversale Wallonie - Mer du Nord' },
    { dir: 'Nord-Est ➔ Sud-Ouest', icon: '↙️', label: 'Genk ➔ Mons', start: 'Genk', startCoords: [5.5008, 50.9655], end: 'Mons', endCoords: [3.9523, 50.4541], motorway: 'E314 • E40 • E19', desc: 'Limbourg vers Hainaut' },
    { dir: 'Nord-Ouest ➔ Sud-Est', icon: '↘️', label: 'Brugge ➔ Arlon', start: 'Brugge', startCoords: [3.2247, 51.2093], end: 'Arlon', endCoords: [5.8137, 49.6833], motorway: 'E40 • E411', desc: 'Venise du Nord vers Ardennes' },
  ],
  DE: [
    { dir: 'Nord ➔ Sud', icon: '⬇️', label: 'Hamburg ➔ München', start: 'Hamburg', startCoords: [9.9937, 53.5511], end: 'München', endCoords: [11.5820, 48.1351], motorway: 'A7 • A9', desc: 'Axe Nord-Sud Allemagne' },
    { dir: 'Est ➔ Ouest', icon: '⬅️', label: 'Dresden ➔ Köln', start: 'Dresden', startCoords: [13.7373, 51.0504], end: 'Köln', endCoords: [6.9603, 50.9375], motorway: 'A4', desc: 'Transversale Saxe - Rhénanie' },
    { dir: 'Nord-Est ➔ Sud-Ouest', icon: '↙️', label: 'Berlin ➔ Frankfurt', start: 'Berlin', startCoords: [13.4050, 52.5200], end: 'Frankfurt am Main', endCoords: [8.6821, 50.1109], motorway: 'A9 • A4 • A5', desc: 'Capitale vers Hesse' },
    { dir: 'Nord-Ouest ➔ Sud-Est', icon: '↘️', label: 'Bremen ➔ München', start: 'Bremen', startCoords: [8.8017, 53.0793], end: 'München', endCoords: [11.5820, 48.1351], motorway: 'A27 • A7 • A9', desc: 'Nord-Ouest vers Bavière' },
  ],
  PT: [
    { dir: 'Nord ➔ Sud', icon: '⬇️', label: 'Porto ➔ Faro', start: 'Porto', startCoords: [-8.6291, 41.1579], end: 'Faro', endCoords: [-7.9304, 37.0194], motorway: 'A1 • A2', desc: 'Corridor Atlantique complet Nord-Sud' },
    { dir: 'Est ➔ Ouest', icon: '⬅️', label: 'Elvas ➔ Lisboa', start: 'Elvas', startCoords: [-7.1628, 38.8817], end: 'Lisboa', endCoords: [-9.1393, 38.7223], motorway: 'A6 • A2', desc: 'Frontière espagnole vers Capitale' },
    { dir: 'Nord-Est ➔ Sud-Ouest', icon: '↙️', label: 'Bragança ➔ Setúbal', start: 'Bragança', startCoords: [-6.7570, 41.8061], end: 'Setúbal', endCoords: [-8.8882, 38.5244], motorway: 'A4 • A1 • A2', desc: 'Trás-os-Montes vers Péninsule de Setúbal' },
    { dir: 'Nord-Ouest ➔ Sud-Est', icon: '↘️', label: 'Viana do Castelo ➔ Évora', start: 'Viana do Castelo', startCoords: [-8.8329, 41.6918], end: 'Évora', endCoords: [-7.9135, 38.5714], motorway: 'A28 • A1 • A6', desc: 'Minho vers Alentejo' },
  ],
  NL: [
    { dir: 'Nord ➔ Sud', icon: '⬇️', label: 'Amsterdam ➔ Maastricht', start: 'Amsterdam', startCoords: [4.9041, 52.3676], end: 'Maastricht', endCoords: [5.6910, 50.8514], motorway: 'A2', desc: 'Corridor A2 Randstad - Limburg' },
    { dir: 'Est ➔ Ouest', icon: '⬅️', label: 'Hengelo ➔ Den Haag', start: 'Hengelo', startCoords: [6.7933, 52.2657], end: 'Den Haag', endCoords: [4.3007, 52.0705], motorway: 'A1 • A12', desc: 'Frontière allemande vers Mer du Nord' },
    { dir: 'Nord-Est ➔ Sud-Ouest', icon: '↙️', label: 'Groningen ➔ Breda', start: 'Groningen', startCoords: [6.5665, 53.2194], end: 'Breda', endCoords: [4.7756, 51.5719], motorway: 'A28 • A27', desc: 'Nord vers Brabant-Septentrional' },
    { dir: 'Nord-Ouest ➔ Sud-Est', icon: '↘️', label: 'Alkmaar ➔ Eindhoven', start: 'Alkmaar', startCoords: [4.7593, 52.6324], end: 'Eindhoven', endCoords: [5.4697, 51.4416], motorway: 'A9 • A2', desc: 'Hollande-Septentrionale vers Brainport' },
  ],
  LU: [
    { dir: 'Nord ➔ Sud', icon: '⬇️', label: 'Ettelbruck ➔ Dudelange', start: 'Ettelbruck', startCoords: [6.1030, 49.8475], end: 'Dudelange', endCoords: [6.0844, 49.4800], motorway: 'A7 • A3', desc: 'Corridor Nord-Sud Luxembourg' },
    { dir: 'Est ➔ Ouest', icon: '⬅️', label: 'Wasserbillig ➔ Steinfort', start: 'Wasserbillig', startCoords: [6.5028, 49.7139], end: 'Steinfort', endCoords: [5.9142, 49.6606], motorway: 'A1 • A6', desc: 'Axe frontalier Allemagne - Belgique' },
    { dir: 'Nord-Est ➔ Sud-Ouest', icon: '↙️', label: 'Echternach ➔ Pétange', start: 'Echternach', startCoords: [6.4219, 49.8116], end: 'Pétange', endCoords: [5.8756, 49.5578], motorway: 'A1 • A4 • A13', desc: 'Petite Suisse vers Bassin Minier' },
    { dir: 'Nord-Ouest ➔ Sud-Est', icon: '↘️', label: 'Steinfort ➔ Schengen', start: 'Steinfort', startCoords: [5.9142, 49.6606], end: 'Schengen', endCoords: [6.3653, 49.5094], motorway: 'A6 • A3 • A13', desc: 'Diagonale Belgique vers Tripoint Moselle' },
  ],
  AT: [
    { dir: 'Nord ➔ Sud', icon: '⬇️', label: 'Linz ➔ Graz', start: 'Linz', startCoords: [14.2858, 48.3064], end: 'Graz', endCoords: [15.4395, 47.0707], motorway: 'A1 • A9', desc: 'Pyhrn Autobahn Nord-Sud' },
    { dir: 'Est ➔ Ouest', icon: '⬅️', label: 'Wien ➔ Salzburg', start: 'Wien', startCoords: [16.3738, 48.2082], end: 'Salzburg', endCoords: [13.0550, 47.8095], motorway: 'A1 West Autobahn', desc: 'Dorsale Capitale vers Salzbourg' },
    { dir: 'Nord-Est ➔ Sud-Ouest', icon: '↙️', label: 'Wien ➔ Klagenfurt', start: 'Wien', startCoords: [16.3738, 48.2082], end: 'Klagenfurt', endCoords: [14.3050, 46.6247], motorway: 'A2 Süd Autobahn', desc: 'Dorsale Sud Autriche - Carinthie' },
    { dir: 'Nord-Ouest ➔ Sud-Est', icon: '↘️', label: 'Salzburg ➔ Graz', start: 'Salzburg', startCoords: [13.0550, 47.8095], end: 'Graz', endCoords: [15.4395, 47.0707], motorway: 'A10 • A9', desc: 'Tauern & Pyhrn Autobahn' },
  ],
  CH: [
    { dir: 'Nord ➔ Sud', icon: '⬇️', label: 'Basel ➔ Chiasso', start: 'Basel', startCoords: [7.5886, 47.5596], end: 'Chiasso', endCoords: [9.0322, 45.8358], motorway: 'A2 Gotthard', desc: 'Axe transalpin Gothard majeur' },
    { dir: 'Est ➔ Ouest', icon: '⬅️', label: 'St. Gallen ➔ Genève', start: 'St. Gallen', startCoords: [9.3767, 47.4245], end: 'Genève', endCoords: [6.1432, 46.2044], motorway: 'A1 Autoroute', desc: 'Transversale suisse Lac de Constance - Léman' },
    { dir: 'Nord-Est ➔ Sud-Ouest', icon: '↙️', label: 'Zürich ➔ Lausanne', start: 'Zürich', startCoords: [8.5417, 47.3769], end: 'Lausanne', endCoords: [6.6323, 46.5197], motorway: 'A1 Autoroute', desc: 'Centre financier vers Romandie' },
    { dir: 'Nord-Ouest ➔ Sud-Est', icon: '↘️', label: 'Basel ➔ Lugano', start: 'Basel', startCoords: [7.5886, 47.5596], end: 'Lugano', endCoords: [8.9511, 46.0037], motorway: 'A2 Gotthard', desc: 'Rhin vers Tessin' },
  ],
  SI: [
    { dir: 'Nord ➔ Sud', icon: '⬇️', label: 'Maribor ➔ Koper', start: 'Maribor', startCoords: [15.6459, 46.5547], end: 'Koper', endCoords: [13.7302, 45.5481], motorway: 'A1 Avtocesta', desc: 'Glavni koridor Maribor - Ljubljana - Obala' },
    { dir: 'Est ➔ Ouest', icon: '⬅️', label: 'Murska Sobota ➔ Nova Gorica', start: 'Murska Sobota', startCoords: [16.1664, 46.6625], end: 'Nova Gorica', endCoords: [13.6484, 45.9560], motorway: 'A5 • A1 • H4', desc: 'Prekmurje skozi prestolnico do Goriške' },
    { dir: 'Nord-Est ➔ Sud-Ouest', icon: '↙️', label: 'Celje ➔ Koper', start: 'Celje', startCoords: [15.2677, 46.2360], end: 'Koper', endCoords: [13.7302, 45.5481], motorway: 'A1 Avtocesta', desc: 'Štajerska do Jadranskega morja' },
    { dir: 'Nord-Ouest ➔ Sud-Est', icon: '↘️', label: 'Jesenice ➔ Novo Mesto', start: 'Jesenice', startCoords: [14.0560, 46.4367], end: 'Novo Mesto', endCoords: [15.1689, 45.8038], motorway: 'A2 Dolenjska & Gorenjska', desc: 'Alpe proti hrvaški meji' },
  ],
  HR: [
    { dir: 'Nord ➔ Sud', icon: '⬇️', label: 'Zagreb ➔ Split', start: 'Zagreb', startCoords: [15.9819, 45.8150], end: 'Split', endCoords: [16.4402, 43.5081], motorway: 'A1 Dalmatina', desc: 'Glavni koridor Zagreb - Jadransko more' },
    { dir: 'Est ➔ Ouest', icon: '⬅️', label: 'Slavonski Brod ➔ Rijeka', start: 'Slavonski Brod', startCoords: [18.0156, 45.1603], end: 'Rijeka', endCoords: [14.4422, 45.3271], motorway: 'A3 • A1 • A6', desc: 'Slavonija preko Gorskog kotara do Kvarnera' },
    { dir: 'Nord-Est ➔ Sud-Ouest', icon: '↙️', label: 'Varaždin ➔ Zadar', start: 'Varaždin', startCoords: [16.3366, 46.3057], end: 'Zadar', endCoords: [15.2314, 44.1194], motorway: 'A4 • A1', desc: 'Sjeverna Hrvatska prema Dalmaciji' },
    { dir: 'Nord-Ouest ➔ Sud-Est', icon: '↘️', label: 'Karlovac ➔ Ploče', start: 'Karlovac', startCoords: [15.5553, 45.4929], end: 'Ploče', endCoords: [17.4333, 43.0531], motorway: 'A1 Dalmatina Jug', desc: 'Središnja Hrvatska prema jugu Dalmacije' },
  ]
};

let currentRefCountry = 'FR';

function renderReferenceCorridors(country) {
  currentRefCountry = country || 'FR';
  const container = document.getElementById('ref-corridors-list');
  if (!container) return;
  
  const list = REFERENCE_ROUTES_32[currentRefCountry] || [];
  const testLabel = (typeof t === 'function' && t() && t().refRoutesTest) ? t().refRoutesTest : 'Tester';
  
  container.innerHTML = list.map((item, idx) => `
    <button type="button" class="ref-corridor-item" onclick="applyReferenceRoute('${currentRefCountry}', ${idx})">
      <div class="ref-corridor-left">
        <span class="ref-corridor-dir">${item.icon} ${item.dir}</span>
        <span class="ref-corridor-route">${item.label}</span>
        <span class="ref-corridor-meta">${item.motorway} • ${item.desc}</span>
      </div>
      <span class="ref-corridor-btn-tag">${testLabel}</span>
    </button>
  `).join('');

  document.querySelectorAll('.ref-tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.refCountry === currentRefCountry);
  });
}

function applyReferenceRoute(country, index) {
  const list = REFERENCE_ROUTES_32[country];
  if (!list || !list[index]) return;
  const item = list[index];
  applyPreset(item.start, item.startCoords, item.end, item.endCoords);
}

function initReferenceRoutesUI() {
  const toggleBtn = document.getElementById('btn-ref-routes-toggle');
  const panel = document.getElementById('ref-routes-body');
  if (toggleBtn && panel) {
    toggleBtn.addEventListener('click', () => {
      const isExpanded = toggleBtn.getAttribute('aria-expanded') === 'true';
      toggleBtn.setAttribute('aria-expanded', !isExpanded);
      panel.style.display = isExpanded ? 'none' : 'block';
      if (!isExpanded) {
        renderReferenceCorridors(currentRefCountry);
      }
    });
  }

  document.querySelectorAll('.ref-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const c = btn.dataset.refCountry;
      renderReferenceCorridors(c);
    });
  });

  renderReferenceCorridors(currentRefCountry);
}

window.REFERENCE_ROUTES_32 = REFERENCE_ROUTES_32;
window.REFERENCE_ROUTES_44 = REFERENCE_ROUTES_32;
window.REFERENCE_ROUTES_52 = REFERENCE_ROUTES_32;
window.applyReferenceRoute = applyReferenceRoute;
window.initReferenceRoutesUI = initReferenceRoutesUI;

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
      <input type="text" class="address-input" id="input-${wpId}" placeholder="${t().stepPlaceholder(index + 1)}" />
      <button type="button" class="btn-clear-input" id="btn-clear-${wpId}" title="Effacer la saisie" aria-label="Effacer" tabindex="-1">✕</button>
      <div class="autocomplete-dropdown" id="dropdown-${wpId}"></div>
    </div>
    <button class="btn-remove-step" title="${t().removeStepTitle}">✕</button>
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
  hasSeenListTabAfterRoute = false;
  const startInput = document.getElementById('input-start');
  const endInput = document.getElementById('input-end');

  // Auto-resolve typed text (e.g. "London", "Folkestone") if user didn't click the dropdown
  if (startInput && startInput.value.trim().length >= 2) {
    const typedStart = startInput.value.trim();
    if (!startPoint || startPoint.label.toLowerCase() !== typedStart.toLowerCase()) {
      const matches = await searchLocationsBilingual(typedStart);
      if (matches.length > 0) {
        startPoint = { coords: matches[0].coords, label: matches[0].cleanName };
        startInput.value = matches[0].cleanName;
      }
    }
  }
  if (endInput && endInput.value.trim().length >= 2) {
    const typedEnd = endInput.value.trim();
    if (!endPoint || endPoint.label.toLowerCase() !== typedEnd.toLowerCase()) {
      const matches = await searchLocationsBilingual(typedEnd);
      if (matches.length > 0) {
        endPoint = { coords: matches[0].coords, label: matches[0].cleanName };
        endInput.value = matches[0].cleanName;
      }
    }
  }

  // Auto-resolve any waypoint typed without clicking dropdown
  for (const wp of currentWaypoints) {
    const wpInput = document.getElementById(`input-${wp.id}`);
    if (wpInput && wpInput.value.trim().length >= 2 && (!wp.coords || (wp.label || '').toLowerCase() !== wpInput.value.trim().toLowerCase())) {
      const matches = await searchLocationsBilingual(wpInput.value.trim());
      if (matches.length > 0) {
        wp.coords = matches[0].coords;
        wp.label = matches[0].cleanName;
        wpInput.value = matches[0].cleanName;
      }
    }
  }

  if (!startPoint || !endPoint) {
    alert(t().alertMissingPoints);
    return;
  }

  // Save both departure and arrival in the 10 recent localities memory
  saveRecentLocation(startPoint.label, startPoint.coords, startPoint.label);
  saveRecentLocation(endPoint.label, endPoint.coords, endPoint.label);

  const btn = document.getElementById('btn-calculate');
  btn.innerHTML = `<span class="pulse-dot" style="background:#fff"></span> ${t().calcInProgress}`;
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

    let data = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        // En cas d'échec ou saturation du serveur public, repli sans alternatives multiples
        const fetchUrl = (attempt === 2)
          ? `https://router.project-osrm.org/route/v1/driving/${coordsStr}?overview=full&geometries=geojson&steps=true`
          : url;
        const res = await fetch(fetchUrl);
        if (res.ok) {
          const json = await res.json();
          if (json && json.routes && json.routes.length > 0) {
            data = json;
            break;
          }
        }
      } catch (eFetch) {
        console.warn(`[OSRM Router] Tentative ${attempt + 1}/3 échouée:`, eFetch);
      }
      if (attempt < 2) await new Promise(r => setTimeout(r, 1000));
    }

    if (!data || !data.routes || data.routes.length === 0) {
      alert(t().alertNoRoute);
      return;
    }

    alternativeRoutes = data.routes;
    selectRoute(0);
    renderRouteAlternatives();
    updateNavButtonUI();


    // Afficher l'encart Amazon Équipement Route
    const amazonCard = document.getElementById('partner-amazon-card');
    if (amazonCard && AFFILIATE_CONFIG.amazon.enabled) {
      amazonCard.style.display = 'block';
    }

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
    // Switch to map view to display full route overview and stations on mobile
    if (window.innerWidth <= 1080) {
      document.body.classList.add('mobile-route-collapsed');
      const btnToggle = document.getElementById('btn-toggle-route-edit');
      if (btnToggle) btnToggle.innerHTML = t().editBtn;
      setMobileView('map');
    }
    // Faire clignoter l'onglet Liste & Filtres pour inviter l'utilisateur à voir les prix et stations
    setTimeout(() => {
      if (!hasSeenListTabAfterRoute) {
        const btnList = document.getElementById('btn-tab-list');
        if (btnList) {
          btnList.classList.add('tab-attention-pulse');
        }
      }
    }, 200);
  } catch (err) {
    console.error("Erreur calcul d'itinéraire:", err);
    alert(t().alertServerError);
  } finally {
    btn.innerHTML = t().calcBtn;
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
        if (!seen.has(cleanRef) && /^(A\d+|M\d+|T\d+|AP\d+|SS\d+)/i.test(cleanRef)) {
          highways.push(cleanRef);
          seen.add(cleanRef);
        }
      } else if (name && !ref && /autoroute|autostrada|motorway|autopista/i.test(name) && !seen.has(name)) {
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
  const viaCountry = isSwiss ? t().countryCH : (isChamonix ? t().countryFR : '');
  const parts = [hwStr, viaCountry].filter(Boolean);
  return parts.length > 0 ? 'via ' + parts.join(' • ') : (route.legs?.[0]?.summary ? 'via ' + route.legs[0].summary : t().directRoute);
}

// Render Alternative Route Selectors (both in sidebar/list & floating on the map)
function renderRouteAlternatives() {
  const container = document.getElementById('routes-container');
  const mapBar = document.getElementById('map-routes-bar');

  if (!alternativeRoutes || alternativeRoutes.length === 0) {
    if (container) container.style.display = 'none';
    if (mapBar) mapBar.style.display = 'none';
    return;
  }

  // 1. Sidebar Container (Mode Liste) - shown whenever an itinerary is calculated
  if (container) {
    container.style.display = 'flex';
    container.innerHTML = '';
  }

  // 2. Floating Map Bar (Mode Carte) - shown when multiple route choices exist
  if (mapBar) {
    if (alternativeRoutes.length > 1) {
      mapBar.style.display = 'flex';
      mapBar.innerHTML = '';
      if (window.innerWidth <= 1080) {
        mapBar.style.position = 'fixed';
        mapBar.style.zIndex = '1950';
        if (typeof ensureMobileNavBarVisible === 'function') {
          ensureMobileNavBarVisible();
        } else {
          mapBar.style.bottom = 'calc(84px + env(safe-area-inset-bottom, 0px))';
        }
      } else {
        mapBar.style.position = '';
        mapBar.style.bottom = '';
        mapBar.style.zIndex = '';
      }
    } else {
      mapBar.style.display = 'none';
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
    const badgeLabel = idx === 0 ? t().recommended : t().optionN(idx + 1);

    // A. Card in Sidebar
    if (container) {
      const card = document.createElement('div');
      const cardColorClass = idx === 0 ? 'route-card-blue' : 'route-card-orange';
      card.className = `route-card ${cardColorClass} ${idx === 0 ? 'active' : ''}`;
      card.id = `route-card-${idx}`;
      card.innerHTML = `
        <div class="route-card-header">
          <div class="route-card-left">
            <span class="route-badge ${idx === 0 ? 'badge-blue' : 'badge-orange'}">${badgeLabel}</span>
            <span class="route-desc">${summary}</span>
          </div>
          <span class="route-stats">${timeStr} ${diffStr ? `<span class="time-diff">(${diffStr})</span>` : ''} • ${distKm} km</span>
        </div>
      `;
      card.addEventListener('click', () => selectRoute(idx));
      container.appendChild(card);
    }

    // B. Floating Button on Map (only when multiple choices available)
    if (mapBar && alternativeRoutes.length > 1) {
      const btn = document.createElement('div');
      const btnColorClass = idx === 0 ? 'map-route-btn-blue' : 'map-route-btn-orange';
      btn.className = `map-route-btn ${btnColorClass} ${idx === 0 ? 'active' : ''}`;
      btn.id = `map-route-btn-${idx}`;
      btn.innerHTML = `
        <div class="map-route-btn-header">
          <span class="map-route-badge ${idx === 0 ? 'badge-blue' : 'badge-orange'}">${badgeLabel}</span>
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
  userProgressionKmOnRoute = 0;

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
  activeRoutePassedOutline = null;
  activeRoutePassedLine = null;
  activeRouteRemainingOutline = null;
  activeRouteRemainingLine = null;

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
  });

  // Draw active route with high-contrast outline (Option B: passé grisé, restant cyan éclatant)
  if (alternativeRoutes[activeIdx]) {
    const coords = alternativeRoutes[activeIdx].geometry.coordinates;
    const fullLatLngs = coords.map(c => [c[1], c[0]]);

    // 1. Tronçon déjà parcouru (Gris ardoise visible mais secondaire, en arrière-plan)
    activeRoutePassedOutline = L.polyline([], {
      color: '#0f172a',
      weight: 8.5,
      opacity: 0.45,
      lineJoin: 'round'
    }).addTo(map);
    routeLayers.push(activeRoutePassedOutline);

    activeRoutePassedLine = L.polyline([], {
      color: '#64748b',
      weight: 6.5,
      opacity: 0.8,
      lineJoin: 'round'
    }).addTo(map);
    routeLayers.push(activeRoutePassedLine);

    // 2. Tronçon restant à parcourir (Bleu cyan vibrant avec contour sombre haute lisibilité)
    activeRouteRemainingOutline = L.polyline(fullLatLngs, {
      color: '#090d16',
      weight: 12,
      opacity: 0.9,
      lineJoin: 'round'
    }).addTo(map);
    routeLayers.push(activeRouteRemainingOutline);

    activeRouteRemainingLine = L.polyline(fullLatLngs, {
      color: '#0284c7',
      weight: 7.5,
      opacity: 1.0,
      lineJoin: 'round'
    }).addTo(map);
    routeLayers.push(activeRouteRemainingLine);

    updateActiveRoutePolylines();

    fitMapToRouteAndStations();
  }
}

// Fit map to show the entire route, alternative routes, departure, arrival, and all stations along it
function fitMapToRouteAndStations() {
  if (!map) return;

  const bounds = L.latLngBounds();

  // Include user's current GPS position if available
  if (userGpsPosition && userGpsPosition.lat && userGpsPosition.lon) {
    bounds.extend([userGpsPosition.lat, userGpsPosition.lon]);
  }

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

// Project a point onto a line segment and return metric distance, progress t, signed perpendicular distance in meters, and heading
function distPointToSegment(px, py, x1, y1, x2, y2) {
  const midLatRad = ((y1 + y2) * 0.5) * (Math.PI / 180);
  const cosLat = Math.cos(midLatRad);
  const dxM = (x2 - x1) * 111320 * cosLat;
  const dyM = (y2 - y1) * 111320;
  const segLenM = Math.hypot(dxM, dyM);

  if (segLenM < 0.1) {
    return {
      dist: getDistanceKm(py, px, y1, x1),
      t: 0,
      cross: 0,
      signedPerpM: 0,
      headingDeg: 0,
      dxM: 0,
      dyM: 0
    };
  }

  const sxM = (px - x1) * 111320 * cosLat;
  const syM = (py - y1) * 111320;

  let t = (sxM * dxM + syM * dyM) / (segLenM * segLenM);
  t = Math.max(0, Math.min(1, t));

  const projXM = t * dxM;
  const projYM = t * dyM;
  const dist = Math.hypot(sxM - projXM, syM - projYM) / 1000;

  // Signed metric perpendicular distance in meters:
  // negative (< 0): Station is on the RIGHT side of the vehicle's direction of travel
  // positive (> 0): Station is on the LEFT side of the vehicle's direction of travel (opposing carriageway)
  const signedPerpM = (dxM * syM - dyM * sxM) / segLenM;
  const headingDeg = Math.atan2(dxM, dyM) * (180 / Math.PI);

  return {
    dist,
    t,
    cross: signedPerpM, // replaces unnormalized cross with metric signedPerpM for backwards compatibility
    signedPerpM,
    headingDeg,
    dxM,
    dyM
  };
}

// Pre-compute and cache cumulative distances along route geometry for instantaneous projections and polyline slicing
function ensureRouteDistances(route) {
  if (!route || !route.geometry || !route.geometry.coordinates) return null;
  if (route._segDistances && route._cumDistances) return route;

  const coords = route.geometry.coordinates;
  const n = coords.length;
  const segDistances = new Float64Array(Math.max(0, n - 1));
  const cumDistances = new Float64Array(n);
  cumDistances[0] = 0;

  for (let i = 0; i < n - 1; i++) {
    const p1 = coords[i];
    const p2 = coords[i + 1];
    const d = getDistanceKm(p1[1], p1[0], p2[1], p2[0]);
    segDistances[i] = d;
    cumDistances[i + 1] = cumDistances[i] + d;
  }

  route._segDistances = segDistances;
  route._cumDistances = cumDistances;
  route._totalKm = cumDistances[n - 1] || 0;
  return route;
}

// Mise à jour dynamique du tracé actif façon GPS / Waze (Option B) :
// - Le tronçon déjà parcouru passe en gris ardoise discret (#64748b)
// - Le tronçon restant à parcourir reste en bleu cyan éclatant haute visibilité (#0284c7)
function updateActiveRoutePolylines() {
  if (!activeRouteData || !activeRouteRemainingLine) return;
  const coords = activeRouteData.geometry?.coordinates;
  if (!coords || coords.length < 2) return;

  ensureRouteDistances(activeRouteData);
  const segDistances = activeRouteData._segDistances;
  const cumDistances = activeRouteData._cumDistances;
  const totalKm = activeRouteData._totalKm || (cumDistances ? cumDistances[cumDistances.length - 1] : 0);

  // Si la navigation n'est pas active ou si l'on est tout au début (< 150m)
  if (!isGpsNavActive || userProgressionKmOnRoute <= 0.15) {
    const fullLatLngs = coords.map(c => [c[1], c[0]]);
    if (activeRoutePassedOutline) activeRoutePassedOutline.setLatLngs([]);
    if (activeRoutePassedLine) activeRoutePassedLine.setLatLngs([]);
    if (activeRouteRemainingOutline) activeRouteRemainingOutline.setLatLngs(fullLatLngs);
    if (activeRouteRemainingLine) activeRouteRemainingLine.setLatLngs(fullLatLngs);
    return;
  }

  // Si la destination a été atteinte
  if (userProgressionKmOnRoute >= totalKm - 0.15) {
    const fullLatLngs = coords.map(c => [c[1], c[0]]);
    if (activeRoutePassedOutline) activeRoutePassedOutline.setLatLngs(fullLatLngs);
    if (activeRoutePassedLine) activeRoutePassedLine.setLatLngs(fullLatLngs);
    if (activeRouteRemainingOutline) activeRouteRemainingOutline.setLatLngs([]);
    if (activeRouteRemainingLine) activeRouteRemainingLine.setLatLngs([]);
    return;
  }

  // Recherche rapide du segment contenant userProgressionKmOnRoute
  let splitIdx = 0;
  let splitT = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    const segEnd = cumDistances[i + 1];
    if (userProgressionKmOnRoute <= segEnd) {
      splitIdx = i;
      const segLen = segDistances[i];
      splitT = segLen > 0 ? (userProgressionKmOnRoute - cumDistances[i]) / segLen : 0;
      splitT = Math.max(0, Math.min(1, splitT));
      break;
    }
  }

  const p1 = coords[splitIdx];
  const p2 = coords[splitIdx + 1];
  const splitLon = p1[0] + splitT * (p2[0] - p1[0]);
  const splitLat = p1[1] + splitT * (p2[1] - p1[1]);
  const splitLatLng = [splitLat, splitLon];

  // Tronçon passé (départ -> point de progression actuel)
  const passedLatLngs = [];
  for (let i = 0; i <= splitIdx; i++) {
    passedLatLngs.push([coords[i][1], coords[i][0]]);
  }
  passedLatLngs.push(splitLatLng);

  // Tronçon restant (point de progression actuel -> arrivée)
  const remainingLatLngs = [splitLatLng];
  for (let i = splitIdx + 1; i < coords.length; i++) {
    remainingLatLngs.push([coords[i][1], coords[i][0]]);
  }

  if (activeRoutePassedOutline) activeRoutePassedOutline.setLatLngs(passedLatLngs);
  if (activeRoutePassedLine) activeRoutePassedLine.setLatLngs(passedLatLngs);
  if (activeRouteRemainingOutline) activeRouteRemainingOutline.setLatLngs(remainingLatLngs);
  if (activeRouteRemainingLine) activeRouteRemainingLine.setLatLngs(remainingLatLngs);
}

// Find all highway stations along the route, ordered chronologically
let currentRouteStations = [];

function processStationsOnRoute(route) {
  const coords = route.geometry.coordinates; // [[lon, lat], ...]

  // Pre-calculate cumulative distance along the route polyline
  ensureRouteDistances(route);
  const cumDist = route._cumDistances;
  const totalKm = route._totalKm;

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
    let bestSignedPerpM = 0;
    let bestHeadingDeg = 0;
    let bestDxM = 0;
    let bestDyM = 0;

    for (let i = 0; i < coords.length - 1; i++) {
      const p1 = coords[i];
      const p2 = coords[i+1];
      const res = distPointToSegment(s.lon, s.lat, p1[0], p1[1], p2[0], p2[1]);
      if (res.dist < minDist) {
        minDist = res.dist;
        const segLen = cumDist[i+1] - cumDist[i];
        bestKmOnRoute = cumDist[i] + res.t * segLen;
        bestSignedPerpM = res.signedPerpM;
        bestHeadingDeg = res.headingDeg;
        bestDxM = res.dxM;
        bestDyM = res.dyM;
      }
    }

    const exitStationsChk = document.getElementById('chk-exit-stations');
    const includeExit = Boolean(exitStationsChk && exitStationsChk.checked);
    const isServiceArea = Boolean(
      s.pk || s.pk_text ||
      /aire|área|area|vzp|verzorgingsplaats|snelweg|rastst|autobahn|autostrad|autoestrad|services|msa/i.test(s.nom || '') ||
      /aire|área|area|vzp|verzorgingsplaats|snelweg|rastst|autobahn|autostrad|autoestrad|services|msa/i.test(s.adresse || '')
    );
    const isExitCandidate = Boolean(s.is_exit_station || !isServiceArea);
    
    // When exit stations toggle is ON, expand search tolerance up to 1.8 km
    const stationToleranceKm = includeExit ? 1.80 : (s.pays === 'GB' ? 0.95 : maxDistanceKm);

    if (minDist <= stationToleranceKm) {
      const isExit = Boolean(isExitCandidate && (minDist > 0.35 || s.is_exit_station));
      if (!includeExit && isExit) {
        return; // Exclude exit stations when user has not checked the toggle
      }

      const sensLow = (s.sens || '').toLowerCase();
      // Exit stations accessible via interchange roundabouts in both directions,
      // and bidirectional service areas across Europe (ambos, beide, double, nord/süd, etc.)
      const isDoubleSens = /double|deux sens|2 sens|ambos|beide|entrambi|both|tous sens|nord\/süd|ost\/west/i.test(sensLow) || isExit;

      const isUk = s.pays === 'GB';
      // In Continental Europe (right-hand drive):
      // - Right side of road: bestSignedPerpM < 0 (accessible)
      // - Opposite side (left): bestSignedPerpM > 0 (inaccessible across central median barrier)
      // A small +12m tolerance accommodates stations right on the edge of the carriageway or interchange entries
      // In the UK (left-hand drive):
      // - Left side of road: bestSignedPerpM > 0 (accessible)
      // - Opposite side (right): bestSignedPerpM < 0 (inaccessible)
      if (!isDoubleSens) {
        if (isUk) {
          if (bestSignedPerpM < -12.0) return;
        } else {
          if (bestSignedPerpM > 12.0) return;
        }

        // Secondary layer: Cardinal direction consistency check
        const isHeadingSouth = Math.abs(bestHeadingDeg) >= 135;
        const isHeadingNorth = Math.abs(bestHeadingDeg) <= 45;
        const isHeadingEast = bestHeadingDeg > 45 && bestHeadingDeg < 135;
        const isHeadingWest = bestHeadingDeg < -45 && bestHeadingDeg > -135;

        if (isHeadingSouth && /nord|north|norte|noord/i.test(sensLow) && !/sud|south|sur|zuid/i.test(sensLow)) {
          return;
        }
        if (isHeadingNorth && /sud|south|sur|zuid/i.test(sensLow) && !/nord|north|norte|noord/i.test(sensLow)) {
          return;
        }
        if (isHeadingEast && /ouest|west|oeste/i.test(sensLow) && !/est|east|este|ost/i.test(sensLow)) {
          return;
        }
        if (isHeadingWest && /est|east|este|ost/i.test(sensLow) && !/ouest|west|oeste/i.test(sensLow)) {
          return;
        }
      }

      // Official highway Point Kilométrique (PK)
      let displayedPk = s.pk_text || (s.pk ? `${s.pk}` : null);

      matched.push({
        ...s,
        distOnRoute: bestKmOnRoute,
        displayedPk: displayedPk,
        minDistToAxisM: Math.round(minDist * 1000),
        isExitStation: isExit,
        exitDistanceM: Math.round(minDist * 1000),
        signedPerpM: bestSignedPerpM,
        _isDoubleSens: isDoubleSens
      });
    }
  });

  // Tertiary layer: Twin station pair mutual exclusion
  // If two service areas on the same highway (autoroute) are within 800m of each other along the route,
  // they are opposite twin service areas. Strictly keep only the one on the driver's accessible side!
  matched.sort((a, b) => a.distOnRoute - b.distOnRoute);
  const dedupedMatched = [];
  const skipIndices = new Set();
  const isUkRoute = Boolean(activeRouteData && activeRouteData.pays === 'GB');

  for (let i = 0; i < matched.length; i++) {
    if (skipIndices.has(i)) continue;
    const s1 = matched[i];
    for (let j = i + 1; j < matched.length; j++) {
      if (skipIndices.has(j)) continue;
      const s2 = matched[j];
      if (s2.distOnRoute - s1.distOnRoute > 0.8) break; // beyond 800m
      if (s1.autoroute && s2.autoroute && s1.autoroute === s2.autoroute && s1.autoroute !== 'Route' &&
          !s1.isExitStation && !s2.isExitStation && !s1._isDoubleSens && !s2._isDoubleSens) {
        if (!isUkRoute) {
          if (s1.signedPerpM <= s2.signedPerpM) {
            skipIndices.add(j);
          } else {
            skipIndices.add(i);
          }
        } else {
          if (s1.signedPerpM >= s2.signedPerpM) {
            skipIndices.add(j);
          } else {
            skipIndices.add(i);
          }
        }
      }
    }
    if (!skipIndices.has(i)) {
      dedupedMatched.push(s1);
    }
  }

  currentRouteStations = dedupedMatched;
  window.currentRouteStations = currentRouteStations;
  populateBrandFilter();
  renderCurrentRouteStations();
  fitMapToRouteAndStations();
  maybeLoadGermanLivePrices(route, coords, cumDist);
  maybeLoadFrenchCorridorStations(route, coords, cumDist);
}

// Charge à la demande les stations allemandes et leurs prix réels le long du trajet
// (un appel par tranche de ~40 km en Allemagne, 12 appels maximum, mis en cache 5 min par le relais)
async function maybeLoadGermanLivePrices(route, coords, cumDist) {
  if (!DE_LIVE_PRICES.proxyUrl || !route || route._deLiveRequested) return;
  route._deLiveRequested = true;

  const inGermany = (lat, lon) => lat >= 47.2 && lat <= 55.1 && lon >= 5.8 && lon <= 15.1;
  const samples = [];
  let nextKm = 0;
  for (let i = 0; i < coords.length && samples.length < 12; i++) {
    const [lon, lat] = coords[i];
    if (cumDist[i] >= nextKm && inGermany(lat, lon)) {
      samples.push([lat, lon]);
      nextKm = cumDist[i] + 40;
    }
  }
  if (samples.length === 0) return;

  const base = DE_LIVE_PRICES.proxyUrl.replace(/\/$/, '');
  const responses = await Promise.allSettled(samples.map(([lat, lon]) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    return fetch(`${base}/list?lat=${lat.toFixed(3)}&lng=${lon.toFixed(3)}&rad=25`, { signal: ctrl.signal })
      .then(r => r.json())
      .finally(() => clearTimeout(timer));
  }));

  const knownIds = new Set(allStations.map(s => String(s.id)));
  let added = 0;
  responses.forEach(res => {
    if (res.status !== 'fulfilled' || !res.value || !Array.isArray(res.value.stations)) return;
    res.value.stations.forEach(tk => {
      const id = `TK-${tk.id}`;
      if (knownIds.has(id)) return;
      knownIds.add(id);
      const prix = {};
      if (typeof tk.e10 === 'number' && tk.e10 > 0) prix.e10 = tk.e10;
      if (typeof tk.e5 === 'number' && tk.e5 > 0) prix.sp95 = tk.e5;
      if (typeof tk.diesel === 'number' && tk.diesel > 0) prix.gazole = tk.diesel;
      allStations.push({
        id,
        pays: 'DE',
        live: true,
        enseigne: (tk.brand || tk.name || 'Tankstelle').trim(),
        nom: (tk.name || '').trim(),
        autoroute: '',
        sens: '',
        adresse: `${tk.street || ''} ${tk.houseNumber || ''}`.trim(),
        cp: tk.postCode ? String(tk.postCode) : '',
        ville: tk.place || '',
        lat: tk.lat,
        lon: tk.lng,
        pk_text: null,
        prix,
        ruptures: [],
        services: []
      });
      added++;
    });
  });

  if (added > 0 && activeRouteData === route) {
    processStationsOnRoute(route);
  }
}

// Charge à la demande les stations françaises officielles le long du trajet (nationales / routes secondaires / sorties)
// Interroge l'API officielle de Bercy (data.economie.gouv.fr) par échantillons géographiques le long du couloir
async function maybeLoadFrenchCorridorStations(route, coords, cumDist) {
  if (!route || route._frCorridorRequested) return;
  route._frCorridorRequested = true;

  // Délimitation géographique de la France métropolitaine
  const inFrance = (lat, lon) => lat >= 42.3 && lat <= 51.1 && lon >= -5.2 && lon <= 9.6;

  const samples = [];
  let nextKm = 0;
  for (let i = 0; i < coords.length && samples.length < 12; i++) {
    const [lon, lat] = coords[i];
    if (cumDist[i] >= nextKm && inFrance(lat, lon)) {
      samples.push([lat, lon]);
      nextKm = cumDist[i] + 35; // Échantillonnage régulier tous les 35 km
    }
  }
  if (samples.length === 0) return;

  const knownIds = new Set(allStations.map(s => String(s.id)));
  const responses = await Promise.allSettled(samples.map(([lat, lon]) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4500);
    const url = `https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/prix-des-carburants-en-france-flux-instantane-v2/records?where=within_distance(geom%2C%20geom'POINT(${lon.toFixed(3)}%20${lat.toFixed(3)})'%2C%203km)&limit=15`;
    return fetch(url, { signal: ctrl.signal })
      .then(r => r.json())
      .finally(() => clearTimeout(timer));
  }));

  let added = 0;
  responses.forEach(res => {
    if (res.status !== 'fulfilled' || !res.value || !Array.isArray(res.value.results)) return;
    res.value.results.forEach(r => {
      if (!r || !r.id || !r.geom || typeof r.geom.lat !== 'number' || typeof r.geom.lon !== 'number') return;
      const id = `FR-${r.id}`;
      if (knownIds.has(id)) return;
      knownIds.add(id);

      const prix = {};
      if (typeof r.gazole_prix === 'number' && r.gazole_prix > 0) prix.gazole = r.gazole_prix;
      if (typeof r.sp95_prix === 'number' && r.sp95_prix > 0) prix.sp95 = r.sp95_prix;
      if (typeof r.e10_prix === 'number' && r.e10_prix > 0) prix.e10 = r.e10_prix;
      if (typeof r.sp98_prix === 'number' && r.sp98_prix > 0) prix.sp98 = r.sp98_prix;
      if (typeof r.e85_prix === 'number' && r.e85_prix > 0) prix.e85 = r.e85_prix;
      if (typeof r.gplc_prix === 'number' && r.gplc_prix > 0) prix.gplc = r.gplc_prix;

      if (Object.keys(prix).length === 0) return;

      const addr = (r.adresse || '').trim();
      const ville = (r.ville || '').trim();
      const nom = r.nom ? r.nom.trim() : `Station ${ville}`;
      let enseigne = 'Station';
      const fullText = `${nom} ${addr} ${(r.services_service || []).join(' ')}`.toLowerCase();
      if (fullText.includes('total')) enseigne = 'TotalEnergies';
      else if (fullText.includes('leclerc')) enseigne = 'E.Leclerc';
      else if (fullText.includes('carrefour')) enseigne = 'Carrefour';
      else if (fullText.includes('intermarch')) enseigne = 'Intermarché';
      else if (fullText.includes('super u') || fullText.includes('système u')) enseigne = 'Système U';
      else if (fullText.includes('esso')) enseigne = 'Esso';
      else if (fullText.includes('bp')) enseigne = 'BP';
      else if (fullText.includes('shell')) enseigne = 'Shell';
      else if (fullText.includes('avia')) enseigne = 'Avia';
      else if (fullText.includes('auchan')) enseigne = 'Auchan';
      else if (fullText.includes('casino')) enseigne = 'Casino';
      else if (fullText.includes('eni')) enseigne = 'Eni';

      const ruptures = [];
      ['gazole', 'sp95', 'e10', 'sp98', 'e85', 'gplc'].forEach(f => {
        if (r[`${f}_rupture_type`] === 'definitive' || r[`${f}_rupture_type`] === 'temporaire') {
          ruptures.push(f.toUpperCase());
        }
      });

      allStations.push({
        id,
        pays: 'FR',
        live: true,
        enseigne,
        nom,
        autoroute: 'Route',
        sens: 'Double sens',
        adresse: addr,
        cp: r.cp ? String(r.cp) : '',
        ville,
        departement: r.departement || '',
        lat: r.geom.lat,
        lon: r.geom.lon,
        pk_text: null,
        prix,
        ruptures,
        services: Array.isArray(r.services_service) ? r.services_service : []
      });
      added++;
    });
  });

  if (added > 0 && activeRouteData === route) {
    processStationsOnRoute(route);
  }
}

function createEvdanceCard() {
  const card = document.createElement('div');
  card.className = 'partner-card partner-evdance';
  card.id = 'partner-evdance-card';
  const tr = t();
  const targetUrl = AFFILIATE_CONFIG.evdance.url;
  const promoCode = AFFILIATE_CONFIG.evdance.promoCode || 'EVEU20';
  card.innerHTML = `
    <div class="partner-badge evdance-badge">${tr.evdanceBadge}</div>
    <a href="${targetUrl}" target="_blank" rel="noopener sponsored" class="evdance-row" title="EVDANCE Europe">
      <span class="amazon-item-icon">🔌</span>
      <div class="amazon-item-details">
        <span class="amazon-item-name">${tr.evdanceTitle}</span>
        <span class="amazon-item-sub">${tr.evdanceSub} <span class="evdance-promo-pill">${promoCode}</span></span>
      </div>
      <span class="evdance-arrow">${tr.evdanceCta}</span>
    </a>
    <div class="amazon-disclosure">${tr.evdanceDisclosure}</div>
  `;
  return card;
}

function createAmazonCard() {
  const amazonCard = document.createElement('div');
  amazonCard.className = 'partner-card partner-amazon';
  amazonCard.id = 'partner-amazon-card';
  const tr = t();
  const trItems = tr.amazonItems || AFFILIATE_CONFIG.amazon.items;
  const disclosure = tr.amazonDisclosure || "En tant que Partenaire Amazon, nous réalisons un bénéfice sur les achats remplissant les conditions requises.";
  amazonCard.innerHTML = `
    <div class="partner-badge amazon-badge">${tr.amazonBadge}</div>
    <div class="amazon-items-list">
      ${AFFILIATE_CONFIG.amazon.items.map((item, i) => {
        const loc = trItems[i] || item;
        const targetUrl = loc.url || item.url;
        return `
        <a href="${targetUrl}" target="_blank" rel="noopener sponsored" class="amazon-item-row" title="Amazon">
          <span class="amazon-item-icon">${item.icon}</span>
          <div class="amazon-item-details">
            <span class="amazon-item-name">${loc.name}</span>
            <span class="amazon-item-sub">${loc.sub}</span>
          </div>
          <span class="amazon-item-arrow">${tr.amazonView}</span>
        </a>
      `;
      }).join('')}
    </div>
    <div class="amazon-disclosure">${disclosure}</div>
  `;
  return amazonCard;
}

function createActivePartnerCard() {
  if (selectedFuel === 'elec' && AFFILIATE_CONFIG.evdance && AFFILIATE_CONFIG.evdance.enabled) {
    return createEvdanceCard();
  }
  if (AFFILIATE_CONFIG.amazon && AFFILIATE_CONFIG.amazon.enabled) {
    return createAmazonCard();
  }
  return null;
}

// Render stations in sidebar and on map
function renderCurrentRouteStations() {
  // Clear map markers
  stationMarkers.forEach(m => map.removeLayer(m));
  stationMarkers = [];

  // Filter upcoming stations if Live GPS Drive mode is active
  let candidateStations = currentRouteStations;
  if (isGpsNavActive) {
    // Only show stations that are ahead of user (station.distOnRoute >= userProgression - 0.3km)
    candidateStations = candidateStations.filter(s => s.distOnRoute >= (userProgressionKmOnRoute - 0.3));
  }

  // Filter by brand
  let filtered = candidateStations;
  if (selectedFuel === 'elec') {
    filtered = filtered.filter(s => {
      const p = getFuelPrice(s.prix, 'elec');
      return p !== null && p > 0;
    });
  }
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

  // Update counter (with total route mileage when an active route is computed)
  const countLabel = document.getElementById('stations-count-label');
  if (countLabel) {
    const baseCount = t().stationsCount(filtered.length);
    if (activeRouteData && activeRouteData.distance) {
      const distKm = (activeRouteData.distance / 1000).toFixed(0);
      countLabel.textContent = `${baseCount} • ${distKm} km`;
    } else {
      countLabel.textContent = baseCount;
    }
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
    const tr = t();
    if (selectedFuel === 'elec' && AFFILIATE_CONFIG.evdance && AFFILIATE_CONFIG.evdance.enabled) {
      listContainer.appendChild(createEvdanceCard());
    }
    const emptyBox = document.createElement('div');
    const isInitial = !activeRouteData && currentRouteStations.length === 0;
    emptyBox.style.cssText = `text-align:center; padding: ${selectedFuel === 'elec' ? '18px 14px' : '40px 20px'}; color: var(--text-muted);`;
    emptyBox.innerHTML = isInitial
      ? `
        <p style="font-size: 1.8rem; margin-bottom: 6px;">${selectedFuel === 'elec' ? '⚡' : '🛣️'}</p>
        <p>${tr.emptyInitial}</p>
      `
      : `
        <p style="font-size: 2rem; margin-bottom: 8px;">${selectedFuel === 'elec' ? '⚡' : '⛽'}</p>
        <p>${tr.emptyFilteredTitle}</p>
        <p style="font-size:0.8rem; margin-top:4px;">${tr.emptyFilteredSub}</p>
      `;
    listContainer.appendChild(emptyBox);
    return;
  }

  let partnerInserted = false;

  // Dynamically adapt Fuel Selector dropdown labels according to the route's country/countries
  const routeCountries = [...new Set(currentRouteStations.map(s => s.pays || 'FR'))];
  const fuelSelectEl = document.getElementById('select-fuel');
  if (fuelSelectEl && routeCountries.length > 0) {
    const singleCountry = routeCountries.length === 1 ? routeCountries[0] : null;
    const hasSeparateSp95 = routeCountries.includes('FR') || routeCountries.includes('DE');
    const langCountryDict = FUEL_LABELS_BY_COUNTRY[t().defaultCountry] || FUEL_LABELS_BY_COUNTRY.FR;
    Array.from(fuelSelectEl.options).forEach(opt => {
      const fKey = opt.value;
      // Hide separate SP95 (E5) option when route does not include France or Germany (since ES, IT, GB have a single Unleaded 95 category)
      if (fKey === 'sp95') {
        opt.style.display = hasSeparateSp95 ? '' : 'none';
      }
      const prefix = fKey === 'elec' ? '' : '⛽ ';
      if (fKey === 'all') {
        opt.textContent = `${prefix}${langCountryDict.all}`;
      } else if (singleCountry) {
        const dict = FUEL_LABELS_BY_COUNTRY[singleCountry] || FUEL_LABELS_BY_COUNTRY.FR;
        if (dict[fKey]) {
          opt.textContent = `${prefix}${dict[fKey]}`;
        }
      } else {
        // Cross-border route: combine unique official names across the traversed countries
        const names = [...new Set(routeCountries.map(c => (FUEL_LABELS_BY_COUNTRY[c] || FUEL_LABELS_BY_COUNTRY.FR)[fKey]).filter(Boolean))];
        if (names.length > 0) {
          opt.textContent = `${prefix}${names.join(' / ')}`;
        }
      }
    });
  }

  // Render cards and map markers
  filtered.forEach((st, idx) => {
    const tr = t();
    const isUK = st.pays === 'GB';
    const isCH = st.pays === 'CH' || st.devise === 'CHF';
    const isNativeCase = st.pays === 'GB' || st.pays === 'DE';
    const isElec = selectedFuel === 'elec';
    const fuelPrice = (selectedFuel !== 'all') ? getFuelPrice(st.prix, selectedFuel) : (st.prix ? Object.values(st.prix)[0] : null);
    const isCheapest = fuelPrice && fuelPrice === lowestPrice;
    const brandClass = getBrandClass(st.enseigne);
    const unavailText = tr.fuelUnavailable || 'Indispo';
    const pinPriceDisplay = fuelPrice 
      ? (isElec 
          ? `${fuelPrice.toFixed(3)}${isUK ? '£' : (isCH ? ' CHF' : '€')}/kWh` 
          : (isUK ? `£${fuelPrice.toFixed(3)}` : (isCH ? `${fuelPrice.toFixed(3)} CHF` : `${fuelPrice.toFixed(3)}€`))) 
      : unavailText;

    const exitPinClass = st.isExitStation ? 'exit-pin' : '';
    const exitPinIcon = st.isExitStation ? '🚪 ' : '';

    // Create Map Marker Pin
    const pinHtml = `
      <div class="custom-station-pin ${isCheapest ? 'cheapest' : ''} ${isElec ? 'electric-pin' : ''} ${exitPinClass}" id="pin-${st.id}">
        <span class="brand-badge ${brandClass}" style="padding:1px 4px; font-size:0.65rem;">${exitPinIcon}${isElec ? '⚡' : ''} ${(st.enseigne || st.marque || 'Station').substring(0, 5)}</span>
        <span>${pinPriceDisplay}</span>
      </div>
    `;

    const customIcon = L.divIcon({
      html: pinHtml,
      className: 'station-div-icon',
      iconSize: isElec ? [116, 26] : [104, 26],
      iconAnchor: isElec ? [58, 13] : [52, 13]
    });

    const marker = L.marker([st.lat, st.lon], { icon: customIcon }).addTo(map);

    // Opening status & weather
    const openingStatus = getStationOpeningStatus(st);
    const cachedWeather = getCachedWeather(st.lat, st.lon);
    const weatherPopupHtml = cachedWeather
      ? `<span class="popup-weather-icon">${cachedWeather.icon}</span> <strong>${cachedWeather.temp}°C</strong> · ${cachedWeather.desc}`
      : `<span>🌤️ ${tr.weatherLoading || 'Météo en direct'}</span>`;

    // Popup content
    const countryFlags = { GB: '🇬🇧', DE: '🇩🇪', BE: '🇧🇪', ES: '🇪🇸', IT: '🇮🇹', PT: '🇵🇹', NL: '🇳🇱', FR: '🇫🇷' };
    const flag = countryFlags[st.pays] || '🇫🇷';
    const nomFormatted = isNativeCase ? st.nom : formatProperName(st.nom);
    const villeFormatted = isNativeCase ? st.ville : formatProperName(st.ville);
    const sensFormatted = st.sens ? translateSens(st.sens, isNativeCase) : '';
    const cleanPk = String(st.displayedPk || '').replace(/^km\s*/i, '').trim();
    const defaultHw = tr.defaultHighway || (currentLang === 'de' ? 'Autobahn' : (currentLang === 'it' ? 'Autostrada' : (currentLang === 'es' ? 'Autopista' : (currentLang === 'en' ? 'Motorway' : 'Autoroute'))));
    const pkBadgeLabel = cleanPk
      ? (isUK ? `${st.autoroute || defaultHw} • J${cleanPk}` : tr.kmMarker(st.autoroute || defaultHw, cleanPk))
      : (st.autoroute ? `${st.autoroute}` : defaultHw);
    const remainingKm = Math.max(0, (st.distOnRoute - userProgressionKmOnRoute)).toFixed(1);
    const distCountdownText = tr.fromCurrentPos(remainingKm);

    const wazeUrl = `https://waze.com/ul?ll=${st.lat},${st.lon}&navigate=yes`;
    const gmapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${st.lat},${st.lon}&travelmode=driving`;

    const wazeSvg = `<svg class="nav-btn-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M19.5 10.5c0-4.4-3.8-8-8.5-8S2.5 6.1 2.5 10.5c0 1.9.7 3.6 1.8 5-.5 1.2-1.4 2.1-2.3 2.5-.4.2-.5.7-.2 1 .3.3.9.5 1.8.5 1.3 0 2.6-.4 3.6-.9 1.2.5 2.5.8 3.8.8 4.7 0 8.5-3.6 8.5-8.9zm-11 0c-.8 0-1.5-.7-1.5-1.5S7.7 7.5 8.5 7.5 10 8.2 10 9s-.7 1.5-1.5 1.5zm6 0c-.8 0-1.5-.7-1.5-1.5S13.7 7.5 14.5 7.5 16 8.2 16 9s-.7 1.5-1.5 1.5zm-3 5.2c-1.9 0-3.5-1-4.2-2.5-.2-.4 0-.8.4-1 .4-.2.8 0 1 .4.5 1 1.6 1.6 2.8 1.6s2.3-.6 2.8-1.6c.2-.4.6-.6 1-.4.4.2.6.6.4 1-.7 1.5-2.3 2.5-4.2 2.5z"/></svg>`;
    const gmapsSvg = `<svg class="nav-btn-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>`;

    const exitNum = extractExitNumber(st);
    const formattedExitDist = formatExitDistKm(st.exitDistanceM || 800);
    const offMotorwayBadgeText = (tr.offMotorwayBadge && typeof tr.offMotorwayBadge === 'function')
      ? tr.offMotorwayBadge(formattedExitDist, exitNum)
      : (exitNum ? `À ${formattedExitDist} de la sortie n° ${exitNum}` : `À ${formattedExitDist} de la sortie d'autoroute`);

    const popupExitBannerHtml = st.isExitStation ? `
      <div class="popup-exit-banner popup-off-motorway-banner">
        ⚠️ <strong>${tr.offMotorwayPopupTitle || 'Station hors autoroute'}</strong>
        <div style="font-size:0.75rem; margin-top:2px;">${(tr.offMotorwayPopupDesc && typeof tr.offMotorwayPopupDesc === 'function') ? tr.offMotorwayPopupDesc(formattedExitDist, exitNum) : (exitNum ? `Accessible à la sortie n° ${exitNum} (~${formattedExitDist})` : `Accessible à la sortie d'autoroute / péage (~${formattedExitDist})`)}</div>
      </div>
    ` : '';

    const popupPkHtml = (!st.isExitStation && pkBadgeLabel) ? `
        <div class="popup-pk">📍 🛣️ ${pkBadgeLabel}</div>` : '';

    const popupContent = `
      <div class="station-popup">
        <div class="popup-title"><span class="flag-icon">${flag}</span> ${st.enseigne} - ${nomFormatted}</div>${popupPkHtml}
        <div style="font-size:0.8rem; color:#cbd5e1; margin-bottom:4px;">${isNativeCase ? st.adresse : formatProperName(st.adresse)} (${villeFormatted})</div>
        <div style="font-size:0.75rem; color:#38bdf8; margin-bottom:6px;">${tr.popupDirDist(sensFormatted || tr.sensDirect, remainingKm)}</div>
        
        ${popupExitBannerHtml}

        <div class="popup-weather-row" id="weather-popup-${st.id}">
          ${weatherPopupHtml}
        </div>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:4px; font-size:0.8rem; margin-bottom:8px;">
          ${renderPopupPrices(st.prix, selectedFuel, st.pays, st.maj)}
        </div>

        <div class="popup-opening-hours">
          <div class="popup-hours-title">${tr.hoursTitle || '🕒 HORAIRES D\'OUVERTURE'}</div>
          <div class="popup-hours-line">⛽ <strong>${tr.pumps247 || 'Pompes & bornes : 24h/24'}</strong></div>
          <div class="popup-hours-line">☕ <strong>${tr.foodLabel || 'Restauration :'}</strong> ${openingStatus.popupSchedule}</div>
        </div>

        ${renderPopupAmenitiesBlock(st)}
        <div class="station-nav-actions popup-nav-actions">
          <a href="${wazeUrl}" target="_blank" rel="noopener noreferrer" class="btn-gps-nav btn-waze" title="${tr.wazeTitle}">
            ${wazeSvg} <span>Waze</span>
          </a>
          <a href="${gmapsUrl}" target="_blank" rel="noopener noreferrer" class="btn-gps-nav btn-gmaps" title="${tr.gmapsTitle}">
            ${gmapsSvg} <span>Maps</span>
          </a>
        </div>
      </div>
    `;
    marker.bindPopup(popupContent, {
      autoPan: true,
      autoPanPadding: [20, 20],
      autoPanPaddingTopLeft: [25, 80],
      autoPanPaddingBottomRight: [25, 60],
      keepInView: true,
      maxHeight: 380,
      offset: [0, -10]
    });
    stationMarkers.push(marker);

    // Create Sidebar Card
    const card = document.createElement('div');
    const exitCardClass = st.isExitStation ? 'exit-station-card' : '';
    card.className = `station-card ${exitCardClass} ${isCheapest ? 'highlighted' : ''}`;
    card.id = `card-${st.id}`;

    card.innerHTML = `
      ${isCheapest ? `<div class="best-price-ribbon">${t().bestPrice}</div>` : ''}
      ${st.isExitStation ? `
        <div class="exit-card-banner">
          <span class="exit-card-banner-icon">🚪</span>
          <span class="exit-card-banner-text">${(tr.offMotorwayPopupTitle || 'STATION HORS AUTOROUTE').toUpperCase()}</span>
        </div>
      ` : ''}
      <div class="card-top">
        <div style="display:flex; align-items:center; gap:4px; flex-wrap:wrap;">
          <span class="station-rank">#${idx + 1}</span>
          <span class="flag-icon">${flag}</span>
          <span class="brand-badge ${brandClass}">${st.enseigne}</span>
          ${st.isExitStation ? `<span class="station-type-badge exit-badge" title="${tr.offMotorwayTooltip || ''}">🚪 ${offMotorwayBadgeText}</span>` : ''}
        </div>
        <div class="card-top-right">
          <span class="station-weather-pill" id="weather-card-${st.id}" title="${cachedWeather ? cachedWeather.desc : 'Météo en direct'}">
            ${cachedWeather ? `${cachedWeather.icon} ${cachedWeather.temp}°C` : '🌤️ --°C'}
          </span>
          <div class="station-logo-badge" title="${st.enseigne}">
            ${getBrandLogoSvg(st.enseigne)}
          </div>
          ${!st.isExitStation && pkBadgeLabel ? `
            <span class="pk-marker-badge">
              🛣️ ${pkBadgeLabel}
            </span>
          ` : ''}
        </div>
      </div>

      <div class="station-name-row">
        <div class="station-name">${nomFormatted}</div>
        <div class="station-nav-actions">
          <a href="${wazeUrl}" target="_blank" rel="noopener noreferrer" class="btn-gps-nav btn-waze" onclick="event.stopPropagation();" title="${t().wazeTitle}">
            ${wazeSvg} <span>Waze</span>
          </a>
          <a href="${gmapsUrl}" target="_blank" rel="noopener noreferrer" class="btn-gps-nav btn-gmaps" onclick="event.stopPropagation();" title="${t().gmapsTitle}">
            ${gmapsSvg} <span>Maps</span>
          </a>
        </div>
      </div>
      <div class="station-details">
        <span class="distance-countdown">${distCountdownText}</span>
        ${sensFormatted ? `<span class="sens-tag">${sensFormatted}</span>` : ''}
        <span>• ${villeFormatted}</span>
      </div>

      <div class="prices-container">
        ${renderCardPrices(st.prix, selectedFuel, isCheapest, st.pays, st.maj)}
      </div>
      ${(st.pays === 'BE' || (st.pays === 'DE' && !st.live)) ? `<div style="font-size:0.68rem; color:#94a3b8; margin-top:3px;">${t().estimatedPrice}</div>` : ''}
      ${(st.pays === 'DE' && st.live) ? `<div style="font-size:0.66rem; color:#94a3b8; margin-top:3px;">MTS-K · <a href="https://www.tankerkoenig.de" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation();" style="color:#7dd3fc;">Tankerkönig</a> (CC BY 4.0)</div>` : ''}

      ${(() => {
        if (selectedFuel !== 'all' || !st.ruptures || st.ruptures.length === 0) return '';
        const realRuptures = st.ruptures.filter(r => !(r.toUpperCase() === 'SP95' && st.prix && st.prix.e10 > 0));
        return realRuptures.length > 0 ? `<div><span class="rupture-badge">${t().outOfStock} ${realRuptures.join(', ')}</span></div>` : '';
      })()}
    `;

    // Click card to zoom map to station and center the popup within the visible screen
    card.addEventListener('click', () => {
      document.querySelectorAll('.station-card').forEach(c => c.classList.remove('highlighted'));
      card.classList.add('highlighted');
      
      const isMobile = window.innerWidth <= 900;
      if (isMobile) {
        setMobileView('map');
      }

      setTimeout(() => {
        if (map) {
          map.invalidateSize();
          marker.openPopup();
          // The popup is positioned vertically ABOVE the marker icon.
          // Centering directly on [st.lat, st.lon] can cut off the top of the popup.
          // By offsetting slightly, the entire popup is vertically centered on screen.
          const pt = map.project([st.lat, st.lon], 14);
          const yOffset = isMobile ? 120 : 90;
          const targetPoint = map.unproject([pt.x, pt.y - yOffset], 14);
          map.setView(targetPoint, 14, { animate: true });
        }
      }, isMobile ? 180 : 30);
    });

    listContainer.appendChild(card);

    // Insérer l'encart partenaire (EVDANCE si Électrique, sinon Amazon) juste après la 2e station
    if (idx === 1) {
      const pCard = createActivePartnerCard();
      if (pCard) {
        listContainer.appendChild(pCard);
        partnerInserted = true;
      }
    }
  });

  // Si l'itinéraire a moins de 2 stations, l'insérer à la fin
  if (!partnerInserted && filtered.length > 0) {
    const pCard = createActivePartnerCard();
    if (pCard) listContainer.appendChild(pCard);
  }

  // Asynchronously fetch and display live weather from Open-Meteo
  fetchWeatherForStations(filtered);
}

// Helper to format official price verification date/time (e.g. "Aujourd'hui à 08h15", "Hier à 18h24", "01/11 à 09h30")
function formatPriceMaj(majStr) {
  if (!majStr) return '';
  try {
    const normalized = String(majStr).trim().replace('T', ' ');
    const parts = normalized.split(' ');
    const datePart = parts[0];
    const timePart = parts[1] || '';
    const dateSegments = datePart.split('-');
    if (dateSegments.length < 3) return '';
    const year = parseInt(dateSegments[0], 10);
    const month = parseInt(dateSegments[1], 10);
    const day = parseInt(dateSegments[2], 10);
    if (!year || !month || !day) return '';

    const timeSegments = timePart.split(':');
    const hours = timeSegments[0] ? timeSegments[0].padStart(2, '0') : '';
    const minutes = timeSegments[1] ? timeSegments[1].padStart(2, '0') : '';
    const timeFmt = (hours && minutes) ? `${hours}h${minutes}` : '';

    const now = new Date();
    const todayY = now.getFullYear();
    const todayM = now.getMonth() + 1;
    const todayD = now.getDate();

    const targetDate = new Date(year, month - 1, day);
    const todayDate = new Date(todayY, todayM - 1, todayD);
    const diffDays = Math.round((todayDate - targetDate) / (1000 * 60 * 60 * 24));

    const tr = t();
    if (diffDays === 0) {
      return timeFmt ? `${tr.today} ${tr.atTime} ${timeFmt}` : tr.today;
    } else if (diffDays === 1) {
      return timeFmt ? `${tr.yesterday} ${tr.atTime} ${timeFmt}` : tr.yesterday;
    } else {
      const dd = String(day).padStart(2, '0');
      const mm = String(month).padStart(2, '0');
      return timeFmt ? `${dd}/${mm} ${tr.atTime} ${timeFmt}` : `${dd}/${mm}`;
    }
  } catch (e) {
    return '';
  }
}

// Render fuel prices inside card
function renderCardPrices(prices, featuredFuel, isCheapest, pays, maj) {
  const isUK = pays === 'GB';
  const isElec = featuredFuel === 'elec';
  const isCH = pays === 'CH';
  const formatPrice = (val) => {
    if (isElec) return isUK ? `${val.toFixed(3)} £/kWh` : (isCH ? `${val.toFixed(3)} CHF/kWh` : `${val.toFixed(3)} €/kWh`);
    return isUK ? `£${val.toFixed(3)}` : (isCH ? `${val.toFixed(3)} CHF` : `${val.toFixed(3)} €`);
  };
  const majFormatted = formatPriceMaj(maj);
  const fuelIcon = isElec ? '⚡' : '⛽';

  if (!prices || Object.keys(prices).length === 0) {
    return `
      <div class="prices-single-row">
        <span class="single-fuel-label"><span class="fuel-icon">${fuelIcon}</span><span class="fuel-name">${t().priceLbl}</span></span>
        <span class="price-val-unavail">${t().noPrice}</span>
      </div>
    `;
  }

  // When a specific fuel is filtered (default behavior: e10/sp95, gazole, sp98, etc.)
  if (featuredFuel && featuredFuel !== 'all') {
    const p = getFuelPrice(prices, featuredFuel);
    const rawFuelName = getServedFuelLabel(prices, featuredFuel, pays);
    const fuelName = rawFuelName.replace(/^[⚡⛽]\s*/, '');

    if (p && p > 0) {
      return `
        <div class="prices-single-row ${isCheapest ? 'cheapest' : 'featured'} ${isElec ? 'electric-row' : ''}">
          <div class="single-fuel-label">
            <span class="fuel-icon">${fuelIcon}</span>
            <span class="fuel-name">${fuelName}</span>
          </div>
          <div class="single-fuel-price">
            <span class="price-val-large ${isCheapest ? 'cheapest' : ''}">${formatPrice(p)}</span>
            ${majFormatted ? `<span class="price-maj-time" title="${t().verifiedAt} ${maj}">🕒 ${majFormatted}</span>` : ''}
          </div>
        </div>
      `;
    } else {
      return `
        <div class="prices-single-row unavailable">
          <div class="single-fuel-label">
            <span class="fuel-icon">${fuelIcon}</span>
            <span class="fuel-name">${fuelName}</span>
          </div>
          <div class="single-fuel-price">
            <span class="price-val-unavail">${t().unavail}</span>
          </div>
        </div>
      `;
    }
  }

  // If "Tous les carburants" (all) is selected, render official country-specific multi-fuel grid
  const fuels = getDistinctCountryFuels(pays);
  let html = '<div class="prices-grid">';
  fuels.forEach(f => {
    if (prices[f]) {
      html += `
        <div class="price-item">
          <span class="price-name">${getFuelLabel(f, pays)}</span>
          <span class="price-val">${formatPrice(prices[f])}</span>
        </div>
      `;
    }
  });
  if (majFormatted) {
    html += `<div class="prices-grid-maj">🕒 ${t().verifiedAt} ${majFormatted}</div>`;
  }
  html += '</div>';
  return html;
}

// Render prices in marker popup
function renderPopupPrices(prices, featuredFuel, pays, maj) {
  const isUK = pays === 'GB';
  const isElec = featuredFuel === 'elec';
  const isCH = pays === 'CH';
  const formatPrice = (val) => {
    if (isElec) return isUK ? `${val.toFixed(3)} £/kWh` : (isCH ? `${val.toFixed(3)} CHF/kWh` : `${val.toFixed(3)} €/kWh`);
    return isUK ? `£${val.toFixed(3)}` : (isCH ? `${val.toFixed(3)} CHF` : `${val.toFixed(3)} €`);
  };
  const majFormatted = formatPriceMaj(maj);
  const fuelIcon = isElec ? '⚡' : '⛽';

  if (!prices) return `<span>${t().noPrice}</span>`;
  if (featuredFuel && featuredFuel !== 'all') {
    const p = getFuelPrice(prices, featuredFuel);
    const rawFuelName = getServedFuelLabel(prices, featuredFuel, pays);
    const fuelName = rawFuelName.replace(/^[⚡⛽]\s*/, '');
    if (p && p > 0) {
      const bgBorder = isElec 
        ? 'background: rgba(14, 165, 233, 0.18); border: 1.5px solid #0ea5e9;'
        : 'background: rgba(16, 185, 129, 0.15); border: 1.5px solid #10b981;';
      const labelColor = isElec ? '#7dd3fc' : '#a7f3d0';
      return `
        <div style="grid-column: span 2; ${bgBorder} padding: 6px 12px; border-radius: 8px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px;">
          <span style="color: ${labelColor}; font-size: 0.85rem; font-weight: 700;">${fuelIcon} ${fuelName}</span>
          <div style="display:flex; align-items:center; gap:8px;">
            <b style="color: #ffffff; font-size: 1.15rem; font-family: monospace;">${formatPrice(p)}</b>
            ${majFormatted ? `<span class="price-maj-time" style="font-size:0.7rem;" title="${t().verifiedAt} ${maj}">🕒 ${majFormatted}</span>` : ''}
          </div>
        </div>
      `;
    } else {
      return `
        <div style="grid-column: span 2; background: rgba(239, 68, 68, 0.15); border: 1px solid #ef4444; padding: 6px 10px; border-radius: 6px; text-align:center; color:#fca5a5; font-size:0.8rem;">
          ${fuelIcon} ${fuelName} : ${t().unavail}
        </div>
      `;
    }
  }
  const fuels = getDistinctCountryFuels(pays).filter(f => prices[f]);
  let html = fuels.map(f => `
    <div style="background:rgba(255,255,255,0.06); padding:3px 6px; border-radius:4px;">
      <span style="color:#94a3b8; font-size:0.7rem;">${getFuelLabel(f, pays)}:</span>
      <b style="color:#fff;">${formatPrice(prices[f])}</b>
    </div>
  `).join('');
  if (majFormatted) {
    html += `<div style="grid-column: span 2; font-size:0.72rem; color:#7dd3fc; text-align:right; margin-top:4px;">🕒 ${t().verifiedAt} ${majFormatted}</div>`;
  }
  return html;
}

// Helper for brand badge CSS class
function getBrandClass(brand) {
  const b = (brand || '').toLowerCase();
  if (b.includes('aral')) return 'badge-aral';
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
  if (b.includes('texaco')) return 'badge-esso';
  return 'badge-default';
}

// Return official brand logo SVG badge
function getBrandLogoSvg(brand) {
  const b = (brand || '').toLowerCase().trim();

  // Aral (German blue diamond)
  if (b.includes('aral')) {
    return `<svg viewBox="0 0 100 100" class="brand-svg" xmlns="http://www.w3.org/2000/svg">
      <rect width="100" height="100" rx="18" fill="#ffffff"/>
      <polygon points="50,6 94,50 50,94 6,50" fill="#00549f" stroke="#00386b" stroke-width="2"/>
      <polygon points="50,12 88,50 50,88 12,50" fill="none" stroke="#ffffff" stroke-width="2.5"/>
      <text x="50" y="57" font-family="'Plus Jakarta Sans', Arial, sans-serif" font-weight="900" font-size="21" fill="#ffffff" text-anchor="middle" letter-spacing="0.5">ARAL</text>
    </svg>`;
  }

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


// ==========================================================================
// Live GPS Drive Mode / Suivi d'itinéraire en direct
// ==========================================================================
let hasSeenListTabAfterRoute = false;
let isGpsNavActive = false;
let isGpsAutoFollow = false;
let isProgrammaticPan = false;
let needsFirstNavZoom = false;

function safeMapPanTo(lat, lon, zoom = null) {
  if (!map) return;
  isProgrammaticPan = true;
  if (zoom !== null) {
    map.flyTo([lat, lon], zoom, { animate: true, duration: 0.8 });
  } else {
    map.panTo([lat, lon], { animate: true, duration: 0.8 });
  }
  setTimeout(() => { isProgrammaticPan = false; }, 950);
}

function updateLocateButtonNavState() {
  const btnLocate = document.getElementById('btn-locate-me');
  if (!btnLocate) return;
  if (isGpsNavActive && isGpsAutoFollow) {
    btnLocate.classList.add('active-follow');
    btnLocate.title = t().navFollowing || "Suivi automatique actif (centré)";
  } else {
    btnLocate.classList.remove('active-follow');
    btnLocate.title = t().locateMeTitle || "Centrer sur ma position";
  }
}
let liveGpsWatchId = null;
let gpsWatchId = null; // Legacy alias
let userGpsPosition = null; // { lat, lon, accuracy, heading, speed, timestamp, city, isHighAccuracy }
let userGpsMarker = null;
let userProgressionKmOnRoute = 0;

try {
  Object.defineProperty(window, 'userGpsPosition', { get: () => userGpsPosition, set: (v) => { userGpsPosition = v; }, configurable: true });
  Object.defineProperty(window, 'userGpsMarker', { get: () => userGpsMarker, set: (v) => { userGpsMarker = v; }, configurable: true });
  Object.defineProperty(window, 'activeRouteData', { get: () => activeRouteData, set: (v) => { activeRouteData = v; }, configurable: true });
  Object.defineProperty(window, 'alternativeRoutes', { get: () => alternativeRoutes, set: (v) => { alternativeRoutes = v; }, configurable: true });
  Object.defineProperty(window, 'currentRouteStations', { get: () => currentRouteStations, set: (v) => { currentRouteStations = v; }, configurable: true });
  Object.defineProperty(window, 'isGpsNavActive', { get: () => isGpsNavActive, set: (v) => { isGpsNavActive = v; }, configurable: true });
  Object.defineProperty(window, 'isGpsAutoFollow', { get: () => isGpsAutoFollow, set: (v) => { isGpsAutoFollow = v; }, configurable: true });
  Object.defineProperty(window, 'userProgressionKmOnRoute', { get: () => userProgressionKmOnRoute, set: (v) => { userProgressionKmOnRoute = v; }, configurable: true });
} catch(e) {}

function toggleGpsNavigation() {
  if (isGpsNavActive) {
    stopGpsNavigation();
  } else {
    startGpsNavigation();
  }
}

function updateNavButtonUI() {
  const btnStart = document.getElementById('btn-start-nav');
  const btnSum = document.getElementById('btn-sum-nav');
  const tr = t();

  if (btnStart) {
    if (activeRouteData) {
      btnStart.style.display = 'flex';
    } else {
      btnStart.style.display = 'none';
    }

    if (isGpsNavActive) {
      btnStart.classList.add('nav-active');
      btnStart.innerHTML = `<span class="nav-pulse-dot"></span> <span>${tr.stopNav || 'Arrêter'}</span>`;
    } else {
      btnStart.classList.remove('nav-active');
      btnStart.innerHTML = `<span class="nav-pulse-dot"></span> <span>${tr.startNav || 'Démarrer'}</span>`;
    }
  }

  if (btnSum) {
    if (isGpsNavActive) {
      btnSum.classList.add('nav-active');
      btnSum.innerHTML = `<span>⏹</span> ${tr.stopNav ? tr.stopNav.split(' ')[0] : 'Arrêter'}`;
      btnSum.title = tr.stopNav || 'Arrêter';
    } else {
      btnSum.classList.remove('nav-active');
      btnSum.innerHTML = `<span>🟢</span> ${tr.startNav || 'Démarrer'}`;
      btnSum.title = tr.startNav || 'Démarrer';
    }
  }
}

let userGpsAccuracyCircle = null;

// Function to update the permanent GPS marker on map with precision halo
function updateUserGpsMarker(latitude, longitude, accuracy = null, isIpFallback = false) {
  if (!map) return;
  if (!userGpsMarker) {
    const userIcon = L.divIcon({
      className: 'gps-user-marker',
      html: '<div class="gps-user-pulse"></div>',
      iconSize: [26, 26],
      iconAnchor: [13, 13]
    });
    userGpsMarker = L.marker([latitude, longitude], {
      pane: 'gpsUserPane',
      icon: userIcon,
      zIndexOffset: 50000
    }).addTo(map);
  } else {
    userGpsMarker.setLatLng([latitude, longitude]);
    if (!map.hasLayer(userGpsMarker)) {
      userGpsMarker.addTo(map);
    }
  }

  // Info-bulle adaptée selon la nature et la précision du relevé
  let tooltipText = '';
  if (isIpFallback) {
    tooltipText = `📍 Position réseau estimée • Recherche satellite GPS en cours...`;
  } else if (accuracy && accuracy <= 150) {
    tooltipText = `🎯 Position GPS satellite exacte (±${Math.round(accuracy)}m)`;
  } else if (accuracy) {
    tooltipText = `📍 Position estimée (±${Math.round(accuracy)}m)`;
  } else {
    const base = t().currentPos ? t().currentPos.replace(/^📍\s*/, '') : 'Votre position';
    tooltipText = `📍 ${base}`;
  }

  try {
    userGpsMarker.unbindTooltip();
    userGpsMarker.bindTooltip(tooltipText, {
      direction: 'top',
      offset: [0, -14],
      className: isIpFallback ? 'gps-user-tooltip gps-user-tooltip-ip' : 'gps-user-tooltip'
    });
  } catch (e) {}

  // Affichage du halo de précision (cercle bleu satellite ou ambre réseau)
  if (accuracy && accuracy > 0 && accuracy < 60000) {
    const circleOptions = isIpFallback
      ? { color: '#f59e0b', weight: 1.5, dashArray: '4,4', fillOpacity: 0.12, pane: 'gpsUserPane' }
      : { color: '#0284c7', weight: 1.5, fillOpacity: 0.15, pane: 'gpsUserPane' };
    if (!userGpsAccuracyCircle) {
      userGpsAccuracyCircle = L.circle([latitude, longitude], { radius: accuracy, ...circleOptions }).addTo(map);
    } else {
      userGpsAccuracyCircle.setLatLng([latitude, longitude]);
      userGpsAccuracyCircle.setRadius(accuracy);
      userGpsAccuracyCircle.setStyle(circleOptions);
      if (!map.hasLayer(userGpsAccuracyCircle)) {
        userGpsAccuracyCircle.addTo(map);
      }
    }
  } else if (userGpsAccuracyCircle && map.hasLayer(userGpsAccuracyCircle)) {
    map.removeLayer(userGpsAccuracyCircle);
  }
}

let toastTimer = null;
function showToast(msg, options = {}) {
  let toast = document.getElementById('app-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'app-toast';
    toast.className = 'toast-notification';
    document.body.appendChild(toast);
  }
  const isWarning = options.isWarning === true;
  const isInfo = options.isInfo === true;
  const isSuccess = options.isSuccess === true;
  toast.className = `toast-notification ${isWarning ? 'warning' : ''} ${isInfo ? 'info' : ''} ${isSuccess ? 'success' : ''}`;
  toast.innerHTML = msg;
  toast.classList.add('show');

  if (toastTimer) clearTimeout(toastTimer);
  const dur = options.duration || 4500;
  toastTimer = setTimeout(() => {
    toast.classList.remove('show');
  }, dur);
}

// ============================================================================
// GPS ENGINE & SATELLITE POSITIONING (PURE RANDOTRACKER DUAL-ENGINE ARCHITECTURE)
// ============================================================================

let isTrackingGps = false;
let lastGpsTimestamp = null;
let hasAutoCenteredGps = false;
let gpsHeartbeatWorker = null;
let gpsForcedInterval = null;

// ============================================================================
// MAINTIEN D'ARRIÈRE-PLAN AUDIO & MEDIASESSION (POCHE ÉCRAN ÉTEINT / DOZE MODE)
// Architecture RandoTracker pour empêcher Android et iOS de suspendre le GPS
// ============================================================================
let silentAudioKeeper = null;
let silentAudioBlobUrl = null;
let audioContextKeeper = null;
let audioOscillator = null;
let isAudioUnlocked = false;

function createSilentAudioBlobUrl() {
  if (silentAudioBlobUrl) return silentAudioBlobUrl;
  try {
    const sampleRate = 8000;
    const numSamples = sampleRate * 2;
    const buffer = new ArrayBuffer(44 + numSamples);
    const view = new DataView(buffer);

    function writeString(offset, string) {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    }
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + numSamples, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM Format
    view.setUint16(22, 1, true); // Mono
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate, true);
    view.setUint16(32, 1, true);
    view.setUint16(34, 8, true); // 8-bit
    writeString(36, 'data');
    view.setUint32(40, numSamples, true);
    for (let i = 0; i < numSamples; i++) {
      view.setUint8(44 + i, 128);
    }
    const blob = new Blob([buffer], { type: 'audio/wav' });
    silentAudioBlobUrl = URL.createObjectURL(blob);
    return silentAudioBlobUrl;
  } catch (e) {
    return 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';
  }
}

function unlockAndStartKeepAlive() {
  if (isAudioUnlocked) {
    if (audioContextKeeper && audioContextKeeper.state === 'suspended') {
      audioContextKeeper.resume().catch(() => {});
    }
    if (silentAudioKeeper && silentAudioKeeper.paused) {
      silentAudioKeeper.play().catch(() => {});
    }
    return;
  }

  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (AudioCtx) {
      if (!audioContextKeeper) {
        audioContextKeeper = new AudioCtx();
      }
      if (audioContextKeeper.state === 'suspended') {
        audioContextKeeper.resume().catch(() => {});
      }
      if (!audioOscillator) {
        try {
          audioOscillator = audioContextKeeper.createOscillator();
          const gainNode = audioContextKeeper.createGain();
          gainNode.gain.value = 0.00001; // Inaudible mais actif pour le système
          audioOscillator.connect(gainNode);
          gainNode.connect(audioContextKeeper.destination);
          audioOscillator.start();
        } catch (e) {}
      }
    }

    if (!silentAudioKeeper) {
      const audioUrl = createSilentAudioBlobUrl();
      silentAudioKeeper = new Audio(audioUrl);
      silentAudioKeeper.loop = true;
      silentAudioKeeper.volume = 0.001;
    }
    const playPromise = silentAudioKeeper.play();
    if (playPromise !== undefined) {
      playPromise.catch(() => {});
    }

    isAudioUnlocked = true;

    if ('mediaSession' in navigator) {
      try {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: 'FuelCoPilot • Navigation & Prix Carburant',
          artist: 'GPS en direct & Alertes Stations',
          album: 'Guidage actif autoroute',
          artwork: [
            { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: 'icon-512.png', sizes: '512x512', type: 'image/png' }
          ]
        });
        navigator.mediaSession.playbackState = 'playing';

        navigator.mediaSession.setActionHandler('play', () => {
          if (silentAudioKeeper) silentAudioKeeper.play().catch(() => {});
          if (audioContextKeeper && audioContextKeeper.state === 'suspended') audioContextKeeper.resume().catch(() => {});
          navigator.mediaSession.playbackState = 'playing';
        });
        navigator.mediaSession.setActionHandler('pause', () => {
          if (silentAudioKeeper) silentAudioKeeper.play().catch(() => {});
          navigator.mediaSession.playbackState = 'playing';
        });
      } catch (e) {}
    }
  } catch (e) {}
}

// Auto-déverrouillage instantané sur le moindre toucher ou interaction utilisateur
['click', 'touchstart', 'touchend', 'pointerdown', 'keydown'].forEach(evt => {
  window.addEventListener(evt, unlockAndStartKeepAlive, { passive: true });
});

function startBackgroundKeepAlive() {
  unlockAndStartKeepAlive();
}

function stopBackgroundKeepAlive() {
  if (silentAudioKeeper) {
    try { silentAudioKeeper.pause(); } catch (e) {}
  }
  if (audioContextKeeper && audioContextKeeper.state === 'running') {
    try { audioContextKeeper.suspend().catch(() => {}); } catch (e) {}
  }
  if ('mediaSession' in navigator) {
    try { navigator.mediaSession.playbackState = 'none'; } catch (e) {}
  }
}

// ============================================================================
// CHRONOMÈTRE D'ARRIÈRE-PLAN WEB WORKER & DUAL-ENGINE GPS WATCHDOG (RANDOTRACKER)
// ============================================================================

function stopGpsWorkerHeartbeat() {
  if (gpsHeartbeatWorker) {
    try {
      gpsHeartbeatWorker.postMessage('stop');
      gpsHeartbeatWorker.terminate();
    } catch (e) {}
    gpsHeartbeatWorker = null;
  }
  stopGpsForcedWatchdog();
}

function startGpsWorkerHeartbeat(onSuccessCallback) {
  stopGpsWorkerHeartbeat();

  try {
    const workerScript = `
      let timer = null;
      self.onmessage = function(e) {
        if (e.data === 'start') {
          if (timer) clearInterval(timer);
          timer = setInterval(function() {
            self.postMessage('tick');
          }, 3500);
        } else if (e.data === 'stop') {
          if (timer) clearInterval(timer);
          timer = null;
        }
      };
    `;
    const blob = new Blob([workerScript], { type: 'application/javascript' });
    const workerUrl = URL.createObjectURL(blob);
    gpsHeartbeatWorker = new Worker(workerUrl);
    gpsHeartbeatWorker.onmessage = function(e) {
      if (e.data === 'tick' && isTrackingGps) {
        const now = Date.now();
        const lastTime = lastGpsTimestamp || 0;

        // Interrogation matérielle GPS si aucun point récent (< 7s)
        if (now - lastTime >= 7000 && navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            onSuccessCallback,
            (err) => { console.warn('[GPS Worker Heartbeat] Refresh matériel passif:', err ? err.code : 'err'); },
            { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
          );
        }

        // Maintien Audio
        if (audioContextKeeper && audioContextKeeper.state === 'suspended') {
          audioContextKeeper.resume().catch(() => {});
        }
        if (silentAudioKeeper && silentAudioKeeper.paused) {
          silentAudioKeeper.play().catch(() => {});
        }

        // Gardien WakeLock
        if (document.visibilityState === 'visible' && !navScreenWakeLock) {
          requestNavWakeLock();
        }
      }
    };
    gpsHeartbeatWorker.postMessage('start');
  } catch (e) {
    console.warn('[GPS Worker Heartbeat] Fallback watchdog standard:', e);
  }

  // Fallback thread principal à 7000ms
  startGpsForcedWatchdog(onSuccessCallback);
}

function startGpsForcedWatchdog(onSuccessCallback) {
  if (gpsForcedInterval) clearInterval(gpsForcedInterval);

  gpsForcedInterval = setInterval(() => {
    if (isTrackingGps && navigator.geolocation) {
      const now = Date.now();
      const lastTime = lastGpsTimestamp || 0;
      if (now - lastTime >= 7000) {
        navigator.geolocation.getCurrentPosition(
          onSuccessCallback,
          (e) => { console.warn('[GPS Watchdog] Polling passif:', e ? e.code : 'err'); },
          { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
        );
      }
    }
  }, 7000);
}

function stopGpsForcedWatchdog() {
  if (gpsForcedInterval) {
    clearInterval(gpsForcedInterval);
    gpsForcedInterval = null;
  }
}

let navScreenWakeLock = null;
let isWakeLockRequested = false;

async function requestNavWakeLock() {
  isWakeLockRequested = true;
  if ('wakeLock' in navigator) {
    try {
      if (navScreenWakeLock && !navScreenWakeLock.released) return;
      navScreenWakeLock = await navigator.wakeLock.request('screen');
      navScreenWakeLock.addEventListener('release', () => {
        navScreenWakeLock = null;
        if (isWakeLockRequested && (isGpsNavActive || isTrackingGps) && document.visibilityState === 'visible') {
          setTimeout(requestNavWakeLock, 500);
        }
      });
      console.log('[GPS Engine] WakeLock écran actif');
    } catch (e) {
      console.warn('[GPS Engine] WakeLock non activé:', e);
    }
  }
}

function releaseNavWakeLock() {
  isWakeLockRequested = false;
  if (navScreenWakeLock) {
    try { navScreenWakeLock.release(); } catch (e) {}
    navScreenWakeLock = null;
  }
}

function stopGpsWatch() {
  isTrackingGps = false;
  if (liveGpsWatchId !== null) {
    try { navigator.geolocation.clearWatch(liveGpsWatchId); } catch(e) {}
    liveGpsWatchId = null;
    gpsWatchId = null;
  }
  stopGpsWorkerHeartbeat();
  releaseNavWakeLock();
  stopBackgroundKeepAlive();
}

function stopLiveGpsWatch() {
  stopGpsWatch();
}

function formatGeolocationErrorMessage(err) {
  const code = err && err.code;
  const lang = currentLang || 'fr';
  const tr = t();
  const enterCityLabel = tr.actionEnterCity || 'Saisir ma ville';
  const actionBtn = ` <a href="javascript:void(0)" onclick="const inp=document.getElementById('input-start')||document.getElementById('start-input');if(inp){inp.focus();inp.click();}" style="color:#93c5fd;text-decoration:underline;font-weight:700;margin-left:6px;cursor:pointer;">${enterCityLabel}</a>`;
  if (code === 1) { // PERMISSION_DENIED
    if (lang === 'nl') return "📍 Locatie geblokkeerd: tik op het 🔒-pictogram links van fuelcopilot.fr en kies 'Precieze locatie'." + actionBtn;
    if (lang === 'de') return "📍 Standort blockiert: Tippen Sie auf das 🔒-Symbol links neben fuelcopilot.fr und wählen Sie 'Genaue Position'." + actionBtn;
    if (lang === 'en') return "📍 Location blocked: tap the 🔒 icon left of fuelcopilot.fr and ensure 'Precise location' is ON." + actionBtn;
    if (lang === 'it') return "📍 Posizione bloccata: tocca l'icona 🔒 a sinistra di fuelcopilot.fr e attiva 'Posizione precisa'." + actionBtn;
    if (lang === 'es') return "📍 Ubicación bloqueada: toca el icono 🔒 a la izquierda de fuelcopilot.fr y activa 'Ubicación precisa'." + actionBtn;
    if (lang === 'pt') return "📍 Localização bloqueada: toque no ícone 🔒 à esquerda de fuelcopilot.fr e ative 'Localização precisa'." + actionBtn;
    if (lang === 'sl') return "📍 Lokacija blokirana: dotaknite se ikone 🔒 levo od fuelcopilot.fr in omogočite 'Natančna lokacija'." + actionBtn;
    if (lang === 'hr') return "📍 Lokacija blokirana: dodirnite ikonu 🔒 lijevo od fuelcopilot.fr i omogućite 'Točna lokacija'." + actionBtn;
    return "📍 Position bloquée : touchez l'icône 🔒 à gauche de fuelcopilot.fr et vérifiez que 'Position' est autorisée." + actionBtn;
  } else if (code === 2) { // POSITION_UNAVAILABLE
    if (lang === 'nl') return "📍 Gps-signaal niet beschikbaar: activeer 'Locatie' in het snelmenu van uw telefoon." + actionBtn;
    if (lang === 'de') return "📍 Kein GPS-Signal: Bitte 'Standort' im Schnelleinstellungs-Menü aktivieren." + actionBtn;
    if (lang === 'en') return "📍 GPS unavailable: please turn on 'Location' in your phone's top swipe-down menu." + actionBtn;
    if (lang === 'it') return "📍 Segnale GPS non disponibile: attiva 'Posizione' nel menu a discesa del telefono." + actionBtn;
    if (lang === 'es') return "📍 Señal GPS no disponible: activa 'Ubicación' en el menú superior del teléfono." + actionBtn;
    if (lang === 'pt') return "📍 Sinal GPS indisponível: ative 'Localização' no menu rápido do seu telemóvel." + actionBtn;
    if (lang === 'sl') return "📍 GPS signal ni na voljo: vklopite 'Lokacija' v hitrem meniju telefona." + actionBtn;
    if (lang === 'hr') return "📍 GPS signal nije dostupan: uključite 'Lokacija' u brzom izborniku telefona." + actionBtn;
    return "📍 Signal GPS indisponible : activez 'Position' dans le volet du haut de votre téléphone." + actionBtn;
  }
  return (tr.locationError || "Signal GPS en cours d'acquisition.") + actionBtn;
}

// ============================================================================
// ARCHITECTURE GPS & SUIVI RANDOTRACKER PUR
// ============================================================================

/**
 * Calcul dynamique et progression kilométrique continue sur l'itinéraire actif
 * Permet de suivre le véhicule sur l'autoroute sans restriction bloquante
 */
function updateUserProgressionOnRoute(latitude, longitude) {
  if (!activeRouteData || !activeRouteData.geometry || !activeRouteData.geometry.coordinates) return;
  const routeCoords = activeRouteData.geometry.coordinates; // [[lon, lat], ...]
  ensureRouteDistances(activeRouteData);
  const segDistances = activeRouteData._segDistances;
  const cumDistances = activeRouteData._cumDistances;

  let minDist = 99999;
  let currentKm = 0;

  for (let i = 0; i < routeCoords.length - 1; i++) {
    const p1 = routeCoords[i];
    const p2 = routeCoords[i+1];
    const segLen = segDistances ? segDistances[i] : getDistanceKm(p1[1], p1[0], p2[1], p2[0]);
    const res = distPointToSegment(longitude, latitude, p1[0], p1[1], p2[0], p2[1]);
    if (res.dist < minDist) {
      minDist = res.dist;
      const baseKm = cumDistances ? cumDistances[i] : 0;
      currentKm = baseKm + (res.t * segLen);
    }
  }

  // Corridor d'autoroute étendu (jusqu'à 3 km)
  if (minDist <= 3.0) {
    if (userProgressionKmOnRoute === 0) {
      userProgressionKmOnRoute = Math.max(0, currentKm);
    } else {
      // Progression monotone : ne recule pas lors des imprécisions GPS, avance dès que le véhicule se déplace
      if (currentKm >= userProgressionKmOnRoute - 0.5) {
        userProgressionKmOnRoute = Math.max(userProgressionKmOnRoute, currentKm);
      }
    }

    // Mise à jour dynamique du tracé (parcouru vs restant) et des décomptes des stations à venir
    updateActiveRoutePolylines();
    renderCurrentRouteStations();
  }
}

/**
 * Démarrage du flux de géolocalisation GPS continu (Architecture RandoTracker pure)
 */
function startGpsWatch(useHighAccuracy = true) {
  if (!navigator.geolocation) {
    console.warn('[GPS Engine] navigator.geolocation non supporté');
    return;
  }

  // Nettoyage préalable de tout watcher actif (RandoTracker line 3910)
  if (liveGpsWatchId !== null) {
    try { navigator.geolocation.clearWatch(liveGpsWatchId); } catch(e) {}
    liveGpsWatchId = null;
    gpsWatchId = null;
  }

  isTrackingGps = true;

  const onPositionSuccess = (pos) => {
    if (!pos || !pos.coords) return;
    const now = Date.now();
    const lat = pos.coords.latitude;
    const lon = pos.coords.longitude;
    const acc = Math.round(pos.coords.accuracy || 15);
    const speed = (typeof pos.coords.speed === 'number' && !isNaN(pos.coords.speed) && pos.coords.speed >= 0)
      ? (pos.coords.speed * 3.6) // km/h
      : null;
    const heading = (typeof pos.coords.heading === 'number' && !isNaN(pos.coords.heading) && pos.coords.heading >= 0)
      ? pos.coords.heading
      : null;

    // Ignorer les erreurs aberrantes (> 25 000m)
    if (acc > 25000) return;

    lastGpsTimestamp = now;
    isTrackingGps = true;

    // Persistance de la dernière position (Architecture RandoTracker lines 3764-3767)
    try {
      localStorage.setItem('fuelpilot_last_lat', String(lat));
      localStorage.setItem('fuelpilot_last_lon', String(lon));
    } catch (e) {}

    userGpsPosition = {
      lat,
      lon,
      accuracy: acc,
      heading,
      speed,
      isHighAccuracy: (acc <= 150),
      isIpFallback: false,
      timestamp: now,
      city: (userGpsPosition && userGpsPosition.city) || ''
    };

    // 1. Mettre à jour en temps réel le marqueur GPS et le halo sur Leaflet
    updateUserGpsMarker(lat, lon, acc, false);

    // 2. Auto-centrage fluide au 1er fix (RandoTracker lines 3862-3867)
    if (!hasAutoCenteredGps) {
      if (map) {
        map.setView([lat, lon], acc <= 500 ? 16 : 14, { animate: true });
      }
      hasAutoCenteredGps = true;
      showToast(`🎯 Position GPS trouvée (±${acc}m)`, { isSuccess: true, duration: 3000 });
    }

    // 3. Suivi de caméra en direct si le guidage automatique est actif
    if (isGpsNavActive && isGpsAutoFollow && map) {
      safeMapPanTo(lat, lon);
    }

    // 4. Si l'utilisateur attendait le GPS pour définir le point de départ
    if (isWaitingGpsForStart) {
      isWaitingGpsForStart = false;
      applyGpsAsStartPoint(lat, lon, userGpsPosition.city || '');
      updateUserGpsMarker(lat, lon, acc, false);
      if (typeof updateAllClearButtons === 'function') updateAllClearButtons();
      showToast(`🎯 Position GPS validée comme point de départ (±${acc}m)`, { isSuccess: true, duration: 3000 });
    }

    // 5. Mise à jour kilométrique continue le long de l'itinéraire (RandoTracker track progress)
    if (activeRouteData) {
      updateUserProgressionOnRoute(lat, lon);
    }

    // 6. Reverse-géocodage non bloquant si la commune n'est pas encore renseignée
    if (!userGpsPosition.city) {
      reverseGeocodeCoords(lat, lon).then(city => {
        if (city && userGpsPosition) {
          userGpsPosition.city = city;
          if (userGpsMarker) updateUserGpsMarker(lat, lon, acc, false);
          const startInp = document.getElementById('input-start');
          if (startPoint && startPoint.label && startPoint.label.includes('Ma position actuelle') && startInp) {
            applyGpsAsStartPoint(lat, lon, city);
          }
        }
      }).catch(() => {});
    }

    // Arrêter le spinner du bouton "Me localiser"
    const btnLocate = document.getElementById('btn-locate-me');
    if (btnLocate) btnLocate.classList.remove('locating');
  };

  const onPositionError = (err) => {
    console.warn(`[GPS Engine] Erreur (highAcc=${useHighAccuracy}):`, err ? err.code : 'err', err ? err.message : '');

    // Architecture RandoTracker (lines 3878-3889) :
    // Ne pas tuer le suivi en cas de simple dépassement de délai (code 3)
    if (err && err.code === 3) {
      if (useHighAccuracy) {
        startGpsWatch(false);
      }
      return;
    }

    if (useHighAccuracy) {
      startGpsWatch(false);
      return;
    }

    // Arrêter le spinner de localisation
    const btnLocate = document.getElementById('btn-locate-me');
    if (btnLocate) btnLocate.classList.remove('locating');

    // N'afficher de notification d'erreur QUE si permission explicitement refusée (code 1)
    if (err && err.code === 1) {
      showToast(formatGeolocationErrorMessage(err), { isWarning: true, duration: 6000 });
    }
  };

  // 0. Acquisition réseau/Wi-Fi immédiate en parallèle au démarrage (indispensable en intérieur sur Android TWA)
  if (useHighAccuracy && !userGpsPosition) {
    try {
      navigator.geolocation.getCurrentPosition(
        onPositionSuccess,
        (e) => { console.warn('[GPS Engine] Fast network init:', e ? e.code : 'err'); },
        { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 }
      );
    } catch (e) {}
  }

  // 1. One-shot direct pour premier point avec maximumAge: 60000 (RandoTracker lines 3904-3908)
  try {
    navigator.geolocation.getCurrentPosition(onPositionSuccess, onPositionError, {
      enableHighAccuracy: useHighAccuracy,
      timeout: 10000,
      maximumAge: 60000 // RandoTracker line 3907 : retour immédiat du cache réseau/cellulaire sans latence
    });
  } catch (e) {
    console.warn('[GPS Engine] getCurrentPosition erreur:', e);
  }

  // 2. Flux continu watchPosition avec maximumAge: 5000 (RandoTracker lines 3913-3917)
  try {
    liveGpsWatchId = navigator.geolocation.watchPosition(onPositionSuccess, onPositionError, {
      enableHighAccuracy: useHighAccuracy,
      timeout: 12000,
      maximumAge: 5000 // RandoTracker line 3916 : flux régulier sans forcer le cold lock
    });
    gpsWatchId = liveGpsWatchId;
  } catch (e) {
    console.warn('[GPS Engine] watchPosition erreur:', e);
  }

  // 3. Activer le battement de cœur d'arrière-plan Web Worker 3.5s & Forçage matériel 7s (RandoTracker line 3920)
  startGpsWorkerHeartbeat(onPositionSuccess);

  // 4. Activer le maintien d'activité média système et WakeLock
  startBackgroundKeepAlive();
  if (isGpsNavActive) {
    requestNavWakeLock();
  }
}

function startLiveGpsWatch(forceRestart = false) {
  startGpsWatch(true);
}

function startBackgroundGpsWatch() {
  startGpsWatch(true);
}

function autoStartupGeolocation() {
  startGpsWatch(true);
}

// Gestion de la veille / réactivation immédiate lors du déverrouillage ou retour sur l'onglet
if (typeof document !== 'undefined' && document.addEventListener) {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      startGpsWatch(true);
      if (isGpsNavActive) {
        requestNavWakeLock();
      }
    }
  });
}

// Distance approximative entre une coordonnée et l'itinéraire actif
function getRouteDistKm(lat, lon) {
  if (!activeRouteData?.geometry?.coordinates) return null;
  const coords = activeRouteData.geometry.coordinates;
  let minD = 99999;
  const step = Math.max(1, Math.floor(coords.length / 60));
  for (let i = 0; i < coords.length; i += step) {
    const p = coords[i];
    const d = getDistanceKm(lat, lon, p[1], p[0]);
    if (d < minD) minD = d;
  }
  return minD;
}

/**
 * Géolocalisation directe active bi-mode (Réseau rapide + Satellite haute précision en parallèle)
 * Garantit un centrage instantané en intérieur (Android TWA / NETWORK_PROVIDER) comme en extérieur (GPS)
 */
async function geolocateCurrentLocation(onFoundCallback) {
  if (!navigator.geolocation) {
    showToast(t().locationError || "La géolocalisation n'est pas supportée par votre navigateur", { isError: true, duration: 4000 });
    return;
  }

  showToast(t().locating || "Recherche de votre position GPS...", { isInfo: true, duration: 3000 });

  const btnLocate = document.getElementById('btn-locate-me');
  if (btnLocate) btnLocate.classList.add('locating');

  let hasResolved = false;
  let failCount = 0;
  let lastErr = null;

  const handleSuccess = (pos, source) => {
    if (!pos || !pos.coords) return;
    const lat = pos.coords.latitude;
    const lon = pos.coords.longitude;
    const accuracy = Math.round(pos.coords.accuracy || 15);
    const now = Date.now();

    // Si déjà résolu avec une meilleure précision, ne pas écraser par un fix moins précis
    if (hasResolved && source === 'fast') return;
    if (hasResolved && source === 'high' && userGpsPosition && accuracy > (userGpsPosition.accuracy || 9999) + 20) return;

    const isFirstFix = !hasResolved;
    hasResolved = true;

    if (btnLocate) btnLocate.classList.remove('locating');

    isTrackingGps = true;
    lastGpsTimestamp = now;

    try {
      localStorage.setItem('fuelpilot_last_lat', String(lat));
      localStorage.setItem('fuelpilot_last_lon', String(lon));
    } catch (e) {}

    userGpsPosition = {
      lat,
      lon,
      accuracy,
      heading: pos.coords.heading,
      speed: (typeof pos.coords.speed === 'number' && !isNaN(pos.coords.speed) && pos.coords.speed >= 0) ? pos.coords.speed * 3.6 : null,
      isHighAccuracy: (accuracy <= 150),
      isIpFallback: false,
      timestamp: now,
      city: (userGpsPosition && userGpsPosition.city) || ''
    };

    // Cadrer immédiatement la carte sur la position
    if (map) {
      const targetZoom = (accuracy <= 500) ? Math.max(map.getZoom(), 16) : Math.max(map.getZoom(), 14);
      map.setView([lat, lon], targetZoom, { animate: true });
      hasAutoCenteredGps = true;
    }

    // Mettre à jour le marqueur GPS et le halo
    updateUserGpsMarker(lat, lon, accuracy, false);
    if (userGpsMarker) userGpsMarker.openTooltip();

    // Résoudre le nom de la commune / ville en tâche de fond
    reverseGeocodeCoords(lat, lon).then(city => {
      if (city && userGpsPosition) {
        userGpsPosition.city = city;
        if (userGpsMarker) updateUserGpsMarker(lat, lon, accuracy, false);
        const startInp = document.getElementById('input-start');
        if (startPoint && startPoint.label && startPoint.label.includes('Ma position actuelle') && startInp) {
          applyGpsAsStartPoint(lat, lon, city);
        }
      }
    }).catch(() => {});

    if (isFirstFix) {
      if (typeof onFoundCallback === 'function') {
        onFoundCallback(userGpsPosition);
      }
      showToast(`🎯 Position trouvée (±${accuracy}m)`, { isSuccess: true, duration: 3000 });
      if (liveGpsWatchId === null) {
        startGpsWatch(true);
      }
    }
  };

  const handleError = (err, source) => {
    failCount++;
    lastErr = err;
    console.warn(`[geolocateCurrentLocation:${source}] Erreur:`, err ? err.code : 'err', err ? err.message : '');

    // Ne signaler un échec que si les DEUX modes (réseau rapide + satellite) ont échoué
    if (failCount >= 2 && !hasResolved) {
      if (btnLocate) btnLocate.classList.remove('locating');
      const codeTag = (lastErr && lastErr.code) ? ` [code ${lastErr.code}]` : '';
      showToast(formatGeolocationErrorMessage(lastErr) + codeTag, { isWarning: true, duration: 7000 });
    }
  };

  // Mode 1 (Rapide / Réseau-WiFi / Android NETWORK_PROVIDER) : répond en < 300ms même en intérieur
  try {
    navigator.geolocation.getCurrentPosition(
      (pos) => handleSuccess(pos, 'fast'),
      (err) => handleError(err, 'fast'),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 }
    );
  } catch (e) {
    handleError(e, 'fast');
  }

  // Mode 2 (Haute précision / Satellite GPS) : affine la position au mètre près
  try {
    navigator.geolocation.getCurrentPosition(
      (pos) => handleSuccess(pos, 'high'),
      (err) => handleError(err, 'high'),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
    );
  } catch (e) {
    handleError(e, 'high');
  }
}

/**
 * Centrage de la carte sur la position de l'utilisateur (RandoTracker lines 3569-3578)
 */
function centerMapOnUser() {
  if (isGpsNavActive) {
    isGpsAutoFollow = true;
    updateLocateButtonNavState();
  }

  const isFresh = isTrackingGps && userGpsPosition && typeof userGpsPosition.lat === 'number' && typeof userGpsPosition.lon === 'number' && !isNaN(userGpsPosition.lat) && (Date.now() - (userGpsPosition.timestamp || 0) < 30000);

  if (isFresh) {
    const currentZoom = map ? map.getZoom() : 16;
    const targetZoom = (userGpsPosition.accuracy <= 500) ? Math.max(currentZoom, 16) : Math.max(currentZoom, 14);
    safeMapPanTo(userGpsPosition.lat, userGpsPosition.lon, targetZoom);
    updateUserGpsMarker(userGpsPosition.lat, userGpsPosition.lon, userGpsPosition.accuracy || 25, false);
    if (userGpsMarker) userGpsMarker.openTooltip();

    const rDist = getRouteDistKm(userGpsPosition.lat, userGpsPosition.lon);
    if (rDist !== null && rDist > 10) {
      showToast(`🎯 Position centrée (${userGpsPosition.city || 'locale'}) • Itinéraire à ${Math.round(rDist)} km`, { isInfo: true, duration: 3500 });
    } else {
      showToast(`🎯 Carte recentrée sur votre position`, { isInfo: true, duration: 2500 });
    }
  } else {
    // Acquisition active bi-mode (réseau rapide + GPS) et centrage immédiat
    geolocateCurrentLocation();
  }
}

function getCachedUserPosition() { return null; }
function saveCachedUserPosition() {}
function initPermanentGpsTracking() { startGpsWatch(true); }

function startGpsNavigation() {
  if (!activeRouteData) {
    alert(t().alertMissingPoints || "Veuillez d'abord calculer un itinéraire.");
    return;
  }

  if (!navigator.geolocation) {
    alert("La géolocalisation n'est pas supportée par votre navigateur.");
    return;
  }

  isGpsNavActive = true;
  isGpsAutoFollow = true;
  updateNavButtonUI();
  updateLocateButtonNavState();

  // Si on est sur l'onglet Liste, basculer immédiatement sur l'onglet Carte pour voir la conduite
  if (document.body.classList.contains('mobile-view-list') && typeof setMobileView === 'function') {
    setMobileView('map');
  }

  // Si une position récente existe
  if (userGpsPosition && map) {
    const rDist = (typeof getRouteDistKm === 'function') ? getRouteDistKm(userGpsPosition.lat, userGpsPosition.lon) : null;
    if (rDist !== null && rDist > 15) {
      // Conducteur distant de l'itinéraire : garder la vue globale de l'itinéraire
      needsFirstNavZoom = false;
      showToast(`📍 Suivi actif • Vous êtes à ${Math.round(rDist)} km de l'itinéraire`, { isInfo: true, duration: 4500 });
    } else {
      needsFirstNavZoom = false;
      safeMapPanTo(userGpsPosition.lat, userGpsPosition.lon, Math.max(map.getZoom(), 16));
      onGpsLocationUpdate(userGpsPosition);
    }
  } else {
    needsFirstNavZoom = true;
    showToast(t().locating || "📍 Recherche des satellites GPS...", { isInfo: true, duration: 3500 });
  }

  // Activer le watcher continu en direct
  startLiveGpsWatch(true);

  // Maintien actif de l'écran allumé pendant la conduite (WakeLock comme RandoTracker)
  requestNavWakeLock();

  // Rafraîchir immédiatement la liste des stations avec les décomptes kilométriques
  renderCurrentRouteStations();
}

function stopGpsNavigation() {
  isGpsNavActive = false;
  isGpsAutoFollow = false;
  userProgressionKmOnRoute = 0;
  releaseNavWakeLock();
  updateNavButtonUI();
  updateLocateButtonNavState();
  updateActiveRoutePolylines();
  renderCurrentRouteStations();
}

function onGpsLocationUpdate(coords) {
  if (!coords) return;
  const latitude = coords.latitude ?? coords.lat;
  const longitude = coords.longitude ?? coords.lon;
  if (typeof latitude !== 'number' || typeof longitude !== 'number' || isNaN(latitude) || isNaN(longitude)) return;

  // 1. Mise à jour de la broche GPS sur la carte
  updateUserGpsMarker(latitude, longitude);

  // 2. Recentrage permanent fluide si le suivi automatique est engagé
  if (isGpsAutoFollow && map) {
    safeMapPanTo(latitude, longitude);
  }

  // 3. Mise à jour dynamique de la progression kilométrique sur l'axe routier
  if (activeRouteData) {
    updateUserProgressionOnRoute(latitude, longitude);
  }
}

// Exports globaux conformes à RandoTracker
window.geolocateCurrentLocation = geolocateCurrentLocation;
window.centerMapOnUser = centerMapOnUser;
window.startGpsWatch = startGpsWatch;
window.useCurrentGpsLocationAsStart = useCurrentGpsLocationAsStart;

function updateAllClearButtons() {
  document.querySelectorAll('.input-group').forEach(group => {
    const inp = group.querySelector('.address-input');
    const btn = group.querySelector('.btn-clear-input');
    if (inp && btn) {
      btn.style.display = inp.value.trim().length > 0 ? 'flex' : 'none';
    }
  });
}

import os
import re

APP_JS_PATH = r'C:\Users\lesda\.gemini\antigravity\scratch\essence-autoroute\app.js'
with open(APP_JS_PATH, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add PT to FUEL_LABELS_BY_COUNTRY
pt_fuel_labels = """  PT: {
    e10: 'Gasolina 95 Simples (E10)',
    gazole: 'Gasóleo Simples (B7)',
    sp98: 'Gasolina Especial 98 (E5)',
    sp95: 'Gasolina 95 Simples (E5)',
    e85: 'Bioetanol E85',
    gplc: 'GPL Auto',
    elec: '⚡ Elétrico (kWh)',
    all: 'Todos os combustíveis'
  },
  ES: {"""

if 'PT: {' not in content:
    content = content.replace('  ES: {', pt_fuel_labels, 1)

# 2. Add complete Portuguese translation dictionary `pt: { ... }` in I18N_DICT
# We insert it after `es: { ... }`
pt_dict = """  pt: {
    pageTitle: "FuelPilot • Combustível Autoestrada & Marcos PK",
    tagline: "Preços de combustível & áreas de serviço na autoestrada",
    privacy: "Privacidade",
    guide: "Guia",
    guideTitle: "Instruções & Guia de utilização",
    live: "Preços em tempo real",
    refreshTitle: "Atualizar o FuelCoPilot",
    sec1: "1. Escolha do itinerário",
    startPlaceholder: "Cidade ou local de partida...",
    endPlaceholder: "Cidade ou destino...",
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
    coverage: "Rede coberta: 🇫🇷 França • 🇩🇪 Alemanha • 🇧🇪 Bélgica • 🇳🇱 Países Baixos • 🇮🇹 Itália • 🇪🇸 Espanha • 🇵🇹 Portugal • 🇬🇧 Reino Unido",
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
  },"""

# Add countryPT and countryNL to existing language blocks if missing
# In fr:
if 'countryPT: "Portugal"' not in content:
    content = content.replace('countryBE: "Belgique",', 'countryBE: "Belgique",\n    countryPT: "Portugal",\n    countryNL: "Pays-Bas",')
    content = content.replace('countryBE: "Belgien",', 'countryBE: "Belgien",\n    countryPT: "Portugal",\n    countryNL: "Niederlande",')
    content = content.replace('countryBE: "Belgium",', 'countryBE: "Belgium",\n    countryPT: "Portugal",\n    countryNL: "Netherlands",')
    content = content.replace('countryBE: "Belgio",', 'countryBE: "Belgio",\n    countryPT: "Portogallo",\n    countryNL: "Paesi Bassi",')
    content = content.replace('countryBE: "België",', 'countryBE: "België",\n    countryPT: "Portugal",\n    countryNL: "Nederland",')
    content = content.replace('countryBE: "Bélgica",', 'countryBE: "Bélgica",\n    countryPT: "Portugal",\n    countryNL: "Países Baixos",')

# Insert pt dictionary before closing of I18N_DICT
if 'pt: {' not in content:
    target_pos = content.rfind('  }\n};')
    if target_pos != -1:
        content = content[:target_pos] + '  },\n' + pt_dict + '\n};' + content[target_pos + 6:]

# 3. Update translateCountryName
old_translate = """  if (n === 'belgique' || n === 'belgium' || n === 'belgio' || n === 'bélgica' || n === 'belgien' || n === 'belgië') return tr.countryBE;
  return rawName;"""

new_translate = """  if (n === 'belgique' || n === 'belgium' || n === 'belgio' || n === 'bélgica' || n === 'belgien' || n === 'belgië') return tr.countryBE;
  if (n === 'portugal' || n === 'portogallo') return tr.countryPT;
  if (n === 'pays-bas' || n === 'netherlands' || n === 'nederland' || n === 'paesi bassi' || n === 'países baixos' || n === 'niederlande') return tr.countryNL;
  return rawName;"""

content = content.replace(old_translate, new_translate)

# 4. Update renderCountryBadgesOnMap
old_badges = """  const countryLabels = [
    { coords: [46.6, 2.5], flag: '🇫🇷', name: tr.countryFR, count: tr.areasCount(438) },
    { coords: [51.1, 10.4], flag: '🇩🇪', name: tr.countryDE, count: tr.areasCount(218) },
    { coords: [50.55, 4.7], flag: '🇧🇪', name: tr.countryBE, count: tr.areasCount(76) },
    { coords: [42.6, 12.8], flag: '🇮🇹', name: tr.countryIT, count: tr.areasCount(615) },
    { coords: [40.2, -3.6], flag: '🇪🇸', name: tr.countryES, count: tr.areasCount(833) },
    { coords: [52.8, -1.8], flag: '🇬🇧', name: tr.countryGB, count: tr.areasCount(158) }
  ];"""

new_badges = """  const countryLabels = [
    { coords: [46.6, 2.5], flag: '🇫🇷', name: tr.countryFR, count: tr.areasCount(635) },
    { coords: [51.1, 10.4], flag: '🇩🇪', name: tr.countryDE, count: tr.areasCount(218) },
    { coords: [50.55, 4.7], flag: '🇧🇪', name: tr.countryBE, count: tr.areasCount(76) },
    { coords: [52.13, 5.29], flag: '🇳🇱', name: tr.countryNL, count: tr.areasCount(57) },
    { coords: [42.6, 12.8], flag: '🇮🇹', name: tr.countryIT, count: tr.areasCount(615) },
    { coords: [40.2, -3.6], flag: '🇪🇸', name: tr.countryES, count: tr.areasCount(833) },
    { coords: [39.5, -8.0], flag: '🇵🇹', name: tr.countryPT, count: tr.areasCount(65) },
    { coords: [52.8, -1.8], flag: '🇬🇧', name: tr.countryGB, count: tr.areasCount(158) }
  ];"""

content = content.replace(old_badges, new_badges)

# 5. Update desiredOrder in ensureLangBarOrder
old_order = "const desiredOrder = ['fr', 'be', 'de', 'it', 'es', 'en'];"
new_order = "const desiredOrder = ['fr', 'be', 'nl', 'de', 'it', 'es', 'pt', 'en'];"
content = content.replace(old_order, new_order)

# 6. Update getCountryFromCoordinates bounding boxes
old_bbox = """  // Bounding box fallbacks
  if (lat >= 36.0 && lat <= 43.8 && lon >= -9.3 && lon <= 3.3) return 'ES';"""

new_bbox = """  // Bounding box fallbacks
  if (lat >= 36.9 && lat <= 42.2 && lon >= -9.5 && lon <= -6.1) return 'PT';
  if (lat >= 50.7 && lat <= 53.6 && lon >= 3.3 && lon <= 7.2) return 'NL';
  if (lat >= 36.0 && lat <= 43.8 && lon >= -9.3 && lon <= 3.3) return 'ES';"""

content = content.replace(old_bbox, new_bbox)

# 7. Update langCountryMap
old_langmap = """  const langCountryMap = {
    fr: 'FR',
    es: 'ES',
    it: 'IT',
    de: 'DE',
    en: 'GB',
    nl: 'BE'
  };"""

new_langmap = """  const langCountryMap = {
    fr: 'FR',
    es: 'ES',
    it: 'IT',
    de: 'DE',
    en: 'GB',
    nl: 'NL',
    pt: 'PT',
    be: 'BE'
  };"""

content = content.replace(old_langmap, new_langmap)

# 8. Add Portuguese and Dutch key cities to BILINGUAL_CITIES_INDEX
new_cities = """  // Portugal
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
"""

if 'display: \'Lisboa (Lisbonne)\'' not in content:
    target_city = "const BILINGUAL_CITIES_INDEX = ["
    content = content.replace(target_city, target_city + "\n" + new_cities, 1)

# Write updated app.js
with open(APP_JS_PATH, 'w', encoding='utf-8') as f:
    f.write(content)

print("SUCCESS: app.js updated for PT and NL")

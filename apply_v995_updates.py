# -*- coding: utf-8 -*-
import os

WORKSPACE = r"C:\Users\lesda\.gemini\antigravity\scratch\essence-autoroute"
APP_JS = os.path.join(WORKSPACE, "app.js")
INDEX_HTML = os.path.join(WORKSPACE, "index.html")

def update_app_js():
    with open(APP_JS, "r", encoding="utf-8") as f:
        content = f.read()

    # 1. Update APP_VERSION
    assert "const APP_VERSION = '9.9.4';" in content, "APP_VERSION 9.9.4 not found"
    content = content.replace("const APP_VERSION = '9.9.4';", "const APP_VERSION = '9.9.5';")

    # 2. Update refRoutesTitle and refRoutesSub in AMENITY_TRANSLATIONS
    content = content.replace('refRoutesTitle: "32 Referenzrouten",', 'refRoutesTitle: "44 Referenzrouten",')
    content = content.replace('refRoutesSub: "4 Korridore pro Land (8 europäische Länder)",', 'refRoutesSub: "4 Korridore pro Land (11 europäische Länder)",')

    content = content.replace('refRoutesTitle: "32 Reference Routes",', 'refRoutesTitle: "44 Reference Routes",')
    content = content.replace('refRoutesSub: "4 corridors per country (8 European countries)",', 'refRoutesSub: "4 corridors per country (11 European countries)",')

    content = content.replace('refRoutesTitle: "32 Referentieroutes",', 'refRoutesTitle: "44 Referentieroutes",')
    content = content.replace('refRoutesSub: "4 corridors per land (8 Europese landen)",', 'refRoutesSub: "4 corridors per land (11 Europese landen)",')

    content = content.replace('refRoutesTitle: "32 Itinerari di riferimento",', 'refRoutesTitle: "44 Itinerari di riferimento",')
    content = content.replace('refRoutesSub: "4 corridoi per paese (8 paesi europei)",', 'refRoutesSub: "4 corridoi per paese (11 paesi europei)",')

    content = content.replace('refRoutesTitle: "32 Itinerarios de referencia",', 'refRoutesTitle: "44 Itinerarios de referencia",')
    content = content.replace('refRoutesSub: "4 corredores por país (8 países europeos)",', 'refRoutesSub: "4 corredores por país (11 países europeos)",')

    content = content.replace('refRoutesTitle: "32 Itinéraires de référence",', 'refRoutesTitle: "44 Itinéraires de référence",')
    content = content.replace('refRoutesSub: "4 corridors par pays (8 pays d\'Europe)",', 'refRoutesSub: "4 corridors par pays (11 pays d\'Europe)",')

    content = content.replace('refRoutesTitle: "32 Itinerários de referência",', 'refRoutesTitle: "44 Itinerários de referência",')
    content = content.replace('refRoutesSub: "4 corredores por país (8 países europeus)",', 'refRoutesSub: "4 corredores por país (11 países europeus)",')

    # 3. Update coverage strings in I18N_DICT
    old_cov_fr = 'coverage: "Réseau couvert : 🇫🇷 France • 🇩🇪 Allemagne • 🇧🇪 Belgique • 🇮🇹 Italie • 🇪🇸 Espagne • 🇬🇧 Royaume-Uni • 🇵🇹 Portugal • 🇳🇱 Pays-Bas",'
    new_cov_fr = 'coverage: "Réseau couvert : 🇫🇷 France • 🇩🇪 Allemagne • 🇧🇪 Belgique • 🇮🇹 Italie • 🇪🇸 Espagne • 🇬🇧 Royaume-Uni • 🇵🇹 Portugal • 🇳🇱 Pays-Bas • 🇱🇺 Luxembourg • 🇦🇹 Autriche • 🇨🇭 Suisse",'
    content = content.replace(old_cov_fr, new_cov_fr)

    old_cov_de = 'coverage: "Abgedecktes Netz: 🇫🇷 Frankreich • 🇩🇪 Deutschland • 🇧🇪 Belgien • 🇮🇹 Italien • 🇪🇸 Spanien • 🇬🇧 Vereinigtes Königreich • 🇵🇹 Portugal • 🇳🇱 Niederlande",'
    new_cov_de = 'coverage: "Abgedecktes Netz: 🇫🇷 Frankreich • 🇩🇪 Deutschland • 🇧🇪 Belgien • 🇮🇹 Italien • 🇪🇸 Spanien • 🇬🇧 Vereinigtes Königreich • 🇵🇹 Portugal • 🇳🇱 Niederlande • 🇱🇺 Luxemburg • 🇦🇹 Österreich • 🇨🇭 Schweiz",'
    content = content.replace(old_cov_de, new_cov_de)

    old_cov_en = 'coverage: "Covered network: 🇫🇷 France • 🇩🇪 Germany • 🇧🇪 Belgium • 🇮🇹 Italy • 🇪🇸 Spain • 🇬🇧 United Kingdom • 🇵🇹 Portugal • 🇳🇱 Netherlands",'
    new_cov_en = 'coverage: "Covered network: 🇫🇷 France • 🇩🇪 Germany • 🇧🇪 Belgium • 🇮🇹 Italy • 🇪🇸 Spain • 🇬🇧 United Kingdom • 🇵🇹 Portugal • 🇳🇱 Netherlands • 🇱🇺 Luxembourg • 🇦🇹 Austria • 🇨🇭 Switzerland",'
    content = content.replace(old_cov_en, new_cov_en)

    old_cov_it = 'coverage: "Rete coperta: 🇫🇷 Francia • 🇩🇪 Germania • 🇧🇪 Belgio • 🇮🇹 Italia • 🇪🇸 Spagna • 🇬🇧 Regno Unito • 🇵🇹 Portogallo • 🇳🇱 Paesi Bassi",'
    new_cov_it = 'coverage: "Rete coperta: 🇫🇷 Francia • 🇩🇪 Germania • 🇧🇪 Belgio • 🇮🇹 Italia • 🇪🇸 Spagna • 🇬🇧 Regno Unito • 🇵🇹 Portogallo • 🇳🇱 Paesi Bassi • 🇱🇺 Lussemburgo • 🇦🇹 Austria • 🇨🇭 Svizzera",'
    content = content.replace(old_cov_it, new_cov_it)

    old_cov_nl = 'coverage: "Gedekt netwerk: 🇫🇷 Frankrijk • 🇩🇪 Duitsland • 🇧🇪 België • 🇮🇹 Italië • 🇪🇸 Spanje • 🇬🇧 Verenigd Koninkrijk • 🇵🇹 Portugal • 🇳🇱 Nederland",'
    new_cov_nl = 'coverage: "Gedekt netwerk: 🇫🇷 Frankrijk • 🇩🇪 Duitsland • 🇧🇪 België • 🇮🇹 Italië • 🇪🇸 Spanje • 🇬🇧 Verenigd Koninkrijk • 🇵🇹 Portugal • 🇳🇱 Nederland • 🇱🇺 Luxemburg • 🇦🇹 Oostenrijk • 🇨🇭 Zwitserland",'
    content = content.replace(old_cov_nl, new_cov_nl)

    old_cov_es = 'coverage: "Red cubierta: 🇫🇷 Francia • 🇩🇪 Alemania • 🇧🇪 Bélgica • 🇮🇹 Italia • 🇪🇸 España • 🇬🇧 Reino Unido • 🇵🇹 Portugal • 🇳🇱 Países Bajos",'
    new_cov_es = 'coverage: "Red cubierta: 🇫🇷 Francia • 🇩🇪 Alemania • 🇧🇪 Bélgica • 🇮🇹 Italia • 🇪🇸 España • 🇬🇧 Reino Unido • 🇵🇹 Portugal • 🇳🇱 Países Bajos • 🇱🇺 Luxemburgo • 🇦🇹 Austria • 🇨🇭 Suiza",'
    content = content.replace(old_cov_es, new_cov_es)

    old_cov_pt = 'coverage: "Rede coberta: 🇫🇷 França • 🇩🇪 Alemanha • 🇧🇪 Bélgica • 🇮🇹 Itália • 🇪🇸 Espanha • 🇬🇧 Reino Unido • 🇵🇹 Portugal • 🇳🇱 Países Baixos",'
    new_cov_pt = 'coverage: "Rede coberta: 🇫🇷 França • 🇩🇪 Alemanha • 🇧🇪 Bélgica • 🇮🇹 Itália • 🇪🇸 Espanha • 🇬🇧 Reino Unido • 🇵🇹 Portugal • 🇳🇱 Países Baixos • 🇱🇺 Luxemburgo • 🇦🇹 Áustria • 🇨🇭 Suíça",'
    content = content.replace(old_cov_pt, new_cov_pt)

    # 4. Add countryLU and countryAT in country dictionaries
    # FR:
    content = content.replace('countryNL: "Pays-Bas",', 'countryNL: "Pays-Bas",\n    countryLU: "Luxembourg",\n    countryAT: "Autriche",')
    # DE:
    content = content.replace('countryNL: "Niederlande",', 'countryNL: "Niederlande",\n    countryLU: "Luxemburg",\n    countryAT: "Österreich",')
    # EN:
    content = content.replace('countryNL: "Netherlands",', 'countryNL: "Netherlands",\n    countryLU: "Luxembourg",\n    countryAT: "Austria",')
    # IT:
    content = content.replace('countryNL: "Paesi Bassi",', 'countryNL: "Paesi Bassi",\n    countryLU: "Lussemburgo",\n    countryAT: "Austria",')
    # NL:
    content = content.replace('countryNL: "Nederland",', 'countryNL: "Nederland",\n    countryLU: "Luxemburg",\n    countryAT: "Oostenrijk",')
    # ES:
    content = content.replace('countryNL: "Países Bajos",', 'countryNL: "Países Bajos",\n    countryLU: "Luxemburgo",\n    countryAT: "Austria",')
    # PT:
    content = content.replace('countryNL: "Países Baixos",', 'countryNL: "Países Baixos",\n    countryLU: "Luxemburgo",\n    countryAT: "Áustria",')

    # 5. Update translateCountryName
    trans_snippet = """  if (n === 'portugal' || n === 'portogallo') return tr.countryPT;
  if (n === 'pays-bas' || n === 'netherlands' || n === 'nederland' || n === 'paesi bassi' || n === 'países baixos' || n === 'niederlande') return tr.countryNL;
  if (n === 'luxembourg' || n === 'luxemburg' || n === 'lussemburgo' || n === 'luxemburgo') return tr.countryLU;
  if (n === 'autriche' || n === 'austria' || n === 'österreich' || n === 'oostenrijk' || n === 'áustria') return tr.countryAT;"""
    content = content.replace(
        "  if (n === 'portugal' || n === 'portogallo') return tr.countryPT;\n  if (n === 'pays-bas' || n === 'netherlands' || n === 'nederland' || n === 'paesi bassi' || n === 'países baixos' || n === 'niederlande') return tr.countryNL;",
        trans_snippet
    )

    # 6. Update FUEL_LABELS_BY_COUNTRY
    fuel_labels_add = """  LU: {
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
  GB: {"""
    content = content.replace("  GB: {", fuel_labels_add)

    # 7. Update getDistinctCountryFuels
    content = content.replace(
        "if (pays === 'DE') return ['gazole', 'e10', 'sp95', 'sp98', 'gplc'];",
        "if (pays === 'DE' || pays === 'AT' || pays === 'LU') return ['gazole', 'e10', 'sp95', 'sp98', 'gplc'];\n  if (pays === 'CH') return ['gazole', 'sp95', 'sp98', 'gplc'];"
    )

    # 8. Update fuel-equiv-table in renderFuelInfoModal
    old_table_headers = """          <th>🇵🇹 ${tr.countryPT}</th>
          <th>🇳🇱 ${tr.countryNL}</th>
          <th>🇬🇧 ${tr.countryGB}</th>"""

    new_table_headers = """          <th>🇵🇹 ${tr.countryPT}</th>
          <th>🇳🇱 ${tr.countryNL}</th>
          <th>🇱🇺 ${tr.countryLU}</th>
          <th>🇦🇹 ${tr.countryAT}</th>
          <th>🇨🇭 ${tr.countryCH}</th>
          <th>🇬🇧 ${tr.countryGB}</th>"""
    content = content.replace(old_table_headers, new_table_headers)

    content = content.replace(
        """          <td><b>Gasolina 95 (E10)</b></td>
          <td><b>Euro 95 (E10)</b></td>
          <td><b>Unleaded (E10)</b></td>""",
        """          <td><b>Gasolina 95 (E10)</b></td>
          <td><b>Euro 95 (E10)</b></td>
          <td><b>Super 95 (E10)</b></td>
          <td><b>Super 95 (E10)</b></td>
          <td><b>Bleifrei 95 (E10)</b></td>
          <td><b>Unleaded (E10)</b></td>"""
    )
    content = content.replace(
        """          <td><b>Gasolina Simples 95</b></td>
          <td>Euro 95 (E5)</td>
          <td>Unleaded 95</td>""",
        """          <td><b>Gasolina Simples 95</b></td>
          <td>Euro 95 (E5)</td>
          <td>Super 95 (E5)</td>
          <td>Super 95</td>
          <td>Sans plomb 95</td>
          <td>Unleaded 95</td>"""
    )
    content = content.replace(
        """          <td><b>Gasóleo Simples (B7)</b></td>
          <td><b>Diesel (B7)</b></td>
          <td><b>Diesel (B7)</b></td>""",
        """          <td><b>Gasóleo Simples (B7)</b></td>
          <td><b>Diesel (B7)</b></td>
          <td><b>Diesel (B7)</b></td>
          <td><b>Diesel (B7)</b></td>
          <td><b>Diesel</b></td>
          <td><b>Diesel (B7)</b></td>"""
    )
    content = content.replace(
        """          <td><b>Gasolina Especial 98</b></td>
          <td><b>Super Plus 98 (E5)</b></td>
          <td><b>Super Unleaded (E5)</b></td>""",
        """          <td><b>Gasolina Especial 98</b></td>
          <td><b>Super Plus 98 (E5)</b></td>
          <td><b>Super 98 (E5)</b></td>
          <td><b>Super Plus (98)</b></td>
          <td><b>Super Plus 98</b></td>
          <td><b>Super Unleaded (E5)</b></td>"""
    )
    content = content.replace(
        """          <td><b>GPL Auto</b></td>
          <td><b>Autogas (LPG)</b></td>
          <td><b>LPG Autogas</b></td>""",
        """          <td><b>GPL Auto</b></td>
          <td><b>Autogas (LPG)</b></td>
          <td><b>GPL / Autogas</b></td>
          <td><b>Autogas (LPG)</b></td>
          <td><b>Autogas / GPL</b></td>
          <td><b>LPG Autogas</b></td>"""
    )
    content = content.replace(
        """          <td>Bioetanol E85</td>
          <td>Bio-ethanol E85</td>
          <td>Bioethanol E85</td>""",
        """          <td>Bioetanol E85</td>
          <td>Bio-ethanol E85</td>
          <td>Bioéthanol E85</td>
          <td>Bioethanol E85</td>
          <td>Bioethanol E85</td>
          <td>Bioethanol E85</td>"""
    )

    # 9. Currency formatting
    content = content.replace(
        "    const isUK = st.pays === 'GB';",
        "    const isUK = st.pays === 'GB';\n    const isCH = st.pays === 'CH' || st.devise === 'CHF';"
    )
    content = content.replace(
        """    const pinPriceDisplay = fuelPrice 
      ? (isElec 
          ? `${fuelPrice.toFixed(3)}${isUK ? '£' : '€'}/kWh` 
          : (isUK ? `£${fuelPrice.toFixed(3)}` : `${fuelPrice.toFixed(3)}€`)) 
      : unavailText;""",
        """    const pinPriceDisplay = fuelPrice 
      ? (isElec 
          ? `${fuelPrice.toFixed(3)}${isUK ? '£' : (isCH ? ' CHF' : '€')}/kWh` 
          : (isUK ? `£${fuelPrice.toFixed(3)}` : (isCH ? `${fuelPrice.toFixed(3)} CHF` : `${fuelPrice.toFixed(3)}€`))) 
      : unavailText;"""
    )

    content = content.replace(
        """  const formatPrice = (val) => {
    if (isElec) return isUK ? `${val.toFixed(3)} £/kWh` : `${val.toFixed(3)} €/kWh`;
    return isUK ? `£${val.toFixed(3)}` : `${val.toFixed(3)} €`;
  };""",
        """  const isCH = pays === 'CH';
  const formatPrice = (val) => {
    if (isElec) return isUK ? `${val.toFixed(3)} £/kWh` : (isCH ? `${val.toFixed(3)} CHF/kWh` : `${val.toFixed(3)} €/kWh`);
    return isUK ? `£${val.toFixed(3)}` : (isCH ? `${val.toFixed(3)} CHF` : `${val.toFixed(3)} €`);
  };"""
    )

    content = content.replace(
        """function renderPopupPrices(prices, featuredFuel, pays, maj) {
  const isUK = pays === 'GB';
  const isElec = featuredFuel === 'elec';
  const formatPrice = (val) => {
    if (isElec) return isUK ? `${val.toFixed(3)} £/kWh` : `${val.toFixed(3)} €/kWh`;
    return isUK ? `£${val.toFixed(3)}` : `${val.toFixed(3)} €`;
  };""",
        """function renderPopupPrices(prices, featuredFuel, pays, maj) {
  const isUK = pays === 'GB';
  const isCH = pays === 'CH';
  const isElec = featuredFuel === 'elec';
  const formatPrice = (val) => {
    if (isElec) return isUK ? `${val.toFixed(3)} £/kWh` : (isCH ? `${val.toFixed(3)} CHF/kWh` : `${val.toFixed(3)} €/kWh`);
    return isUK ? `£${val.toFixed(3)}` : (isCH ? `${val.toFixed(3)} CHF` : `${val.toFixed(3)} €`);
  };"""
    )

    # 10. Update REFERENCE_ROUTES_32 with LU, AT, CH using exact anchor
    target_nl_end = """    { dir: 'Nord-Ouest ➔ Sud-Est', icon: '↘️', label: 'Alkmaar ➔ Eindhoven', start: 'Alkmaar', startCoords: [4.7593, 52.6324], end: 'Eindhoven', endCoords: [5.4697, 51.4416], motorway: 'A9 • A2', desc: 'Hollande-Septentrionale vers Brainport' },
  ]
};"""

    replacement_nl_with_lu_at_ch = """    { dir: 'Nord-Ouest ➔ Sud-Est', icon: '↘️', label: 'Alkmaar ➔ Eindhoven', start: 'Alkmaar', startCoords: [4.7593, 52.6324], end: 'Eindhoven', endCoords: [5.4697, 51.4416], motorway: 'A9 • A2', desc: 'Hollande-Septentrionale vers Brainport' },
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
  ]
};"""

    assert target_nl_end in content, "target_nl_end not found in app.js!"
    content = content.replace(target_nl_end, replacement_nl_with_lu_at_ch)

    # 11. Add REFERENCE_ROUTES_44 alias
    content = content.replace(
        "window.REFERENCE_ROUTES_32 = REFERENCE_ROUTES_32;",
        "window.REFERENCE_ROUTES_32 = REFERENCE_ROUTES_32;\nwindow.REFERENCE_ROUTES_44 = REFERENCE_ROUTES_32;"
    )

    with open(APP_JS, "w", encoding="utf-8") as f:
        f.write(content)

    print("Successfully updated app.js to v9.9.5 with exact literal replacements!")

def update_index_html():
    with open(INDEX_HTML, "r", encoding="utf-8") as f:
        content = f.read()

    # 1. Update version badge
    content = content.replace("v9.9.4", "v9.9.5")
    content = content.replace("Version 9.9.4", "Version 9.9.5")

    # 2. Add LU, AT, CH buttons in ref-country-tabs if not already present
    if 'data-ref-country="LU"' not in content:
        old_tabs = """                <button type="button" class="ref-tab-btn" data-ref-country="PT" title="Portugal">🇵🇹 PT</button>
                <button type="button" class="ref-tab-btn" data-ref-country="NL" title="Pays-Bas">🇳🇱 NL</button>
              </div>"""

        new_tabs = """                <button type="button" class="ref-tab-btn" data-ref-country="PT" title="Portugal">🇵🇹 PT</button>
                <button type="button" class="ref-tab-btn" data-ref-country="NL" title="Pays-Bas">🇳🇱 NL</button>
                <button type="button" class="ref-tab-btn" data-ref-country="LU" title="Luxembourg">🇱🇺 LU</button>
                <button type="button" class="ref-tab-btn" data-ref-country="AT" title="Autriche">🇦🇹 AT</button>
                <button type="button" class="ref-tab-btn" data-ref-country="CH" title="Suisse">🇨🇭 CH</button>
              </div>"""
        content = content.replace(old_tabs, new_tabs)

    with open(INDEX_HTML, "w", encoding="utf-8") as f:
        f.write(content)

    print("Successfully updated index.html to v9.9.5!")

if __name__ == "__main__":
    update_app_js()
    update_index_html()

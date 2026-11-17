# -*- coding: utf-8 -*-
import os

WORKSPACE = r"C:\Users\lesda\.gemini\antigravity\scratch\essence-autoroute"
APP_JS = os.path.join(WORKSPACE, "app.js")
INDEX_HTML = os.path.join(WORKSPACE, "index.html")
GUIDE_HTML = os.path.join(WORKSPACE, "guide.html")

def update_app_js():
    with open(APP_JS, "r", encoding="utf-8") as f:
        content = f.read()

    # 1. Bump version
    assert "const APP_VERSION = '9.9.5';" in content, "APP_VERSION 9.9.5 not found"
    content = content.replace("const APP_VERSION = '9.9.5';", "const APP_VERSION = '9.9.6';")

    # 2. Update 44 -> 52 in refRoutesTitle & refRoutesSub
    content = content.replace('refRoutesTitle: "44 Referenzrouten",', 'refRoutesTitle: "52 Referenzrouten",')
    content = content.replace('refRoutesSub: "4 Korridore pro Land (11 europäische Länder)",', 'refRoutesSub: "4 Korridore pro Land (13 europäische Länder)",')

    content = content.replace('refRoutesTitle: "44 Reference Routes",', 'refRoutesTitle: "52 Reference Routes",')
    content = content.replace('refRoutesSub: "4 corridors per country (11 European countries)",', 'refRoutesSub: "4 corridors per country (13 European countries)",')

    content = content.replace('refRoutesTitle: "44 Referentieroutes",', 'refRoutesTitle: "52 Referentieroutes",')
    content = content.replace('refRoutesSub: "4 corridors per land (11 Europese landen)",', 'refRoutesSub: "4 corridors per land (13 Europese landen)",')

    content = content.replace('refRoutesTitle: "44 Itinerari di riferimento",', 'refRoutesTitle: "52 Itinerari di riferimento",')
    content = content.replace('refRoutesSub: "4 corridoi per paese (11 paesi europei)",', 'refRoutesSub: "4 corridoi per paese (13 paesi europei)",')

    content = content.replace('refRoutesTitle: "44 Itinerarios de referencia",', 'refRoutesTitle: "52 Itinerarios de referencia",')
    content = content.replace('refRoutesSub: "4 corredores por país (11 países europeos)",', 'refRoutesSub: "4 corredores por país (13 países europeos)",')

    content = content.replace('refRoutesTitle: "44 Itinéraires de référence",', 'refRoutesTitle: "52 Itinéraires de référence",')
    content = content.replace('refRoutesSub: "4 corridors par pays (11 pays d\'Europe)",', 'refRoutesSub: "4 corridors par pays (13 pays d\'Europe)",')

    content = content.replace('refRoutesTitle: "44 Itinerários de referência",', 'refRoutesTitle: "52 Itinerários de referência",')
    content = content.replace('refRoutesSub: "4 corredores por país (11 países europeus)",', 'refRoutesSub: "4 corredores por país (13 países europeus)",')

    # Add sl and hr to AMENITY_TRANSLATIONS
    amenity_addition = """  sl: {
    refRoutesTitle: "52 Referenčnih poti",
    refRoutesSub: "4 koridorji na državo (13 evropskih držav)",
    refRoutesTest: "Preizkusi",

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
    refRoutesTitle: "52 Referentnih ruta",
    refRoutesSub: "4 koridora po državi (13 europskih država)",
    refRoutesTest: "Testiraj",

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
  de: {"""
    content = content.replace("  de: {", amenity_addition)

    # 3. Add countrySI and countryHR in I18N_DICT for all existing languages
    content = content.replace(
        'countryAT: "Autriche",',
        'countryAT: "Autriche",\n    countrySI: "Slovénie",\n    countryHR: "Croatie",'
    )
    content = content.replace(
        'countryAT: "Österreich",',
        'countryAT: "Österreich",\n    countrySI: "Slowenien",\n    countryHR: "Kroatien",'
    )
    content = content.replace(
        'countryAT: "Austria",',
        'countryAT: "Austria",\n    countrySI: "Slovenia",\n    countryHR: "Croatia",'
    )
    content = content.replace(
        'countryAT: "Oostenrijk",',
        'countryAT: "Oostenrijk",\n    countrySI: "Slovenië",\n    countryHR: "Kroatië",'
    )
    content = content.replace(
        'countryAT: "Áustria",',
        'countryAT: "Áustria",\n    countrySI: "Eslovénia",\n    countryHR: "Croácia",'
    )

    # Update coverage strings in I18N_DICT
    content = content.replace(
        '• 🇱🇺 Luxembourg • 🇦🇹 Autriche • 🇨🇭 Suisse"',
        '• 🇱🇺 Luxembourg • 🇦🇹 Autriche • 🇨🇭 Suisse • 🇸🇮 Slovénie • 🇭🇷 Croatie"'
    )
    content = content.replace(
        '• 🇱🇺 Luxemburg • 🇦🇹 Österreich • 🇨🇭 Schweiz"',
        '• 🇱🇺 Luxemburg • 🇦🇹 Österreich • 🇨🇭 Schweiz • 🇸🇮 Slowenien • 🇭🇷 Kroatien"'
    )
    content = content.replace(
        '• 🇱🇺 Luxembourg • 🇦🇹 Austria • 🇨🇭 Switzerland"',
        '• 🇱🇺 Luxembourg • 🇦🇹 Austria • 🇨🇭 Switzerland • 🇸🇮 Slovenia • 🇭🇷 Croatia"'
    )
    content = content.replace(
        '• 🇱🇺 Lussemburgo • 🇦🇹 Austria • 🇨🇭 Svizzera"',
        '• 🇱🇺 Lussemburgo • 🇦🇹 Austria • 🇨🇭 Svizzera • 🇸🇮 Slovenia • 🇭🇷 Croazia"'
    )
    content = content.replace(
        '• 🇱🇺 Luxemburg • 🇦🇹 Oostenrijk • 🇨🇭 Zwitserland"',
        '• 🇱🇺 Luxemburg • 🇦🇹 Oostenrijk • 🇨🇭 Zwitserland • 🇸🇮 Slovenië • 🇭🇷 Kroatië"'
    )
    content = content.replace(
        '• 🇱🇺 Luxemburgo • 🇦🇹 Austria • 🇨🇭 Suiza"',
        '• 🇱🇺 Luxemburgo • 🇦🇹 Austria • 🇨🇭 Suiza • 🇸🇮 Eslovenia • 🇭🇷 Croacia"'
    )
    content = content.replace(
        '• 🇱🇺 Luxemburgo • 🇦🇹 Áustria • 🇨🇭 Suíça"',
        '• 🇱🇺 Luxemburgo • 🇦🇹 Áustria • 🇨🇭 Suíça • 🇸🇮 Eslovénia • 🇭🇷 Croácia"'
    )

    # 4. Add SI and HR to FUEL_LABELS_BY_COUNTRY
    fuel_labels_add = """  SI: {
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
  LU: {"""
    content = content.replace("  LU: {", fuel_labels_add)

    # 5. Update getDistinctCountryFuels
    content = content.replace(
        "if (pays === 'CH') return ['gazole', 'sp95', 'sp98', 'gplc'];",
        "if (pays === 'CH' || pays === 'SI' || pays === 'HR') return ['gazole', 'sp95', 'sp98', 'gplc'];"
    )

    # 6. Update translateCountryName
    trans_addition = """  if (n === 'slovénie' || n === 'slovenia' || n === 'slovenija' || n === 'slowenien' || n === 'eslovenia' || n === 'eslovénia') return tr.countrySI;
  if (n === 'croatie' || n === 'croatia' || n === 'hrvatska' || n === 'kroatien' || n === 'croacia' || n === 'croazia') return tr.countryHR;
  return rawName;"""
    content = content.replace("  return rawName;", trans_addition)

    # 7. Update fuel-equiv-table headers and rows
    old_headers = """          <th>🇱🇺 ${tr.countryLU}</th>
          <th>🇦🇹 ${tr.countryAT}</th>
          <th>🇨🇭 ${tr.countryCH}</th>"""
    new_headers = """          <th>🇱🇺 ${tr.countryLU}</th>
          <th>🇦🇹 ${tr.countryAT}</th>
          <th>🇨🇭 ${tr.countryCH}</th>
          <th>🇸🇮 ${tr.countrySI}</th>
          <th>🇭🇷 ${tr.countryHR}</th>"""
    content = content.replace(old_headers, new_headers)

    # E10 row
    content = content.replace(
        """          <td><b>Bleifrei 95 (E10)</b></td>
          <td><b>Unleaded (E10)</b></td>""",
        """          <td><b>Bleifrei 95 (E10)</b></td>
          <td><b>Eurosuper 95 (E10)</b></td>
          <td><b>Eurosuper 95 (E10)</b></td>
          <td><b>Unleaded (E10)</b></td>"""
    )
    # E5 row
    content = content.replace(
        """          <td>Sans plomb 95</td>
          <td>Unleaded 95</td>""",
        """          <td>Sans plomb 95</td>
          <td>Eurosuper 95</td>
          <td>Eurosuper 95</td>
          <td>Unleaded 95</td>"""
    )
    # Diesel row
    content = content.replace(
        """          <td><b>Diesel</b></td>
          <td><b>Diesel (B7)</b></td>""",
        """          <td><b>Diesel</b></td>
          <td><b>Dizel (B7)</b></td>
          <td><b>Eurodiesel (B7)</b></td>
          <td><b>Diesel (B7)</b></td>"""
    )
    # SP98 row
    content = content.replace(
        """          <td><b>Super Plus 98</b></td>
          <td><b>Super Unleaded (E5)</b></td>""",
        """          <td><b>Super Plus 98</b></td>
          <td><b>Eurosuper 100</b></td>
          <td><b>Eurosuper 100</b></td>
          <td><b>Super Unleaded (E5)</b></td>"""
    )
    # LPG row
    content = content.replace(
        """          <td><b>Autogas / GPL</b></td>
          <td><b>LPG Autogas</b></td>""",
        """          <td><b>Autogas / GPL</b></td>
          <td><b>Avtoplin (LPG)</b></td>
          <td><b>Autoplin (LPG)</b></td>
          <td><b>LPG Autogas</b></td>"""
    )
    # E85 row
    content = content.replace(
        """          <td>Bioethanol E85</td>
          <td>Bioethanol E85</td>
        </tr>
      </tbody>""",
        """          <td>Bioethanol E85</td>
          <td>Bioetanol E85</td>
          <td>Bioetanol E85</td>
          <td>Bioethanol E85</td>
        </tr>
      </tbody>"""
    )

    # 8. Add desiredOrder in ensureLangBarOrder
    content = content.replace(
        "const desiredOrder = ['fr', 'be', 'nl', 'de', 'it', 'es', 'pt', 'en'];",
        "const desiredOrder = ['fr', 'be', 'nl', 'de', 'it', 'es', 'pt', 'sl', 'hr', 'en'];"
    )

    # 9. Add langCountryMap and centers
    content = content.replace(
        "const langCountryMap = { fr: 'FR', de: 'DE', it: 'IT', es: 'ES', en: 'GB', nl: 'NL', pt: 'PT', be: 'BE' };",
        "const langCountryMap = { fr: 'FR', de: 'DE', it: 'IT', es: 'ES', en: 'GB', nl: 'NL', pt: 'PT', be: 'BE', sl: 'SI', hr: 'HR' };"
    )
    content = content.replace(
        "            GB: [[52.8, -1.8], 6]\n          };",
        "            GB: [[52.8, -1.8], 6],\n            SI: [[46.15, 14.99], 8],\n            HR: [[45.1, 15.2], 7]\n          };"
    )

    # 10. Update REFERENCE_ROUTES_32 with SI and HR
    target_ch_end = """    { dir: 'Nord-Ouest ➔ Sud-Est', icon: '↘️', label: 'Basel ➔ Lugano', start: 'Basel', startCoords: [7.5886, 47.5596], end: 'Lugano', endCoords: [8.9511, 46.0037], motorway: 'A2 Gotthard', desc: 'Rhin vers Tessin' },
  ]
};"""

    replacement_ch_with_si_hr = """    { dir: 'Nord-Ouest ➔ Sud-Est', icon: '↘️', label: 'Basel ➔ Lugano', start: 'Basel', startCoords: [7.5886, 47.5596], end: 'Lugano', endCoords: [8.9511, 46.0037], motorway: 'A2 Gotthard', desc: 'Rhin vers Tessin' },
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
};"""
    assert target_ch_end in content, "target_ch_end not found!"
    content = content.replace(target_ch_end, replacement_ch_with_si_hr)

    # 11. Add REFERENCE_ROUTES_52 alias
    content = content.replace(
        "window.REFERENCE_ROUTES_44 = REFERENCE_ROUTES_32;",
        "window.REFERENCE_ROUTES_44 = REFERENCE_ROUTES_32;\nwindow.REFERENCE_ROUTES_52 = REFERENCE_ROUTES_32;"
    )

    with open(APP_JS, "w", encoding="utf-8") as f:
        f.write(content)
    print("Updated app.js with SI & HR support!")

def update_index_html():
    with open(INDEX_HTML, "r", encoding="utf-8") as f:
        content = f.read()

    # 1. Update version badge
    content = content.replace("v9.9.5", "v9.9.6")
    content = content.replace("Version 9.9.5", "Version 9.9.6")

    # 2. Add flags in header before en
    if 'data-lang="sl"' not in content:
        target_en_btn = """    <button type="button" class="lang-flag-btn" data-lang="en" title="English (UK)">"""
        flags_addition = """    <button type="button" class="lang-flag-btn" data-lang="sl" title="Slovenija • Slovenščina" aria-label="Slovenščina">
      <svg class="lang-flag-svg" viewBox="0 0 60 36" xmlns="http://www.w3.org/2000/svg">
        <rect width="60" height="12" fill="#FFFFFF"/>
        <rect y="12" width="60" height="12" fill="#0038A8"/>
        <rect y="24" width="60" height="12" fill="#ED1C24"/>
        <path d="M11,6 C11,6 9,14 14,16 C19,14 17,6 17,6 Z" fill="#0038A8" stroke="#ED1C24" stroke-width="0.8"/>
        <path d="M12,13 L14,9 L16,13 Z" fill="#FFFFFF"/>
      </svg>
    </button>

    <button type="button" class="lang-flag-btn" data-lang="hr" title="Hrvatska • Hrvatski" aria-label="Hrvatski">
      <svg class="lang-flag-svg" viewBox="0 0 60 36" xmlns="http://www.w3.org/2000/svg">
        <rect width="60" height="12" fill="#FF0000"/>
        <rect y="12" width="60" height="12" fill="#FFFFFF"/>
        <rect y="24" width="60" height="12" fill="#0000FF"/>
        <rect x="25" y="10" width="10" height="12" rx="1" fill="#FFFFFF" stroke="#0000FF" stroke-width="0.8"/>
        <rect x="25" y="10" width="2" height="2.4" fill="#FF0000"/>
        <rect x="29" y="10" width="2" height="2.4" fill="#FF0000"/>
        <rect x="33" y="10" width="2" height="2.4" fill="#FF0000"/>
        <rect x="27" y="12.4" width="2" height="2.4" fill="#FF0000"/>
        <rect x="31" y="12.4" width="2" height="2.4" fill="#FF0000"/>
        <rect x="25" y="14.8" width="2" height="2.4" fill="#FF0000"/>
        <rect x="29" y="14.8" width="2" height="2.4" fill="#FF0000"/>
        <rect x="33" y="14.8" width="2" height="2.4" fill="#FF0000"/>
        <rect x="27" y="17.2" width="2" height="2.4" fill="#FF0000"/>
        <rect x="31" y="17.2" width="2" height="2.4" fill="#FF0000"/>
      </svg>
    </button>

    <button type="button" class="lang-flag-btn" data-lang="en" title="English (UK)">"""
        assert target_en_btn in content, "target_en_btn not found!"
        content = content.replace(target_en_btn, flags_addition)

    # 3. Add SI and HR tabs in ref-country-tabs
    if 'data-ref-country="SI"' not in content:
        target_ch_tab = """                <button type="button" class="ref-tab-btn" data-ref-country="CH" title="Suisse">🇨🇭 CH</button>
              </div>"""
        tabs_addition = """                <button type="button" class="ref-tab-btn" data-ref-country="CH" title="Suisse">🇨🇭 CH</button>
                <button type="button" class="ref-tab-btn" data-ref-country="SI" title="Slovénie">🇸🇮 SI</button>
                <button type="button" class="ref-tab-btn" data-ref-country="HR" title="Croatie">🇭🇷 HR</button>
              </div>"""
        assert target_ch_tab in content, "target_ch_tab not found!"
        content = content.replace(target_ch_tab, tabs_addition)

    with open(INDEX_HTML, "w", encoding="utf-8") as f:
        f.write(content)
    print("Updated index.html with SI & HR flags and tabs!")

def update_guide_html():
    with open(GUIDE_HTML, "r", encoding="utf-8") as f:
        content = f.read()

    # 1. Update version badge in guide
    content = content.replace("v9.9 (Novembre 2026)", "v9.9.6 (Novembre 2026)")

    # 2. Add flags to switcher in guide.html
    if 'data-lang="sl"' not in content:
        target_switcher = """        <button type="button" class="lang-btn" data-lang="pt" title="Português">🇵🇹</button>
        <button type="button" class="lang-btn" data-lang="en" title="English">🇬🇧</button>"""
        switcher_addition = """        <button type="button" class="lang-btn" data-lang="pt" title="Português">🇵🇹</button>
        <button type="button" class="lang-btn" data-lang="sl" title="Slovenščina">🇸🇮</button>
        <button type="button" class="lang-btn" data-lang="hr" title="Hrvatski">🇭🇷</button>
        <button type="button" class="lang-btn" data-lang="en" title="English">🇬🇧</button>"""
        assert target_switcher in content, "target_switcher not found!"
        content = content.replace(target_switcher, switcher_addition)

    # 3. Add sl and hr in GUIDE_TEXTS
    if 'sl: {' not in content:
        guide_sl_hr = """    sl: {
      docTitle: "Navodila za uporabo & Vodnik • FuelCoPilot",
      headerTitle: "FuelCo<span>Pilot</span> • Navodila za uporabo",
      badgeVersion: "Uradni vodnik za uporabo • v9.9.6 (November 2026)",
      backBtn: "Nazaj v aplikacijo",
      privacyLink: "Pravilnik o zasebnosti",
      html: `
        <h2>🎯 1. Kaj je FuelCoPilot?</h2>
        <p><strong>FuelCoPilot</strong> je vaš pametni avtocestni sopotnik, zasnovan za resnične prihranke na vaših daljših potovanjih po Evropi. Ker se cene goriv na avtocestah lahko razlikujejo za več kot <strong>0,20 € do 0,35 € na liter</strong> od enega počivališča do drugega, vam FuelCoPilot omogoča načrtovanje točenja goriva brez stresa.</p>
        <div class="callout">
          <p>💡 <strong>Ali ste vedeli?</strong> Pri 50-litrskem rezervoarju lahko z izbiro pravega servisa na avtocesti prihranite med <strong>10 € in 18 €</strong> na posamezni poti!</p>
        </div>

        <h2>🚀 2. Glavne funkcije in uporaba po korakih</h2>
        <div class="features-grid">
          <div class="feature-card">
            <span class="feature-icon">🛣️</span>
            <div class="feature-title">1. Izračun poti A → B</div>
            <p class="feature-desc">Vnesite mesto odhoda in cilja s pametnim predvidevanjem vnosa. Dodajte neomejeno vmesnih postankov in primerjajte alternativne poti.</p>
          </div>
          <div class="feature-card">
            <span class="feature-icon">⛽</span>
            <div class="feature-title">2. Izbira goriva</div>
            <p class="feature-desc">Izberite svoje gorivo: Dizel (B7), Eurosuper 95 (E10/E5), Super Plus 98/100, Avtoplin (LPG) ali Elektrika (kWh). Cene se posodobijo v realnem času.</p>
          </div>
          <div class="feature-card">
            <span class="feature-icon">📍</span>
            <div class="feature-title">3. Postajališča v kronološkem vrstnem redu</div>
            <p class="feature-desc">Počivališča so razvrščena natančno po vrstnem redu na vaši poti s kilometrskimi oznakami in razdaljo od vaše trenutne lokacije.</p>
          </div>
          <div class="feature-card">
            <span class="feature-icon">🧭</span>
            <div class="feature-title">4. Navigacija z enim klikom</div>
            <p class="feature-desc">Z enim klikom odprite katero koli postajo neposredno v navigacijskih aplikacijah <strong>Waze</strong> ali <strong>Google Maps</strong>.</p>
          </div>
        </div>

        <h2>🌍 3. Pokrite države v Evropi (13 držav)</h2>
        <p>FuelCoPilot pokriva avtocestna omrežja v <strong>13 evropskih državah</strong>:</p>
        <p style="margin-top:8px;">🇫🇷 Francija • 🇩🇪 Nemčija • 🇧🇪 Belgija • 🇳🇱 Nizozemska • 🇮🇹 Italija • 🇪🇸 Španija • 🇵🇹 Portugalska • 🇬🇧 Združeno kraljestvo • 🇱🇺 Luksemburg • 🇦🇹 Avstrija • 🇨🇭 Švica • 🇸🇮 Slovenija • 🇭🇷 Hrvaška.</p>
      `
    },
    hr: {
      docTitle: "Upute za uporabu & Vodič • FuelCoPilot",
      headerTitle: "FuelCo<span>Pilot</span> • Upute za uporabu",
      badgeVersion: "Službeni vodič za uporabu • v9.9.6 (Studeni 2026)",
      backBtn: "Povratak na aplikaciju",
      privacyLink: "Politika privatnosti",
      html: `
        <h2>🎯 1. Što je FuelCoPilot?</h2>
        <p><strong>FuelCoPilot</strong> je vaš pametni kopilot na autocesti, osmišljen kako bi vam osigurao stvarne uštede na dugim putovanjima diljem Europe. Budući da se cijene goriva na autocestama mogu razlikovati za više od <strong>0,20 € do 0,35 € po litri</strong> od jednog odmorišta do drugog, FuelCoPilot vam omogućuje planiranje točenja bez stresa.</p>
        <div class="callout">
          <p>💡 <strong>Jeste li znali?</strong> Na punom spremniku od 50 litara, odabir prave postaje na autocesti omogućuje uštedu između <strong>10 € i 18 €</strong> na samo jednom putovanju!</p>
        </div>

        <h2>🚀 2. Glavne značajke i uporaba korak po korak</h2>
        <div class="features-grid">
          <div class="feature-card">
            <span class="feature-icon">🛣️</span>
            <div class="feature-title">1. Izračun rute A → B</div>
            <p class="feature-desc">Unesite polazište i odredište s prediktivnim unosom. Dodajte neograničen broj međutočaka i usporedite predložene alternativne rute.</p>
          </div>
          <div class="feature-card">
            <span class="feature-icon">⛽</span>
            <div class="feature-title">2. Odabir goriva</div>
            <p class="feature-desc">Odaberite željeno gorivo: Eurodiesel (B7), Eurosuper 95 (E10/E5), Eurosuper 100, Autoplin (LPG) ili Struja (kWh). Cijene se ažuriraju u stvarnom vremenu.</p>
          </div>
          <div class="feature-card">
            <span class="feature-icon">📍</span>
            <div class="feature-title">3. Odmorišta kronološkim redom</div>
            <p class="feature-desc">Benzinske postaje prikazane su točno prema redoslijedu nailaska na vašoj ruti s kilometarskim oznakama i udaljenošću od trenutne pozicije.</p>
          </div>
          <div class="feature-card">
            <span class="feature-icon">🧭</span>
            <div class="feature-title">4. Navigacija jednim klikom</div>
            <p class="feature-desc">Jednim dodirom pokrenite vožnju do odabranog odmorišta u aplikacijama <strong>Waze</strong> ili <strong>Google Maps</strong>.</p>
          </div>
        </div>

        <h2>🌍 3. Pokrivene europske zemlje (13 država)</h2>
        <p>FuelCoPilot pokriva autoceste u <strong>13 europskih zemalja</strong>:</p>
        <p style="margin-top:8px;">🇫🇷 Francuska • 🇩🇪 Njemačka • 🇧🇪 Belgija • 🇳🇱 Nizozemska • 🇮🇹 Italija • 🇪🇸 Španjolska • 🇵🇹 Portugal • 🇬🇧 Ujedinjeno Kraljevstvo • 🇱🇺 Luksemburg • 🇦🇹 Austrija • 🇨🇭 Švicarska • 🇸🇮 Slovenija • 🇭🇷 Hrvatska.</p>
      `
    },
    en: {"""
        assert "    en: {" in content, "en: { not found in guide.html!"
        content = content.replace("    en: {", guide_sl_hr)

    with open(GUIDE_HTML, "w", encoding="utf-8") as f:
        f.write(content)
    print("Updated guide.html with SI & HR translations!")

if __name__ == "__main__":
    update_app_js()
    update_index_html()
    update_guide_html()

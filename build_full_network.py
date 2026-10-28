import json
import urllib.request
import csv
import io
import re
import os

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
STATIONS_PATH = os.path.join(SCRIPT_DIR, 'stations_autoroute.json')
PAYS_PATH = os.path.join(SCRIPT_DIR, 'pays_couverts.json')

def clean_station_name(raw_name):
    t = raw_name.strip()
    # Remove internal ID prefixes like 26631_Eni
    t = re.sub(r'^\d{3,}_[a-zA-Z]+\s*', '', t)
    # Remove redundant "Area di Servizio" prefix if present
    t = re.sub(r'^area\s+di\s+servizio\s+', '', t, flags=re.IGNORECASE)
    # Title casing
    t = t.title()
    # Normalize common abbreviations
    t = re.sub(r'\bS\.s\b', 'SS', t)
    t = re.sub(r'\bS\.r\b', 'SR', t)
    t = re.sub(r'\bS\.p\b', 'SP', t)
    t = re.sub(r'\bS\.(\w)', r'S. \1', t) # S.Ilario -> S. Ilario
    return f"Area di Servizio {t}"

def extract_highway(addr, name):
    m_auto = re.search(r'\b(A-?\d{1,2}|A\d{3}|RA\d{1,2})\b', addr, re.IGNORECASE)
    if m_auto:
        return m_auto.group(1).upper().replace('-', '')
    
    m_t = re.search(r'\b(T-?[1-4])\b', addr, re.IGNORECASE)
    if m_t:
        return m_t.group(1).upper().replace('-', '')
        
    m_ss = re.search(r'\b(?:SS|S\.S\.|Statale)\s*(\d+[a-z]?)\b', addr, re.IGNORECASE)
    if m_ss:
        return f"SS{m_ss.group(1).upper()}"
        
    m_sr = re.search(r'\b(?:SR|S\.R\.|Strada Regionale)\s*(\d+[a-z]?)\b', addr, re.IGNORECASE)
    if m_sr:
        return f"SR{m_sr.group(1).upper()}"
        
    m_sp = re.search(r'\b(?:SP|S\.P\.|Provinciale)\s*(\d+[a-z]?)\b', addr, re.IGNORECASE)
    if m_sp:
        return f"SP{m_sp.group(1).upper()}"
        
    if re.search(r'tangenziale|tang\.le', addr, re.IGNORECASE):
        m_tcity = re.search(r'(?:tangenziale|tang\.le)\s*(?:di\s*)?([a-zA-Z]+)', addr, re.IGNORECASE)
        city = m_tcity.group(1).capitalize() if m_tcity else ''
        return f"Tangenziale {city}".strip()
        
    # Check in name
    m_name = re.search(r'\b(A\d{1,2}|SS\d+|RA\d+|T\d)\b', name, re.IGNORECASE)
    if m_name:
        return m_name.group(1).upper()
        
    return 'Autostrada'

def extract_direction(addr, name):
    # Check dir. XXX in address
    m_dir = re.search(r'\bdir\.?\s*([a-zA-ZÀ-ÿ]+)', addr, re.IGNORECASE)
    if m_dir:
        d = m_dir.group(1).lower()
        if d == 'ovest':
            return 'Sens Ouest'
        elif d == 'est':
            return 'Sens Est'
        elif d == 'nord':
            return 'Sens Nord'
        elif d == 'sud':
            return 'Sens Sud'
        elif d == 'interna':
            return 'Sens Intérieur'
        elif d == 'esterna':
            return 'Sens Extérieur'
        else:
            return f"Dir. {d.capitalize()}"
            
    # Check name
    n_low = name.lower()
    if 'ovest' in n_low:
        return 'Sens Ouest'
    elif 'est' in n_low:
        return 'Sens Est'
    elif 'nord' in n_low:
        return 'Sens Nord'
    elif 'sud' in n_low:
        return 'Sens Sud'
    elif 'interna' in n_low:
        return 'Sens Intérieur'
    elif 'esterna' in n_low:
        return 'Sens Extérieur'
        
    return ''

def fetch_and_build_italy():
    url = 'https://mappacarburanti.it/data/stazioni-italia.csv'
    print("Downloading Italian stations from mappacarburanti.it...")
    req = urllib.request.Request(url, headers={'User-Agent': 'FuelPilot-Italy/1.0'})
    with urllib.request.urlopen(req, timeout=30) as r:
        content = r.read().decode('utf-8', errors='ignore')

    reader = csv.DictReader(io.StringIO(content))
    raw_stations = {}

    for row in reader:
        addr = row.get('address', '')
        name = row.get('station_name', '')
        
        is_motorway = bool(
            re.search(r'\bautostrada\b|\baut\b|\braccordo\b|\btangenziale\b|\ba\d+\b', addr, re.IGNORECASE) or
            re.search(r'\best\b|\bovest\b|\bnord\b|\bsud\b', name, re.IGNORECASE) and 'km' in addr.lower()
        )
        
        if not is_motorway:
            continue
            
        sid = row['id_impianto']
        try:
            lat = float(row['lat'])
            lng = float(row['lng'])
        except (ValueError, KeyError):
            continue
            
        # Valid Italy bounding box
        if not (36.0 <= lat <= 47.5 and 6.0 <= lng <= 19.0):
            continue
            
        if sid not in raw_stations:
            raw_stations[sid] = {
                'id': sid,
                'name': name,
                'brand': row.get('brand', ''),
                'address': addr,
                'lat': lat,
                'lng': lng,
                'prices': {}
            }
            
        f_type = row.get('fuel_type', '').lower().strip()
        try:
            p = float(row.get('price', 0))
            if p > 0:
                raw_stations[sid]['prices'][f_type] = p
        except:
            pass

    print(f"Extracted {len(raw_stations)} Italian motorway service areas.")
    
    formatted_stations = []
    
    for sid, st in raw_stations.items():
        addr = st['address']
        raw_name = st['name']
        
        autoroute = extract_highway(addr, raw_name)
        sens = extract_direction(addr, raw_name)
        clean_name = clean_station_name(raw_name)
        
        # PK Borne
        m_pk = re.search(r'km\.?\s*(\d+)(?:[+.,]\d+)?', addr, re.IGNORECASE)
        pk_val = m_pk.group(1) if m_pk else ''
        pk_text = f"km {pk_val}" if pk_val else None
        
        # Brand normalization
        b = st['brand'].strip()
        b_low = b.lower()
        if 'eni' in b_low or 'agip' in b_low:
            brand_norm = 'Eni'
        elif 'ip' in b_low or 'api' in b_low:
            brand_norm = 'IP'
        elif 'q8' in b_low:
            brand_norm = 'Q8'
        elif 'esso' in b_low:
            brand_norm = 'Esso'
        elif 'tamoil' in b_low:
            brand_norm = 'Tamoil'
        elif 'sarni' in b_low:
            brand_norm = 'Sarni Oil'
        elif 'total' in b_low:
            brand_norm = 'TotalEnergies'
        elif 'repsol' in b_low:
            brand_norm = 'Repsol'
        elif 'bianche' in b_low or 'no logo' in b_low:
            brand_norm = 'Pompe Bianche'
        else:
            brand_norm = b.title()
            
        # Postal code & town
        parts = addr.split('-')
        commune = 'Italia'
        cp = ''
        if len(parts) > 1:
            last_part = parts[-1].strip()
            m_cp = re.search(r'\b(\d{5})\b,?\s*(.*)', last_part)
            if m_cp:
                cp = m_cp.group(1)
                c_cand = m_cp.group(2).strip().title()
                if len(c_cand) > 1:
                    commune = c_cand
            else:
                commune = last_part.title()
                
        # Prices
        prices = {}
        raw_p = st['prices']
        benzina = raw_p.get('benzina')
        gasolio = raw_p.get('gasolio')
        gpl = raw_p.get('gpl')
        metano = raw_p.get('metano')
        
        if benzina:
            prices['sp95'] = round(benzina, 3)
            prices['e10'] = round(benzina, 3)
        if gasolio:
            prices['gazole'] = round(gasolio, 3)
        if gpl:
            prices['gplc'] = round(gpl, 3)
        if metano:
            prices['metano'] = round(metano, 3)
            
        formatted_stations.append({
            'id': f"IT-{sid}",
            'pays': 'IT',
            'enseigne': brand_norm,
            'autoroute': autoroute,
            'nom': clean_name,
            'sens': sens,
            'adresse': addr,
            'ville': commune,
            'cp': cp,
            'departement': commune,
            'lat': round(st['lat'], 6),
            'lon': round(st['lng'], 6),
            'pk_text': pk_text,
            'prix': prices,
            'ruptures': [],
            'services': ['Boutique', 'Toilettes', 'Restauration']
        })
        
    # Deduplicate physical service areas (< 250m, same name and direction)
    import math
    def dist_m(s1, s2):
        R = 6371000
        dlat = math.radians(s2['lat'] - s1['lat'])
        dlon = math.radians(s2['lon'] - s1['lon'])
        a = math.sin(dlat/2)**2 + math.cos(math.radians(s1['lat'])) * math.cos(math.radians(s2['lat'])) * math.sin(dlon/2)**2
        return 2 * R * math.asin(math.sqrt(a))
        
    unique_stations = []
    skip_indices = set()
    for i, s1 in enumerate(formatted_stations):
        if i in skip_indices:
            continue
        for j in range(i + 1, len(formatted_stations)):
            if j in skip_indices:
                continue
            s2 = formatted_stations[j]
            if s1['nom'].lower().strip() == s2['nom'].lower().strip() and s1['sens'] == s2['sens'] and dist_m(s1, s2) < 250:
                skip_indices.add(j)
                # Merge prices, preferring lowest price (self-service)
                for f, p in s2['prix'].items():
                    if f not in s1['prix'] or p < s1['prix'][f]:
                        s1['prix'][f] = p
        unique_stations.append(s1)
        
    print(f"Deduplicated from {len(formatted_stations)} to {len(unique_stations)} physical stations.")
    return unique_stations

def update_pays_couverts(it_count):
    print("Updating pays_couverts.json with Italy polygon...")
    with open(PAYS_PATH, 'r', encoding='utf-8') as f:
        pays_data = json.load(f)
        
    # Check if IT already in features
    existing_codes = [f['properties'].get('code') for f in pays_data['features']]
    if 'IT' in existing_codes:
        print("Italy already in pays_couverts.json, updating count.")
        for f in pays_data['features']:
            if f['properties'].get('code') == 'IT':
                f['properties']['stationsCount'] = it_count
    else:
        # Fetch Italy feature from geo-countries
        print("Fetching Italy GeoJSON feature from geo-countries dataset...")
        url = 'https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson'
        req = urllib.request.Request(url, headers={'User-Agent': 'FuelPilot/1.0'})
        with urllib.request.urlopen(req, timeout=45) as r:
            all_countries = json.loads(r.read().decode('utf-8'))
            
        it_feat = None
        for f in all_countries['features']:
            p = f['properties']
            if p.get('ISO3166-1-Alpha-2') == 'IT':
                it_feat = f
                break
                
        if it_feat:
            it_feature_clean = {
                'type': 'Feature',
                'properties': {
                    'name': 'Italie',
                    'code': 'IT',
                    'flag': '🇮🇹',
                    'stationsCount': it_count,
                    'description': "Réseau autoroutier et prix en direct d'Italie (MIMIT / Osservaprezzi)"
                },
                'geometry': it_feat['geometry']
            }
            pays_data['features'].append(it_feature_clean)
            print("Appended Italy feature to pays_couverts.json")
        else:
            print("ERROR: Could not locate Italy in geo-countries dataset!")
            
    with open(PAYS_PATH, 'w', encoding='utf-8') as f:
        json.dump(pays_data, f, ensure_ascii=False)
    print("Saved pays_couverts.json successfully.")

def main():
    # 1. Fetch Italian stations
    it_stations = fetch_and_build_italy()
    print(f"Generated {len(it_stations)} valid Italian stations.")
    
    # 2. Load existing stations (France & Spain)
    with open(STATIONS_PATH, 'r', encoding='utf-8') as f:
        existing = json.load(f)
        
    # Filter out any prior IT stations to avoid duplication
    non_it = [s for s in existing if s.get('pays') != 'IT']
    print(f"Existing non-IT stations: {len(non_it)} (FR + ES)")
    
    # Merge
    combined = non_it + it_stations
    print(f"Total merged stations: {len(combined)}")
    
    with open(STATIONS_PATH, 'w', encoding='utf-8') as f:
        json.dump(combined, f, ensure_ascii=False, indent=2)
    print("Saved stations_autoroute.json successfully.")
    
    # 3. Update pays_couverts.json
    update_pays_couverts(len(it_stations))
    print("Network build complete!")

if __name__ == '__main__':
    main()

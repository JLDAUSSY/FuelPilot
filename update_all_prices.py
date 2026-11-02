import json
import urllib.request
import zipfile
import csv
import io
import os
import sys
import subprocess
import xml.etree.ElementTree as ET
from datetime import datetime

# Assure l'encodage UTF-8 sous Windows PowerShell / CMD sans crash Unicode
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8')

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
STATIONS_PATH = os.path.join(SCRIPT_DIR, 'stations_autoroute.json')

def safe_float(val):
    if not val:
        return None
    try:
        clean = str(val).strip().replace(',', '.')
        f = round(float(clean), 3)
        if 0.30 <= f <= 4.00:
            return f
    except (ValueError, TypeError):
        pass
    return None

# ==============================================================================
# 1. FRANCE (DGCCRF / roulez-eco.fr)
# ==============================================================================
def update_france(stations):
    print("\n--- [FRANCE] Début de l'actualisation ---")
    fr_map = {}
    total_fr = 0
    for st in stations:
        if st.get('pays') == 'FR':
            total_fr += 1
            sid = str(st.get('id', ''))
            fr_map[sid] = st
            if sid.isdigit():
                fr_map[str(int(sid))] = st
                fr_map[sid.zfill(8)] = st

    feed_url = 'https://donnees.roulez-eco.fr/opendata/instantane_ruptures'
    fuel_map = {
        'Gazole': 'gazole',
        'E10': 'e10',
        'SP98': 'sp98',
        'SP95': 'sp95',
        'E85': 'e85',
        'GPLc': 'gplc'
    }

    try:
        req = urllib.request.Request(feed_url, headers={'User-Agent': 'FuelPilot-Updater/1.0'})
        with urllib.request.urlopen(req, timeout=45) as resp:
            zip_bytes = resp.read()

        with zipfile.ZipFile(io.BytesIO(zip_bytes)) as z:
            xml_name = z.namelist()[0]
            with z.open(xml_name) as xml_f:
                tree = ET.parse(xml_f)
                root = tree.getroot()

        updated = 0
        now_str = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

        for pdv in root.findall('pdv'):
            pdv_id = str(pdv.attrib.get('id', ''))
            st = fr_map.get(pdv_id)
            if not st and pdv_id.isdigit():
                st = fr_map.get(str(int(pdv_id)))
            if not st:
                st = fr_map.get(pdv_id.zfill(8))
            if not st:
                continue

            new_prix = dict(st.get('prix') or {})
            found_any = False
            latest_maj = None
            for p in pdv.findall('prix'):
                nom = p.attrib.get('nom')
                val = p.attrib.get('valeur')
                maj_val = p.attrib.get('maj')
                if maj_val and (latest_maj is None or maj_val > latest_maj):
                    latest_maj = maj_val
                if nom in fuel_map and val:
                    p_flt = safe_float(val)
                    if p_flt:
                        new_prix[fuel_map[nom]] = p_flt
                        found_any = True

            new_ruptures = set()
            for r in pdv.findall('rupture'):
                nom = r.attrib.get('nom')
                fin = r.attrib.get('fin', '')
                if nom and (not fin or fin > now_str):
                    new_ruptures.add(nom)

            if found_any:
                st['prix'] = new_prix
                st['ruptures'] = sorted(list(new_ruptures))
                if latest_maj:
                    st['maj'] = latest_maj
                updated += 1

        print(f"France : {updated}/{total_fr} stations actualisées avec succès.")
        return updated
    except Exception as e:
        print(f"[AVERTISSEMENT France] prix conserves intacts : {e}")
        return 0

# ==============================================================================
# 2. ESPAGNE (MITECO - Ministerio para la Transición Ecológica)
# ==============================================================================
def update_spain(stations):
    print("\n--- [ESPAGNE] Début de l'actualisation ---")
    es_map = {}
    total_es = 0
    for st in stations:
        if st.get('pays') == 'ES':
            total_es += 1
            sid = str(st.get('id', ''))
            es_map[sid] = st

    url_es = 'https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PreciosCarburantes/EstacionesTerrestres/'
    
    try:
        # On tente via curl (ultra-fiable sur Windows & Linux pour MITECO) avec repli urllib
        raw_json = None
        try:
            res = subprocess.run(['curl', '-s', '--max-time', '45', url_es], capture_output=True, text=True, encoding='utf-8')
            if res.returncode == 0 and res.stdout and 'ListaEESSPrecio' in res.stdout:
                raw_json = res.stdout
        except Exception:
            pass

        if not raw_json:
            req = urllib.request.Request(url_es, headers={
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                'Accept': 'application/json'
            })
            with urllib.request.urlopen(req, timeout=45) as resp:
                raw_json = resp.read().decode('utf-8', errors='ignore')

        data = json.loads(raw_json)
        eess_list = data.get('ListaEESSPrecio', [])
        print(f"Espagne : flux national téléchargé ({len(eess_list)} stations au total).")

        fecha_feed = str(data.get('Fecha', '')).strip()
        fecha_iso = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        if fecha_feed and '/' in fecha_feed:
            try:
                parts = fecha_feed.split(' ')
                dp = parts[0].split('/')
                if len(dp) == 3:
                    time_part = parts[1] if len(parts) > 1 else '00:00:00'
                    fecha_iso = f"{dp[2]}-{dp[1]}-{dp[0]} {time_part}".strip()
            except Exception:
                pass

        updated = 0
        for item in eess_list:
            ideess = str(item.get('IDEESS', ''))
            sid = f"ES-{ideess}"
            st = es_map.get(sid)
            if not st:
                continue

            new_prix = dict(st.get('prix') or {})
            
            p_gazole = safe_float(item.get('Precio Gasoleo A'))
            p_sp95 = safe_float(item.get('Precio Gasolina 95 E5') or item.get('Precio Gasolina 95 E10'))
            p_sp98 = safe_float(item.get('Precio Gasolina 98 E5'))
            p_gplc = safe_float(item.get('Precio Gases licuados del petróleo'))

            if p_gazole: new_prix['gazole'] = p_gazole
            if p_sp95:
                new_prix['sp95'] = p_sp95
                new_prix['e10'] = p_sp95 # En Espagne l'essence standard 95 est compatible E10/E5
            if p_sp98: new_prix['sp98'] = p_sp98
            if p_gplc: new_prix['gplc'] = p_gplc

            if p_gazole or p_sp95 or p_sp98:
                st['prix'] = new_prix
                st['maj'] = fecha_iso
                updated += 1

        print(f"Espagne : {updated}/{total_es} stations d'autoroute actualisées avec succès.")
        return updated
    except Exception as e:
        print(f"[AVERTISSEMENT Espagne] prix conserves intacts : {e}")
        return 0

# ==============================================================================
# 3. ITALIE (MIMIT / MappaCarburanti)
# ==============================================================================
def update_italy(stations):
    print("\n--- [ITALIE] Debut de l'actualisation ---")
    it_map = {}
    total_it = 0
    for st in stations:
        if st.get('pays') == 'IT':
            total_it += 1
            sid = str(st.get('id', ''))
            it_map[sid] = st

    url_it = 'https://mappacarburanti.it/data/stazioni-italia.csv'
    
    try:
        req = urllib.request.Request(url_it, headers={'User-Agent': 'FuelPilot-Updater/1.0'})
        with urllib.request.urlopen(req, timeout=45) as resp:
            content = resp.read().decode('utf-8', errors='ignore')

        reader = csv.DictReader(io.StringIO(content))
        st_prices = {}
        st_maj = {}

        for row in reader:
            id_imp = row.get('id_impianto')
            if not id_imp:
                continue
            sid = f"IT-{id_imp}"
            if sid not in it_map:
                continue

            up_at = row.get('updated_at')
            if up_at and len(up_at) >= 16:
                clean_up = up_at[:19].replace('T', ' ')
                if sid not in st_maj or clean_up > st_maj[sid]:
                    st_maj[sid] = clean_up

            fuel_type = (row.get('fuel_type') or '').lower().strip()
            price_flt = safe_float(row.get('price'))
            if not price_flt:
                continue

            if sid not in st_prices:
                st_prices[sid] = {}

            if fuel_type == 'benzina':
                st_prices[sid]['sp95'] = price_flt
                st_prices[sid]['e10'] = price_flt
            elif fuel_type == 'gasolio':
                st_prices[sid]['gazole'] = price_flt
            elif fuel_type == 'gpl':
                st_prices[sid]['gplc'] = price_flt
            elif fuel_type == 'metano':
                st_prices[sid]['metano'] = price_flt

        updated = 0
        for sid, p_dict in st_prices.items():
            st = it_map.get(sid)
            if st and p_dict:
                current_p = dict(st.get('prix') or {})
                current_p.update(p_dict)
                st['prix'] = current_p
                if sid in st_maj:
                    st['maj'] = st_maj[sid]
                updated += 1

        print(f"Italie : {updated}/{total_it} stations d'autoroute actualisees avec succes.")
        return updated
    except Exception as e:
        print(f"[AVERTISSEMENT Italie] prix conserves intacts : {e}")
        return 0

# ==============================================================================
# MAIN & GARANTIE D'INTEGRITE
# ==============================================================================
def main():
    if not os.path.exists(STATIONS_PATH):
        print(f"Erreur fatale : {STATIONS_PATH} introuvable.")
        sys.exit(1)

    print(f"Chargement de la base {STATIONS_PATH}...")
    with open(STATIONS_PATH, 'r', encoding='utf-8') as f:
        stations = json.load(f)

    initial_count = len(stations)
    print(f"Nombre initial de stations : {initial_count}")

    # Execution securisee des trois pays
    fr_count = update_france(stations)
    es_count = update_spain(stations)
    it_count = update_italy(stations)

    # VERIFICATIONS STRICTES DE SECURITE (GARANTIE ZERO EFFET COLLATERAL)
    # 1. Le nombre total de stations doit rester strictement identique
    if len(stations) != initial_count:
        print(f"[ERREUR SECURITE] Le nombre de stations a change ({len(stations)} != {initial_count}) ! Annulation.")
        sys.exit(1)

    # 2. Verification des champs vitaux pour 100% des stations
    for s in stations:
        for req_field in ['id', 'nom', 'pays', 'lat', 'lon']:
            if req_field not in s or s[req_field] is None:
                print(f"[ERREUR SECURITE] Champ obligatoire '{req_field}' manquant pour {s.get('id')} ! Annulation.")
                sys.exit(1)

    # 3. Attribuer une date de verification par defaut aux stations qui n'en ont pas
    now_default = datetime.now().strftime('%Y-%m-%d %H:%M')
    for s in stations:
        if not s.get('maj'):
            s['maj'] = now_default

    # Sauvegarde securisee
    print(f"\n[SUCCES] Toutes les verifications de securite ont reussi.")
    print(f"Mises a jour validees : France: {fr_count}, Espagne: {es_count}, Italie: {it_count}")
    
    with open(STATIONS_PATH, 'w', encoding='utf-8') as f:
        json.dump(stations, f, ensure_ascii=False, indent=2)

    print(f"Base {STATIONS_PATH} sauvegardee avec succes.")

if __name__ == '__main__':
    main()

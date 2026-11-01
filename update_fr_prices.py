import json
import urllib.request
import zipfile
import io
import os
import sys
import xml.etree.ElementTree as ET
from datetime import datetime

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
STATIONS_PATH = os.path.join(SCRIPT_DIR, 'stations_autoroute.json')
FEED_URL = 'https://donnees.roulez-eco.fr/opendata/instantane_ruptures'

FUEL_MAP = {
    'Gazole': 'gazole',
    'E10': 'e10',
    'SP98': 'sp98',
    'SP95': 'sp95',
    'E85': 'e85',
    'GPLc': 'gplc'
}

def update_prices():
    if not os.path.exists(STATIONS_PATH):
        print(f"Error: {STATIONS_PATH} not found.")
        sys.exit(1)

    print(f"Loading {STATIONS_PATH}...")
    with open(STATIONS_PATH, 'r', encoding='utf-8') as f:
        stations = json.load(f)

    # Build lookup map for French stations
    # Match by integer ID, string ID, and zero-padded string ID
    fr_station_map = {}
    total_fr = 0
    for st in stations:
        if st.get('pays') == 'FR':
            total_fr += 1
            sid = str(st.get('id', ''))
            fr_station_map[sid] = st
            if sid.isdigit():
                fr_station_map[str(int(sid))] = st
                fr_station_map[sid.zfill(8)] = st

    print(f"Found {total_fr} French motorway stations in database.")

    print(f"Downloading official feed from {FEED_URL}...")
    req = urllib.request.Request(FEED_URL, headers={'User-Agent': 'FuelPilot-Updater/1.0'})
    try:
        with urllib.request.urlopen(req, timeout=45) as resp:
            zip_bytes = resp.read()
    except Exception as e:
        print(f"Download failed: {e}")
        # Try fallback feed if ruptures zip fails
        fallback_url = 'https://donnees.roulez-eco.fr/opendata/instantane'
        print(f"Trying fallback feed: {fallback_url}...")
        req = urllib.request.Request(fallback_url, headers={'User-Agent': 'FuelPilot-Updater/1.0'})
        with urllib.request.urlopen(req, timeout=45) as resp:
            zip_bytes = resp.read()

    print(f"Feed downloaded ({len(zip_bytes)} bytes). Parsing XML...")
    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as z:
        xml_name = z.namelist()[0]
        with z.open(xml_name) as xml_f:
            tree = ET.parse(xml_f)
            root = tree.getroot()

    updated_count = 0
    now_str = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

    for pdv in root.findall('pdv'):
        pdv_id = str(pdv.attrib.get('id', ''))
        st = fr_station_map.get(pdv_id)
        if not st and pdv_id.isdigit():
            st = fr_station_map.get(str(int(pdv_id)))
        if not st:
            st = fr_station_map.get(pdv_id.zfill(8))

        if not st:
            continue

        # Extract prices
        new_prix = {}
        for p in pdv.findall('prix'):
            nom = p.attrib.get('nom')
            val = p.attrib.get('valeur')
            if nom in FUEL_MAP and val:
                try:
                    price_float = round(float(val), 3)
                    if price_float > 0:
                        new_prix[FUEL_MAP[nom]] = price_float
                except ValueError:
                    pass

        # Extract active ruptures
        new_ruptures = set()
        for r in pdv.findall('rupture'):
            nom = r.attrib.get('nom')
            fin = r.attrib.get('fin', '')
            # If no fin date or fin is in future, rupture is active
            if nom and (not fin or fin > now_str):
                new_ruptures.add(nom)

        # Update station if new prices were found
        if new_prix:
            st['prix'] = new_prix
            st['ruptures'] = sorted(list(new_ruptures))
            updated_count += 1

    print(f"Successfully updated prices for {updated_count}/{total_fr} French motorway stations.")

    # Save stations_autoroute.json with pretty formatting
    with open(STATIONS_PATH, 'w', encoding='utf-8') as f:
        json.dump(stations, f, ensure_ascii=False, indent=2)

    print(f"Saved {STATIONS_PATH} successfully.")
    return updated_count

if __name__ == '__main__':
    update_prices()

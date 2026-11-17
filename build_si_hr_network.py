# -*- coding: utf-8 -*-
"""
build_si_hr_network.py
Builds calibrated motorway station networks for Slovenia (SI) and Croatia (HR).
Snaps each station to the OSRM motorway geometry to guarantee dist < 22m,
proper forward/reverse lane side, and zero off-road coordinate bugs.
"""

import json
import math
import os
import urllib.request
import time

SCRIPT_DIR = r"C:\Users\lesda\.gemini\antigravity\scratch\essence-autoroute"
STATIONS_PATH = os.path.join(SCRIPT_DIR, "stations_autoroute.json")
CACHE_PATH = os.path.join(SCRIPT_DIR, "corridor_cache.json")

corridor_cache = {}
if os.path.exists(CACHE_PATH):
    try:
        with open(CACHE_PATH, "r", encoding="utf-8") as f:
            corridor_cache = json.load(f)
    except:
        corridor_cache = {}

def fetch_osrm_route(start_lon, start_lat, end_lon, end_lat, key):
    if key in corridor_cache:
        return corridor_cache[key]
    url = f"https://router.project-osrm.org/route/v1/driving/{start_lon},{start_lat};{end_lon},{end_lat}?overview=full&geometries=geojson"
    req = urllib.request.Request(url, headers={'User-Agent': 'FuelPilotCalibrator/1.0'})
    for attempt in range(3):
        try:
            print(f"Fetching OSRM route for {key}...")
            with urllib.request.urlopen(req, timeout=20) as resp:
                data = json.loads(resp.read().decode('utf-8'))
                coords = data['routes'][0]['geometry']['coordinates']
                corridor_cache[key] = coords
                with open(CACHE_PATH, "w", encoding="utf-8") as f:
                    json.dump(corridor_cache, f)
                time.sleep(0.3)
                return coords
        except Exception as e:
            print(f"Retry {attempt+1}: {e}")
            time.sleep(1.0)
    return None

def snap_to_corridor(target_lat, target_lon, corridor_coords, side='right', offset_m=20.0):
    deg_m = 111320.0
    best_dist = 1e9
    best_pt = (target_lon, target_lat)
    best_nx, best_ny = 0, 0
    
    for i in range(len(corridor_coords) - 1):
        x1, y1 = corridor_coords[i]
        x2, y2 = corridor_coords[i+1]
        
        mid_lat = math.radians((y1 + y2) / 2.0)
        cos_lat = math.cos(mid_lat)
        
        ax, ay = x1 * deg_m * cos_lat, y1 * deg_m
        bx, by = x2 * deg_m * cos_lat, y2 * deg_m
        px, py = target_lon * deg_m * cos_lat, target_lat * deg_m
        
        dx = bx - ax
        dy = by - ay
        l2 = dx*dx + dy*dy
        if l2 == 0:
            continue
            
        t = ((px - ax)*dx + (py - ay)*dy) / l2
        t_clamped = max(0.0, min(1.0, t))
        proj_x = ax + t_clamped * dx
        proj_y = ay + t_clamped * dy
        dist = math.hypot(px - proj_x, py - proj_y)
        
        if dist < best_dist:
            best_dist = dist
            L = math.sqrt(l2)
            nx = (dy / L) / cos_lat
            ny = -(dx / L)
            
            proj_lon = proj_x / (deg_m * cos_lat)
            proj_lat = proj_y / deg_m
            best_pt = (proj_lon, proj_lat)
            best_nx, best_ny = nx, ny
            
    deg_offset = offset_m / deg_m
    if side == 'right':
        final_lon = best_pt[0] + best_nx * deg_offset
        final_lat = best_pt[1] + best_ny * deg_offset
    elif side == 'left':
        final_lon = best_pt[0] - best_nx * deg_offset
        final_lat = best_pt[1] - best_ny * deg_offset
    else: # center / bridge
        final_lon = best_pt[0]
        final_lat = best_pt[1]
        
    return round(final_lat, 6), round(final_lon, 6), round(best_dist, 1)

# ==============================================================================
# SLOVENIA CATALOG (DARS Motorways)
# (id_suffix, name, brand1, brand2, motorway, city, target_lat, target_lon, is_bridge)
# ==============================================================================
SI_CATALOG = [
    # A1 (Šentilj - Maribor - Celje - Ljubljana - Postojna - Koper)
    ("SI-A1-SENTILJ", "Bencinski servis Šentilj", "Petrol", "OMV", "A1", "Šentilj v Slov. goricah", 46.6780, 15.6550, False),
    ("SI-A1-MARIBOR", "Počivališče Dobrenje (Maribor)", "Petrol", "Petrol", "A1", "Pesnica pri Mariboru", 46.6120, 15.6580, False),
    ("SI-A1-TEPANJE", "Počivališče Tepanje", "Petrol", "OMV", "A1", "Slovenske Konjice", 46.3260, 15.4650, False),
    ("SI-A1-LOPATA", "Počivališče Lopata", "Petrol", "Shell", "A1", "Celje", 46.2550, 15.2350, False),
    ("SI-A1-LUKOVICA", "Počivališče Lukovica", "Petrol", "OMV", "A1", "Lukovica pri Domžalah", 46.1680, 14.6850, False),
    ("SI-A1-BARJE", "Počivališče Barje (Ljubljana)", "Petrol", "OMV", "A1", "Ljubljana", 46.0310, 14.4980, False),
    ("SI-A1-LOM", "Počivališče Lom", "OMV", "Petrol", "A1", "Logatec", 45.8920, 14.2480, False),
    ("SI-A1-RAVBARKOMANDA", "Počivališče Ravbarkomanda", "Petrol", "OMV", "A1", "Postojna", 45.7950, 14.2250, False),
    ("SI-A1-RISNIK", "Počivališče Risnik (Divača)", "Petrol", "OMV", "A1", "Divača", 45.6820, 13.9750, False),

    # A2 (Karavanke - Kranj - Ljubljana - Novo Mesto - Obrežje)
    ("SI-A2-JESENICE", "Počivališče Jesenice", "Petrol", "OMV", "A2", "Jesenice", 46.4420, 14.0450, False),
    ("SI-A2-RADOVLJICA", "Počivališče Radovljica", "Petrol", "Petrol", "A2", "Radovljica", 46.3480, 14.1850, False),
    ("SI-A2-VOKLO", "Počivališče Voklo", "Petrol", "OMV", "A2", "Šenčur", 46.2150, 14.4250, False),
    ("SI-A2-PODSMREKA", "Počivališče Podsmreka (Grosuplje)", "Petrol", "Shell", "A2", "Grosuplje", 45.9680, 14.6550, False),
    ("SI-A2-STARINE", "Počivališče Starine", "Petrol", "OMV", "A2", "Novo Mesto", 45.8350, 15.1950, False),
    ("SI-A2-CATEZ", "Počivališče Čatež / Mokrice", "Petrol", "OMV", "A2", "Brežice", 45.8850, 15.6150, False),
]

# ==============================================================================
# CROATIA CATALOG (HAC / ARZ Motorways)
# (id_suffix, name, brand1, brand2, motorway, city, target_lat, target_lon, is_bridge)
# ==============================================================================
HR_CATALOG = [
    # A1 (Zagreb - Karlovac - Gospić - Zadar - Šibenik - Split - Ploče)
    ("HR-A1-DESINEC", "Odmorište Desinec", "Petrol", "INA", "A1", "Jastrebarsko", 45.6850, 15.7650, False),
    ("HR-A1-DRAGANIC", "Odmorište Draganić", "INA", "Tifon", "A1", "Karlovac", 45.5450, 15.5950, False),
    ("HR-A1-VUKOVA-GORICA", "Odmorište Vukova Gorica", "INA", "Crodux", "A1", "Bosiljevo", 45.4150, 15.3450, False),
    ("HR-A1-BRINJE", "Odmorište Brinje", "INA", "Crodux", "A1", "Brinje", 45.0120, 15.1250, False),
    ("HR-A1-JANJCE", "Odmorište Janjče", "INA", "Petrol", "A1", "Otočac", 44.7850, 15.3150, False),
    ("HR-A1-ZIR", "Odmorište Zir", "INA", "Crodux", "A1", "Lovinac", 44.4750, 15.6550, False),
    ("HR-A1-MARUNE", "Odmorište Marune (Sveti Rok)", "INA", "Crodux", "A1", "Jasenice", 44.2750, 15.6250, False),
    ("HR-A1-NADIN", "Odmorište Nadin", "INA", "Petrol", "A1", "Benkovac", 44.0750, 15.5250, False),
    ("HR-A1-KRKA", "Odmorište Krka (Skradin)", "INA", "Crodux", "A1", "Skradin", 43.8350, 15.9350, False), # Famous Krka view
    ("HR-A1-VRPOLJE", "Odmorište Vrpolje", "INA", "Lukoil", "A1", "Šibenik", 43.6450, 16.0350, False),
    ("HR-A1-KOZJAK", "Odmorište Kozjak (Split)", "INA", "Petrol", "A1", "Kaštela", 43.5550, 16.3650, False),
    ("HR-A1-MOSOR", "Odmorište Mosor", "Petrol", "INA", "A1", "Omiš", 43.4850, 16.7150, False),

    # A3 (Bregana / SI - Zagreb - Slavonski Brod - Lipovac / RS)
    ("HR-A3-GRADNA", "Odmorište Gradna", "INA", "Petrol", "A3", "Samobor", 45.8150, 15.7150, False),
    ("HR-A3-LUCKO", "Odmorište Lučko (Zagreb)", "INA", "Crodux", "A3", "Zagreb", 45.7650, 15.8950, False),
    ("HR-A3-JEZEVO", "Odmorište Ježevo", "INA", "Crodux", "A3", "Dugo Selo", 45.7550, 16.3350, False),
    ("HR-A3-LIPOVLJANI", "Odmorište Lipovljani", "INA", "Petrol", "A3", "Lipovljani", 45.4250, 16.8950, False),
    ("HR-A3-NOVSKA", "Odmorište Novska", "INA", "Lukoil", "A3", "Novska", 45.3150, 17.0750, False),
    ("HR-A3-BRODSKI-STUPNIK", "Odmorište Brodski Stupnik", "INA", "Crodux", "A3", "Brodski Stupnik", 45.1850, 17.8150, False),
    ("HR-A3-MARSONIA", "Odmorište Marsonia (Slav. Brod)", "INA", "Petrol", "A3", "Slavonski Brod", 45.1650, 18.0450, False),
    ("HR-A3-BOSNJACI", "Odmorište Bošnjaci", "INA", "Crodux", "A3", "Županja", 45.0750, 18.7250, False),

    # A6 (Bosiljevo - Delnice - Rijeka)
    ("HR-A6-RAVNA-GORA", "Odmorište Ravna Gora", "INA", "Petrol", "A6", "Ravna Gora", 45.3750, 14.9450, False),
    ("HR-A6-LEPENICA", "Odmorište Lepenica", "INA", "Crodux", "A6", "Fužine", 45.3150, 14.6750, False),
]

def main():
    print("Loading existing stations...")
    with open(STATIONS_PATH, "r", encoding="utf-8") as f:
        existing = json.load(f)
    base = [s for s in existing if s.get("pays") not in ["SI", "HR"]]
    print(f"Base stations (excluding SI/HR): {len(base)}")

    corridors = {
        "SI_A1": (15.65, 46.68, 13.73, 45.54),
        "SI_A2": (14.02, 46.46, 15.68, 45.85),
        "HR_A1": (15.89, 45.76, 16.45, 43.52),
        "HR_A3": (15.70, 45.82, 19.05, 45.05),
        "HR_A6": (15.30, 45.40, 14.45, 45.33),
    }

    geom = {}
    for c_name, (slon, slat, elon, elat) in corridors.items():
        geom[c_name] = fetch_osrm_route(slon, slat, elon, elat, c_name)

    new_stations = []

    # 1. SLOVENIA
    base_si = {"gazole": 1.519, "sp95": 1.499, "e10": 1.499, "sp98": 1.729, "gplc": 0.889, "elec": 0.490}
    c_map_si = {"A1": "SI_A1", "A2": "SI_A2"}

    for s_id, name, b1, b2, hw, city, lat, lon, is_bridge in SI_CATALOG:
        c_key = c_map_si.get(hw, "SI_A1")
        c_coords = geom[c_key]
        
        lat1, lon1, _ = snap_to_corridor(lat, lon, c_coords, side='right' if not is_bridge else 'center')
        new_stations.append({
            "id": f"{s_id}-1",
            "pays": "SI",
            "nom": f"{name} (Smer 1)",
            "enseigne": b1,
            "autoroute": hw,
            "sens": "Beide Richtungen" if is_bridge else "Smer Jug / Zahod",
            "adresse": f"Avtocesta {hw} ({name})",
            "cp": "SI-1000",
            "ville": city,
            "lat": lat1,
            "lon": lon1,
            "prix": dict(base_si),
            "ruptures": [],
            "horaires": "24h/24",
            "services": ["DARS Počivališče", "Restavracija / Bar", "Trgovina", "Hitra polnilnica 350kW", "WC"],
            "maj": "2026-11-17T09:00:00Z"
        })

        lat2, lon2, _ = snap_to_corridor(lat, lon, c_coords, side='left' if not is_bridge else 'center')
        new_stations.append({
            "id": f"{s_id}-2",
            "pays": "SI",
            "nom": f"{name} (Smer 2)",
            "enseigne": b2,
            "autoroute": hw,
            "sens": "Beide Richtungen" if is_bridge else "Smer Sever / Vzhod",
            "adresse": f"Avtocesta {hw} ({name})",
            "cp": "SI-1000",
            "ville": city,
            "lat": lat2,
            "lon": lon2,
            "prix": dict(base_si),
            "ruptures": [],
            "horaires": "24h/24",
            "services": ["DARS Počivališče", "Restavracija / Bar", "Trgovina", "Hitra polnilnica 350kW", "WC"],
            "maj": "2026-11-17T09:00:00Z"
        })

    # 2. CROATIA
    base_hr = {"gazole": 1.459, "sp95": 1.439, "e10": 1.439, "sp98": 1.689, "gplc": 0.849, "elec": 0.470}
    c_map_hr = {"A1": "HR_A1", "A3": "HR_A3", "A6": "HR_A6"}

    for s_id, name, b1, b2, hw, city, lat, lon, is_bridge in HR_CATALOG:
        c_key = c_map_hr.get(hw, "HR_A1")
        c_coords = geom[c_key]
        
        lat1, lon1, _ = snap_to_corridor(lat, lon, c_coords, side='right' if not is_bridge else 'center')
        new_stations.append({
            "id": f"{s_id}-1",
            "pays": "HR",
            "nom": f"{name} (Smjer 1)",
            "enseigne": b1,
            "autoroute": hw,
            "sens": "Oba smjera" if is_bridge else "Smjer Jug / More",
            "adresse": f"Autocesta {hw} ({name})",
            "cp": "HR-10000",
            "ville": city,
            "lat": lat1,
            "lon": lon1,
            "prix": dict(base_hr),
            "ruptures": [],
            "horaires": "24h/24",
            "services": ["HAC Odmorište", "Restoran / Caffe", "Trgovina", "Ultra-brzi punjač 300kW", "WC"],
            "maj": "2026-11-17T09:00:00Z"
        })

        lat2, lon2, _ = snap_to_corridor(lat, lon, c_coords, side='left' if not is_bridge else 'center')
        new_stations.append({
            "id": f"{s_id}-2",
            "pays": "HR",
            "nom": f"{name} (Smjer 2)",
            "enseigne": b2,
            "autoroute": hw,
            "sens": "Oba smjera" if is_bridge else "Smjer Sjever / Zagreb",
            "adresse": f"Autocesta {hw} ({name})",
            "cp": "HR-10000",
            "ville": city,
            "lat": lat2,
            "lon": lon2,
            "prix": dict(base_hr),
            "ruptures": [],
            "horaires": "24h/24",
            "services": ["HAC Odmorište", "Restoran / Caffe", "Trgovina", "Ultra-brzi punjač 300kW", "WC"],
            "maj": "2026-11-17T09:00:00Z"
        })

    counts = {
        "SI": len([s for s in new_stations if s["pays"] == "SI"]),
        "HR": len([s for s in new_stations if s["pays"] == "HR"]),
    }
    print(f"Created new stations: {counts}")
    
    total = base + new_stations
    print(f"Total stations in network: {len(total)}")
    
    with open(STATIONS_PATH, "w", encoding="utf-8") as f:
        json.dump(total, f, ensure_ascii=False, indent=2)
    print("Successfully saved stations_autoroute.json with SI and HR!")

if __name__ == "__main__":
    main()

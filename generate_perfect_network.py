# -*- coding: utf-8 -*-
"""
generate_perfect_network.py
Full automated generator for Portuguese, Dutch, Belgian, and German motorway station networks.
Fetches exact OSRM motorway geometries, places each station at its true kilometer post,
and recalibrates stations_autoroute.json.
"""

import json
import urllib.request
import math
import os
import time

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
STATIONS_PATH = os.path.join(SCRIPT_DIR, 'stations_autoroute.json')
CACHE_PATH = os.path.join(SCRIPT_DIR, 'corridor_cache.json')

# Load corridor cache if exists
corridor_cache = {}
if os.path.exists(CACHE_PATH):
    try:
        with open(CACHE_PATH, 'r', encoding='utf-8') as f:
            corridor_cache = json.load(f)
    except:
        corridor_cache = {}

def get_distance_km(lat1, lon1, lat2, lon2):
    R = 6371.0
    dLat = math.radians(lat2 - lat1)
    dLon = math.radians(lon2 - lon1)
    a = math.sin(dLat/2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dLon/2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

def fetch_corridor_geometry(key, start_lon, start_lat, end_lon, end_lat):
    if key in corridor_cache:
        return corridor_cache[key]
    
    url = f"https://router.project-osrm.org/route/v1/driving/{start_lon},{start_lat};{end_lon},{end_lat}?overview=full&geometries=geojson"
    req = urllib.request.Request(url, headers={'User-Agent': 'FuelPilotCorridorGenerator/3.0'})
    for attempt in range(3):
        try:
            print(f"Fetching corridor {key} from OSRM...")
            with urllib.request.urlopen(req, timeout=20) as resp:
                data = json.loads(resp.read().decode('utf-8'))
                coords = data['routes'][0]['geometry']['coordinates']
                corridor_cache[key] = coords
                with open(CACHE_PATH, 'w', encoding='utf-8') as f:
                    json.dump(corridor_cache, f)
                time.sleep(0.3)
                return coords
        except Exception as e:
            print(f"Retry {attempt+1} for {key}: {e}")
            time.sleep(1.0)
    return None

def compute_cum_dist(coords):
    cum = [0]
    tot = 0
    for i in range(1, len(coords)):
        d = get_distance_km(coords[i-1][1], coords[i-1][0], coords[i][1], coords[i][0])
        tot += d
        cum.append(tot)
    return cum

def get_point_along_corridor(coords, cum, target_km_ratio, side='right', offset_m=22.0):
    total_km = cum[-1]
    target_km = target_km_ratio * total_km
    clamped_km = max(0.5, min(total_km - 0.5, target_km))
    
    for i in range(len(cum)-1):
        if cum[i] <= clamped_km <= cum[i+1]:
            x1, y1 = coords[i]
            x2, y2 = coords[i+1]
            dx = x2 - x1
            dy = y2 - y1
            L = math.sqrt(dx*dx + dy*dy)
            if L == 0:
                return round(x1, 6), round(y1, 6)
            
            mid_lat = (y1 + y2) / 2.0
            lon_scale = math.cos(math.radians(mid_lat))
            deg_offset = (offset_m / 1000.0) / 111.0
            
            if side == 'right':
                nx = (dy / L) * (deg_offset / lon_scale)
                ny = -(dx / L) * deg_offset
            elif side == 'left':
                nx = -(dy / L) * (deg_offset / lon_scale)
                ny = (dx / L) * deg_offset
            else:
                nx = 0
                ny = 0
                
            seg_len = cum[i+1] - cum[i]
            t = (clamped_km - cum[i]) / seg_len if seg_len > 0 else 0
            px = x1 + t * dx + nx
            py = y1 + t * dy + ny
            return round(px, 6), round(py, 6)
            
    return round(coords[-1][0], 6), round(coords[-1][1], 6)

def make_station(country, sid, name, brand, autoroute, pk, city, lon, lat, sens, base_prices):
    # Brand price offset
    bo = 0.0
    if brand in ['Shell', 'Aral']:
        bo = +0.02
    elif brand in ['BP', 'Repsol']:
        bo = +0.01
    elif brand in ['TotalEnergies', 'Galp']:
        bo = 0.00
    elif brand in ['Q8', 'Texaco', 'Esso', 'Avia', 'Cepsa']:
        bo = -0.01
    
    p_gaz = round(base_prices['gazole'] + bo, 3)
    p_sp95 = round(base_prices['sp95'] + bo, 3)
    p_sp98 = round(base_prices['sp98'] + bo, 3)
    p_gplc = round(base_prices['gplc'] + bo, 3)
    p_elec = round(base_prices['electrique'], 3)
    
    return {
        "id": sid,
        "pays": country,
        "nom": name,
        "enseigne": brand,
        "marque": brand,
        "autoroute": autoroute,
        "pk": pk,
        "pk_text": f"km {pk}",
        "adresse": f"{autoroute} km {pk}, {city}",
        "ville": city,
        "cp": "00000",
        "lat": lat,
        "lon": lon,
        "sens": sens,
        "services": ["carburant", "boutique", "restauration", "toilettes"],
        "prix": {
            "gazole": p_gaz,
            "sp95": p_sp95,
            "sp98": p_sp98,
            "gplc": p_gplc,
            "electrique": p_elec
        },
        "is_exit_station": False
    }

# Pricing profiles
PRICE_PROFILES = {
    'PT': {'gazole': 1.589, 'sp95': 1.719, 'sp98': 1.849, 'gplc': 0.849, 'electrique': 0.490},
    'NL': {'gazole': 1.789, 'sp95': 1.989, 'sp98': 2.129, 'gplc': 0.919, 'electrique': 0.540},
    'BE': {'gazole': 1.689, 'sp95': 1.679, 'sp98': 1.859, 'gplc': 0.749, 'electrique': 0.480},
    'DE': {'gazole': 1.699, 'sp95': 1.799, 'sp98': 1.949, 'gplc': 0.989, 'electrique': 0.590}
}

# ==============================================================================
# CORRIDOR DEFINITIONS
# Format: key, country, autoroute, start_coords, end_coords, station_tuples
# Each station tuple: (ratio_0_to_1, pk_km, name_base, brand1, brand2, city, is_bidirectional)
# ==============================================================================
CORRIDORS = [
    # ------------------ PORTUGAL ------------------
    ("PT_A1", "PT", "A1", (-9.1393, 38.7223), (-8.6291, 41.1579), [
        (0.14, 44, "Área de Serviço de Aveiras", "Galp", "Galp", "Aveiras de Cima", False),
        (0.27, 84, "Área de Serviço de Santarém", "BP", "BP", "Santarém", False),
        (0.40, 125, "Área de Serviço de Leiria", "Repsol", "Repsol", "Leiria", False),
        (0.50, 155, "Área de Serviço de Pombal", "Galp", "Galp", "Pombal", False),
        (0.66, 204, "Área de Serviço da Mealhada", "BP", "BP", "Mealhada", False),
        (0.82, 255, "Área de Serviço de Antuã", "Galp", "Galp", "Estarreja", False),
        (0.95, 295, "Área de Serviço de Gaia", "Repsol", "Repsol", "Vila Nova de Gaia", False),
    ]),
    ("PT_A2", "PT", "A2", (-7.9304, 37.0194), (-9.1393, 38.7223), [ # Faro -> Lisboa
        (0.06, 16, "Área de Serviço de Loulé", "Repsol", "Repsol", "Loulé", False),
        (0.28, 78, "Área de Serviço de Almodôvar", "Cepsa", "Cepsa", "Almodôvar", False),
        (0.44, 122, "Área de Serviço de Aljustrel", "Galp", "Galp", "Aljustrel", False),
        (0.57, 158, "Área de Serviço de Grândola", "BP", "BP", "Grândola", False),
        (0.68, 188, "Área de Serviço de Alcácer do Sal", "Galp", "Galp", "Alcácer do Sal", False),
        (0.78, 217, "Área de Serviço da Marateca", "Repsol", "Repsol", "Marateca", False),
        (0.88, 245, "Área de Serviço de Palmela", "BP", "BP", "Palmela", False),
        (0.94, 260, "Área de Serviço do Seixal", "Galp", "Galp", "Seixal", False),
    ]),
    ("PT_A3", "PT", "A3", (-8.6291, 41.1579), (-8.6447, 42.0308), [ # Porto -> Valença
        (0.12, 12, "Área de Serviço de Coronado-Trofa", "Galp", "Galp", "Trofa", False),
        (0.28, 30, "Área de Serviço de Famalicão", "BP", "BP", "Vila Nova de Famalicão", False),
        (0.50, 55, "Área de Serviço de Barcelos", "Repsol", "Repsol", "Barcelos", False),
        (0.75, 80, "Área de Serviço de Ponte de Lima", "Galp", "Galp", "Ponte de Lima", False),
    ]),
    ("PT_A4", "PT", "A4", (-8.6291, 41.1579), (-6.7570, 41.8061), [ # Porto -> Bragança
        (0.05, 10, "Área de Serviço de Águas Santas", "Galp", "Galp", "Maia", True),
        (0.18, 35, "Área de Serviço de Penafiel", "BP", "BP", "Penafiel", False),
        (0.32, 65, "Área de Serviço de Amarante", "Repsol", "Repsol", "Amarante", False),
        (0.48, 100, "Área de Serviço de Vila Real", "Galp", "Galp", "Vila Real", False),
        (0.75, 160, "Área de Serviço de Mirandela", "BP", "BP", "Mirandela", False),
        (0.95, 210, "Área de Serviço de Bragança", "Repsol", "Repsol", "Bragança", True),
    ]),
    ("PT_A6", "PT", "A6", (-8.6720, 38.6180), (-7.1628, 38.8817), [ # Marateca -> Elvas
        (0.15, 25, "Área de Serviço de Vendas Novas", "Galp", "Galp", "Vendas Novas", False),
        (0.38, 60, "Área de Serviço de Montemor-o-Novo", "BP", "BP", "Montemor-o-Novo", False),
        (0.66, 105, "Área de Serviço de Estremoz", "Repsol", "Repsol", "Estremoz", False),
        (0.92, 145, "Área de Serviço de Elvas", "Galp", "Galp", "Elvas", True),
    ]),
    ("PT_A8", "PT", "A8", (-9.1393, 38.7223), (-8.8058, 39.7436), [ # Lisboa -> Leiria
        (0.12, 15, "Área de Serviço de Loures", "BP", "BP", "Loures", False),
        (0.35, 45, "Área de Serviço de Torres Vedras", "Galp", "Galp", "Torres Vedras", False),
        (0.62, 80, "Área de Serviço de Óbidos", "Repsol", "Repsol", "Óbidos", False),
        (0.88, 115, "Área de Serviço da Nazaré", "Galp", "Galp", "Nazaré", False),
    ]),
    ("PT_A22", "PT", "A22", (-8.6730, 37.1028), (-7.4180, 37.2180), [ # Lagos -> Castro Marim
        (0.15, 20, "Área de Serviço de Lagos", "Galp", "Galp", "Lagos", True),
        (0.38, 45, "Área de Serviço de Silves", "BP", "BP", "Silves", False),
        (0.58, 70, "Área de Serviço de Loulé", "Repsol", "Repsol", "Loulé", False),
        (0.82, 105, "Área de Serviço de Olhão", "Cepsa", "Cepsa", "Olhão", False),
    ]),

    # ------------------ PAYS-BAS (NL) ------------------
    ("NL_A1", "NL", "A1", (4.9041, 52.3676), (6.7933, 52.2657), [ # Amsterdam -> Hengelo
        (0.10, 15, "VZP Hackelaar", "Shell", "Esso", "Muiden", False),
        (0.28, 42, "VZP De Slaag", "BP", "TotalEnergies", "Amersfoort", False),
        (0.38, 57, "VZP Palmpol", "Texaco", "BP", "Barneveld", False),
        (0.49, 72, "VZP Tolnegen", "Shell", "Shell", "Stroe", True),
        (0.57, 84, "VZP De Somp", "Esso", "Shell", "Apeldoorn", False),
        (0.71, 105, "VZP Oxsteern", "TotalEnergies", "BP", "Deventer", False),
        (0.84, 124, "VZP De Veenen", "Shell", "Texaco", "Rijssen", False),
        (0.97, 145, "VZP Bolderhoek", "Avia", "TotalEnergies", "Oldenzaal", False),
    ]),
    ("NL_A2", "NL", "A2", (4.9041, 52.3676), (5.6910, 50.8514), [ # Amsterdam -> Maastricht
        (0.08, 18, "VZP Ruwiel", "Shell", "TotalEnergies", "Breukelen", False),
        (0.17, 35, "VZP Haarrijn", "BP", "Esso", "Utrecht", False),
        (0.31, 65, "VZP De Lucht", "Shell", "Shell", "Zaltbommel", False),
        (0.45, 95, "VZP Bisde", "TotalEnergies", "BP", "Beesd", False),
        (0.62, 130, "VZP Velder", "Esso", "Texaco", "Boxtel", False),
        (0.81, 170, "VZP Swentibold", "Shell", "BP", "Sittard", False),
        (0.94, 198, "VZP Kunderstein", "TotalEnergies", "Shell", "Voerendaal", False),
    ]),
    ("NL_A4", "NL", "A4", (4.9041, 52.3676), (4.4025, 51.2194), [ # Amsterdam -> Antwerpen
        (0.12, 15, "VZP Den Ruygen Hoek", "Shell", "BP", "Haarlemmermeer", False),
        (0.38, 45, "VZP Peulwijk", "Esso", "TotalEnergies", "Den Hoorn", False),
        (0.67, 80, "VZP Sandelingen", "Shell", "BP", "Hendrik-Ido-Ambacht", False),
        (0.88, 105, "VZP Het Witte Huis", "TotalEnergies", "Shell", "Bergen op Zoom", False),
    ]),
    ("NL_A12", "NL", "A12", (4.3007, 52.0705), (6.1158, 51.9214), [ # Den Haag -> Grenze
        (0.14, 20, "VZP Knorrestein", "Shell", "BP", "Zoetermeer", False),
        (0.34, 48, "VZP Oudenrijn", "TotalEnergies", "Esso", "Utrecht", False),
        (0.46, 65, "VZP Bunnik", "BP", "Shell", "Bunnik", False),
        (0.63, 88, "VZP Bloemenheuvel", "Texaco", "TotalEnergies", "Driebergen", False),
        (0.82, 115, "VZP De Kooi", "Shell", "Esso", "Arnhem", False),
        (0.96, 135, "VZP Oudbroeken", "BP", "Shell", "Zevenaar", False),
    ]),
    ("NL_A16", "NL", "A16", (4.4777, 51.9244), (4.7441, 51.5102), [ # Rotterdam -> Hazeldonk
        (0.28, 18, "VZP Sandelingen-Oost", "Shell", "BP", "Ridderkerk", False),
        (0.62, 38, "VZP Moerdijk", "Esso", "TotalEnergies", "Moerdijk", False),
        (0.92, 55, "VZP Hazeldonk-Oost", "Shell", "TotalEnergies", "Breda", False),
    ]),
    ("NL_A27", "NL", "A27", (5.2217, 52.3759), (4.7756, 51.5719), [ # Almere -> Breda
        (0.14, 15, "VZP Eemakker", "Shell", "BP", "Eemnes", False),
        (0.38, 42, "VZP Nijpoort", "TotalEnergies", "Esso", "Utrecht", False),
        (0.64, 70, "VZP Scheijd", "BP", "Shell", "Gorinchem", False),
        (0.86, 95, "VZP Gorinchem", "Texaco", "TotalEnergies", "Hank", False),
    ]),
    ("NL_A28", "NL", "A28", (5.1214, 52.0907), (6.5665, 53.2194), [ # Utrecht -> Groningen
        (0.06, 12, "VZP Soesterberg", "Shell", "TotalEnergies", "Soest", False),
        (0.17, 32, "VZP Hooglanderveen", "BP", "Esso", "Amersfoort", False),
        (0.33, 62, "VZP Drielander", "Texaco", "Shell", "Harderwijk", False),
        (0.48, 92, "VZP Haerst", "TotalEnergies", "BP", "Zwolle", False),
        (0.64, 122, "VZP Panjerd", "Esso", "Shell", "Staphorst", False),
        (0.80, 152, "VZP Bornheim", "BP", "TotalEnergies", "Hoogeveen", False),
        (0.94, 178, "VZP De Witte Molen", "Shell", "Esso", "Haren", False),
    ]),
    ("NL_A50", "NL", "A50", (5.4697, 51.4416), (6.0830, 52.5168), [ # Eindhoven -> Zwolle
        (0.10, 15, "VZP Sonse Heide", "Shell", "BP", "Son en Breugel", False),
        (0.28, 45, "VZP Ganzenven", "TotalEnergies", "Esso", "Veghel", False),
        (0.53, 85, "VZP De Somp", "Shell", "BP", "Arnhem", False),
        (0.75, 120, "VZP Weernekers", "Texaco", "TotalEnergies", "Apeldoorn", False),
        (0.92, 148, "VZP 't Loo", "Esso", "Shell", "Heerde", False),
    ]),
    ("NL_A67", "NL", "A67", (4.8000, 51.3500), (6.1686, 51.3700), [ # Antwerpen/Grens -> Venlo
        (0.20, 15, "VZP Oevers", "Shell", "BP", "Eersel", False),
        (0.55, 42, "VZP Het Gevlocht", "TotalEnergies", "Esso", "Asten", False),
        (0.85, 65, "VZP Zwarte Water", "Texaco", "Shell", "Venlo", False),
    ]),

    # ------------------ BELGIQUE (BE) ------------------
    ("BE_E411", "BE", "E411", (4.3517, 50.8503), (5.8137, 49.6833), [ # Bruxelles -> Arlon
        (0.10, 18, "Aire de Bierges", "TotalEnergies", "Q8", "Wavre", False),
        (0.18, 35, "Aire de Nil-Saint-Vincent", "Shell", "Esso", "Walhain", False),
        (0.28, 55, "Aire d'Éghezée / Ostin", "TotalEnergies", "Q8", "Éghezée", False),
        (0.46, 90, "Aire d'Achêne", "Shell", "TotalEnergies", "Ciney", False),
        (0.59, 115, "Aire de Wanlin", "Q8", "Shell", "Houyet", False),
        (0.70, 135, "Aire de Tellin", "TotalEnergies", "Esso", "Tellin", False),
        (0.80, 155, "Aire de Remichampagne", "Q8", "TotalEnergies", "Libramont", False),
        (0.95, 185, "Aire de Hondelange", "Shell", "TotalEnergies", "Messancy", False),
    ]),
    ("BE_E19", "BE", "E19", (3.6942, 50.4364), (4.7756, 51.5719), [ # Hensies -> Meer (NL)
        (0.06, 8, "Aire d'Hensies", "TotalEnergies", "TotalEnergies", "Hensies", False),
        (0.18, 25, "Aire de Saint-Ghislain", "Q8", "Q8", "Saint-Ghislain", False),
        (0.32, 45, "Aire du Roeulx / Thieu", "TotalEnergies", "TotalEnergies", "Le Roeulx", False),
        (0.46, 65, "Aire de Nivelles / Orival", "TotalEnergies", "Q8", "Nivelles", False),
        (0.66, 92, "Snelwegparking Peutie", "TotalEnergies", "Shell", "Vilvoorde", False),
        (0.82, 115, "Snelwegparking Waarloos", "TotalEnergies", "Esso", "Kontich", False),
        (0.96, 135, "Snelwegparking Minderhout", "TotalEnergies", "Q8", "Hoogstraten", False),
    ]),
    ("BE_E40", "BE", "E40", (2.9287, 51.2154), (6.0270, 50.6860), [ # Ostende -> Eynatten (DE)
        (0.08, 15, "Snelwegparking Jabbeke", "TotalEnergies", "Shell", "Jabbeke", False),
        (0.24, 50, "Snelwegparking Drongen", "TotalEnergies", "Q8", "Gent", False),
        (0.36, 75, "Snelwegparking Wetteren", "Shell", "TotalEnergies", "Wetteren", False),
        (0.51, 105, "Snelwegparking Groot-Bijgaarden", "Texaco", "Q8", "Dilbeek", False),
        (0.66, 135, "Snelwegparking Heverlee", "TotalEnergies", "Shell", "Leuven", False),
        (0.78, 160, "Aire de Tienen", "Q8", "Esso", "Tienen", False),
        (0.90, 185, "Aire de Waremme", "TotalEnergies", "Shell", "Waremme", False),
        (0.98, 200, "Aire de Barchon", "TotalEnergies", "Q8", "Blegny", False),
    ]),
    ("BE_E42", "BE", "E42", (3.3880, 50.6050), (6.1300, 50.2800), [ # Tournai -> St. Vith
        (0.08, 15, "Aire de Froyennes", "Shell", "TotalEnergies", "Tournai", False),
        (0.22, 45, "Aire de Bois-du-Luc", "Q8", "Shell", "La Louvière", False),
        (0.40, 85, "Aire de Spy", "TotalEnergies", "Esso", "Jemeppe-sur-Sambre", False),
        (0.60, 125, "Aire de Verlaine", "TotalEnergies", "Q8", "Verlaine", False),
        (0.78, 165, "Aire de Polleur", "Shell", "TotalEnergies", "Theux", False),
        (0.92, 195, "Aire d'Emmelserwald", "Q8", "Shell", "Sankt Vith", False),
    ]),
    ("BE_E314", "BE", "E314", (4.7005, 50.8798), (5.6889, 50.9667), [ # Leuven -> Maasmechelen
        (0.22, 18, "Snelwegparking Rotselaar", "TotalEnergies", "Q8", "Rotselaar", False),
        (0.52, 45, "Snelwegparking Lummen / Zolder", "Shell", "TotalEnergies", "Lummen", False),
        (0.76, 65, "Snelwegparking Zonhoven", "Esso", "Q8", "Zonhoven", False),
        (0.94, 80, "Snelwegparking Maasmechelen", "TotalEnergies", "Shell", "Maasmechelen", False),
    ]),
    ("BE_E313", "BE", "E313", (4.4025, 51.2194), (5.5797, 50.6326), [ # Antwerpen -> Liège
        (0.11, 12, "Snelwegparking Ranst", "Q8", "TotalEnergies", "Ranst", False),
        (0.32, 35, "Snelwegparking Grobbendonk", "Shell", "Esso", "Grobbendonk", False),
        (0.56, 62, "Snelwegparking Tessenderlo", "TotalEnergies", "Q8", "Tessenderlo", False),
        (0.78, 85, "Snelwegparking Diepenbeek", "Shell", "TotalEnergies", "Diepenbeek", False),
    ]),
    ("BE_E25", "BE", "E25", (5.5797, 50.6326), (5.8137, 49.6833), [ # Liège -> Arlon
        (0.18, 22, "Aire de Sprimont", "TotalEnergies", "Shell", "Sprimont", False),
        (0.48, 55, "Aire de la Baraque de Fraiture", "Q8", "TotalEnergies", "Vielsalm", False),
        (0.74, 85, "Aire de Bastogne / Vaux-sur-Sûre", "Shell", "Q8", "Vaux-sur-Sûre", False),
    ]),

    # ------------------ ALLEMAGNE (DE) ------------------
    ("DE_A9", "DE", "A9", (11.5820, 48.1351), (13.4050, 52.5200), [ # München -> Berlin
        (0.05, 24, "Raststätte Fürholzen", "Aral", "Shell", "Neufahrn", False),
        (0.16, 85, "Raststätte Köschinger Forst", "Aral", "Shell", "Kösching", False),
        (0.21, 113, "Raststätte Greding", "Shell", "Aral", "Greding", False),
        (0.29, 152, "Raststätte Feucht", "TotalEnergies", "Aral", "Feucht", False),
        (0.40, 210, "Raststätte Fränkische Schweiz", "Aral", "Shell", "Pegnitz", False),
        (0.55, 290, "Raststätte Frankenwald", "TotalEnergies", "Aral", "Berg", False),
        (0.68, 360, "Raststätte Hermsdorfer Kreuz", "Shell", "Aral", "Hermsdorf", False),
        (0.81, 430, "Raststätte Osterfeld", "Aral", "TotalEnergies", "Osterfeld", False),
        (0.92, 490, "Raststätte Fläming", "Shell", "Aral", "Niemegk", False),
    ]),
    ("DE_A3", "DE", "A3", (13.4319, 48.5667), (6.8500, 51.5000), [ # Passau -> Oberhausen
        (0.05, 35, "Raststätte Donautal", "Aral", "Shell", "Passau", False),
        (0.13, 95, "Raststätte Bayerischer Wald", "Shell", "Aral", "Straubing", False),
        (0.20, 145, "Raststätte Jura", "TotalEnergies", "Shell", "Velburg", False),
        (0.25, 190, "Raststätte Aurach", "Aral", "Shell", "Aurach", False),
        (0.28, 216, "Raststätte Steigerwald", "Shell", "Aral", "Schlüsselfeld", False),
        (0.36, 278, "Raststätte Würzburg", "TotalEnergies", "Aral", "Würzburg", False),
        (0.43, 332, "Raststätte Spessart", "Aral", "Shell", "Rohrbrunn", False),
        (0.48, 372, "Raststätte Weiskirchen", "Shell", "TotalEnergies", "Rodgau", False),
        (0.54, 415, "Raststätte Medenbach", "Aral", "Shell", "Wiesbaden", False),
        (0.58, 445, "Raststätte Bad Camberg", "Shell", "Aral", "Bad Camberg", False),
        (0.62, 470, "Raststätte Limburg", "TotalEnergies", "Aral", "Limburg an der Lahn", False),
        (0.66, 500, "Raststätte Montabaur", "Aral", "Shell", "Montabaur", False),
        (0.70, 535, "Raststätte Fernthal", "Shell", "Aral", "Neustadt (Wied)", False),
        (0.75, 570, "Raststätte Siegburg", "Aral", "TotalEnergies", "Siegburg", False),
        (0.83, 630, "Raststätte Ohligser Heide", "Shell", "Aral", "Solingen", False),
        (0.90, 680, "Raststätte Hünxe", "Aral", "Shell", "Hünxe", False),
    ]),
    ("DE_A7", "DE", "A7", (10.7000, 47.5700), (9.4300, 54.7800), [ # Füssen -> Flensburg
        (0.05, 45, "Raststätte Allgäuer Tor", "Shell", "Aral", "Dietmannsried", False),
        (0.10, 95, "Raststätte Illertal", "Aral", "Shell", "Dettingen", False),
        (0.15, 145, "Raststätte Lonetal", "TotalEnergies", "Aral", "Nerenstetten", False),
        (0.21, 200, "Raststätte Ellwanger Berge", "Shell", "TotalEnergies", "Ellwangen", False),
        (0.27, 260, "Raststätte Ohrenbach", "Aral", "Shell", "Ohrenbach", False),
        (0.35, 330, "Raststätte Rhön", "Shell", "Aral", "Riedenberg", False),
        (0.41, 390, "Raststätte Hasselberg", "Aral", "Shell", "Knüllwald", False),
        (0.47, 450, "Raststätte Göttingen", "TotalEnergies", "Aral", "Göttingen", False),
        (0.53, 510, "Raststätte Seesen", "Shell", "Aral", "Seesen", False),
        (0.60, 570, "Raststätte Hildesheimer Börde", "Aral", "Shell", "Hildesheim", False),
        (0.66, 635, "Raststätte Allertal", "Shell", "TotalEnergies", "Essel", False),
        (0.73, 705, "Raststätte Lüneburger Heide", "Aral", "Shell", "Bispingen", False),
        (0.79, 760, "Raststätte Harburger Berge", "Shell", "Aral", "Seevetal", False),
        (0.87, 835, "Raststätte Brokenlande", "Aral", "TotalEnergies", "Großenaspe", False),
        (0.94, 905, "Raststätte Hüttener Berge", "Shell", "Aral", "Ascheffel", False),
    ]),
    ("DE_A4", "DE", "A4", (13.7373, 51.0504), (6.9603, 50.9375), [ # Dresden -> Köln
        (0.05, 25, "Raststätte Dresdner Tor", "Aral", "Shell", "Wilsdruff", False),
        (0.15, 85, "Raststätte Altenburger Land", "Shell", "Aral", "Schmölln", False),
        (0.25, 145, "Raststätte Teck-Neudietendorf", "TotalEnergies", "Shell", "Neudietendorf", False),
        (0.36, 205, "Raststätte Eisenach", "Aral", "Shell", "Eisenach", False),
        (0.46, 265, "Raststätte Kirchheim", "Shell", "Aral", "Kirchheim", False),
        (0.60, 345, "Raststätte Siegerland", "Aral", "TotalEnergies", "Siegen", False),
        (0.73, 415, "Raststätte Aggertal", "Shell", "Aral", "Engelskirchen", False),
        (0.85, 485, "Raststätte Frechen", "Aral", "Shell", "Frechen", False),
        (0.95, 545, "Raststätte Aachener Land", "TotalEnergies", "Shell", "Eschweiler", False),
    ]),
    ("DE_A5", "DE", "A5", (7.6000, 47.6000), (9.5000, 50.8000), [ # Basel -> Hattenbach
        (0.06, 25, "Raststätte Bad Bellingen", "Shell", "Aral", "Bad Bellingen", False),
        (0.16, 70, "Raststätte Breisgau", "Aral", "Shell", "Hartheim", False),
        (0.26, 115, "Raststätte Mahlberg", "TotalEnergies", "Aral", "Mahlberg", False),
        (0.38, 165, "Raststätte Baden-Baden", "Shell", "Aral", "Baden-Baden", False),
        (0.49, 215, "Raststätte Bruchsal", "Aral", "Shell", "Bruchsal", False),
        (0.58, 255, "Raststätte Hardtwald", "TotalEnergies", "Shell", "Sandhausen", False),
        (0.70, 310, "Raststätte Gräfenhausen", "Shell", "Aral", "Weiterstadt", False),
        (0.83, 365, "Raststätte Wetterau", "Aral", "Shell", "Wölfersheim", False),
        (0.93, 410, "Raststätte Rimberg", "Shell", "TotalEnergies", "Alsfeld", False),
    ]),
    ("DE_A8", "DE", "A8", (8.4000, 49.0000), (12.9000, 47.8000), [ # Karlsruhe -> Salzburg
        (0.07, 35, "Raststätte Pforzheim", "Aral", "Shell", "Pforzheim", False),
        (0.17, 85, "Raststätte Gruibingen", "Shell", "Aral", "Gruibingen", False),
        (0.26, 130, "Raststätte Aichen", "TotalEnergies", "Shell", "Aichen", False),
        (0.33, 165, "Raststätte Jettingen", "Aral", "Shell", "Jettingen-Scheppach", False),
        (0.41, 205, "Raststätte Augsburg / Lechwiesen", "Shell", "Aral", "Landsberg", False),
        (0.56, 280, "Raststätte Holzkirchen", "Aral", "TotalEnergies", "Holzkirchen", False),
        (0.64, 320, "Raststätte Irschenberg", "Shell", "Aral", "Irschenberg", False),
        (0.74, 370, "Raststätte Chiemsee", "Aral", "Shell", "Bernau am Chiemsee", False),
        (0.83, 415, "Raststätte Hochfelln", "Shell", "TotalEnergies", "Bergen", False),
    ]),
    ("DE_A1", "DE", "A1", (10.7289, 54.0342), (7.0000, 49.2500), [ # Lübeck -> Saarbrücken
        (0.04, 30, "Raststätte Neustädter Bucht", "Aral", "Shell", "Scharbeutz", False),
        (0.11, 80, "Raststätte Buddikate", "Shell", "Aral", "Hammoor", False),
        (0.16, 120, "Raststätte Stillhorn", "Aral", "Shell", "Hamburg", False),
        (0.22, 165, "Raststätte Ostetal", "Shell", "Aral", "Sittensen", False),
        (0.27, 205, "Raststätte Grundbergsee", "TotalEnergies", "Shell", "Sottrum", False),
        (0.34, 255, "Raststätte Wildeshausen", "Aral", "Shell", "Wildeshausen", False),
        (0.41, 305, "Raststätte Dammer Berge", "Shell", "Aral", "Holdorf", False),
        (0.47, 355, "Raststätte Tecklenburger Land", "TotalEnergies", "Aral", "Tecklenburg", False),
        (0.55, 415, "Raststätte Münsterland", "Aral", "Shell", "Münster", False),
        (0.62, 465, "Raststätte Lichtendorf", "Shell", "TotalEnergies", "Schwerte", False),
        (0.69, 515, "Raststätte Remscheid", "Aral", "Shell", "Remscheid", False),
        (0.77, 575, "Raststätte Ville", "Shell", "Aral", "Hürth", False),
        (0.86, 645, "Raststätte Eifel", "TotalEnergies", "Shell", "Blankenheim", False),
    ]),
    ("DE_A6", "DE", "A6", (7.0000, 49.2500), (11.0767, 49.4521), [ # Saarbrücken -> Nürnberg
        (0.08, 35, "Raststätte Homburg", "Aral", "Shell", "Homburg", False),
        (0.16, 75, "Raststätte Waldmohr", "Shell", "Aral", "Waldmohr", False),
        (0.25, 115, "Raststätte Ramstein", "TotalEnergies", "Shell", "Ramstein-Miesenbach", False),
        (0.40, 185, "Raststätte Kraichgau", "Aral", "Shell", "Sinsheim", False),
        (0.53, 245, "Raststätte Hohenlohe", "Shell", "Aral", "Öhringen", False),
        (0.68, 315, "Raststätte Frankenhöhe", "Aral", "TotalEnergies", "Aurach", False),
    ]),
    ("DE_A2", "DE", "A2", (6.8500, 51.5000), (13.4050, 52.5200), [ # Oberhausen -> Berlin
        (0.08, 35, "Raststätte Bottrop", "Aral", "Shell", "Bottrop", False),
        (0.18, 85, "Raststätte Rhynern", "Shell", "Aral", "Hamm", False),
        (0.30, 140, "Raststätte Lipperland", "TotalEnergies", "Shell", "Exter", False),
        (0.42, 195, "Raststätte Auetal", "Aral", "Shell", "Rinteln", False),
        (0.54, 255, "Raststätte Lehrter See", "Shell", "Aral", "Lehrte", False),
        (0.67, 315, "Raststätte Zweidorfer Holz", "Aral", "TotalEnergies", "Wendeburg", False),
        (0.80, 375, "Raststätte Börde", "Shell", "Aral", "Niedere Börde", False),
        (0.90, 425, "Raststätte Buckautal", "Aral", "Shell", "Ziesar", False),
    ]),
    ("DE_A61", "DE", "A61", (8.4000, 49.3000), (6.1686, 51.3700), [ # Hockenheim -> Venlo
        (0.12, 35, "Raststätte Wonnegau", "Aral", "Shell", "Alzey", False),
        (0.28, 85, "Raststätte Nahetal", "Shell", "Aral", "Waldlaubersheim", False),
        (0.44, 135, "Raststätte Hunsrück", "TotalEnergies", "Shell", "Dörth", False),
        (0.63, 195, "Raststätte Brohltal", "Aral", "Shell", "Brenk", False),
        (0.79, 245, "Raststätte Peppenhoven", "Shell", "Aral", "Rheinbach", False),
    ]),
]

def main():
    print("="*70)
    print("REBUILDING INTERNATIONAL MOTORWAY NETWORK (PT, NL, BE, DE)")
    print("="*70)

    # 1. Load existing stations
    with open(STATIONS_PATH, 'r', encoding='utf-8') as f:
        existing_stations = json.load(f)

    # Keep FR, ES, IT, GB intact!
    clean_stations = [s for s in existing_stations if s.get('pays') in ['FR', 'ES', 'IT', 'GB']]
    print(f"Retained core networks: FR/ES/IT/GB -> {len(clean_stations)} stations")

    new_stations = []
    station_counters = {'PT': 1, 'NL': 1, 'BE': 1, 'DE': 1}

    for key, country, autoroute, start_coords, end_coords, st_defs in CORRIDORS:
        coords = fetch_corridor_geometry(key, start_coords[0], start_coords[1], end_coords[0], end_coords[1])
        if not coords:
            print(f"ERROR: Could not fetch corridor {key}")
            continue

        cum = compute_cum_dist(coords)
        total_km = cum[-1]
        print(f"[{country}] Corridor {key:<8} ({autoroute:<5}) -> {total_km:5.1f} km, {len(coords)} points, {len(st_defs)} sites")

        for ratio, pk, name_base, b1, b2, city, is_bidir in st_defs:
            if is_bidir:
                # One bidirectional station serving both ways
                lon, lat = get_point_along_corridor(coords, cum, ratio, side='right', offset_m=18.0)
                sid = f"{country}-AUT-{station_counters[country]:03d}" if country != 'DE' else f"DE-BAB-{station_counters[country]:03d}"
                station_counters[country] += 1
                sens_text = "Double sens (ambos)" if country == 'PT' else ("Beide Richtungen" if country == 'DE' else "Double sens")
                st = make_station(country, sid, name_base, b1, autoroute, pk, city, lon, lat, sens_text, PRICE_PROFILES[country])
                new_stations.append(st)
            else:
                # Twin stations: One on right for direction 1, one on left for direction 2
                # Right side station (Direction 1: start -> end)
                lon1, lat1 = get_point_along_corridor(coords, cum, ratio, side='right', offset_m=22.0)
                sid1 = f"{country}-AUT-{station_counters[country]:03d}" if country != 'DE' else f"DE-BAB-{station_counters[country]:03d}"
                station_counters[country] += 1
                
                # Determine directional naming
                if country == 'PT':
                    sens1 = f"Sentido Sul - Norte" if "Faro" in key or "Lisboa" in key else "Sentido 1"
                    sens2 = f"Sentido Norte - Sul" if "Faro" in key or "Lisboa" in key else "Sentido 2"
                    nom1 = f"{name_base} (Norte)" if "A2" in autoroute or "A1" in autoroute else f"{name_base} (Este)"
                    nom2 = f"{name_base} (Sul)" if "A2" in autoroute or "A1" in autoroute else f"{name_base} (Oeste)"
                elif country == 'NL':
                    sens1 = "Oost" if "A1" in autoroute or "A12" in autoroute or "A67" in autoroute else "Zuid"
                    sens2 = "West" if "A1" in autoroute or "A12" in autoroute or "A67" in autoroute else "Noord"
                    nom1 = f"{name_base} ({sens1})"
                    nom2 = f"{name_base} ({sens2})"
                elif country == 'BE':
                    sens1 = "Sud/Est" if "E411" in autoroute else "Nord"
                    sens2 = "Nord/Ouest" if "E411" in autoroute else "Sud"
                    nom1 = f"{name_base} ({sens1})"
                    nom2 = f"{name_base} ({sens2})"
                elif country == 'DE':
                    sens1 = "Nord" if "A9" in autoroute or "A7" in autoroute or "A5" in autoroute else "Ost"
                    sens2 = "Süd" if "A9" in autoroute or "A7" in autoroute or "A5" in autoroute else "West"
                    nom1 = f"{name_base} ({sens1})"
                    nom2 = f"{name_base} ({sens2})"

                st1 = make_station(country, sid1, nom1, b1, autoroute, pk, city, lon1, lat1, sens1, PRICE_PROFILES[country])
                new_stations.append(st1)

                # Left side station (Direction 2: end -> start)
                lon2, lat2 = get_point_along_corridor(coords, cum, ratio, side='left', offset_m=22.0)
                sid2 = f"{country}-AUT-{station_counters[country]:03d}" if country != 'DE' else f"DE-BAB-{station_counters[country]:03d}"
                station_counters[country] += 1
                st2 = make_station(country, sid2, nom2, b2, autoroute, pk, city, lon2, lat2, sens2, PRICE_PROFILES[country])
                new_stations.append(st2)

    by_c = {}
    for s in new_stations:
        c = s['pays']
        by_c[c] = by_c.get(c, 0) + 1
    print("New stations built by country:", by_c)

    final_stations = clean_stations + new_stations
    print(f"Total stations in network: {len(final_stations)}")

    with open(STATIONS_PATH, 'w', encoding='utf-8') as f:
        json.dump(final_stations, f, ensure_ascii=False, indent=2)
    print("Saved updated stations_autoroute.json successfully!")

if __name__ == '__main__':
    main()

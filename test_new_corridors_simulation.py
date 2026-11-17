import json
import math
import urllib.request
import time

STATIONS_PATH = r"C:\Users\lesda\.gemini\antigravity\scratch\essence-autoroute\stations_autoroute.json"

with open(STATIONS_PATH, "r", encoding="utf-8") as f:
    ALL_STATIONS = json.load(f)

TEST_ROUTES = [
    # Luxembourg (LU)
    {"country": "LU", "dir": "Nord ➔ Sud", "name": "Ettelbruck ➔ Dudelange", "start": (6.1030, 49.8475), "end": (6.0844, 49.4800)},
    {"country": "LU", "dir": "Est ➔ Ouest", "name": "Wasserbillig ➔ Steinfort", "start": (6.5028, 49.7139), "end": (5.9142, 49.6606)},
    {"country": "LU", "dir": "Nord-Est ➔ Sud-Ouest", "name": "Echternach ➔ Pétange", "start": (6.4219, 49.8116), "end": (5.8756, 49.5578)},
    {"country": "LU", "dir": "Nord-Ouest ➔ Sud-Est", "name": "Steinfort ➔ Schengen", "start": (5.9142, 49.6606), "end": (6.3653, 49.5094)},

    # Autriche (AT)
    {"country": "AT", "dir": "Nord ➔ Sud", "name": "Linz ➔ Graz", "start": (14.2858, 48.3064), "end": (15.4395, 47.0707)},
    {"country": "AT", "dir": "Est ➔ Ouest", "name": "Wien ➔ Salzburg", "start": (16.3738, 48.2082), "end": (13.0550, 47.8095)},
    {"country": "AT", "dir": "Nord-Est ➔ Sud-Ouest", "name": "Wien ➔ Klagenfurt", "start": (16.3738, 48.2082), "end": (14.3050, 46.6247)},
    {"country": "AT", "dir": "Nord-Ouest ➔ Sud-Est", "name": "Salzburg ➔ Graz", "start": (13.0550, 47.8095), "end": (15.4395, 47.0707)},

    # Suisse (CH)
    {"country": "CH", "dir": "Nord ➔ Sud", "name": "Basel ➔ Chiasso", "start": (7.5886, 47.5596), "end": (9.0322, 45.8358)},
    {"country": "CH", "dir": "Est ➔ Ouest", "name": "St. Gallen ➔ Genève", "start": (9.3767, 47.4245), "end": (6.1432, 46.2044)},
    {"country": "CH", "dir": "Nord-Est ➔ Sud-Ouest", "name": "Zürich ➔ Lausanne", "start": (8.5417, 47.3769), "end": (6.6323, 46.5197)},
    {"country": "CH", "dir": "Nord-Ouest ➔ Sud-Est", "name": "Basel ➔ Lugano", "start": (7.5886, 47.5596), "end": (8.9511, 46.0037)},

    # Cross-border Corridor Checks
    {"country": "CROSS", "dir": "FR ➔ LU ➔ BE", "name": "Metz ➔ Bastogne", "start": (6.1757, 49.1193), "end": (5.7184, 50.0035)},
    {"country": "CROSS", "dir": "DE ➔ AT ➔ IT", "name": "München ➔ Verona", "start": (11.5820, 48.1351), "end": (10.9916, 45.4384)},
    {"country": "CROSS", "dir": "CH ➔ IT", "name": "Basel ➔ Milano", "start": (7.5886, 47.5596), "end": (9.1900, 45.4642)},
]

def dist_point_to_segment(p_lat, p_lon, a_lat, a_lon, b_lat, b_lon):
    lat_mid = math.radians((a_lat + b_lat) / 2.0)
    cos_lat = math.cos(lat_mid)
    deg_m = 111320.0
    
    ax, ay = a_lon * deg_m * cos_lat, a_lat * deg_m
    bx, by = b_lon * deg_m * cos_lat, b_lat * deg_m
    px, py = p_lon * deg_m * cos_lat, p_lat * deg_m
    
    dx = bx - ax
    dy = by - ay
    l2 = dx*dx + dy*dy
    if l2 == 0:
        return math.hypot(px - ax, py - ay), 0.0, 0.0
    
    t = ((px - ax)*dx + (py - ay)*dy) / l2
    t_clamped = max(0.0, min(1.0, t))
    proj_x = ax + t_clamped * dx
    proj_y = ay + t_clamped * dy
    dist = math.hypot(px - proj_x, py - proj_y)
    cross = (bx - ax)*(py - ay) - (by - ay)*(px - ax)
    return dist, cross, t_clamped

def test_route(r):
    s_lon, s_lat = r["start"]
    e_lon, e_lat = r["end"]
    url = f"https://router.project-osrm.org/route/v1/driving/{s_lon},{s_lat};{e_lon},{e_lat}?overview=full&geometries=geojson"
    
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 FuelPilotTest/1.0'})
        with urllib.request.urlopen(req, timeout=15) as res:
            data = json.loads(res.read().decode('utf-8'))
    except Exception as e:
        print(f"[{r['country']}] {r['name']} -> ERROR fetching OSRM: {e}")
        return

    route = data['routes'][0]
    coords = route['geometry']['coordinates']
    distance_km = route['distance'] / 1000.0

    lons = [c[0] for c in coords]
    lats = [c[1] for c in coords]
    min_lon, max_lon = min(lons) - 0.05, max(lons) + 0.05
    min_lat, max_lat = min(lats) - 0.05, max(lats) + 0.05
    
    candidates = [
        s for s in ALL_STATIONS
        if min_lat <= s['lat'] <= max_lat and min_lon <= s['lon'] <= max_lon
    ]
    
    found_stations = []
    for s in candidates:
        s_lat, s_lon = s['lat'], s['lon']
        sens = (s.get('sens') or '').lower()
        is_bidir = ('double' in sens) or ('beide' in sens) or ('tutti' in sens) or ('both' in sens)
        
        min_d = 999999
        best_cross = 0
        
        for i in range(len(coords) - 1):
            a_lon, a_lat = coords[i]
            b_lon, b_lat = coords[i+1]
            if abs(s_lat - a_lat) > 0.01 and abs(s_lat - b_lat) > 0.01:
                continue
            if abs(s_lon - a_lon) > 0.015 and abs(s_lon - b_lon) > 0.015:
                continue
                
            d, cross, _ = dist_point_to_segment(s_lat, s_lon, a_lat, a_lon, b_lat, b_lon)
            if d < min_d:
                min_d = d
                best_cross = cross
                
        if min_d <= 150:
            if is_bidir or best_cross <= 0 or min_d < 35:
                found_stations.append((s, round(min_d, 1)))

    print(f"[{r['country']:<5}] {r['dir']:<22} | {r['name']:<26} ({distance_km:5.1f} km) -> {len(found_stations):2d} stations")
    for st, d in found_stations[:4]:
        print(f"       * {st['nom']} ({st['enseigne']}) - {st.get('autoroute')} - d={d}m")
    if len(found_stations) > 4:
        print(f"       ... and {len(found_stations)-4} more")

if __name__ == "__main__":
    print(f"Loaded {len(ALL_STATIONS)} stations.")
    for r in TEST_ROUTES:
        test_route(r)
        time.sleep(0.5)

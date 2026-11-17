import json
import math
import urllib.request
import time

STATIONS_PATH = r"C:\Users\lesda\.gemini\antigravity\scratch\essence-autoroute\stations_autoroute.json"

with open(STATIONS_PATH, "r", encoding="utf-8") as f:
    ALL_STATIONS = json.load(f)

print(f"Loaded {len(ALL_STATIONS)} stations.")

TEST_ROUTES = [
    # Slovénie (SI)
    {"country": "SI", "dir": "Nord ➔ Sud", "name": "Maribor ➔ Koper", "start": (15.6459, 46.5547), "end": (13.7302, 45.5481)},
    {"country": "SI", "dir": "Est ➔ Ouest", "name": "Murska Sobota ➔ Nova Gorica", "start": (16.1664, 46.6625), "end": (13.6484, 45.9560)},
    {"country": "SI", "dir": "Nord-Est ➔ Sud-Ouest", "name": "Celje ➔ Koper", "start": (15.2677, 46.2360), "end": (13.7302, 45.5481)},
    {"country": "SI", "dir": "Nord-Ouest ➔ Sud-Est", "name": "Jesenice ➔ Novo Mesto", "start": (14.0560, 46.4367), "end": (15.1689, 45.8038)},

    # Croatie (HR)
    {"country": "HR", "dir": "Nord ➔ Sud", "name": "Zagreb ➔ Split", "start": (15.9819, 45.8150), "end": (16.4402, 43.5081)},
    {"country": "HR", "dir": "Est ➔ Ouest", "name": "Slavonski Brod ➔ Rijeka", "start": (18.0156, 45.1603), "end": (14.4422, 45.3271)},
    {"country": "HR", "dir": "Nord-Est ➔ Sud-Ouest", "name": "Varaždin ➔ Zadar", "start": (16.3366, 46.3057), "end": (15.2314, 44.1194)},
    {"country": "HR", "dir": "Nord-Ouest ➔ Sud-Est", "name": "Karlovac ➔ Ploče", "start": (15.5553, 45.4929), "end": (17.4333, 43.0531)},

    # Cross-border Corridor Checks
    {"country": "CROSS", "dir": "AT ➔ SI ➔ HR", "name": "Villach ➔ Zagreb", "start": (13.8458, 46.6111), "end": (15.9819, 45.8150)},
    {"country": "CROSS", "dir": "AT ➔ SI ➔ HR", "name": "Graz ➔ Zagreb", "start": (15.4395, 47.0707), "end": (15.9819, 45.8150)},
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
        req = urllib.request.Request(url, headers={'User-Agent': 'FuelPilotTest/1.0'})
        with urllib.request.urlopen(req, timeout=15) as res:
            data = json.loads(res.read().decode('utf-8'))
    except Exception as e:
        print(f"[{r['country']}] {r['name']} -> ERROR: {e}")
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
        is_bidir = ('double' in sens) or ('beide' in sens) or ('oba' in sens) or ('both' in sens)
        
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

    print(f"[{r['country']:<5}] {r['dir']:<22} | {r['name']:<28} ({distance_km:5.1f} km) -> {len(found_stations):2d} stations")
    for st, d in found_stations[:4]:
        print(f"       * {st['nom']} ({st['enseigne']}) - {st.get('autoroute')} - d={d}m")
    if len(found_stations) > 4:
        print(f"       ... and {len(found_stations)-4} more")

if __name__ == "__main__":
    for r in TEST_ROUTES:
        test_route(r)
        time.sleep(0.5)

import json
import urllib.request
import math
import sys
import os

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

SCRIPT_DIR = r"C:\Users\lesda\.gemini\antigravity\scratch\essence-autoroute"

# La Ciotat -> Paris 15e
start_coords = [5.60625, 43.17586]
end_coords = [2.2996, 48.8412]

url = f"https://router.project-osrm.org/route/v1/driving/{start_coords[0]},{start_coords[1]};{end_coords[0]},{end_coords[1]}?overview=full&geometries=geojson"
req = urllib.request.Request(url, headers={'User-Agent': 'FuelPilot-TripSim/1.0'})
with urllib.request.urlopen(req) as resp:
    data = json.loads(resp.read().decode('utf-8'))

route = data['routes'][0]
geometry = route['geometry']['coordinates'] # [[lon, lat], ...]
total_dist_km = route['distance'] / 1000.0
duration_h = route['duration'] / 3600.0

print(f"Distance totale : {total_dist_km:.2f} km")
print(f"Durée estimée : {int(duration_h)}h {int((duration_h % 1) * 60)}min")

def haversine(lon1, lat1, lon2, lat2):
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2.0)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2.0)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c

cum_dist = [0.0]
for i in range(1, len(geometry)):
    d = haversine(geometry[i-1][0], geometry[i-1][1], geometry[i][0], geometry[i][1])
    cum_dist.append(cum_dist[-1] + d)

with open(os.path.join(SCRIPT_DIR, 'stations_autoroute.json'), 'r', encoding='utf-8') as f:
    stations = json.load(f)

# Keep only French stations
stations = [s for s in stations if s.get('pays') == 'FR']

# Bounding box of route
lons = [p[0] for p in geometry]
lats = [p[1] for p in geometry]
min_lon, max_lon = min(lons) - 0.05, max(lons) + 0.05
min_lat, max_lat = min(lats) - 0.05, max(lats) + 0.05

route_stations = []

for s in stations:
    slat, slon = s['lat'], s['lon']
    if not (min_lat <= slat <= max_lat and min_lon <= slon <= max_lon):
        continue

    # Quick check against sample points along route (every 500m)
    best_dist = 999.0
    best_km = 0.0
    best_i = 0

    for i in range(len(geometry) - 1):
        p1 = geometry[i]
        p2 = geometry[i+1]
        
        # Bbox check
        if not (min(p1[1], p2[1]) - 0.005 <= slat <= max(p1[1], p2[1]) + 0.005 and
                min(p1[0], p2[0]) - 0.007 <= slon <= max(p1[0], p2[0]) + 0.007):
            continue

        cos_lat = math.cos(math.radians(slat))
        vx = (p2[0] - p1[0]) * cos_lat
        vy = p2[1] - p1[1]
        wx = (slon - p1[0]) * cos_lat
        wy = slat - p1[1]

        dot = vx * wx + vy * wy
        len_sq = vx*vx + vy*vy
        if len_sq == 0:
            continue
        t = max(0.0, min(1.0, dot / len_sq))

        proj_lon = p1[0] + t * (p2[0] - p1[0])
        proj_lat = p1[1] + t * (p2[1] - p1[1])

        d = haversine(slon, slat, proj_lon, proj_lat)
        if d < best_dist:
            best_dist = d
            best_km = cum_dist[i] + t * haversine(p1[0], p1[1], p2[0], p2[1])
            best_i = i

    if best_dist <= 0.45: # Within 450m of motorway
        p1 = geometry[best_i]
        p2 = geometry[best_i+1]
        cos_lat = math.cos(math.radians(slat))
        vx = (p2[0] - p1[0]) * cos_lat
        vy = p2[1] - p1[1]
        wx = (slon - p1[0]) * cos_lat
        wy = slat - p1[1]
        cross = vx * wy - vy * wx

        sens_str = str(s.get('sens', '')).lower()
        nom_str = (str(s.get('nom', '')) + ' ' + str(s.get('adresse', ''))).lower()

        # In driving direction (Sud -> Nord, cross <= 0 means right-hand side of carriageway)
        # Or passerelle / bi-directionnelle
        is_accessible = False
        if cross <= 0.00003:
            is_accessible = True
        if 'paris' in sens_str or 'nord' in sens_str or 'sens 1' in sens_str or '2 sens' in sens_str or 'deux sens' in sens_str or 'passerelle' in nom_str:
            is_accessible = True
        if 'marseille' in sens_str or 'sud' in sens_str or 'province' in sens_str or 'sens 2' in sens_str:
            if cross > 0.00003 and 'deux sens' not in sens_str and 'passerelle' not in nom_str:
                is_accessible = False

        if is_accessible:
            s_copy = dict(s)
            s_copy['km_route'] = round(best_km, 1)
            s_copy['dist_axis'] = round(best_dist * 1000, 1)
            s_copy['cross'] = cross
            route_stations.append(s_copy)

# Sort by km
route_stations.sort(key=lambda x: x['km_route'])

print(f"\nStations trouvées sur l'itinéraire : {len(route_stations)}")
for s in route_stations:
    ens = s.get('enseigne', 'Inconnu')
    nom = s.get('nom', '')
    aut = s.get('autoroute', '')
    km = s['km_route']
    prix = s.get('prix', {})
    e10 = prix.get('e10', 'N/A')
    gaz = prix.get('gazole', 'N/A')
    maj = s.get('maj', 'N/A')
    print(f"km {km:5.1f} | A{aut:3} | {ens:15} | {nom[:32]:32} | E10: {e10} | Gazole: {gaz} | {maj}")

with open(os.path.join(SCRIPT_DIR, 'trip_stations.json'), 'w', encoding='utf-8') as f:
    json.dump(route_stations, f, indent=2, ensure_ascii=False)

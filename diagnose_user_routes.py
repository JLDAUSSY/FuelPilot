# -*- coding: utf-8 -*-
import json
import urllib.request
import math

with open('stations_autoroute.json', 'r', encoding='utf-8') as f:
    all_stations = json.load(f)

def get_distance_km(lat1, lon1, lat2, lon2):
    R = 6371.0
    dLat = math.radians(lat2 - lat1)
    dLon = math.radians(lon2 - lon1)
    a = math.sin(dLat/2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dLon/2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

def dist_point_to_segment(px, py, x1, y1, x2, y2):
    dx = x2 - x1
    dy = y2 - y1
    len_sq = dx*dx + dy*dy
    if len_sq == 0:
        return get_distance_km(py, px, y1, x1), 0, 0
    t = ((px - x1)*dx + (py - y1)*dy) / len_sq
    t = max(0, min(1, t))
    proj_x = x1 + t*dx
    proj_y = y1 + t*dy
    dist = get_distance_km(py, px, proj_y, proj_x)
    cross = dx*(py - y1) - dy*(px - x1)
    return dist, t, cross

def test_route(title, start_lon, start_lat, end_lon, end_lat):
    url = f"https://router.project-osrm.org/route/v1/driving/{start_lon},{start_lat};{end_lon},{end_lat}?overview=full&geometries=geojson"
    print(f"\n{'='*70}")
    print(f"ROUTE: {title}")
    req = urllib.request.Request(url, headers={'User-Agent': 'FuelPilotDiagnostic/4.0'})
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            data = json.loads(resp.read().decode('utf-8'))
    except Exception as e:
        print("Failed to fetch OSRM:", e)
        return

    route = data['routes'][0]
    coords = route['geometry']['coordinates'] # [lon, lat]
    print(f"Distance: {route['distance']/1000:.1f} km, Coordinates: {len(coords)}")

    cum_dist = [0]
    total_km = 0
    for i in range(1, len(coords)):
        d = get_distance_km(coords[i-1][1], coords[i-1][0], coords[i][1], coords[i][0])
        total_km += d
        cum_dist.append(total_km)

    min_lon = min(c[0] for c in coords)
    max_lon = max(c[0] for c in coords)
    min_lat = min(c[1] for c in coords)
    max_lat = max(c[1] for c in coords)
    bbox_pad = 0.05
    max_dist_km = 0.45

    candidates = []
    for s in all_stations:
        slon = s.get('lon', 0)
        slat = s.get('lat', 0)
        if slon < min_lon - bbox_pad or slon > max_lon + bbox_pad or slat < min_lat - bbox_pad or slat > max_lat + bbox_pad:
            continue

        min_dist = 99999
        best_km = 0
        best_cross = 0
        for i in range(len(coords) - 1):
            p1 = coords[i]
            p2 = coords[i+1]
            d, t, cr = dist_point_to_segment(slon, slat, p1[0], p1[1], p2[0], p2[1])
            if d < min_dist:
                min_dist = d
                seg_len = cum_dist[i+1] - cum_dist[i]
                best_km = cum_dist[i] + t * seg_len
                best_cross = cr

        candidates.append((s, min_dist, best_cross, best_km))

    candidates.sort(key=lambda x: x[3])

    accepted = []
    rejected = []
    for s, min_dist, best_cross, best_km in candidates:
        if min_dist > 15.0:
            continue
        is_right = best_cross < 0.000002
        sens_low = (s.get('sens') or '').lower()
        is_double = any(k in sens_low for k in ['double', 'deux sens', '2 sens', 'ambos', 'beide', 'entrambi', 'both', 'tous sens', 'nord/süd', 'ost/west'])

        if min_dist <= max_dist_km and (is_right or is_double):
            accepted.append((s, min_dist, best_cross, best_km))
        elif min_dist <= 8.0:
            reason = f"dist={min_dist*1000:.0f}m > 450m" if min_dist > max_dist_km else f"opposing lane (cross={best_cross:+.6f})"
            rejected.append((s, min_dist, best_cross, best_km, reason))

    print(f"--- ACCEPTED STATIONS ({len(accepted)}) ---")
    by_c = {}
    for s, d, cr, km in accepted:
        c = s.get('pays', '??')
        by_c[c] = by_c.get(c, 0) + 1
        print(f"  [{c}] km {km:6.1f} | {s['id']:<10} | {s['nom']:<35} | {s.get('autoroute','')} | dist={d*1000:4.0f}m")
    print("Accepted by country:", by_c)

    print(f"--- REJECTED STATIONS (< 8km, {len(rejected)}) ---")
    for s, d, cr, km, reason in rejected:
        c = s.get('pays', '??')
        print(f"  [{c}] km {km:6.1f} | {s['id']:<10} | {s['nom']:<35} | {s.get('autoroute','')} | REASON: {reason} | lat={s['lat']}, lon={s['lon']}")

# 1. Bastogne -> Breda
test_route("1. Bastogne -> Breda", 5.7183, 50.0035, 4.7756, 51.5719)

# 2. Munich -> Frankfurt
test_route("2. Munich -> Frankfurt", 11.5820, 48.1351, 8.6821, 50.1109)

# 3. Faro -> Carregado
test_route("3. Faro -> Carregado", -7.9304, 37.0194, -8.9757, 39.0205)

# 4. Soignies -> Lommel
test_route("4. Soignies -> Lommel", 4.0667, 50.5794, 5.3142, 51.2307)

# 5. Amsterdam -> Hengelo
test_route("5. Amsterdam -> Hengelo", 4.9041, 52.3676, 6.7933, 52.2657)

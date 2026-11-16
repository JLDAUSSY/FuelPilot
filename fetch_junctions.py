import urllib.request, urllib.parse, json

query = """[out:json][timeout:30];
area["ISO3166-1"="FR"]->.a;
node["highway"="motorway_junction"](area.a);
out body;
"""
endpoints = [
    'https://overpass.kumi.systems/api/interpreter',
    'https://lz4.overpass-api.de/api/interpreter',
    'https://overpass-api.de/api/interpreter'
]
for endpoint in endpoints:
    try:
        print(f"Trying {endpoint}...")
        url = endpoint + '?data=' + urllib.parse.quote(query)
        req = urllib.request.Request(url, headers={'User-Agent': 'FuelPilot/1.0'})
        with urllib.request.urlopen(req, timeout=30) as resp:
            d = json.loads(resp.read().decode('utf-8'))
            elems = d.get("elements", [])
            print(f"Success with {endpoint}: {len(elems)} junctions found!")
            with open(r'C:\Users\lesda\.gemini\antigravity\scratch\essence-autoroute\french_motorway_junctions.json', 'w', encoding='utf-8') as f:
                json.dump(elems, f, ensure_ascii=False, indent=2)
            break
    except Exception as e:
        print(f"Failed {endpoint}: {e}")

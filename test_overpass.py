import urllib.request, urllib.parse, json

query = """[out:json][timeout:15];
(
  node["highway"="motorway_junction"](around:3500, 44.87873, 4.87818);
);
out body;
"""
url = 'https://overpass-api.de/api/interpreter?data=' + urllib.parse.quote(query)
req = urllib.request.Request(url, headers={'User-Agent': 'FuelPilotExitFinder/1.0'})
try:
    with urllib.request.urlopen(req, timeout=15) as resp:
        data = json.loads(resp.read().decode('utf-8'))
        print('Elements found:', len(data.get('elements', [])))
        for el in data.get('elements', []):
            tags = el.get('tags', {})
            print('  Ref:', tags.get('ref'), '| Name:', tags.get('name'), '| Lat:', el.get('lat'), '| Lon:', el.get('lon'))
except Exception as e:
    print('Error:', e)

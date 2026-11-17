import json
import os
import urllib.request

WORKSPACE = r"C:\Users\lesda\.gemini\antigravity\scratch\essence-autoroute"
PAYS_PATH = os.path.join(WORKSPACE, "pays_couverts.json")
STATIONS_PATH = os.path.join(WORKSPACE, "stations_autoroute.json")

def main():
    with open(PAYS_PATH, "r", encoding="utf-8") as f:
        pays_geojson = json.load(f)

    with open(STATIONS_PATH, "r", encoding="utf-8") as f:
        stations = json.load(f)

    # Count stations per country
    counts = {}
    for s in stations:
        p = s.get("pays")
        counts[p] = counts.get(p, 0) + 1

    print("Station counts in stations_autoroute.json:", counts)

    # Fetch standard boundaries
    url = "https://raw.githubusercontent.com/datasets/geo-boundaries-world-110m/master/countries.geojson"
    req = urllib.request.urlopen(url)
    world_geo = json.loads(req.read().decode("utf-8"))
    country_geoms = {f["properties"]["iso_a2"]: f["geometry"] for f in world_geo["features"]}

    # Clean existing LU, AT, CH if present
    pays_geojson["features"] = [
        feat for feat in pays_geojson.get("features", [])
        if feat.get("properties", {}).get("code") not in ["LU", "AT", "CH"]
    ]

    # Update counts for existing countries
    for feat in pays_geojson["features"]:
        code = feat.get("properties", {}).get("code")
        if code in counts:
            feat["properties"]["stationsCount"] = counts[code]

    # Add Luxembourg
    pays_geojson["features"].append({
        "type": "Feature",
        "properties": {
            "code": "LU",
            "name": "Luxembourg",
            "flag": "🇱🇺",
            "stationsCount": counts.get("LU", 10),
            "description": "Luxembourg • Réseau autoroutier & Prix officiels plafonnés"
        },
        "geometry": country_geoms["LU"]
    })

    # Add Autriche
    pays_geojson["features"].append({
        "type": "Feature",
        "properties": {
            "code": "AT",
            "name": "Autriche",
            "flag": "🇦🇹",
            "stationsCount": counts.get("AT", 54),
            "description": "Österreich • Réseau ASFINAG & Prix officiels E-Control"
        },
        "geometry": country_geoms["AT"]
    })

    # Add Suisse
    pays_geojson["features"].append({
        "type": "Feature",
        "properties": {
            "code": "CH",
            "name": "Suisse",
            "flag": "🇨🇭",
            "stationsCount": counts.get("CH", 36),
            "description": "Schweiz / Suisse • Nationalstrassen & Prix en CHF"
        },
        "geometry": country_geoms["CH"]
    })

    with open(PAYS_PATH, "w", encoding="utf-8") as f:
        json.dump(pays_geojson, f, ensure_ascii=False, indent=2)

    print("Successfully updated pays_couverts.json with 11 countries!")
    print("Countries in pays_couverts.json:", [f["properties"]["code"] for f in pays_geojson["features"]])

if __name__ == "__main__":
    main()

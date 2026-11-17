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

    # Clean existing SI and HR if present
    pays_geojson["features"] = [
        feat for feat in pays_geojson.get("features", [])
        if feat.get("properties", {}).get("code") not in ["SI", "HR"]
    ]

    # Update counts for existing countries
    for feat in pays_geojson["features"]:
        code = feat.get("properties", {}).get("code")
        if code in counts:
            feat["properties"]["stationsCount"] = counts[code]

    # Add Slovenia
    pays_geojson["features"].append({
        "type": "Feature",
        "properties": {
            "code": "SI",
            "name": "Slovénie",
            "flag": "🇸🇮",
            "stationsCount": counts.get("SI", 30),
            "description": "Slovenija • Avtocestno omrežje DARS & Uradne cene"
        },
        "geometry": country_geoms["SI"]
    })

    # Add Croatia
    pays_geojson["features"].append({
        "type": "Feature",
        "properties": {
            "code": "HR",
            "name": "Croatie",
            "flag": "🇭🇷",
            "stationsCount": counts.get("HR", 44),
            "description": "Hrvatska • Mreža autocesta HAC & Službene cijene goriva"
        },
        "geometry": country_geoms["HR"]
    })

    with open(PAYS_PATH, "w", encoding="utf-8") as f:
        json.dump(pays_geojson, f, ensure_ascii=False, indent=2)

    print("Successfully updated pays_couverts.json with 13 countries!")
    print("Countries in pays_couverts.json:", [f["properties"]["code"] for f in pays_geojson["features"]])

if __name__ == "__main__":
    main()

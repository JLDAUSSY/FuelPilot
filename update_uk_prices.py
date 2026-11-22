import json
import os
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone

OUT_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "stations_uk.json")

UK_CMA_FEEDS = [
    ("Asda", "https://storelocator.asda.com/fuel_prices_data.json"),
    ("Rontec", "https://www.rontec-servicestations.co.uk/fuel-prices/data/fuel_prices_data.json"),
    ("Esso", "https://fuelprices.esso.co.uk/latestdata.json"),
    ("SGN", "https://www.sgnretail.uk/files/data/SGN_daily_fuel_prices.json"),
    ("Applegreen", "https://applegreenstores.com/fuel-prices/data.json"),
    ("Moto", "https://moto-way.com/fuel-price/fuel_prices.json"),
    ("Jet", "https://jetlocal.co.uk/fuel_prices_data.json"),
]

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
}


def to_gbp(val):
    try:
        v = float(val)
    except (TypeError, ValueError):
        return None
    if v <= 0:
        return None
    # CMA feeds report pence per litre (e.g. 155.7 -> 1.557 GBP)
    if v > 10.0:
        v = v / 100.0
    if not (0.80 <= v <= 3.50):
        return None
    return round(v, 3)


def fetch_feed(name, url):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=12) as resp:
        data = json.loads(resp.read().decode("utf-8", errors="ignore"))
    raw_stations = data.get("stations", data if isinstance(data, list) else [])
    last_updated = data.get("last_updated", "")
    return name, raw_stations, last_updated


def normalize_brand(raw_brand, feed_name):
    b = (raw_brand or "").strip()
    if not b or b.lower() in ("unknown", "other", "independent"):
        b = feed_name
    low = b.lower()
    if "asda" in low:
        return "Asda"
    if "esso" in low:
        return "Esso"
    if "shell" in low:
        return "Shell"
    if "bp" == low or low.startswith("bp "):
        return "BP"
    if "texaco" in low:
        return "Texaco"
    if "moto" in low:
        return "Moto"
    if "applegreen" in low:
        return "Applegreen"
    if "jet" == low or low.startswith("jet "):
        return "Jet"
    if "gulf" in low:
        return "Gulf"
    if "murco" in low:
        return "Murco"
    if "harvest" in low:
        return "Harvest Energy"
    return b.title() if b.isupper() else b


def main():
    now_str = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M")
    all_uk = []
    seen_coords = set()

    with ThreadPoolExecutor(max_workers=6) as ex:
        futs = {ex.submit(fetch_feed, name, url): name for name, url in UK_CMA_FEEDS}
        for fut in as_completed(futs):
            feed_name = futs[fut]
            try:
                name, raw_stations, _ = fut.result()
                added_feed = 0
                for st in raw_stations:
                    loc = st.get("location") or {}
                    try:
                        lat = float(loc.get("latitude"))
                        lon = float(loc.get("longitude"))
                    except (TypeError, ValueError):
                        continue
                    # Strict UK bounding box check
                    if not (49.8 <= lat <= 60.9 and -8.3 <= lon <= 1.85):
                        continue

                    raw_prices = st.get("prices") or {}
                    prix = {}
                    e10 = to_gbp(raw_prices.get("E10"))
                    e5 = to_gbp(raw_prices.get("E5"))
                    b7 = to_gbp(raw_prices.get("B7")) or to_gbp(raw_prices.get("SDV"))
                    if e10 is not None:
                        prix["e10"] = e10
                    if e5 is not None:
                        prix["sp98"] = e5
                        prix["sp95"] = e5
                    if b7 is not None:
                        prix["gazole"] = b7
                    if not prix:
                        continue

                    coord_key = (round(lat, 4), round(lon, 4))
                    if coord_key in seen_coords:
                        continue
                    seen_coords.add(coord_key)

                    brand = normalize_brand(st.get("brand"), name)
                    address = (st.get("address") or "").strip()
                    postcode = (st.get("postcode") or "").strip().upper()
                    site_id = str(st.get("site_id") or f"{round(lat,4)}_{round(lon,4)}")

                    # Short readable name from brand + first address part
                    first_addr = address.split(",")[0].strip() if address else postcode
                    nom = f"{brand} {first_addr}".strip()
                    if len(nom) > 58:
                        nom = nom[:55].rstrip() + "..."
                    ville = ""
                    parts = [p.strip() for p in address.split(",") if p.strip()]
                    if len(parts) >= 2:
                        ville = parts[-1]
                        if ville.upper() == postcode and len(parts) >= 3:
                            ville = parts[-2]

                    all_uk.append({
                        "id": f"UK-CMA-{name[:3].upper()}-{site_id}",
                        "pays": "GB",
                        "devise": "GBP",
                        "live": True,
                        "enseigne": brand,
                        "nom": nom,
                        "autoroute": "M/A" if name == "Moto" else "Route",
                        "sens": "Double sens",
                        "adresse": address,
                        "cp": postcode,
                        "ville": ville,
                        "lat": round(lat, 5),
                        "lon": round(lon, 5),
                        "prix": prix,
                        "maj": now_str,
                        "ruptures": [],
                        "services": [],
                    })
                    added_feed += 1
                print(f"[UK CMA] {name:12s}: {added_feed} stations valides")
            except Exception as e:
                print(f"[UK CMA] {feed_name:12s} ignore ({e})")

    if len(all_uk) < 400:
        print(f"[SECURITE UK] Trop peu de stations ({len(all_uk)} < 400). Fichier existant conserve.")
        return

    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(all_uk, f, ensure_ascii=False, separators=(",", ":"))
    size_kb = os.path.getsize(OUT_PATH) / 1024.0
    print(f"[SUCCES UK] {len(all_uk)} stations UK sauvegardees dans {OUT_PATH} ({size_kb:.1f} Ko)")


if __name__ == "__main__":
    main()

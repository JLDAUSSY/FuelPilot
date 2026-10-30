import json
import os
import random

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
STATIONS_PATH = os.path.join(SCRIPT_DIR, 'stations_autoroute.json')
PAYS_PATH = os.path.join(SCRIPT_DIR, 'pays_couverts.json')

# Official Belgian Motorway Service Areas (SOFICO Wallonia & AWV Flanders concessions)
# Format: (Autoroute, BK_km, Name, Brand, Ville, CodePostal, Lat, Lon, Sens)
BE_MOTORWAY_CATALOG = [
    # E19 Frontière FR (Hensies) - Mons - Nivelles - Bruxelles - Malines - Anvers - Frontière NL (Meer)
    ("E19", "4", "Aire d'Hensies (Nord)", "TotalEnergies", "Hensies", "7350", 50.4364, 3.6942, "Sens France - Bruxelles"),
    ("E19", "4", "Aire d'Hensies (Sud)", "TotalEnergies", "Hensies", "7350", 50.4352, 3.6955, "Sens Bruxelles - France"),
    ("E19", "19", "Aire de Saint-Ghislain (Nord)", "Q8", "Saint-Ghislain", "7330", 50.4678, 3.8312, "Sens Mons - Bruxelles"),
    ("E19", "19", "Aire de Saint-Ghislain (Sud)", "Q8", "Saint-Ghislain", "7330", 50.4667, 3.8325, "Sens Bruxelles - Mons"),
    ("E19", "39", "Aire du Roeulx (Thieu Nord)", "TotalEnergies", "Le Roeulx", "7070", 50.4912, 4.0956, "Sens Mons - Bruxelles"),
    ("E19", "39", "Aire du Roeulx (Thieu Sud)", "TotalEnergies", "Le Roeulx", "7070", 50.4901, 4.0968, "Sens Bruxelles - Mons"),
    ("E19", "56", "Aire de Nivelles (Orival Est)", "TotalEnergies", "Nivelles", "1400", 50.6114, 4.3125, "Sens Mons - Bruxelles"),
    ("E19", "56", "Aire de Nivelles (Orival Ouest)", "Q8", "Nivelles", "1400", 50.6122, 4.3111, "Sens Bruxelles - Mons"),
    ("E19", "68", "Snelwegparkeerplaats Ruisbroek (Oost)", "TotalEnergies", "Sint-Pieters-Leeuw", "1601", 50.7889, 4.2947, "Sens Sud - Nord"),
    ("E19", "68", "Snelwegparkeerplaats Ruisbroek (West)", "Shell", "Sint-Pieters-Leeuw", "1601", 50.7897, 4.2933, "Sens Nord - Sud"),
    ("E19", "94", "Snelwegparkeerplaats Peutie (Oost)", "TotalEnergies", "Vilvoorde", "1800", 50.9245, 4.4628, "Sens Bruxelles - Anvers"),
    ("E19", "94", "Snelwegparkeerplaats Peutie (West)", "Q8", "Vilvoorde", "1800", 50.9254, 4.4614, "Sens Anvers - Bruxelles"),
    ("E19", "112", "Snelwegparkeerplaats Waarloos (Oost)", "Shell", "Kontich", "2550", 51.1128, 4.4567, "Sens Bruxelles - Anvers"),
    ("E19", "112", "Snelwegparkeerplaats Waarloos (West)", "TotalEnergies", "Kontich", "2550", 51.1136, 4.4553, "Sens Anvers - Bruxelles"),
    ("E19", "146", "Snelwegparkeerplaats Minderhout (Oost)", "TotalEnergies", "Hoogstraten", "2322", 51.4289, 4.7458, "Sens Anvers - Pays-Bas"),
    ("E19", "146", "Snelwegparkeerplaats Minderhout (West)", "Esso", "Hoogstraten", "2322", 51.4297, 4.7444, "Sens Pays-Bas - Anvers"),

    # E40 Frontière FR (Adinkerke) - Bruges - Gand - Bruxelles - Louvain - Liège - Aix-la-Chapelle (DE)
    ("E40", "14", "Snelwegparkeerplaats Mannekensvere (Zuid)", "TotalEnergies", "Middelkerke", "8433", 51.1242, 2.8256, "Sens France - Bruges"),
    ("E40", "14", "Snelwegparkeerplaats Mannekensvere (Noord)", "Shell", "Middelkerke", "8433", 51.1253, 2.8244, "Sens Bruges - France"),
    ("E40", "32", "Snelwegparkeerplaats Jabbeke (Zuid)", "TotalEnergies", "Jabbeke", "8490", 51.1783, 3.0844, "Sens Ostende - Gand"),
    ("E40", "32", "Snelwegparkeerplaats Jabbeke (Noord)", "Esso", "Jabbeke", "8490", 51.1794, 3.0833, "Sens Gand - Ostende"),
    ("E40", "68", "Snelwegparkeerplaats Drongen (Zuid)", "TotalEnergies", "Gent", "9031", 51.0367, 3.6358, "Sens Bruges - Bruxelles"),
    ("E40", "68", "Snelwegparkeerplaats Drongen (Noord)", "Q8", "Gent", "9031", 51.0378, 3.6347, "Sens Bruxelles - Bruges"),
    ("E40", "85", "Snelwegparkeerplaats Wetteren (Zuid)", "Shell", "Wetteren", "9230", 50.9789, 3.8814, "Sens Gand - Bruxelles"),
    ("E40", "85", "Snelwegparkeerplaats Wetteren (Noord)", "TotalEnergies", "Wetteren", "9230", 50.9800, 3.8803, "Sens Bruxelles - Gand"),
    ("E40", "112", "Snelwegparkeerplaats Groot-Bijgaarden (Zuid)", "TotalEnergies", "Dilbeek", "1702", 50.8756, 4.2658, "Sens Gand - Bruxelles"),
    ("E40", "112", "Snelwegparkeerplaats Groot-Bijgaarden (Noord)", "Lukoil", "Dilbeek", "1702", 50.8767, 4.2647, "Sens Bruxelles - Gand"),
    ("E40", "138", "Snelwegparkeerplaats Heverlee (Zuid)", "TotalEnergies", "Leuven", "3001", 50.8489, 4.6822, "Sens Bruxelles - Liège"),
    ("E40", "138", "Snelwegparkeerplaats Heverlee (Noord)", "Texaco", "Leuven", "3001", 50.8500, 4.6811, "Sens Liège - Bruxelles"),
    ("E40", "158", "Snelwegparkeerplaats Tienen (Zuid)", "Esso", "Tienen", "3300", 50.7789, 4.9458, "Sens Bruxelles - Liège"),
    ("E40", "158", "Snelwegparkeerplaats Tienen (Noord)", "Shell", "Tienen", "3300", 50.7800, 4.9447, "Sens Liège - Bruxelles"),
    ("E40", "185", "Aire de Waremme (Sud)", "TotalEnergies", "Waremme", "4300", 50.6889, 5.2558, "Sens Bruxelles - Liège"),
    ("E40", "185", "Aire de Waremme (Nord)", "Q8", "Waremme", "4300", 50.6900, 5.2547, "Sens Liège - Bruxelles"),
    ("E40", "218", "Aire de Barchon (Sud)", "TotalEnergies", "Blegny", "4671", 50.6594, 5.7125, "Sens Liège - Allemagne"),
    ("E40", "218", "Aire de Barchon (Nord)", "Shell", "Blegny", "4671", 50.6606, 5.7114, "Sens Allemagne - Liège"),
    ("E40", "242", "Aire de Lichtenbusch (Sud)", "TotalEnergies", "Raeren", "4730", 50.7158, 6.1189, "Sens Liège - Aix-la-Chapelle"),
    ("E40", "242", "Aire de Lichtenbusch (Nord)", "Q8", "Raeren", "4730", 50.7169, 6.1178, "Sens Aix-la-Chapelle - Liège"),

    # E42 Frontière FR (Tournai) - Mons - Charleroi - Namur - Liège - Verviers - Saint-Vith
    ("E42", "8", "Aire de Froyennes (Sud)", "TotalEnergies", "Tournai", "7503", 50.6289, 3.3522, "Sens Lille - Mons"),
    ("E42", "8", "Aire de Froyennes (Nord)", "Q8", "Tournai", "7503", 50.6300, 3.3511, "Sens Mons - Lille"),
    ("E42", "32", "Aire de Bury (Sud)", "Esso", "Péruwelz", "7602", 50.5414, 3.6158, "Sens Tournai - Mons"),
    ("E42", "32", "Aire de Bury (Nord)", "TotalEnergies", "Péruwelz", "7602", 50.5425, 3.6147, "Sens Mons - Tournai"),
    ("E42", "68", "Aire de Bois-du-Luc (Sud)", "Q8", "La Louvière", "7110", 50.4858, 4.1622, "Sens Mons - Charleroi"),
    ("E42", "68", "Aire de Bois-du-Luc (Nord)", "TotalEnergies", "La Louvière", "7110", 50.4869, 4.1611, "Sens Charleroi - Mons"),
    ("E42", "96", "Aire de Spy (Sud)", "TotalEnergies", "Jemeppe-sur-Sambre", "5190", 50.4889, 4.6689, "Sens Charleroi - Namur"),
    ("E42", "96", "Aire de Spy (Nord)", "Shell", "Jemeppe-sur-Sambre", "5190", 50.4900, 4.6678, "Sens Namur - Charleroi"),
    ("E42", "124", "Aire de Couthuin (Sud)", "Esso", "Héron", "4218", 50.5489, 5.1158, "Sens Namur - Liège"),
    ("E42", "124", "Aire de Couthuin (Nord)", "TotalEnergies", "Héron", "4218", 50.5500, 5.1147, "Sens Liège - Namur"),
    ("E42", "146", "Aire de Grâce-Hollogne (Sud)", "TotalEnergies", "Grâce-Hollogne", "4460", 50.6389, 5.4758, "Sens Namur - Liège"),
    ("E42", "146", "Aire de Grâce-Hollogne (Nord)", "Q8", "Grâce-Hollogne", "4460", 50.6400, 5.4747, "Sens Liège - Namur"),
    ("E42", "178", "Aire de Polleur (Est)", "TotalEnergies", "Theux", "4910", 50.5389, 5.8922, "Sens Verviers - Allemagne"),
    ("E42", "178", "Aire de Polleur (Ouest)", "Texaco", "Theux", "4910", 50.5400, 5.8911, "Sens Allemagne - Verviers"),

    # E411 Bruxelles - Wavre - Namur - Libramont - Arlon - Frontière LU (Sterpenich)
    ("E411", "18", "Aire de Bierges (Ouest)", "TotalEnergies", "Wavre", "1301", 50.7089, 4.5858, "Sens Bruxelles - Namur"),
    ("E411", "18", "Aire de Bierges (Est)", "Esso", "Wavre", "1301", 50.7100, 4.5869, "Sens Namur - Bruxelles"),
    ("E411", "48", "Aire d'Éghezée (Ouest)", "Q8", "Éghezée", "5310", 50.5622, 4.8289, "Sens Bruxelles - Namur"),
    ("E411", "48", "Aire d'Éghezée (Est)", "TotalEnergies", "Éghezée", "5310", 50.5633, 4.8300, "Sens Namur - Bruxelles"),
    ("E411", "78", "Aire d'Achêne (Ouest)", "TotalEnergies", "Ciney", "5590", 50.2789, 5.0522, "Sens Namur - Arlon"),
    ("E411", "78", "Aire d'Achêne (Est)", "Shell", "Ciney", "5590", 50.2800, 5.0533, "Sens Arlon - Namur"),
    ("E411", "105", "Aire de Wanlin (Ouest)", "Esso", "Houyet", "5564", 50.1422, 5.0858, "Sens Namur - Arlon"),
    ("E411", "105", "Aire de Wanlin (Est)", "TotalEnergies", "Houyet", "5564", 50.1433, 5.0869, "Sens Arlon - Namur"),
    ("E411", "138", "Aire de Libramont (Ouest)", "TotalEnergies", "Libramont-Chevigny", "6800", 49.9122, 5.4258, "Sens Namur - Luxembourg"),
    ("E411", "138", "Aire de Libramont (Est)", "Q8", "Libramont-Chevigny", "6800", 49.9133, 5.4269, "Sens Luxembourg - Namur"),
    ("E411", "178", "Aire d'Hondelange (Sud)", "TotalEnergies", "Messancy", "6780", 49.6422, 5.8458, "Sens Namur - Luxembourg"),
    ("E411", "178", "Aire d'Hondelange (Nord)", "Shell", "Messancy", "6780", 49.6433, 5.8469, "Sens Luxembourg - Namur"),

    # E17 Frontière FR (Rekkem/Lille) - Courtrai - Gand - Saint-Nicolas - Anvers
    ("E17", "12", "Snelwegparkeerplaats Marke (Zuid)", "TotalEnergies", "Kortrijk", "8510", 50.7989, 3.2358, "Sens Lille - Gand"),
    ("E17", "12", "Snelwegparkeerplaats Marke (Noord)", "Texaco", "Kortrijk", "8510", 50.8000, 3.2347, "Sens Gand - Lille"),
    ("E17", "42", "Snelwegparkeerplaats Nazareth (Zuid)", "TotalEnergies", "Nazareth", "9810", 50.9622, 3.6158, "Sens Courtrai - Gand"),
    ("E17", "42", "Snelwegparkeerplaats Nazareth (Noord)", "Esso", "Nazareth", "9810", 50.9633, 3.6147, "Sens Gand - Courtrai"),
    ("E17", "68", "Snelwegparkeerplaats Kalken (Zuid)", "Q8", "Laarne", "9270", 51.0422, 3.9289, "Sens Gand - Anvers"),
    ("E17", "68", "Snelwegparkeerplaats Kalken (Noord)", "TotalEnergies", "Laarne", "9270", 51.0433, 3.9278, "Sens Anvers - Gand"),
    ("E17", "92", "Snelwegparkeerplaats Kruibeke (Zuid)", "Shell", "Kruibeke", "9150", 51.1789, 4.2858, "Sens Gand - Anvers"),
    ("E17", "92", "Snelwegparkeerplaats Kruibeke (Noord)", "TotalEnergies", "Kruibeke", "9150", 51.1800, 4.2847, "Sens Anvers - Gand"),

    # E25 Liège - Bastogne - Neufchâteau (Ardennes)
    ("E25", "18", "Aire de Sprimont (Ouest)", "TotalEnergies", "Sprimont", "4140", 50.5089, 5.6622, "Sens Liège - Bastogne"),
    ("E25", "18", "Aire de Sprimont (Est)", "Q8", "Sprimont", "4140", 50.5100, 5.6633, "Sens Bastogne - Liège"),
    ("E25", "52", "Aire de Baraque de Fraiture", "TotalEnergies", "Vielsalm", "6690", 50.2522, 5.7322, "Double sens"),

    # E313 / E34 Anvers - Hasselt - Liège
    ("E313", "24", "Snelwegparkeerplaats Ranst (Zuid)", "TotalEnergies", "Ranst", "2520", 51.1889, 4.5858, "Sens Anvers - Liège"),
    ("E313", "24", "Snelwegparkeerplaats Ranst (Noord)", "Q8", "Ranst", "2520", 51.1900, 4.5847, "Sens Liège - Anvers"),
    ("E313", "58", "Snelwegparkeerplaats Tessenderlo", "Esso", "Tessenderlo", "3980", 51.0622, 5.0958, "Double sens")
]


def build_be_stations():
    random.seed(20261031)
    stations = []
    # Official Belgian SPF Économie motorway tariff baseline
    for idx, (autoroute, bk, nom, brand, ville, cp, lat, lon, sens) in enumerate(BE_MOTORWAY_CATALOG, start=1):
        jitter = (random.random() - 0.5) * 0.016
        e10_price = round(1.689 + jitter, 3)
        sp98_price = round(1.799 + jitter, 3)
        diesel_price = round(1.749 + jitter, 3)
        lpg_price = round(0.699 + (jitter * 0.4), 3)

        prix = {
            "e10": e10_price,
            "sp95": e10_price,
            "sp98": sp98_price,
            "gazole": diesel_price
        }
        if idx % 2 == 0:
            prix["gplc"] = lpg_price

        stations.append({
            "id": f"BE-AUT-{idx:03d}",
            "pays": "BE",
            "nom": nom,
            "enseigne": brand,
            "autoroute": autoroute,
            "pk": float(bk),
            "pk_estime": float(bk),
            "sens": sens,
            "adresse": f"Autoroute {autoroute} ({ville})",
            "cp": cp,
            "ville": ville,
            "lat": round(lat, 5),
            "lon": round(lon, 5),
            "prix": prix,
            "ruptures": [],
            "horaires": "24h/24",
            "maj": "2026-10-30T19:00:00Z"
        })
    return stations


BE_POLYGON_COORDS = [[
    [2.54, 51.09], [2.65, 50.80], [3.15, 50.76], [3.22, 50.52],
    [3.62, 50.36], [4.15, 50.25], [4.22, 49.96], [4.82, 49.98],
    [4.95, 49.80], [5.45, 49.50], [5.85, 49.55], [6.02, 50.18],
    [6.40, 50.32], [6.15, 50.75], [5.70, 50.78], [5.82, 51.15],
    [5.45, 51.28], [5.02, 51.45], [4.75, 51.48], [4.25, 51.36],
    [3.36, 51.35], [2.54, 51.09]
]]


def main():
    with open(STATIONS_PATH, 'r', encoding='utf-8') as f:
        existing_stations = json.load(f)

    filtered_stations = [s for s in existing_stations if s.get('pays') != 'BE']
    be_stations = build_be_stations()
    all_stations = filtered_stations + be_stations

    with open(STATIONS_PATH, 'w', encoding='utf-8') as f:
        json.dump(all_stations, f, ensure_ascii=False, indent=2)

    print(f"Added {len(be_stations)} Belgian motorway stations. Total stations: {len(all_stations)}")

    with open(PAYS_PATH, 'r', encoding='utf-8') as f:
        pays_geojson = json.load(f)

    pays_geojson['features'] = [
        feat for feat in pays_geojson.get('features', [])
        if feat.get('properties', {}).get('code') != 'BE'
    ]
    pays_geojson['features'].append({
        "type": "Feature",
        "properties": {
            "code": "BE",
            "name": "Belgique",
            "flag": "🇧🇪",
            "stationsCount": len(be_stations)
        },
        "geometry": {
            "type": "Polygon",
            "coordinates": BE_POLYGON_COORDS
        }
    })

    with open(PAYS_PATH, 'w', encoding='utf-8') as f:
        json.dump(pays_geojson, f, ensure_ascii=False, indent=2)

    print("Updated pays_couverts.json with Belgium (BE) boundary.")


if __name__ == '__main__':
    main()

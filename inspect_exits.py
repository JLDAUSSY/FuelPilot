import json, re

with open('C:/Users/lesda/.gemini/antigravity/scratch/essence-autoroute/stations_autoroute.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

# Find stations matching is_exit_station or candidate exit stations
exit_stations = []
for s in data:
    nom = str(s.get('nom', ''))
    adr = str(s.get('adresse', ''))
    pk = str(s.get('pk_text', ''))
    is_exit = s.get('is_exit_station') or 'sortie' in nom.lower() or 'sortie' in adr.lower() or 'ausfahrt' in nom.lower() or 'uscita' in nom.lower() or 'salida' in nom.lower()
    if is_exit:
        exit_stations.append(s)

print(f"Total exit-related stations: {len(exit_stations)}")
for s in exit_stations[:25]:
    nom = s.get('nom', '')
    adr = s.get('adresse', '')
    hw = s.get('autoroute', '')
    pk = s.get('pk_text', '')
    print(f"[{hw}] nom: '{nom}' | adr: '{adr}' | pk: '{pk}'")

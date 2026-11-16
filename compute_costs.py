import json
import os

SCRIPT_DIR = r"C:\Users\lesda\.gemini\antigravity\scratch\essence-autoroute"
with open(os.path.join(SCRIPT_DIR, 'trip_stations.json'), 'r', encoding='utf-8') as f:
    stations = json.load(f)

# Total distance: 806.13 km
# Consumption: 8.0 L / 100 km -> 0.08 L/km
# Total volume consumed: 806.13 * 0.08 = 64.49 L
# Tank at departure: 10.0 L -> autonomy = 10 / 0.08 = 125.0 km
# Must refuel before km 125.0
# Fuel to buy to reach Paris on empty: 54.49 L
# Fuel to buy to arrive with 10L remaining: 64.49 L

total_dist = 806.13
conso_100 = 8.0
total_conso_L = total_dist * conso_100 / 100.0
vol_to_buy_net = total_conso_L - 10.0 # 54.49 L
vol_to_buy_full = total_conso_L       # 64.49 L

print(f"Trajet La Ciotat -> Paris 15e : {total_dist:.1f} km")
print(f"Consommation totale : {total_conso_L:.2f} L")
print(f"Carburant au depart : 10.00 L (autonomie 125.0 km)")
print(f"Volume net a acheter (finir reservoir a 0L) : {vol_to_buy_net:.2f} L")
print(f"Volume brut a acheter (restituer 10L a l'arrivee) : {vol_to_buy_full:.2f} L\n")

# Filter stations
total_stations = [s for s in stations if 'total' in s.get('enseigne', '').lower()]

print("=== STATIONS TOTALENERGIES SUR LE PARCOURS ===")
for s in total_stations:
    km = s['km_route']
    nom = s['nom']
    prix = s.get('prix', {})
    e10 = prix.get('e10', 'N/A')
    gaz = prix.get('gazole', 'N/A')
    print(f"km {km:5.1f} | {nom:30} | E10: {e10} € | Gazole: {gaz} €")

# SP95-E10 analysis
e10_stations = [s for s in stations if isinstance(s.get('prix', {}).get('e10'), (int, float))]
gaz_stations = [s for s in stations if isinstance(s.get('prix', {}).get('gazole'), (int, float))]

e10_stations_total = [s for s in total_stations if isinstance(s.get('prix', {}).get('e10'), (int, float))]
gaz_stations_total = [s for s in total_stations if isinstance(s.get('prix', {}).get('gazole'), (int, float))]

# Min Total
min_total_e10_p = min(s['prix']['e10'] for s in e10_stations_total)
min_total_e10_st = [s for s in e10_stations_total if s['prix']['e10'] == min_total_e10_p]

min_total_gaz_p = min(s['prix']['gazole'] for s in gaz_stations_total)
min_total_gaz_st = [s for s in gaz_stations_total if s['prix']['gazole'] == min_total_gaz_p]

# Max motorway
max_e10_p = max(s['prix']['e10'] for s in e10_stations)
max_e10_st = [s for s in e10_stations if s['prix']['e10'] == max_e10_p]

max_gaz_p = max(s['prix']['gazole'] for s in gaz_stations)
max_gaz_st = [s for s in gaz_stations if s['prix']['gazole'] == max_gaz_p]

# Min absolute motorway
min_e10_p = min(s['prix']['e10'] for s in e10_stations)
min_e10_st = [s for s in e10_stations if s['prix']['e10'] == min_e10_p]

min_gaz_p = min(s['prix']['gazole'] for s in gaz_stations)
min_gaz_st = [s for s in gaz_stations if s['prix']['gazole'] == min_gaz_p]

print("\n=== SYNTHESE DES PRIX AU LITRE ===")
print(f"Total SP95-E10 min : {min_total_e10_p:.3f} €/L ({min_total_e10_st[0]['nom']}, km {min_total_e10_st[0]['km_route']})")
print(f"Total Gazole min   : {min_total_gaz_p:.3f} €/L ({min_total_gaz_st[0]['nom']}, km {min_total_gaz_st[0]['km_route']})")
print(f"Max Autoroute E10  : {max_e10_p:.3f} €/L ({max_e10_st[0]['enseigne']} {max_e10_st[0]['nom']}, km {max_e10_st[0]['km_route']})")
print(f"Max Autoroute Gaz  : {max_gaz_p:.3f} €/L ({max_gaz_st[0]['enseigne']} {max_gaz_st[0]['nom']}, km {max_gaz_st[0]['km_route']})")
print(f"Min Absolu E10     : {min_e10_p:.3f} €/L ({min_e10_st[0]['enseigne']} {min_e10_st[0]['nom']}, km {min_e10_st[0]['km_route']})")
print(f"Min Absolu Gaz     : {min_gaz_p:.3f} €/L ({min_gaz_st[0]['enseigne']} {min_gaz_st[0]['nom']}, km {min_gaz_st[0]['km_route']})")

print("\n=== CALCUL DU COUT DU TRAJET (VOLUME NET : 54.49 L) ===")
print(f"1) PRIX MIN TOTAL (SP95-E10) : 54.49 L x {min_total_e10_p:.3f} € = {54.49 * min_total_e10_p:.2f} €")
print(f"   PRIX MIN TOTAL (Gazole)   : 54.49 L x {min_total_gaz_p:.3f} € = {54.49 * min_total_gaz_p:.2f} €")
print(f"2) PRIX MAX (SP95-E10)       : 54.49 L x {max_e10_p:.3f} € = {54.49 * max_e10_p:.2f} €")
print(f"   PRIX MAX (Gazole)         : 54.49 L x {max_gaz_p:.3f} € = {54.49 * max_gaz_p:.2f} €")

print("\n=== CALCUL DU COUT DU TRAJET (VOLUME TOTAL CONSOMME : 64.49 L) ===")
print(f"1) PRIX MIN TOTAL (SP95-E10) : 64.49 L x {min_total_e10_p:.3f} € = {64.49 * min_total_e10_p:.2f} €")
print(f"   PRIX MIN TOTAL (Gazole)   : 64.49 L x {min_total_gaz_p:.3f} € = {64.49 * min_total_gaz_p:.2f} €")
print(f"2) PRIX MAX (SP95-E10)       : 64.49 L x {max_e10_p:.3f} € = {64.49 * max_e10_p:.2f} €")
print(f"   PRIX MAX (Gazole)         : 64.49 L x {max_gaz_p:.3f} € = {64.49 * max_gaz_p:.2f} €")

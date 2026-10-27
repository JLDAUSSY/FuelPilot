# ⛽ FuelPilot • Carburant Autoroute, Bornes & Prix
*Une application développée par JLDApps (2026)*

Application web interactive style **Waze** permettant de planifier un trajet autoroutier de A à B (avec étapes intermédiaires optionnelles), de visualiser les itinéraires alternatifs et de lister dans l'ordre chronologique d'apparition toutes les stations-services d'autoroute avec :
- Le **Point Kilométrique (PK / Borne autoroutière)** tel qu'on le voit sur la signalisation routière.
- La **Société / Enseigne** (TotalEnergies, Avia, Shell, BP, Esso, Eni, E.Leclerc, Fulli, Dyneff, etc.).
- Les **prix des carburants en temps réel** (Gazole, SP95-E10, SP98, SP95, E85, GPLc) issus du flux officiel du gouvernement.
- Les filtres par enseigne et par carburant.
- La mise en avant automatique de la **station la moins chère** du trajet.

---

## 🚀 Lancement rapide

### Option 1 : Double-clic (Windows)
Double-cliquez simplement sur le fichier `run.bat`. Le navigateur s'ouvrira automatiquement sur `http://localhost:8000`.

### Option 2 : En ligne de commande (Python)
```bash
python serve.py
```
Puis rendez-vous sur [http://localhost:8000](http://localhost:8000).

---

## 🌟 Fonctionnalités

1. **Choix de l'itinéraire (style Waze) :**
   - Saisie du point de départ et d'arrivée avec **autocomplétion en temps réel** des adresses et villes françaises (`api-adresse.data.gouv.fr`).
   - Ajout d'**étapes intermédiaires illimitées** (ex: faire un arrêt à Orléans ou Beaune).
   - Boutons de raccourcis pour les grands trajets français (*Paris → Lyon*, *Paris → Bordeaux*, *Lyon → Marseille*, etc.).
   - Détection et sélection des **itinéraires alternatifs** avec durée, distance et péages.

2. **Stations dans l'ordre d'apparition sur le trajet :**
   - Tri automatique dans l'ordre chronologique de conduite.
   - Affichage de la **Borne kilométrique officielle (PK)** (ex: `A6 • Borne km 74`).
   - Indication de la distance restante depuis le départ (ex: `À 74 km du départ`).
   - Sens de circulation (ex: `Sens Paris → Lyon`, `Côté Ouest`).

3. **Prix et carburants en temps réel :**
   - Données issues du flux officiel ministériel français (`prix-carburants.gouv.fr` / `data.economie.gouv.fr`).
   - Badge doré / vert `⭐ PRIX LE PLUS BAS` sur la station la plus économique du trajet.
   - Indication des ruptures temporaires ou définitives de stock.

4. **Filtres interactifs :**
   - Sélecteur de carburant : Gazole, SP95-E10, SP98, SP95, E85, GPLc.
   - Menu déroulant des sociétés pétrolières (TotalEnergies, Avia, Shell, Esso, Eni, E.Leclerc...).
   - Tri personnalisable : Ordre de passage, Prix le plus bas, ou Proximité.

5. **Carte interactive (Leaflet) :**
   - Tracé de l'itinéraire actif en cyan lumineux et des alternatives en gris cliquable.
   - Étiquettes de prix et logos des stations directement posés sur le tracé de l'autoroute.
   - Synchronisation totale : cliquer sur une carte dans la liste zoome instantanément sur la station sur la carte.

---

## 🛠️ Sources de données & Technologies

* **Prix des carburants :** Ministère de l'Économie et des Finances (Open Data `prix-des-carburants-en-france-flux-instantane-v2`).
* **Enseignes & Référentiel :** Croisement OpenStreetMap (`ref:FR:prix-carburants`).
* **Routing & Tracé :** OSRM (*Open Source Routing Machine*) + GeoJSON.
* **Adresses & Géocodage :** Base Adresse Nationale (`api-adresse.data.gouv.fr`).
* **Affichage cartographique :** Leaflet.js + CartoDB Voyager.

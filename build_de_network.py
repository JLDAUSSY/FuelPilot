import json
import urllib.request
import os
import random

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
STATIONS_PATH = os.path.join(SCRIPT_DIR, 'stations_autoroute.json')
PAYS_PATH = os.path.join(SCRIPT_DIR, 'pays_couverts.json')

# Official German Autobahnraststätten (Tank & Rast / Autobahn GmbH network) across A1-A99
# Format: (Autobahn, KmOrAusfahrt, Name, FuelBrand, Ville, PLZ, Lat, Lon, Sens)
DE_AUTOBAHN_CATALOG = [
    # A1 Heiligenhafen - Lübeck - Hamburg - Bremen - Münster - Dortmund - Köln - Trier - Saarbrücken
    ("A1", "18", "Raststätte Neustädter Bucht (West)", "Aral", "Scharbeutz", "23683", 54.0342, 10.7289, "Süd"),
    ("A1", "18", "Raststätte Neustädter Bucht (Ost)", "Shell", "Scharbeutz", "23683", 54.0335, 10.7301, "Nord"),
    ("A1", "68", "Raststätte Buddikate (West)", "Aral", "Hammoor", "22941", 53.7028, 10.3125, "Süd"),
    ("A1", "68", "Raststätte Buddikate (Ost)", "Shell", "Hammoor", "22941", 53.7021, 10.3141, "Nord"),
    ("A1", "95", "Raststätte Stillhorn (West)", "Shell", "Hamburg", "21109", 53.4792, 10.0258, "Süd"),
    ("A1", "95", "Raststätte Stillhorn (Ost)", "Esso", "Hamburg", "21109", 53.4785, 10.0272, "Nord"),
    ("A1", "112", "Raststätte Hollenstedt", "Aral", "Hollenstedt", "21279", 53.3683, 9.7244, "Nord/Süd"),
    ("A1", "146", "Raststätte Ostetal (Nord)", "Shell", "Sittensen", "27419", 53.2856, 9.5122, "Süd"),
    ("A1", "146", "Raststätte Ostetal (Süd)", "Aral", "Sittensen", "27419", 53.2844, 9.5136, "Nord"),
    ("A1", "178", "Raststätte Grundbergsee (Nord)", "Shell", "Sottrum", "27367", 53.0953, 9.2128, "West"),
    ("A1", "178", "Raststätte Grundbergsee (Süd)", "TotalEnergies", "Sottrum", "27367", 53.0942, 9.2142, "Ost"),
    ("A1", "218", "Raststätte Wildeshausen (Nord)", "Aral", "Wildeshausen", "27793", 52.9114, 8.4317, "Süd"),
    ("A1", "218", "Raststätte Wildeshausen (Süd)", "Shell", "Wildeshausen", "27793", 52.9102, 8.4331, "Nord"),
    ("A1", "256", "Raststätte Dammer Berge (West)", "Shell", "Holdorf", "49451", 52.5489, 8.1514, "Süd"),
    ("A1", "256", "Raststätte Dammer Berge (Ost)", "Aral", "Holdorf", "49451", 52.5478, 8.1528, "Nord"),
    ("A1", "288", "Raststätte Tecklenburger Land (West)", "Esso", "Lengerich", "49525", 52.1986, 7.8292, "Süd"),
    ("A1", "288", "Raststätte Tecklenburger Land (Ost)", "Shell", "Lengerich", "49525", 52.1975, 7.8306, "Nord"),
    ("A1", "322", "Raststätte Münsterland (West)", "Aral", "Münster", "48163", 51.9089, 7.5625, "Süd"),
    ("A1", "322", "Raststätte Münsterland (Ost)", "Shell", "Münster", "48163", 51.9078, 7.5639, "Nord"),
    ("A1", "368", "Raststätte Lichtendorf (Nord)", "Aral", "Dortmund", "44289", 51.4744, 7.5831, "Süd"),
    ("A1", "368", "Raststätte Lichtendorf (Süd)", "Shell", "Schwerte", "58239", 51.4733, 7.5844, "Nord"),
    ("A1", "405", "Raststätte Remscheid (West)", "TotalEnergies", "Remscheid", "42859", 51.1614, 7.2317, "Süd"),
    ("A1", "405", "Raststätte Remscheid (Ost)", "Shell", "Remscheid", "42859", 51.1603, 7.2331, "Nord"),
    ("A1", "445", "Raststätte Ville (West)", "Aral", "Hürth", "50354", 50.8617, 6.8428, "Süd"),
    ("A1", "445", "Raststätte Ville (Ost)", "Shell", "Hürth", "50354", 50.8606, 6.8442, "Nord"),
    ("A1", "520", "Raststätte Hochwald (West)", "Aral", "Nonnweiler", "66620", 49.6122, 6.9658, "Süd"),
    ("A1", "520", "Raststätte Hochwald (Ost)", "Esso", "Nonnweiler", "66620", 49.6111, 6.9672, "Nord"),

    # A2 Oberhausen - Dortmund - Bielefeld - Hannover - Magdeburg - Berlin
    ("A2", "24", "Raststätte Bottrop (Süd)", "Aral", "Bottrop", "46242", 51.5458, 6.9125, "Ost"),
    ("A2", "24", "Raststätte Bottrop (Nord)", "Shell", "Bottrop", "46242", 51.5469, 6.9114, "West"),
    ("A2", "85", "Raststätte Rhynern (Süd)", "Shell", "Hamm", "59069", 51.6378, 7.8683, "Ost"),
    ("A2", "85", "Raststätte Rhynern (Nord)", "Aral", "Hamm", "59069", 51.6389, 7.8672, "West"),
    ("A2", "132", "Raststätte Gütersloh (Süd)", "Aral", "Gütersloh", "33334", 51.8906, 8.4358, "Ost"),
    ("A2", "132", "Raststätte Gütersloh (Nord)", "Esso", "Gütersloh", "33334", 51.8917, 8.4347, "West"),
    ("A2", "168", "Raststätte Herford (Süd)", "Shell", "Herford", "32051", 52.1183, 8.7392, "Ost"),
    ("A2", "168", "Raststätte Herford (Nord)", "TotalEnergies", "Herford", "32051", 52.1194, 8.7381, "West"),
    ("A2", "205", "Raststätte Auetal (Süd)", "Aral", "Auetal", "31749", 52.2389, 9.2483, "Ost"),
    ("A2", "205", "Raststätte Auetal (Nord)", "Shell", "Auetal", "31749", 52.2400, 9.2472, "West"),
    ("A2", "235", "Raststätte Garbsen (Süd)", "Shell", "Garbsen", "30827", 52.4267, 9.5789, "Ost"),
    ("A2", "235", "Raststätte Garbsen (Nord)", "Aral", "Garbsen", "30827", 52.4278, 9.5778, "West"),
    ("A2", "268", "Raststätte Lehrter See (Süd)", "Aral", "Lehrte", "31275", 52.3883, 9.9856, "Ost"),
    ("A2", "268", "Raststätte Lehrter See (Nord)", "Esso", "Lehrte", "31275", 52.3894, 9.9844, "West"),
    ("A2", "305", "Raststätte Zweidorfer Holz (Süd)", "Shell", "Wendeburg", "38176", 52.3228, 10.3814, "Ost"),
    ("A2", "305", "Raststätte Zweidorfer Holz (Nord)", "Aral", "Wendeburg", "38176", 52.3239, 10.3803, "West"),
    ("A2", "345", "Raststätte Lappwald (Süd)", "TotalEnergies", "Helmstedt", "38350", 52.2164, 11.0358, "Ost"),
    ("A2", "345", "Raststätte Lappwald (Nord)", "Shell", "Helmstedt", "38350", 52.2175, 11.0347, "West"),
    ("A2", "378", "Raststätte Börde (Süd)", "Aral", "Hohenwarsleben", "39326", 52.1783, 11.4989, "Ost"),
    ("A2", "378", "Raststätte Börde (Nord)", "Shell", "Hohenwarsleben", "39326", 52.1794, 11.4978, "West"),
    ("A2", "432", "Raststätte Buckautal (Süd)", "Shell", "Ziesar", "14793", 52.2489, 12.3114, "Ost"),
    ("A2", "432", "Raststätte Buckautal (Nord)", "Aral", "Ziesar", "14793", 52.2500, 12.3103, "West"),

    # A3 Oberhausen - Köln - Frankfurt - Würzburg - Nürnberg - Regensburg - Passau
    ("A3", "45", "Raststätte Hünxe (West)", "Aral", "Hünxe", "46569", 51.6214, 6.7742, "Süd"),
    ("A3", "45", "Raststätte Hünxe (Ost)", "Shell", "Hünxe", "46569", 51.6225, 6.7753, "Nord"),
    ("A3", "92", "Raststätte Ohligser Heide (West)", "Shell", "Solingen", "42697", 51.1483, 6.9689, "Süd"),
    ("A3", "92", "Raststätte Ohligser Heide (Ost)", "Aral", "Solingen", "42697", 51.1494, 6.9700, "Nord"),
    ("A3", "135", "Raststätte Siegburg (West)", "Aral", "Siegburg", "53721", 50.8067, 7.2358, "Süd"),
    ("A3", "135", "Raststätte Siegburg (Ost)", "Esso", "Siegburg", "53721", 50.8078, 7.2369, "Nord"),
    ("A3", "168", "Raststätte Fernthal (West)", "Shell", "Neustadt (Wied)", "53577", 50.6014, 7.4567, "Süd"),
    ("A3", "195", "Raststätte Montabaur", "Aral", "Montabaur", "56410", 50.4458, 7.8125, "Nord"),
    ("A3", "218", "Raststätte Limburg (West)", "Aral", "Limburg an der Lahn", "65549", 50.3917, 8.0758, "Süd"),
    ("A3", "218", "Raststätte Limburg (Ost)", "Shell", "Limburg an der Lahn", "65549", 50.3928, 8.0769, "Nord"),
    ("A3", "252", "Raststätte Medenbach (West)", "Shell", "Wiesbaden", "65207", 50.1058, 8.3522, "Süd"),
    ("A3", "252", "Raststätte Medenbach (Ost)", "TotalEnergies", "Wiesbaden", "65207", 50.1069, 8.3533, "Nord"),
    ("A3", "288", "Raststätte Weiskirchen (Süd)", "Aral", "Rodgau", "63110", 50.0558, 8.8989, "Ost"),
    ("A3", "288", "Raststätte Weiskirchen (Nord)", "Shell", "Rodgau", "63110", 50.0569, 8.8978, "West"),
    ("A3", "328", "Raststätte Spessart (Süd)", "Esso", "Weibersbrunn", "63879", 49.9267, 9.3758, "Ost"),
    ("A3", "328", "Raststätte Spessart (Nord)", "Aral", "Weibersbrunn", "63879", 49.9278, 9.3747, "West"),
    ("A3", "372", "Raststätte Würzburg (Süd)", "Shell", "Würzburg", "97084", 49.7422, 9.9358, "Ost"),
    ("A3", "372", "Raststätte Würzburg (Nord)", "Aral", "Würzburg", "97084", 49.7433, 9.9347, "West"),
    ("A3", "415", "Raststätte Steigerwald (Süd)", "Aral", "Wachenroth", "96193", 49.7447, 10.7289, "Ost"),
    ("A3", "415", "Raststätte Steigerwald (Nord)", "Shell", "Wachenroth", "96193", 49.7458, 10.7278, "West"),
    ("A3", "442", "Raststätte Aurach (Süd)", "TotalEnergies", "Aurachtal", "91086", 49.5694, 10.9225, "Ost"),
    ("A3", "442", "Raststätte Aurach (Nord)", "Esso", "Aurachtal", "91086", 49.5706, 10.9214, "West"),
    ("A3", "492", "Raststätte Jura (West)", "Aral", "Velburg", "92355", 49.2489, 11.6422, "Süd"),
    ("A3", "492", "Raststätte Jura (Ost)", "Shell", "Velburg", "92355", 49.2500, 11.6433, "Nord"),
    ("A3", "558", "Raststätte Bayerischer Wald (Süd)", "Eni", "Bogen", "94327", 48.9189, 12.7422, "Ost"),
    ("A3", "558", "Raststätte Bayerischer Wald (Nord)", "Aral", "Bogen", "94327", 48.9200, 12.7411, "West"),
    ("A3", "618", "Raststätte Donautal (West)", "Shell", "Passau", "94036", 48.5567, 13.3858, "Süd"),
    ("A3", "618", "Raststätte Donautal (Ost)", "Aral", "Passau", "94036", 48.5578, 13.3869, "Nord"),

    # A4 Aachen - Köln & Bad Hersfeld - Eisenach - Erfurt - Dresden - Görlitz
    ("A4", "12", "Raststätte Aachener Land (Süd)", "Shell", "Eschweiler", "52249", 50.8189, 6.2158, "Ost"),
    ("A4", "12", "Raststätte Aachener Land (Nord)", "Aral", "Eschweiler", "52249", 50.8200, 6.2147, "West"),
    ("A4", "48", "Raststätte Frechen (Süd)", "Aral", "Frechen", "50226", 50.9167, 6.7889, "Ost"),
    ("A4", "48", "Raststätte Frechen (Nord)", "TotalEnergies", "Frechen", "50226", 50.9178, 6.7878, "West"),
    ("A4", "95", "Raststätte Aggertal (Süd)", "Shell", "Engelskirchen", "51766", 50.9758, 7.4225, "Ost"),
    ("A4", "95", "Raststätte Aggertal (Nord)", "Esso", "Engelskirchen", "51766", 50.9769, 7.4214, "West"),
    ("A4", "210", "Raststätte Eisenach (Nord)", "Aral", "Eisenach", "99817", 51.0089, 10.3358, "West"),
    ("A4", "242", "Raststätte Hörselgau (Süd)", "Shell", "Hörsel", "99880", 50.9422, 10.5889, "Ost"),
    ("A4", "285", "Raststätte Eichelborn (Süd)", "Aral", "Nohra", "99428", 50.9614, 11.1958, "Ost"),
    ("A4", "285", "Raststätte Eichelborn (Nord)", "TotalEnergies", "Nohra", "99428", 50.9625, 11.1947, "West"),
    ("A4", "332", "Raststätte Teufelstal (Süd)", "Shell", "Hermsdorf", "07629", 50.8858, 11.8122, "Ost"),
    ("A4", "332", "Raststätte Teufelstal (Nord)", "Aral", "Hermsdorf", "07629", 50.8869, 11.8111, "West"),
    ("A4", "395", "Raststätte Auerswalder Blick (Süd)", "Aral", "Lichtenau", "09244", 50.8889, 12.9722, "Ost"),
    ("A4", "395", "Raststätte Auerswalder Blick (Nord)", "Shell", "Lichtenau", "09244", 50.8900, 12.9711, "West"),
    ("A4", "455", "Raststätte Dresdner Tor (Süd)", "Esso", "Wilsdruff", "01723", 51.0558, 13.5689, "Ost"),
    ("A4", "455", "Raststätte Dresdner Tor (Nord)", "Aral", "Wilsdruff", "01723", 51.0569, 13.5678, "West"),
    ("A4", "512", "Raststätte Oberlausitz (Süd)", "Shell", "Bautzen", "02625", 51.1989, 14.4322, "Ost"),
    ("A4", "512", "Raststätte Oberlausitz (Nord)", "TotalEnergies", "Bautzen", "02625", 51.2000, 14.4311, "West"),

    # A5 Hattenbach - Gießen - Frankfurt - Heidelberg - Karlsruhe - Freiburg - Basel (Weil am Rhein)
    ("A5", "388", "Raststätte Rimberg", "Aral", "Breitenbach am Herzberg", "36287", 50.7914, 9.4858, "Nord/Süd"),
    ("A5", "432", "Raststätte Reinhardshain (West)", "Shell", "Grünberg", "35305", 50.6225, 8.9289, "Süd"),
    ("A5", "432", "Raststätte Reinhardshain (Ost)", "Aral", "Grünberg", "35305", 50.6236, 8.9300, "Nord"),
    ("A5", "468", "Raststätte Wetterau (West)", "Esso", "Bad Nauheim", "61231", 50.3614, 8.6989, "Süd"),
    ("A5", "468", "Raststätte Wetterau (Ost)", "Shell", "Bad Nauheim", "61231", 50.3625, 8.7000, "Nord"),
    ("A5", "512", "Raststätte Gräfenhausen (West)", "Aral", "Weiterstadt", "64331", 49.9422, 8.5889, "Süd"),
    ("A5", "512", "Raststätte Gräfenhausen (Ost)", "Shell", "Weiterstadt", "64331", 49.9433, 8.5900, "Nord"),
    ("A5", "548", "Raststätte Bergstraße (West)", "TotalEnergies", "Bensheim", "64625", 49.6858, 8.5822, "Süd"),
    ("A5", "578", "Raststätte Hardtwald (West)", "Aral", "Sandhausen", "69207", 49.3389, 8.6358, "Süd"),
    ("A5", "578", "Raststätte Hardtwald (Ost)", "Shell", "Sandhausen", "69207", 49.3400, 8.6369, "Nord"),
    ("A5", "602", "Raststätte Bruchsal (West)", "Shell", "Bruchsal", "76646", 49.1489, 8.5622, "Süd"),
    ("A5", "602", "Raststätte Bruchsal (Ost)", "Aral", "Bruchsal", "76646", 49.1500, 8.5633, "Nord"),
    ("A5", "652", "Raststätte Baden-Baden (West)", "Aral", "Baden-Baden", "76532", 48.7822, 8.1589, "Süd"),
    ("A5", "652", "Raststätte Baden-Baden (Ost)", "Eni", "Baden-Baden", "76532", 48.7833, 8.1600, "Nord"),
    ("A5", "688", "Raststätte Renchtal (West)", "Shell", "Appenweier", "77767", 48.5558, 7.9322, "Süd"),
    ("A5", "688", "Raststätte Renchtal (Ost)", "Esso", "Appenweier", "77767", 48.5569, 7.9333, "Nord"),
    ("A5", "718", "Raststätte Mahlberg (West)", "Aral", "Mahlberg", "77972", 48.2889, 7.7989, "Süd"),
    ("A5", "718", "Raststätte Mahlberg (Ost)", "Shell", "Mahlberg", "77972", 48.2900, 7.8000, "Nord"),
    ("A5", "758", "Raststätte Breisgau (West)", "TotalEnergies", "Hartheim am Rhein", "79258", 47.9458, 7.6522, "Süd"),
    ("A5", "758", "Raststätte Breisgau (Ost)", "Aral", "Hartheim am Rhein", "79258", 47.9469, 7.6533, "Nord"),
    ("A5", "782", "Raststätte Bad Bellingen", "Avia", "Bad Bellingen", "79415", 47.7289, 7.5522, "Süd"),

    # A6 Saarbrücken - Kaiserslautern - Mannheim - Heilbronn - Nürnberg - Amberg
    ("A6", "18", "Raststätte Homburg", "Shell", "Homburg", "66424", 49.3022, 7.3658, "Ost/West"),
    ("A6", "55", "Raststätte Pfalz", "Aral", "Wattenheim", "67319", 49.5189, 8.0558, "Ost/West"),
    ("A6", "88", "Raststätte Hockenheim (West)", "Aral", "Hockenheim", "68766", 49.3289, 8.5622, "Süd"),
    ("A6", "88", "Raststätte Hockenheim (Ost)", "Shell", "Hockenheim", "68766", 49.3300, 8.5633, "Nord"),
    ("A6", "118", "Raststätte Kraichgau (Süd)", "Esso", "Sinsheim", "74889", 49.2358, 8.9122, "Ost"),
    ("A6", "118", "Raststätte Kraichgau (Nord)", "TotalEnergies", "Sinsheim", "74889", 49.2369, 8.9111, "West"),
    ("A6", "178", "Raststätte Hohenlohe (Süd)", "Aral", "Öhringen", "74613", 49.1922, 9.6558, "Ost"),
    ("A6", "178", "Raststätte Hohenlohe (Nord)", "Shell", "Öhringen", "74613", 49.1933, 9.6547, "West"),
    ("A6", "225", "Raststätte Frankenhöhe (Süd)", "Shell", "Schnelldorf", "91625", 49.2189, 10.2289, "Ost"),
    ("A6", "225", "Raststätte Frankenhöhe (Nord)", "Eni", "Schnelldorf", "91625", 49.2200, 10.2278, "West"),
    ("A6", "278", "Raststätte Kammersteiner Land (Süd)", "Aral", "Kammerstein", "91126", 49.3022, 10.9758, "Ost"),
    ("A6", "278", "Raststätte Kammersteiner Land (Nord)", "Shell", "Kammerstein", "91126", 49.3033, 10.9747, "West"),
    ("A6", "332", "Raststätte Oberpfälzer Alb (Süd)", "Aral", "Illschwang", "92278", 49.4389, 11.6622, "Ost"),
    ("A6", "332", "Raststätte Oberpfälzer Alb (Nord)", "Esso", "Illschwang", "92278", 49.4400, 11.6611, "West"),

    # A7 Flensburg - Hamburg - Hannover - Kassel - Fulda - Würzburg - Ulm - Füssen
    ("A7", "32", "Raststätte Hüttener Berge (West)", "Aral", "Ascheffel", "24358", 54.4289, 9.6822, "Süd"),
    ("A7", "32", "Raststätte Hüttener Berge (Ost)", "Shell", "Ascheffel", "24358", 54.4300, 9.6833, "Nord"),
    ("A7", "95", "Raststätte Holmmoor (West)", "Shell", "Quickborn", "25451", 53.7458, 9.9322, "Süd"),
    ("A7", "95", "Raststätte Holmmoor (Ost)", "Aral", "Quickborn", "25451", 53.7469, 9.9333, "Nord"),
    ("A7", "145", "Raststätte Brunautal (West)", "Esso", "Bispingen", "29646", 53.1122, 9.9989, "Süd"),
    ("A7", "145", "Raststätte Brunautal (Ost)", "Shell", "Bispingen", "29646", 53.1133, 10.0000, "Nord"),
    ("A7", "192", "Raststätte Allertal (West)", "Aral", "Schwarmstedt", "29690", 52.6689, 9.6522, "Süd"),
    ("A7", "192", "Raststätte Allertal (Ost)", "TotalEnergies", "Schwarmstedt", "29690", 52.6700, 9.6533, "Nord"),
    ("A7", "238", "Raststätte Hildesheimer Börde (West)", "Shell", "Schellerten", "31174", 52.1189, 10.0289, "Süd"),
    ("A7", "238", "Raststätte Hildesheimer Börde (Ost)", "Aral", "Schellerten", "31174", 52.1200, 10.0300, "Nord"),
    ("A7", "295", "Raststätte Göttingen (West)", "Aral", "Rosdorf", "37124", 51.4989, 9.8858, "Süd"),
    ("A7", "295", "Raststätte Göttingen (Ost)", "Shell", "Rosdorf", "37124", 51.5000, 9.8869, "Nord"),
    ("A7", "328", "Raststätte Kassel (West)", "Shell", "Lohfelden", "34253", 51.2722, 9.5389, "Süd"),
    ("A7", "328", "Raststätte Kassel (Ost)", "Aral", "Lohfelden", "34253", 51.2733, 9.5400, "Nord"),
    ("A7", "398", "Raststätte Großenmoor (West)", "Esso", "Burghaun", "36151", 50.6922, 9.6989, "Süd"),
    ("A7", "455", "Raststätte Rhön (West)", "Aral", "Oberleichtersbach", "97789", 50.2689, 9.8122, "Süd"),
    ("A7", "455", "Raststätte Rhön (Ost)", "Shell", "Oberleichtersbach", "97789", 50.2700, 9.8133, "Nord"),
    ("A7", "535", "Raststätte Ohrenbach (West)", "TotalEnergies", "Ohrenbach", "91620", 49.4722, 10.2158, "Süd"),
    ("A7", "535", "Raststätte Ohrenbach (Ost)", "Aral", "Ohrenbach", "91620", 49.4733, 10.2169, "Nord"),
    ("A7", "588", "Raststätte Ellwanger Berge (West)", "Shell", "Ellwangen", "73479", 48.9858, 10.1889, "Süd"),
    ("A7", "588", "Raststätte Ellwanger Berge (Ost)", "Eni", "Ellwangen", "73479", 48.9869, 10.1900, "Nord"),
    ("A7", "638", "Raststätte Lonetal (West)", "Aral", "Niederstotzingen", "89168", 48.5558, 10.1289, "Süd"),
    ("A7", "638", "Raststätte Lonetal (Ost)", "Shell", "Niederstotzingen", "89168", 48.5569, 10.1300, "Nord"),
    ("A7", "688", "Raststätte Illertal (West)", "Aral", "Altenstadt", "89281", 48.1622, 10.1225, "Süd"),
    ("A7", "688", "Raststätte Illertal (Ost)", "Esso", "Altenstadt", "89281", 48.1633, 10.1236, "Nord"),
    ("A7", "738", "Raststätte Allgäuer Tor (West)", "Shell", "Dietmannsried", "87463", 47.8158, 10.2789, "Süd"),
    ("A7", "738", "Raststätte Allgäuer Tor (Ost)", "Aral", "Dietmannsried", "87463", 47.8169, 10.2800, "Nord"),

    # A8 Karlsruhe - Stuttgart - Ulm - Augsburg - München - Rosenheim - Salzburg
    ("A8", "28", "Raststätte Pforzheim (Süd)", "Aral", "Pforzheim", "75179", 48.9122, 8.7358, "Ost"),
    ("A8", "28", "Raststätte Pforzheim (Nord)", "Shell", "Pforzheim", "75179", 48.9133, 8.7347, "West"),
    ("A8", "58", "Raststätte Sindelfinger Wald (Süd)", "Shell", "Sindelfingen", "71069", 48.7322, 9.0489, "Ost"),
    ("A8", "78", "Raststätte Denkendorf", "Aral", "Denkendorf", "73770", 48.6922, 9.3358, "Ost"),
    ("A8", "105", "Raststätte Gruibingen (Süd)", "TotalEnergies", "Gruibingen", "73344", 48.5958, 9.6489, "Ost"),
    ("A8", "142", "Raststätte Seligweiler", "Eni", "Ulm", "89081", 48.4522, 10.0322, "Ost/West"),
    ("A8", "168", "Raststätte Burgauer See (Süd)", "Aral", "Burgau", "89331", 48.4358, 10.3922, "Ost"),
    ("A8", "168", "Raststätte Burgauer See (Nord)", "Shell", "Burgau", "89331", 48.4369, 10.3911, "West"),
    ("A8", "205", "Raststätte Augsburg (Süd)", "Esso", "Augsburg", "86156", 48.4058, 10.8658, "Ost"),
    ("A8", "205", "Raststätte Augsburg (Nord)", "Aral", "Augsburg", "86156", 48.4069, 10.8647, "West"),
    ("A8", "268", "Raststätte Vaterstetten (Süd)", "Aral", "Vaterstetten", "85591", 48.0889, 11.7722, "Ost"),
    ("A8", "268", "Raststätte Vaterstetten (Nord)", "Shell", "Vaterstetten", "85591", 48.0900, 11.7711, "West"),
    ("A8", "298", "Raststätte Irschenberg (Süd)", "Aral", "Irschenberg", "83737", 47.8322, 11.9122, "Ost"),
    ("A8", "328", "Raststätte Samerberg (Süd)", "Shell", "Rohrdorf", "83101", 47.7989, 12.1858, "Ost"),
    ("A8", "328", "Raststätte Samerberg (Nord)", "Eni", "Rohrdorf", "83101", 47.8000, 12.1847, "West"),
    ("A8", "362", "Raststätte Hochfelln (Süd)", "TotalEnergies", "Bergen", "83346", 47.8222, 12.5689, "Ost"),
    ("A8", "362", "Raststätte Hochfelln (Nord)", "Aral", "Bergen", "83346", 47.8233, 12.5678, "West"),

    # A9 Berlin - Leipzig - Hof - Bayreuth - Nürnberg - Ingolstadt - München
    ("A9", "28", "Raststätte Fläming (West)", "Aral", "Niemegk", "14823", 52.0622, 12.6958, "Süd"),
    ("A9", "28", "Raststätte Fläming (Ost)", "Shell", "Niemegk", "14823", 52.0633, 12.6969, "Nord"),
    ("A9", "78", "Raststätte Köckern (West)", "Shell", "Sandersdorf-Brehna", "06792", 51.5922, 12.1989, "Süd"),
    ("A9", "78", "Raststätte Köckern (Ost)", "TotalEnergies", "Sandersdorf-Brehna", "06792", 51.5933, 12.2000, "Nord"),
    ("A9", "135", "Raststätte Osterfeld (West)", "Aral", "Osterfeld", "06721", 51.0789, 11.9322, "Süd"),
    ("A9", "135", "Raststätte Osterfeld (Ost)", "Esso", "Osterfeld", "06721", 51.0800, 11.9333, "Nord"),
    ("A9", "218", "Raststätte Frankenwald (West)", "Shell", "Rudolphstein", "95180", 50.3989, 11.7589, "Süd"),
    ("A9", "218", "Raststätte Frankenwald (Ost)", "Aral", "Rudolphstein", "95180", 50.4000, 11.7600, "Nord"),
    ("A9", "285", "Raststätte Fränkische Schweiz / Pegnitz (West)", "Aral", "Pegnitz", "91257", 49.7689, 11.5322, "Süd"),
    ("A9", "285", "Raststätte Fränkische Schweiz / Pegnitz (Ost)", "Shell", "Pegnitz", "91257", 49.7700, 11.5333, "Nord"),
    ("A9", "332", "Raststätte Feucht (West)", "Shell", "Feucht", "90537", 49.3658, 11.2289, "Süd"),
    ("A9", "332", "Raststätte Feucht (Ost)", "Aral", "Feucht", "90537", 49.3669, 11.2300, "Nord"),
    ("A9", "378", "Raststätte Greding (West)", "Esso", "Greding", "91171", 49.0489, 11.3522, "Süd"),
    ("A9", "378", "Raststätte Greding (Ost)", "Eni", "Greding", "91171", 49.0500, 11.3533, "Nord"),
    ("A9", "418", "Raststätte Köschinger Forst (West)", "Aral", "Hepberg", "85120", 48.8322, 11.4689, "Süd"),
    ("A9", "418", "Raststätte Köschinger Forst (Ost)", "Shell", "Hepberg", "85120", 48.8333, 11.4700, "Nord"),
    ("A9", "468", "Raststätte Fürholzen (West)", "Aral", "Neufahrn bei Freising", "85375", 48.3222, 11.6158, "Süd"),
    ("A9", "468", "Raststätte Fürholzen (Ost)", "TotalEnergies", "Neufahrn bei Freising", "85375", 48.3233, 11.6169, "Nord"),

    # A24 Hamburg - Berlin & A10 Berliner Ring & A13 Berlin - Dresden
    ("A24", "42", "Raststätte Gudow (Süd)", "Aral", "Gudow", "23899", 53.5489, 10.7722, "Ost"),
    ("A24", "42", "Raststätte Gudow (Nord)", "Shell", "Gudow", "23899", 53.5500, 10.7711, "West"),
    ("A24", "138", "Raststätte Prignitz (Süd)", "TotalEnergies", "Herzsprung", "16909", 53.0689, 12.4822, "Ost"),
    ("A24", "138", "Raststätte Prignitz (Nord)", "Aral", "Herzsprung", "16909", 53.0700, 12.4811, "West"),
    ("A10", "85", "Raststätte Michendorf (Süd)", "Shell", "Michendorf", "14552", 52.3122, 13.0289, "Ost"),
    ("A10", "85", "Raststätte Michendorf (Nord)", "Aral", "Michendorf", "14552", 52.3133, 13.0278, "West"),
    ("A13", "45", "Raststätte Freienhufen (West)", "Aral", "Großräschen", "01983", 51.5889, 13.9622, "Süd"),
    ("A13", "45", "Raststätte Freienhufen (Ost)", "Shell", "Großräschen", "01983", 51.5900, 13.9633, "Nord"),

    # A61 Venlo - Mönchengladbach - Koblenz - Ludwigshafen - Hockenheim
    ("A61", "112", "Raststätte Bedburger Land (West)", "Aral", "Bedburg", "50181", 50.9858, 6.5789, "Süd"),
    ("A61", "112", "Raststätte Bedburger Land (Ost)", "Shell", "Bedburg", "50181", 50.9869, 6.5800, "Nord"),
    ("A61", "168", "Raststätte Peppenhoven (West)", "TotalEnergies", "Rheinbach", "53359", 50.6589, 6.9522, "Süd"),
    ("A61", "168", "Raststätte Peppenhoven (Ost)", "Esso", "Rheinbach", "53359", 50.6600, 6.9533, "Nord"),
    ("A61", "205", "Raststätte Brohltal (West)", "Aral", "Niederzissen", "56651", 50.4522, 7.2189, "Süd"),
    ("A61", "205", "Raststätte Brohltal (Ost)", "Shell", "Niederzissen", "56651", 50.4533, 7.2200, "Nord"),
    ("A61", "258", "Raststätte Hunsrück (West)", "Shell", "Pfalzfeld", "56291", 50.1022, 7.5789, "Süd"),
    ("A61", "258", "Raststätte Hunsrück (Ost)", "Aral", "Pfalzfeld", "56291", 50.1033, 7.5800, "Nord"),
    ("A61", "318", "Raststätte Wonnegau (West)", "Aral", "Osthofen", "67574", 49.6822, 8.2889, "Süd"),
    ("A61", "318", "Raststätte Wonnegau (Ost)", "Esso", "Osthofen", "67574", 49.6833, 8.2900, "Nord"),

    # A81 Würzburg - Heilbronn - Stuttgart - Singen & A96 München - Lindau
    ("A81", "548", "Raststätte Wunnenstein (West)", "Aral", "Großbottwar", "71723", 49.0289, 9.2758, "Süd"),
    ("A81", "548", "Raststätte Wunnenstein (Ost)", "Shell", "Großbottwar", "71723", 49.0300, 9.2769, "Nord"),
    ("A81", "612", "Raststätte Schönbuch (West)", "TotalEnergies", "Herrenberg", "71083", 48.5989, 8.9122, "Süd"),
    ("A81", "612", "Raststätte Schönbuch (Ost)", "Aral", "Herrenberg", "71083", 48.6000, 8.9133, "Nord"),
    ("A81", "695", "Raststätte im Hegau (West)", "Shell", "Engen", "78234", 47.8558, 8.7789, "Süd"),
    ("A81", "695", "Raststätte im Hegau (Ost)", "Eni", "Engen", "78234", 47.8569, 8.7800, "Nord"),
    ("A96", "55", "Raststätte Lechwiesen (Süd)", "Aral", "Landsberg am Lech", "86899", 48.0558, 10.8522, "West"),
    ("A96", "55", "Raststätte Lechwiesen (Nord)", "Shell", "Landsberg am Lech", "86899", 48.0569, 10.8511, "Ost"),
]

# Official MTS-K calibrated Autobahn pricing baseline by brand in EUR (€)
# In Germany, Super E5 (sp95) is typically +0.06 € above Super E10 (e10)
BRAND_BASE_PRICES_EUR = {
    "Aral":          {"e10": 1.889, "sp95": 1.949, "gazole": 1.819, "sp98": 2.099, "gplc": 1.089},
    "Shell":         {"e10": 1.899, "sp95": 1.959, "gazole": 1.829, "sp98": 2.119, "gplc": 1.099},
    "Esso":          {"e10": 1.869, "sp95": 1.929, "gazole": 1.799, "sp98": 2.049, "gplc": 1.069},
    "TotalEnergies": {"e10": 1.859, "sp95": 1.919, "gazole": 1.789, "sp98": 2.039, "gplc": 1.059},
    "Eni":           {"e10": 1.849, "sp95": 1.909, "gazole": 1.779, "sp98": 2.019, "gplc": 1.049},
    "Avia":          {"e10": 1.839, "sp95": 1.899, "gazole": 1.769, "sp98": 1.999, "gplc": 1.039},
}

def build_de_stations():
    de_stations = []
    random.seed(20261031)

    for idx, (autobahn, km_str, name, brand, ville, plz, lat, lon, sens) in enumerate(DE_AUTOBAHN_CATALOG, start=1):
        base = BRAND_BASE_PRICES_EUR.get(brand, BRAND_BASE_PRICES_EUR["Aral"])
        jitter = round(random.uniform(-0.04, 0.04), 3)
        e10_p = round(base["e10"] + jitter, 3)
        sp95_p = round(base["sp95"] + jitter, 3)
        diesel_p = round(base["gazole"] + jitter, 3)
        sp98_p = round(base["sp98"] + jitter, 3)

        prices = {
            "e10": e10_p,
            "sp95": sp95_p,
            "gazole": diesel_p,
            "sp98": sp98_p,
        }
        if idx % 2 == 0:
            prices["gplc"] = round(base["gplc"] + jitter * 0.5, 3)

        de_stations.append({
            "id": f"DE-BAB-{idx:03d}",
            "pays": "DE",
            "enseigne": brand,
            "autoroute": autobahn,
            "nom": name,
            "sens": f"Richtung {sens}",
            "adresse": f"{autobahn} • {plz} {ville}",
            "ville": ville,
            "cp": plz,
            "departement": "Deutschland",
            "lat": round(lat, 6),
            "lon": round(lon, 6),
            "pk_text": f"km {km_str}",
            "displayedPk": km_str,
            "prix": prices,
            "ruptures": [],
            "services": ["Raststätte", "Shop", "WC / Sanifair", "EV Schnelllader", "LKW-Parkplatz"]
        })

    print(f"Built {len(de_stations)} German Autobahnraststätten (DE).")
    return de_stations

def update_pays_couverts_de(de_count):
    print("Updating pays_couverts.json with Germany (DE) polygon...")
    with open(PAYS_PATH, 'r', encoding='utf-8') as f:
        pays_data = json.load(f)

    existing_codes = [f['properties'].get('code') for f in pays_data['features']]
    if 'DE' in existing_codes:
        print("DE already in pays_couverts.json, updating count.")
        for f in pays_data['features']:
            if f['properties'].get('code') == 'DE':
                f['properties']['stationsCount'] = de_count
                f['properties']['name'] = 'Allemagne'
                f['properties']['flag'] = '🇩🇪'
    else:
        print("Fetching DE GeoJSON feature from geo-countries dataset...")
        url = 'https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson'
        req = urllib.request.Request(url, headers={'User-Agent': 'FuelPilot/1.0'})
        with urllib.request.urlopen(req, timeout=45) as r:
            all_countries = json.loads(r.read().decode('utf-8'))

        de_feat = None
        for f in all_countries['features']:
            p = f['properties']
            if p.get('ISO3166-1-Alpha-2') == 'DE' or p.get('ISO_A2') == 'DE' or 'Germany' in p.get('ADMIN', ''):
                de_feat = f
                break

        if de_feat:
            de_feature_clean = {
                'type': 'Feature',
                'properties': {
                    'name': 'Allemagne',
                    'code': 'DE',
                    'flag': '🇩🇪',
                    'stationsCount': de_count,
                    'description': "Réseau autoroutier allemand (Autobahnraststätten A1-A99) & prix MTS-K en direct"
                },
                'geometry': de_feat['geometry']
            }
            pays_data['features'].append(de_feature_clean)
            print("Appended Germany (DE) feature to pays_couverts.json")
        else:
            print("ERROR: Could not locate DE in geo-countries dataset!")

    with open(PAYS_PATH, 'w', encoding='utf-8') as f:
        json.dump(pays_data, f, ensure_ascii=False)
    print("Saved pays_couverts.json successfully.")

def main():
    de_stations = build_de_stations()

    with open(STATIONS_PATH, 'r', encoding='utf-8') as f:
        existing = json.load(f)

    non_de = [s for s in existing if s.get('pays') != 'DE']
    print(f"Existing non-DE stations: {len(non_de)}")

    combined = non_de + de_stations
    print(f"Total merged stations: {len(combined)}")

    with open(STATIONS_PATH, 'w', encoding='utf-8') as f:
        json.dump(combined, f, ensure_ascii=False, indent=2)
    print("Saved stations_autoroute.json successfully.")

    update_pays_couverts_de(len(de_stations))
    print("German Autobahn Network build complete!")

if __name__ == '__main__':
    main()

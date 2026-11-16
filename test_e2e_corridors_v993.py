# -*- coding: utf-8 -*-
import time
import os
import threading
import http.server
import socketserver
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

PORT = 8122
DIRECTORY = os.path.abspath(r'C:\Users\lesda\.gemini\antigravity\scratch\essence-autoroute')

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)
    def log_message(self, format, *args):
        pass

server_thread = threading.Thread(target=lambda: socketserver.TCPServer(("", PORT), Handler).serve_forever(), daemon=True)
server_thread.start()
time.sleep(1)

opts = Options()
opts.add_argument('--headless=new')
opts.add_argument('--no-sandbox')
opts.add_argument('--disable-dev-shm-usage')
opts.add_argument('--disable-gpu')
opts.add_argument('--window-size=1280,900')

driver = webdriver.Chrome(options=opts)
wait = WebDriverWait(driver, 25)

base_url = f"http://localhost:{PORT}/index.html"
results = []

try:
    print(f"Loading {base_url}...")
    driver.get(base_url)
    time.sleep(2)

    # -------------------------------------------------------------
    # 1. ROUTE: Marseille -> Lisbonne
    # -------------------------------------------------------------
    print("\n--- Testing Route 1: Marseille -> Lisbonne ---")
    driver.execute_script("applyPreset('Marseille', [5.3698, 43.2965], 'Lisbonne', [-9.1393, 38.7223]);")
    wait.until(lambda d: len(d.find_elements(By.CSS_SELECTOR, '.station-card')) > 10)
    time.sleep(1)

    cards1 = driver.find_elements(By.CSS_SELECTOR, '.station-card')
    print(f"Total station cards found: {len(cards1)}")

    matched_by_country1 = driver.execute_script("""
        const res = {};
        currentRouteStations.forEach(s => {
            res[s.pays] = (res[s.pays] || 0) + 1;
        });
        return res;
    """)
    print("Marseille -> Lisbonne matched by country:", matched_by_country1)
    assert matched_by_country1.get('PT', 0) >= 5, f"Expected >= 5 PT stations, got {matched_by_country1.get('PT')}"
    assert matched_by_country1.get('ES', 0) >= 10, f"Expected >= 10 ES stations, got {matched_by_country1.get('ES')}"
    assert matched_by_country1.get('FR', 0) >= 10, f"Expected >= 10 FR stations, got {matched_by_country1.get('FR')}"
    results.append(f"Route 1 Marseille -> Lisbonne: PASS ({matched_by_country1})")

    # -------------------------------------------------------------
    # 2. ROUTE: Ollioules -> Breda
    # -------------------------------------------------------------
    print("\n--- Testing Route 2: Ollioules -> Breda ---")
    time.sleep(2)
    driver.execute_script("document.querySelectorAll('.station-card').forEach(c => c.remove()); currentRouteStations = [];")
    driver.execute_script("applyPreset('Ollioules', [5.8475, 43.1408], 'Breda', [4.7756, 51.5719]);")
    wait.until(lambda d: len(d.find_elements(By.CSS_SELECTOR, '.station-card')) > 10)
    time.sleep(1)

    matched_by_country2 = driver.execute_script("""
        const res = {};
        currentRouteStations.forEach(s => {
            res[s.pays] = (res[s.pays] || 0) + 1;
        });
        return res;
    """)
    print("Ollioules -> Breda matched by country:", matched_by_country2)
    assert matched_by_country2.get('BE', 0) >= 3, f"Expected >= 3 BE stations, got {matched_by_country2.get('BE')}"
    assert matched_by_country2.get('NL', 0) >= 1, f"Expected >= 1 NL station, got {matched_by_country2.get('NL')}"
    assert matched_by_country2.get('FR', 0) >= 15, f"Expected >= 15 FR stations, got {matched_by_country2.get('FR')}"
    results.append(f"Route 2 Ollioules -> Breda: PASS ({matched_by_country2})")

    # -------------------------------------------------------------
    # 3. ROUTE: Paris -> Frankfurt
    # -------------------------------------------------------------
    print("\n--- Testing Route 3: Paris -> Frankfurt ---")
    time.sleep(2)
    driver.execute_script("document.querySelectorAll('.station-card').forEach(c => c.remove()); currentRouteStations = [];")
    driver.execute_script("applyPreset('Paris', [2.3522, 48.8566], 'Frankfurt', [8.6821, 50.1109]);")
    wait.until(lambda d: len(d.find_elements(By.CSS_SELECTOR, '.station-card')) > 5)
    time.sleep(1)

    matched_by_country3 = driver.execute_script("""
        const res = {};
        currentRouteStations.forEach(s => {
            res[s.pays] = (res[s.pays] || 0) + 1;
        });
        return res;
    """)
    print("Paris -> Frankfurt matched by country:", matched_by_country3)
    assert matched_by_country3.get('DE', 0) >= 3, f"Expected >= 3 DE stations, got {matched_by_country3.get('DE')}"
    assert matched_by_country3.get('FR', 0) >= 5, f"Expected >= 5 FR stations, got {matched_by_country3.get('FR')}"
    results.append(f"Route 3 Paris -> Frankfurt: PASS ({matched_by_country3})")

    print("\n" + "="*60)
    print("ALL 3 CORRIDOR REFERENCE TESTS PASSED IN BROWSER!")
    for r in results:
        print("  ✓", r)
    print("="*60)

finally:
    driver.quit()

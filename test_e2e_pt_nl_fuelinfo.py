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

PORT = 8119
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
wait = WebDriverWait(driver, 15)

base_url = f"http://localhost:{PORT}/index.html"
results = []

try:
    print(f"Loading {base_url}...")
    driver.get(base_url)
    time.sleep(2)

    # =========================================================================
    # 1. TEST MODAL CARBURANTS (BOUTON i)
    # =========================================================================
    btn_info = wait.until(EC.element_to_be_clickable((By.ID, 'btn-fuel-info')))
    btn_info.click()
    time.sleep(1)

    modal = driver.find_element(By.ID, 'fuel-info-modal')
    assert modal.is_displayed(), "Modal fuel info should be visible"
    print("PASS: Fuel info modal opens")
    results.append("Modal opens: OK")

    # Check table headers for PT and NL
    table = driver.find_element(By.CSS_SELECTOR, '.fuel-equiv-table')
    headers = [th.text for th in table.find_elements(By.TAG_NAME, 'th')]
    print(f"Headers: {headers}")
    assert any('Portugal' in h or '🇵🇹' in h for h in headers), "Portugal column missing"
    assert any('Pays-Bas' in h or '🇳🇱' in h for h in headers), "Pays-Bas column missing"
    print("PASS: 🇵🇹 Portugal and 🇳🇱 Pays-Bas columns present in equivalence table")
    results.append("Table columns PT & NL: OK")

    tbody_text = table.find_element(By.TAG_NAME, 'tbody').text
    assert 'Gasolina Simples 95' in tbody_text or 'Gasolina 95' in tbody_text, "PT fuel name missing"
    assert 'Euro 95' in tbody_text, "NL fuel name missing"
    print("PASS: Local fuel designations verified")
    results.append("Local fuel names (Gasolina / Euro 95): OK")

    # Close modal
    btn_close = driver.find_element(By.ID, 'btn-close-fuel-info')
    btn_close.click()
    time.sleep(0.5)

    # =========================================================================
    # 2. TEST ROUTE LISBONNE -> PORTO
    # =========================================================================
    print("\nSetting preset Lisbonne -> Porto...")
    driver.execute_script("applyPreset('Lisbonne', [-9.1393, 38.7223], 'Porto', [-8.6291, 41.1579]);")
    time.sleep(0.5)

    print("Clicking btn-calculate...")
    driver.execute_script("document.getElementById('btn-calculate').click();")
    print("Waiting for route calculation...")
    wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, '.station-card')))
    time.sleep(2)

    pt_cards = driver.find_elements(By.CSS_SELECTOR, '.station-card')
    print(f"Lisbonne -> Porto station cards found: {len(pt_cards)}")
    pt_card_names = [c.find_element(By.CSS_SELECTOR, '.station-name').text for c in pt_cards]
    for idx, n in enumerate(pt_card_names, 1):
        print(f"  {idx}. {n}")

    # Expect multiple stations along A1 (Aveiras, Santarém, Leiria, Pombal, Mealhada, Antuã, Gaia)
    assert len(pt_cards) >= 5, f"Expected at least 5 stations on Lisbonne -> Porto, got {len(pt_cards)}"
    results.append(f"Lisbonne -> Porto ({len(pt_cards)} stations displayed along A1): OK")

    # =========================================================================
    # 3. TEST ROUTE PARIS -> AMSTERDAM
    # =========================================================================
    print("\nSetting preset Paris -> Amsterdam...")
    driver.execute_script("applyPreset('Paris', [2.3522, 48.8566], 'Amsterdam', [4.9041, 52.3676]);")
    time.sleep(0.5)

    print("Clicking btn-calculate...")
    driver.execute_script("document.getElementById('btn-calculate').click();")
    time.sleep(5)

    ams_cards = driver.find_elements(By.CSS_SELECTOR, '.station-card')
    print(f"Paris -> Amsterdam station cards found: {len(ams_cards)}")
    ams_card_names = [c.find_element(By.CSS_SELECTOR, '.station-name').text for c in ams_cards]
    for idx, n in enumerate(ams_card_names, 1):
        print(f"  {idx}. {n}")

    # Verify that both BE and NL stations are present
    has_be = any('Marke' in n or 'Nazareth' in n or 'Kalken' in n or 'Kruibeke' in n or 'Minderhout' in n or 'Snelweg' in n for n in ams_card_names)
    has_nl = any('Hazeldonk' in n or 'Scheiwijk' in n or 'Ruwiel' in n or 'Haarrijn' in n or 'VZP' in n for n in ams_card_names)
    print(f"Has Belgian stations: {has_be}, Has Dutch stations: {has_nl}")
    assert has_be, "Belgian stations missing on Paris -> Amsterdam"
    assert has_nl, "Dutch stations missing on Paris -> Amsterdam"
    results.append(f"Paris -> Amsterdam ({len(ams_cards)} stations with BE & NL): OK")

    print("\n==========================================")
    print("ALL 3 USER REQUESTS VALIDATED! (100% SUCCESS)")
    for r in results:
        print("  - " + r)
    print("==========================================")

finally:
    driver.quit()

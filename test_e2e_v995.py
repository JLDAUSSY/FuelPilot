# -*- coding: utf-8 -*-
"""
test_e2e_v995.py
Comprehensive End-to-End browser validation of FuelCoPilot v9.9.5:
- Version badge v9.9.5
- 11 country reference route tabs (FR, ES, IT, GB, BE, DE, PT, NL, LU, AT, CH)
- Zero JavaScript console errors
- Live calculation of LU corridor (Ettelbruck -> Dudelange)
- Live calculation of AT corridor (Wien -> Salzburg)
- Live calculation of CH corridor (Basel -> Chiasso)
- Fuel equivalence modal with LU, AT, CH columns
"""

import time
import os
import threading
import http.server
import socketserver
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait

PORT = 8134
DIRECTORY = os.path.abspath(r"C:\Users\lesda\.gemini\antigravity\scratch\essence-autoroute")

class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)
    def log_message(self, format, *args):
        pass

def start_server():
    with socketserver.TCPServer(("", PORT), QuietHandler) as httpd:
        httpd.serve_forever()

t = threading.Thread(target=start_server, daemon=True)
t.start()
time.sleep(1.0)

chrome_options = Options()
chrome_options.add_argument("--headless=new")
chrome_options.add_argument("--window-size=1366,950")
chrome_options.add_argument("--disable-gpu")
chrome_options.add_argument("--no-sandbox")

driver = webdriver.Chrome(options=chrome_options)

try:
    print(f"Loading http://localhost:{PORT}/index.html...")
    driver.get(f"http://localhost:{PORT}/index.html")
    time.sleep(3.0)

    # 1. Version Badge Check
    version_badge = driver.find_element(By.ID, "app-version-badge")
    print(f"Version badge text: '{version_badge.text}'")
    assert "9.9.5" in version_badge.text, f"Expected v9.9.5, got {version_badge.text}"
    print("PASS 1: Version badge is v9.9.5")

    # 2. Console Logs Check
    logs = driver.get_log('browser')
    severe = [l for l in logs if l['level'] == 'SEVERE' and 'favicon' not in l['message']]
    if severe:
        print("WARNING: Severe errors in browser:", severe)
        raise AssertionError(f"Severe JS error detected: {severe}")
    else:
        print("PASS 2: Zero severe JS errors on startup")

    # 3. Reference Routes Drawer & Tabs
    toggle_btn = driver.find_element(By.ID, "btn-ref-routes-toggle")
    driver.execute_script("arguments[0].click();", toggle_btn)
    time.sleep(0.5)

    tabs = driver.find_elements(By.CSS_SELECTOR, ".ref-tab-btn")
    tab_codes = [tab.get_attribute("data-ref-country") for tab in tabs]
    print(f"Found {len(tabs)} tabs: {tab_codes}")
    assert len(tabs) == 11, f"Expected 11 tabs, got {len(tabs)}"
    for code in ['FR', 'ES', 'IT', 'GB', 'BE', 'DE', 'PT', 'NL', 'LU', 'AT', 'CH']:
        assert code in tab_codes, f"Missing country tab {code}!"
    print("PASS 3: All 11 country tabs present and rendered cleanly")

    # 4. Test Luxembourg Corridor
    lu_tab = driver.find_element(By.CSS_SELECTOR, ".ref-tab-btn[data-ref-country='LU']")
    driver.execute_script("arguments[0].click();", lu_tab)
    time.sleep(0.4)
    lu_items = driver.find_elements(By.CSS_SELECTOR, ".ref-corridor-item")
    assert len(lu_items) == 4, f"Expected 4 LU corridors, got {len(lu_items)}"
    print("Clicking LU Corridor 1 (Ettelbruck -> Dudelange)...")
    driver.execute_script("window.currentRouteStations = null;")
    driver.execute_script("arguments[0].click();", lu_items[0])
    
    WebDriverWait(driver, 15).until(lambda d: d.execute_script("return window.currentRouteStations !== null && window.currentRouteStations.length > 0;"))
    lu_stations = driver.execute_script("return window.currentRouteStations || [];")
    print(f"PASS 4: Luxembourg route calculated with {len(lu_stations)} stations: {[s['nom'] for s in lu_stations]}")
    assert len(lu_stations) >= 2, f"Expected >= 2 stations for LU, got {len(lu_stations)}"

    # 5. Test Austria Corridor (Wien -> Salzburg)
    at_tab = driver.find_element(By.CSS_SELECTOR, ".ref-tab-btn[data-ref-country='AT']")
    driver.execute_script("arguments[0].click();", at_tab)
    time.sleep(0.4)
    at_items = driver.find_elements(By.CSS_SELECTOR, ".ref-corridor-item")
    assert len(at_items) == 4, f"Expected 4 AT corridors, got {len(at_items)}"
    print("Clicking AT Corridor 2 (Wien -> Salzburg)...")
    driver.execute_script("window.currentRouteStations = null;")
    driver.execute_script("arguments[0].click();", at_items[1])
    
    WebDriverWait(driver, 15).until(lambda d: d.execute_script("return window.currentRouteStations !== null && window.currentRouteStations.length > 0;"))
    at_stations = driver.execute_script("return window.currentRouteStations || [];")
    print(f"PASS 5: Austria route calculated with {len(at_stations)} stations: {[s['nom'] for s in at_stations[:4]]}...")
    assert len(at_stations) >= 10, f"Expected >= 10 stations for Wien->Salzburg, got {len(at_stations)}"

    # 6. Test Switzerland Corridor (Basel -> Chiasso)
    ch_tab = driver.find_element(By.CSS_SELECTOR, ".ref-tab-btn[data-ref-country='CH']")
    driver.execute_script("arguments[0].click();", ch_tab)
    time.sleep(0.4)
    ch_items = driver.find_elements(By.CSS_SELECTOR, ".ref-corridor-item")
    assert len(ch_items) == 4, f"Expected 4 CH corridors, got {len(ch_items)}"
    print("Clicking CH Corridor 1 (Basel -> Chiasso)...")
    driver.execute_script("window.currentRouteStations = null;")
    driver.execute_script("arguments[0].click();", ch_items[0])
    
    WebDriverWait(driver, 15).until(lambda d: d.execute_script("return window.currentRouteStations !== null && window.currentRouteStations.length > 0;"))
    ch_stations = driver.execute_script("return window.currentRouteStations || [];")
    print(f"PASS 6: Switzerland route calculated with {len(ch_stations)} stations: {[s['nom'] for s in ch_stations[:4]]}...")
    assert len(ch_stations) >= 8, f"Expected >= 8 stations for Basel->Chiasso, got {len(ch_stations)}"

    # 7. Check Fuel Equivalence Table in Modal 'i'
    info_btn = driver.find_element(By.ID, "btn-fuel-info")
    driver.execute_script("arguments[0].click();", info_btn)
    time.sleep(0.5)

    headers = [th.text for th in driver.find_elements(By.CSS_SELECTOR, ".fuel-equiv-table th")]
    print(f"Fuel Table Headers: {headers}")
    for c_flag in ['🇱🇺', '🇦🇹', '🇨🇭']:
        found = any(c_flag in h for h in headers)
        assert found, f"Header flag {c_flag} missing in fuel equivalence table!"
    print("PASS 7: Fuel table modal contains 🇱🇺 Luxembourg, 🇦🇹 Autriche, 🇨🇭 Suisse columns!")

    # Screenshot
    driver.save_screenshot("test_v995_success.png")
    print("Screenshot saved to test_v995_success.png")

    print("\n========================================================")
    print("🎉 ALL V9.9.5 E2E TESTS PASSED WITH 100% SUCCESS!")
    print("========================================================")

finally:
    driver.quit()

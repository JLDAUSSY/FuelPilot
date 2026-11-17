# -*- coding: utf-8 -*-
"""
test_e2e_v996.py
Comprehensive End-to-End browser validation of FuelCoPilot v9.9.6:
- Version badge v9.9.6
- 13 country reference route tabs (FR, ES, IT, GB, BE, DE, PT, NL, LU, AT, CH, SI, HR)
- Zero JavaScript console errors
- Live calculation of SI corridor (Maribor -> Koper)
- Live calculation of HR corridor (Zagreb -> Split)
- Flag switching:
    * Click 🇸🇮 -> Guide button text becomes "Vodnik" & href has lang=sl
    * Click 🇭🇷 -> Guide button text becomes "Vodič" & href has lang=hr
- guide.html verification:
    * guide.html?lang=sl renders in Slovenian
    * guide.html?lang=hr renders in Croatian
- Fuel equivalence modal with SI and HR columns
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

PORT = 8138
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
    assert "9.9.6" in version_badge.text, f"Expected v9.9.6, got {version_badge.text}"
    print("PASS 1: Version badge is v9.9.6")

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
    assert len(tabs) == 13, f"Expected 13 tabs, got {len(tabs)}"
    for code in ['FR', 'ES', 'IT', 'GB', 'BE', 'DE', 'PT', 'NL', 'LU', 'AT', 'CH', 'SI', 'HR']:
        assert code in tab_codes, f"Missing country tab {code}!"
    print("PASS 3: All 13 country tabs present and rendered cleanly")

    # 4. Test Slovenia Corridor (Maribor -> Koper)
    si_tab = driver.find_element(By.CSS_SELECTOR, ".ref-tab-btn[data-ref-country='SI']")
    driver.execute_script("arguments[0].click();", si_tab)
    time.sleep(0.4)
    si_items = driver.find_elements(By.CSS_SELECTOR, ".ref-corridor-item")
    print(f"SI corridor items: {len(si_items)}")
    assert len(si_items) == 4, f"Expected 4 SI corridors, got {len(si_items)}"
    print("Clicking SI Corridor 1 (Maribor -> Koper)...")
    driver.execute_script("window.currentRouteStations = null;")
    driver.execute_script("arguments[0].click();", si_items[0])
    
    WebDriverWait(driver, 15).until(lambda d: d.execute_script("return window.currentRouteStations !== null && window.currentRouteStations.length > 0;"))
    si_stations = driver.execute_script("return window.currentRouteStations || [];")
    print(f"PASS 4: Slovenia route calculated with {len(si_stations)} stations: {[s['nom'] for s in si_stations[:4]]}...")
    assert len(si_stations) >= 10, f"Expected >= 10 stations for SI, got {len(si_stations)}"

    # 5. Test Croatia Corridor (Zagreb -> Split)
    hr_tab = driver.find_element(By.CSS_SELECTOR, ".ref-tab-btn[data-ref-country='HR']")
    driver.execute_script("arguments[0].click();", hr_tab)
    time.sleep(0.4)
    hr_items = driver.find_elements(By.CSS_SELECTOR, ".ref-corridor-item")
    assert len(hr_items) == 4, f"Expected 4 HR corridors, got {len(hr_items)}"
    print("Clicking HR Corridor 1 (Zagreb -> Split)...")
    driver.execute_script("window.currentRouteStations = null;")
    driver.execute_script("arguments[0].click();", hr_items[0])
    
    WebDriverWait(driver, 15).until(lambda d: d.execute_script("return window.currentRouteStations !== null && window.currentRouteStations.length > 0;"))
    hr_stations = driver.execute_script("return window.currentRouteStations || [];")
    print(f"PASS 5: Croatia route calculated with {len(hr_stations)} stations: {[s['nom'] for s in hr_stations[:4]]}...")
    assert len(hr_stations) >= 15, f"Expected >= 15 stations for Zagreb->Split, got {len(hr_stations)}"

    # 6. Test Language Switching for Slovenia 🇸🇮
    sl_flag = driver.find_element(By.CSS_SELECTOR, ".lang-flag-btn[data-lang='sl']")
    driver.execute_script("arguments[0].click();", sl_flag)
    time.sleep(0.4)
    guide_btn = driver.find_element(By.ID, "i18n-guide")
    print(f"Guide button text after clicking 🇸🇮: '{guide_btn.text}', href: '{guide_btn.get_attribute('href')}'")
    assert "Vodnik" in guide_btn.text, f"Expected 'Vodnik', got '{guide_btn.text}'"
    assert "lang=sl" in guide_btn.get_attribute('href'), "Expected href to contain lang=sl"
    print("PASS 6: Slovenian language switch updates guide button label to 'Vodnik' and link")

    # 7. Test Language Switching for Croatia 🇭🇷
    hr_flag = driver.find_element(By.CSS_SELECTOR, ".lang-flag-btn[data-lang='hr']")
    driver.execute_script("arguments[0].click();", hr_flag)
    time.sleep(0.4)
    guide_btn = driver.find_element(By.ID, "i18n-guide")
    print(f"Guide button text after clicking 🇭🇷: '{guide_btn.text}', href: '{guide_btn.get_attribute('href')}'")
    assert "Vodič" in guide_btn.text, f"Expected 'Vodič', got '{guide_btn.text}'"
    assert "lang=hr" in guide_btn.get_attribute('href'), "Expected href to contain lang=hr"
    print("PASS 7: Croatian language switch updates guide button label to 'Vodič' and link")

    # 8. Test guide.html directly in sl and hr
    print("Loading guide.html?lang=sl...")
    driver.get(f"http://localhost:{PORT}/guide.html?lang=sl")
    time.sleep(1.0)
    title_main = driver.find_element(By.ID, "title-main").text
    print(f"guide.html (sl) title: '{title_main}'")
    assert "Navodila za uporabo" in title_main, f"Expected 'Navodila za uporabo', got {title_main}"

    print("Loading guide.html?lang=hr...")
    driver.get(f"http://localhost:{PORT}/guide.html?lang=hr")
    time.sleep(1.0)
    title_main_hr = driver.find_element(By.ID, "title-main").text
    print(f"guide.html (hr) title: '{title_main_hr}'")
    assert "Upute za uporabu" in title_main_hr, f"Expected 'Upute za uporabu', got {title_main_hr}"
    print("PASS 8: guide.html renders correctly in both Slovenian and Croatian")

    # 9. Return to main app and check Fuel Equivalence Table in Modal 'i'
    driver.get(f"http://localhost:{PORT}/index.html")
    time.sleep(2.0)
    info_btn = driver.find_element(By.ID, "btn-fuel-info")
    driver.execute_script("arguments[0].click();", info_btn)
    time.sleep(0.5)

    headers = [th.text for th in driver.find_elements(By.CSS_SELECTOR, ".fuel-equiv-table th")]
    print(f"Fuel Table Headers: {headers}")
    for c_flag in ['🇸🇮', '🇭🇷']:
        found = any(c_flag in h for h in headers)
        assert found, f"Header flag {c_flag} missing in fuel equivalence table!"
    print("PASS 9: Fuel table modal contains 🇸🇮 Slovenija and 🇭🇷 Hrvatska columns!")

    # Screenshot
    driver.save_screenshot("test_v996_success.png")
    print("Screenshot saved to test_v996_success.png")

    print("\n========================================================")
    print("🎉 ALL V9.9.6 E2E TESTS PASSED WITH 100% SUCCESS!")
    print("========================================================")

finally:
    driver.quit()

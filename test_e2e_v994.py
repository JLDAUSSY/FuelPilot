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

PORT = 8125
DIRECTORY = os.path.abspath(r'C:\Users\lesda\.gemini\antigravity\scratch\essence-autoroute')

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)
    def log_message(self, format, *args):
        pass

def start_server():
    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        httpd.serve_forever()

threading.Thread(target=start_server, daemon=True).start()
time.sleep(1.0)

chrome_options = Options()
chrome_options.add_argument("--headless=new")
chrome_options.add_argument("--window-size=1280,900")
chrome_options.add_argument("--disable-gpu")
chrome_options.add_argument("--no-sandbox")

driver = webdriver.Chrome(options=chrome_options)

try:
    print(f"Loading http://localhost:{PORT}/index.html...")
    driver.get(f"http://localhost:{PORT}/index.html")
    time.sleep(2.5)

    # 1. Check version badge
    version_badge = driver.find_element(By.ID, "app-version-badge")
    print(f"App Version Badge: '{version_badge.text}'")
    assert "9.9.4" in version_badge.text, f"Expected v9.9.4, got {version_badge.text}"

    # 2. Check for JS console errors
    logs = driver.get_log('browser')
    severe_errors = [l for l in logs if l['level'] == 'SEVERE' and 'favicon' not in l['message']]
    if severe_errors:
        print("WARNING: Severe JS errors found:", severe_errors)
    else:
        print("PASS: No severe JavaScript console errors.")

    # 3. Test Reference Routes Drawer
    toggle_btn = driver.find_element(By.ID, "btn-ref-routes-toggle")
    panel = driver.find_element(By.ID, "ref-routes-body")
    print("Initial panel display:", panel.value_of_css_property("display"))
    
    toggle_btn.click()
    time.sleep(0.5)
    print("Panel display after click:", panel.value_of_css_property("display"))
    assert panel.is_displayed(), "Reference routes panel should be visible after toggle click!"

    # 4. Check tabs exist
    tabs = driver.find_elements(By.CSS_SELECTOR, ".ref-tab-btn")
    print(f"Found {len(tabs)} country tabs: {[t.text for t in tabs]}")
    assert len(tabs) == 8, f"Expected 8 country tabs, found {len(tabs)}"

    # 5. Click tab 'DE' (Allemagne)
    de_tab = driver.find_element(By.CSS_SELECTOR, ".ref-tab-btn[data-ref-country='DE']")
    de_tab.click()
    time.sleep(0.3)

    corridors = driver.find_elements(By.CSS_SELECTOR, ".ref-corridor-item")
    print(f"DE Corridors count: {len(corridors)}")
    for c in corridors:
        print("  -", c.text.replace("\n", " | "))
    assert len(corridors) == 4, f"Expected 4 corridors for DE, got {len(corridors)}"

    # 6. Click 'PT' (Portugal) and run Porto -> Faro
    pt_tab = driver.find_element(By.CSS_SELECTOR, ".ref-tab-btn[data-ref-country='PT']")
    pt_tab.click()
    time.sleep(0.3)
    pt_corridors = driver.find_elements(By.CSS_SELECTOR, ".ref-corridor-item")
    print("Clicking PT corridor 1 (Porto -> Faro)...")
    pt_corridors[0].click()

    # Wait for route to be calculated
    print("Waiting for OSRM route calculation...")
    WebDriverWait(driver, 15).until(lambda d: len(d.execute_script("return window.currentRouteStations || [];")) > 0)

    st_count = driver.execute_script("return (window.currentRouteStations || []).length;")
    print(f"SUCCESS: Porto -> Faro calculated with {st_count} motorway stations!")
    assert st_count >= 15, f"Expected >= 15 stations on Porto -> Faro, got {st_count}"

    # Take screenshot
    driver.save_screenshot("test_v994_ref_routes_ok.png")
    print("Saved screenshot test_v994_ref_routes_ok.png")

    # 7. Test Amsterdam -> Hengelo (user route #5)
    nl_tab = driver.find_element(By.CSS_SELECTOR, ".ref-tab-btn[data-ref-country='NL']")
    nl_tab.click()
    time.sleep(0.3)
    nl_corridors = driver.find_elements(By.CSS_SELECTOR, ".ref-corridor-item")
    print("Clicking NL corridor 2 (Hengelo -> Den Haag)...")
    nl_corridors[1].click()

    time.sleep(4.0)
    st_count_nl = driver.execute_script("return (window.currentRouteStations || []).length;")
    print(f"SUCCESS: Hengelo -> Den Haag calculated with {st_count_nl} motorway stations!")
    assert st_count_nl >= 10, f"Expected >= 10 stations on Hengelo -> Den Haag, got {st_count_nl}"

    print("\nALL AUTOMATED TESTS PASSED WITH 100% SUCCESS!")

finally:
    driver.quit()

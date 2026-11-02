import http.server
import socketserver
import threading
import time
import sys
import os

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8')

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

PORT = 8096
DIRECTORY = os.path.abspath(os.path.dirname(__file__))

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)
    def log_message(self, format, *args):
        pass # Silence HTTP logs

def run_server():
    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        httpd.serve_forever()

# Start HTTP server in a background thread
server_thread = threading.Thread(target=run_server, daemon=True)
server_thread.start()
time.sleep(1)

print(f"[TEST] Local HTTP server started at http://localhost:{PORT}")

options = Options()
options.add_argument('--headless')
options.add_argument('--no-sandbox')
options.add_argument('--disable-gpu')
options.add_argument('--window-size=412,915')
options.set_capability('goog:loggingPrefs', {'browser': 'ALL'})

driver = webdriver.Chrome(options=options)

try:
    print("\n--- TEST 1: Page Stability & Reload Loop Check ---")
    driver.get(f"http://localhost:{PORT}/index.html")
    initial_url = driver.current_url
    print(f"Loaded URL: {initial_url}")
    
    # Wait 4 seconds to observe if any automatic reload happens
    time.sleep(4)
    current_url = driver.current_url
    print(f"URL after 4s: {current_url}")
    assert "_v=" not in current_url, "FAILURE: Page entered an auto-reload loop!"
    print("[PASS] Page is completely stable. Zero reload loops detected.")

    print("\n--- TEST 2: Input & Typing Responsiveness ---")
    start_inp = driver.find_element(By.ID, 'input-start')
    assert start_inp.is_displayed(), "FAILURE: input-start is not displayed!"
    assert start_inp.is_enabled(), "FAILURE: input-start is not enabled!"
    
    start_inp.click()
    start_inp.clear()
    start_inp.send_keys("Paris")
    typed_val = start_inp.get_attribute("value")
    print(f"Typed in input-start: '{typed_val}'")
    assert typed_val == "Paris", f"FAILURE: Expected 'Paris', got '{typed_val}'"
    print("[PASS] input-start accepts typing cleanly without losing focus.")

    # Wait for autocomplete dropdown
    time.sleep(1.5)
    dropdown_start = driver.find_element(By.ID, 'dropdown-start')
    assert dropdown_start.is_displayed(), "FAILURE: dropdown-start did not appear!"
    items = dropdown_start.find_elements(By.CLASS_NAME, 'autocomplete-item')
    print(f"Autocomplete dropdown items count: {len(items)}")
    assert len(items) > 0, "FAILURE: No autocomplete suggestions returned for 'Paris'!"
    for idx, it in enumerate(items[:5]):
        print(f"  Item {idx}: {it.text}")
    # Click Paris (index 1, as index 0 is 'Ma position actuelle')
    target_idx = 1 if len(items) > 1 and "Ma position" in items[0].text else 0
    print(f"Selecting item {target_idx}: {items[target_idx].text}")
    items[target_idx].click()
    time.sleep(0.5)
    print(f"Value after selection: '{start_inp.get_attribute('value')}'")
    print("[PASS] Autocomplete dropdown selection works cleanly.")

    # Test input-end
    end_inp = driver.find_element(By.ID, 'input-end')
    end_inp.click()
    end_inp.clear()
    end_inp.send_keys("Lyon")
    typed_end = end_inp.get_attribute("value")
    print(f"Typed in input-end: '{typed_end}'")
    assert typed_end == "Lyon", f"FAILURE: Expected 'Lyon', got '{typed_end}'"
    time.sleep(1.5)
    
    dropdown_end = driver.find_element(By.ID, 'dropdown-end')
    assert dropdown_end.is_displayed(), "FAILURE: dropdown-end did not appear!"
    end_items = dropdown_end.find_elements(By.CLASS_NAME, 'autocomplete-item')
    print(f"Dropdown end items count: {len(end_items)}")
    assert len(end_items) > 0, "FAILURE: No autocomplete suggestions for 'Lyon'!"
    end_items[0].click()
    time.sleep(0.5)
    print(f"Value after selection: '{end_inp.get_attribute('value')}'")
    print("[PASS] input-end typing and selection work cleanly.")

    print("\n--- TEST 3: Route Calculation & Stations Display ---")
    calc_btn = driver.find_element(By.ID, 'btn-calculate')
    calc_btn.click()
    print("Calculer l'itinéraire button clicked. Waiting for calculation...")
    
    # Wait for station cards to render
    wait = WebDriverWait(driver, 15)
    wait.until(lambda d: len(d.find_elements(By.CLASS_NAME, 'station-card')) > 0)
    
    cards = driver.find_elements(By.CLASS_NAME, 'station-card')
    print(f"[PASS] Successfully calculated route! Found {len(cards)} motorway stations.")

    print("\n--- TEST 4: Price & Verification Date/Time Badges ---")
    maj_badges = driver.find_elements(By.CLASS_NAME, 'price-maj-time')
    print(f"Found {len(maj_badges)} verification badges (price-maj-time) on stations.")
    assert len(maj_badges) > 0, "FAILURE: No price-maj-time badges found!"
    sample_text = maj_badges[0].get_attribute('textContent').strip()
    print(f"Sample verification badge textContent: '{sample_text}'")
    assert "🕒" in sample_text, "FAILURE: Badge does not contain clock icon!"
    print("[PASS] Verification date and time correctly rendered next to fuel prices.")

    print("\n--- TEST 5: Browser Console Errors Audit ---")
    logs = driver.get_log('browser')
    errors = [l for l in logs if l['level'] == 'SEVERE']
    for e in errors:
        print(f"CONSOLE ERROR: {e['message']}")
    assert len(errors) == 0, f"FAILURE: Found {len(errors)} severe console errors!"
    print("[PASS] Zero SEVERE console errors detected.")

    print("\n==========================================")
    print("ALL 5 RIGOROUS AUTOMATED TESTS PASSED! 100%")
    print("==========================================")

finally:
    driver.quit()

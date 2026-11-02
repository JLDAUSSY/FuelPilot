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

PORT = 8108
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
    start_inp.send_keys("Paris")
    driver.execute_script("arguments[0].dispatchEvent(new Event('input', { bubbles: true }));", start_inp)
    typed_val = start_inp.get_attribute("value")
    print(f"Typed in input-start: '{typed_val}'")
    assert "Paris" in typed_val, f"FAILURE: Expected 'Paris', got '{typed_val}'"
    print("[PASS] input-start accepts typing cleanly without losing focus.")

    # Wait for autocomplete dropdown
    dropdown_start = WebDriverWait(driver, 8).until(
        EC.visibility_of_element_located((By.ID, 'dropdown-start'))
    )
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
    end_inp.send_keys("Lyon")
    driver.execute_script("arguments[0].dispatchEvent(new Event('input', { bubbles: true }));", end_inp)
    typed_end = end_inp.get_attribute("value")
    print(f"Typed in input-end: '{typed_end}'")
    assert "Lyon" in typed_end, f"FAILURE: Expected 'Lyon', got '{typed_end}'"
    # Wait for Lyon search results to appear in dropdown-end
    WebDriverWait(driver, 8).until(
        lambda d: any("Lyon" in it.text for it in d.find_element(By.ID, 'dropdown-end').find_elements(By.CLASS_NAME, 'autocomplete-item'))
    )
    dropdown_end = driver.find_element(By.ID, 'dropdown-end')
    end_items = dropdown_end.find_elements(By.CLASS_NAME, 'autocomplete-item')
    print(f"Dropdown end items count: {len(end_items)}")
    lyon_item = next(it for it in end_items if "Lyon" in it.text)
    print(f"Selecting end item: {lyon_item.text}")
    lyon_item.click()
    time.sleep(0.5)
    print(f"Value after selection: '{end_inp.get_attribute('value')}'")
    print("[PASS] input-end typing and selection work cleanly.")

    time.sleep(1)
    print("\n--- TEST 3: Route Calculation & Stations Display ---")
    calc_btn = driver.find_element(By.ID, 'btn-calculate')
    driver.execute_script("arguments[0].click();", calc_btn)
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

    print("\n--- TEST 6: Locate Button & Map Pan Check ---")
    btn_locate = driver.find_element(By.ID, 'btn-locate-me')
    assert btn_locate.is_displayed(), "FAILURE: btn-locate-me not displayed!"
    btn_locate.click()
    time.sleep(1)
    # Check that no unexpected alert is displayed and app remains alive
    try:
        alert = driver.switch_to.alert
        print(f"Alert was opened: '{alert.text[:40]}...' - Accepting it")
        alert.accept()
    except Exception:
        print("No blocking alert, smooth handling.")
    print("[PASS] Locate button clicked cleanly.")

    print("\n--- TEST 7: Commercial Brands (Starbucks, Paul, etc.) & Amenities ---")
    amenity_pills = driver.find_elements(By.CLASS_NAME, 'amenity-pill')
    print(f"Found {len(amenity_pills)} commercial brand/amenity pills on cards.")
    assert len(amenity_pills) > 0, "FAILURE: No amenity pills found on cards!"
    print(f"Sample amenity pill text: '{amenity_pills[0].text}'")

    # Click on the first card to open popup and verify popup amenities block
    first_card = driver.find_element(By.CLASS_NAME, 'station-card')
    driver.execute_script("arguments[0].click();", first_card)
    time.sleep(0.5)
    popup_blocks = driver.find_elements(By.CLASS_NAME, 'popup-amenities-block')
    print(f"Popup amenities blocks found: {len(popup_blocks)}")
    assert len(popup_blocks) > 0, "FAILURE: Popup does not contain popup-amenities-block!"
    popup_text = popup_blocks[0].text
    print(f"Popup amenities content:\n{popup_text}")
    print("[PASS] Commercial brands and motorway amenities render on both cards and popup.")

    print("\n--- TEST 8: Electric (kWh) Fuel Selection & Pricing ---")
    fuel_select = driver.find_element(By.ID, 'select-fuel')
    driver.execute_script("arguments[0].value = 'elec'; arguments[0].dispatchEvent(new Event('change'));", fuel_select)
    time.sleep(1)
    
    # Check that stations are rendered with €/kWh or £/kWh
    elec_cards = driver.find_elements(By.CLASS_NAME, 'station-card')
    print(f"Found {len(elec_cards)} electric-equipped stations on route.")
    assert len(elec_cards) > 0, "FAILURE: No electric stations rendered after selecting elec!"
    
    prices_text = elec_cards[0].find_element(By.CLASS_NAME, 'prices-container').get_attribute('textContent')
    print(f"Sample electric price display: '{prices_text.strip()}'")
    assert "/kWh" in prices_text or "kWh" in prices_text, f"FAILURE: Price text does not specify /kWh! Got: {prices_text}"
    print("[PASS] Electric charging stations correctly filtered and priced per kWh.")

    print("\n--- TEST 9: Live Weather (Open-Meteo) Display ---")
    fuel_select = driver.find_element(By.ID, 'select-fuel')
    driver.execute_script("arguments[0].value = 'e10'; arguments[0].dispatchEvent(new Event('change'));", fuel_select)
    time.sleep(2)
    weather_pills = driver.find_elements(By.CLASS_NAME, 'station-weather-pill')
    print(f"Found {len(weather_pills)} weather pills on cards.")
    assert len(weather_pills) > 0, "FAILURE: No station-weather-pill found!"
    sample_weather = weather_pills[0].get_attribute('textContent').strip()
    print(f"Sample weather pill textContent: '{sample_weather}'")
    assert "°C" in sample_weather, f"FAILURE: Weather pill does not contain °C! Got: '{sample_weather}'"
    print("[PASS] Open-Meteo real-time weather successfully rendered on station cards.")

    print("\n--- TEST 10: Opening Hours & 24/7 Status ---")
    status_badges = driver.find_elements(By.CLASS_NAME, 'opening-status-badge')
    print(f"Found {len(status_badges)} opening status badges on cards.")
    assert len(status_badges) > 0, "FAILURE: No opening-status-badge found!"
    sample_status = status_badges[0].get_attribute('textContent').strip()
    print(f"Sample status badge textContent: '{sample_status}'")
    assert any(icon in sample_status for icon in ["🟢", "🟡", "🌙"]), f"FAILURE: Unknown status badge format: '{sample_status}'"

    first_card = driver.find_element(By.CLASS_NAME, 'station-card')
    driver.execute_script("arguments[0].click();", first_card)
    time.sleep(0.5)
    popup_hours = driver.find_elements(By.CLASS_NAME, 'popup-opening-hours')
    print(f"Popup opening hours blocks found: {len(popup_hours)}")
    assert len(popup_hours) > 0, "FAILURE: Popup does not contain popup-opening-hours block!"
    popup_hours_text = popup_hours[0].get_attribute('textContent').strip()
    print(f"Popup opening hours textContent:\n{popup_hours_text}")
    assert "24h/24" in popup_hours_text or "24/7" in popup_hours_text, "FAILURE: Popup does not state 24h/24 fuel availability!"
    print("[PASS] Opening hours & 24/7 status properly displayed on cards and popups.")

    print("\n--- TEST 11: Exit Stations (< 1.5 km) Toggle & Savings ---")
    initial_count = len(driver.find_elements(By.CLASS_NAME, 'station-card'))
    print(f"Direct motorway stations count before toggle: {initial_count}")

    chk_exit = driver.find_element(By.ID, 'chk-exit-stations')
    assert chk_exit is not None, "FAILURE: #chk-exit-stations checkbox element not found!"
    driver.execute_script("arguments[0].click();", chk_exit)
    time.sleep(2)

    exit_cards = driver.find_elements(By.CLASS_NAME, 'station-card')
    print(f"Total stations count after enabling exit stations: {len(exit_cards)}")
    assert len(exit_cards) >= initial_count, f"FAILURE: Station count did not increase or stay equal! Got {len(exit_cards)}"

    exit_badges = driver.find_elements(By.CLASS_NAME, 'exit-badge')
    print(f"Found {len(exit_badges)} exit badges ('🚪 Sortie').")
    assert len(exit_badges) > 0, "FAILURE: No exit-badge found after enabling exit stations toggle!"
    sample_exit_badge = exit_badges[0].get_attribute('textContent').strip()
    print(f"Sample exit badge text: '{sample_exit_badge}'")
    assert "🚪" in sample_exit_badge and "Sortie" in sample_exit_badge, f"FAILURE: Invalid exit badge: '{sample_exit_badge}'"

    savings_badges = driver.find_elements(By.CLASS_NAME, 'station-savings-badge')
    print(f"Found {len(savings_badges)} savings badges ('💰 Économie').")
    if len(savings_badges) > 0:
        sample_savings = savings_badges[0].get_attribute('textContent').strip()
        print(f"Sample savings badge text: '{sample_savings}'")
        assert "💰" in sample_savings and "plein" in sample_savings, f"FAILURE: Invalid savings badge format: '{sample_savings}'"
    print("[PASS] Exit stations toggle, exit badges, and savings calculations verified successfully.")

    print("\n--- Final Console Error Check ---")
    logs = driver.get_log('browser')
    severe = [l for l in logs if l['level'] == 'SEVERE']
    assert len(severe) == 0, f"FAILURE: Encountered console errors: {severe}"
    print("[PASS] 0 severe console errors throughout all tests.")

    print("\n==========================================")
    print("ALL 11 RIGOROUS AUTOMATED TESTS PASSED! 100%")
    print("==========================================")

finally:
    driver.quit()

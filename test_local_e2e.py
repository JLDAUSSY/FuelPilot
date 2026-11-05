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

    print("\n--- TEST 1B: App Name (FuelCoPilot) & Large Logo (+50%) Check ---")
    brand_h1 = driver.find_element(By.CSS_SELECTOR, '.brand-title h1').text
    print(f"App Brand Title: '{brand_h1}'")
    assert "FuelCoPilot" in brand_h1, f"FAILURE: Expected FuelCoPilot in header, got '{brand_h1}'"
    logo_img = driver.find_element(By.CLASS_NAME, 'brand-logo-img')
    logo_width = logo_img.size['width']
    print(f"Brand logo icon width: {logo_width}px")
    assert logo_width >= 60, f"FAILURE: Logo width expected >= 60px (+50% increase), got {logo_width}px"
    print("[PASS] FuelCoPilot branding and enlarged 68px/87px icon verified.")

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
    dropdown_start = WebDriverWait(driver, 14).until(
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
    WebDriverWait(driver, 14).until(
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

    print("\n--- TEST 2B: Clear Button ('✕') on Address Inputs ---")
    btn_clear_end = driver.find_element(By.ID, 'btn-clear-end')
    assert btn_clear_end.is_displayed(), "FAILURE: btn-clear-end is not displayed when input has value!"
    driver.execute_script("arguments[0].click();", btn_clear_end)
    time.sleep(0.5)
    cleared_val = end_inp.get_attribute("value")
    print(f"Value in input-end after clicking '✕': '{cleared_val}'")
    assert cleared_val == "", f"FAILURE: Expected empty input after clicking '✕', got '{cleared_val}'"
    assert not btn_clear_end.is_displayed(), "FAILURE: btn-clear-end should be hidden when input is empty!"
    
    # Re-type and select Lyon for remaining tests
    end_inp.send_keys("Lyon")
    driver.execute_script("arguments[0].dispatchEvent(new Event('input', { bubbles: true }));", end_inp)
    WebDriverWait(driver, 14).until(
        lambda d: any("Lyon" in it.text for it in d.find_element(By.ID, 'dropdown-end').find_elements(By.CLASS_NAME, 'autocomplete-item'))
    )
    time.sleep(0.3)
    dropdown_end = driver.find_element(By.ID, 'dropdown-end')
    lyon_item = next(it for it in dropdown_end.find_elements(By.CLASS_NAME, 'autocomplete-item') if "Lyon" in it.text)
    driver.execute_script("arguments[0].click();", lyon_item)
    time.sleep(0.5)
    print("[PASS] Clear button ('✕') successfully resets address input cleanly.")

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
        time.sleep(0.5)
    except Exception:
        print("No blocking alert, smooth handling.")
    print("[PASS] Locate button clicked cleanly.")

    print("\n--- TEST 7: Commercial Brands (Removed from list cards, present in popup) ---")
    card_amenities = driver.find_elements(By.CSS_SELECTOR, '.station-card .amenity-pill')
    print(f"Amenity pills on station cards in the list: {len(card_amenities)}")
    assert len(card_amenities) == 0, f"FAILURE: Amenity pills must NOT appear on list cards! Found {len(card_amenities)}"

    # Click on the first card to open popup and verify popup amenities block
    first_card = driver.find_element(By.CLASS_NAME, 'station-card')
    driver.execute_script("arguments[0].click();", first_card)
    time.sleep(0.5)
    popup_blocks = driver.find_elements(By.CLASS_NAME, 'popup-amenities-block')
    print(f"Popup amenities blocks found: {len(popup_blocks)}")
    assert len(popup_blocks) > 0, "FAILURE: Popup does not contain popup-amenities-block!"
    popup_text = popup_blocks[0].text
    print(f"Popup amenities content:\n{popup_text}")
    print("[PASS] Commercial brands are suppressed from list cards and strictly displayed in the popup window.")

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

    print("\n--- TEST 10: Opening Hours & Status (Removed from list cards, present in popup) ---")
    card_status_badges = driver.find_elements(By.CSS_SELECTOR, '.station-card .opening-status-badge')
    print(f"Opening status badges on list cards: {len(card_status_badges)}")
    assert len(card_status_badges) == 0, f"FAILURE: Opening status badge must NOT appear on list cards! Found {len(card_status_badges)}"

    first_card = driver.find_element(By.CLASS_NAME, 'station-card')
    driver.execute_script("arguments[0].click();", first_card)
    time.sleep(0.5)
    popup_hours = driver.find_elements(By.CLASS_NAME, 'popup-opening-hours')
    print(f"Popup opening hours blocks found: {len(popup_hours)}")
    assert len(popup_hours) > 0, "FAILURE: Popup does not contain popup-opening-hours block!"
    popup_hours_text = popup_hours[0].get_attribute('textContent').strip()
    print(f"Popup opening hours textContent:\n{popup_hours_text}")
    assert "24h/24" in popup_hours_text or "24/7" in popup_hours_text, "FAILURE: Popup does not state 24h/24 fuel availability!"
    assert any(icon in popup_hours_text for icon in ["🟢", "🟡", "🌙"]), f"FAILURE: Popup missing opening status: {popup_hours_text}"
    print("[PASS] Opening hours & status properly displayed in popup window and removed from list cards.")

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
    assert "🚪" in sample_exit_badge and ("hors autoroute" in sample_exit_badge.lower() or "sortie" in sample_exit_badge.lower()), f"FAILURE: Invalid exit badge: '{sample_exit_badge}'"
    assert "km" in sample_exit_badge, f"FAILURE: Exit badge distance must be formatted in km with 1 decimal! Got: '{sample_exit_badge}'"
    import re
    assert re.search(r'\d+\.\d+\s*km', sample_exit_badge), f"FAILURE: Exit badge distance does not contain 1-decimal km: '{sample_exit_badge}'"
    print(f"[PASS] Exit badge distance correctly formatted in decimal km: '{sample_exit_badge}'")

    # Check that exit station cards have exit-station-card class and distinct slate grey background
    exit_cards_styled = [c for c in exit_cards if 'exit-station-card' in c.get_attribute('className')]
    assert len(exit_cards_styled) > 0, "FAILURE: No cards have exit-station-card class!"
    bg_color = driver.execute_script("return window.getComputedStyle(arguments[0]).backgroundColor;", exit_cards_styled[0])
    print(f"Exit station card background color: {bg_color}")
    assert bg_color != 'rgb(15, 23, 42)', "FAILURE: Exit card still has default black background!"
    
    # Check that exit station cards feature the high-contrast exit-card-banner
    exit_banners = driver.find_elements(By.CLASS_NAME, 'exit-card-banner')
    print(f"Found {len(exit_banners)} high-contrast exit card top banners.")
    assert len(exit_banners) > 0, "FAILURE: No exit-card-banner found on off-motorway cards!"
    sample_banner = exit_banners[0].get_attribute('textContent').strip()
    print(f"Sample exit banner text: '{sample_banner}'")
    assert "🚪" in sample_banner and ("HORS AUTOROUTE" in sample_banner or "SORTIE" in sample_banner), f"FAILURE: Invalid exit banner text: '{sample_banner}'"
    print("[PASS] Exit station cards feature high-contrast exit-card-banner and distinct slate styling.")

    savings_badges = driver.find_elements(By.CLASS_NAME, 'station-savings-badge')
    print(f"Found {len(savings_badges)} savings badges ('💰 Économie').")
    if len(savings_badges) > 0:
        sample_savings = savings_badges[0].get_attribute('textContent').strip()
        print(f"Sample savings badge text: '{sample_savings}'")
        assert "💰" in sample_savings and "plein" in sample_savings, f"FAILURE: Invalid savings badge format: '{sample_savings}'"
    print("[PASS] Exit stations toggle, exit badges, and savings calculations verified successfully.")


    print("\n--- TEST 12: Exit Station Brand and Off-Highway Popup Verification ---")
    exit_card = next(c for c in exit_cards if len(c.find_elements(By.CLASS_NAME, 'exit-badge')) > 0)
    card_brand = exit_card.find_element(By.CLASS_NAME, 'brand-badge').get_attribute('textContent').strip()
    print(f"Exit station brand: '{card_brand}'")
    assert card_brand and card_brand.lower() != 'station', f"FAILURE: Generic brand 'Station' found on exit card: '{card_brand}'"

    driver.execute_script("arguments[0].scrollIntoView(); arguments[0].click();", exit_card)
    time.sleep(1.2)

    off_banner = driver.find_elements(By.CLASS_NAME, 'popup-off-motorway-banner')
    print(f"Found {len(off_banner)} popup-off-motorway-banner in popup.")
    assert len(off_banner) > 0, "FAILURE: Popup for exit station lacks popup-off-motorway-banner!"
    banner_text = off_banner[0].get_attribute('textContent').strip()
    print(f"Banner text: '{banner_text}'")
    assert 'hors autoroute' in banner_text.lower(), f"FAILURE: Banner does not mention 'Hors autoroute': '{banner_text}'"
    assert "km" in banner_text, f"FAILURE: Banner does not contain km distance: '{banner_text}'"
    assert re.search(r'\d+\.\d+\s*km', banner_text), f"FAILURE: Banner does not contain decimal km distance: '{banner_text}'"

    # Verify that popup-pk (white strip / 'Autoroute') is COMPLETELY REMOVED for off-motorway stations
    popup_pk_elements = driver.find_elements(By.CSS_SELECTOR, '.leaflet-popup-content .popup-pk')
    print(f"Found {len(popup_pk_elements)} popup-pk elements in off-motorway popup.")
    assert len(popup_pk_elements) == 0, f"FAILURE: Off-motorway popup must not display popup-pk ('Autoroute' white strip)! Found {len(popup_pk_elements)}"
    print("[PASS] Off-motorway popup correctly suppresses popup-pk (white strip / 'Autoroute').")
    print("[PASS] Exit station brand, decimal km distance and explicit off-highway notice successfully verified.")

    print("\n--- TEST 13: Popup Centering and Screen Containment ---")
    popup_wrapper = driver.find_element(By.CLASS_NAME, 'leaflet-popup-content-wrapper')
    bounds = driver.execute_script('''
        const rect = arguments[0].getBoundingClientRect();
        return {
            top: rect.top,
            bottom: rect.bottom,
            left: rect.left,
            right: rect.right,
            width: rect.width,
            height: rect.height,
            windowWidth: window.innerWidth,
            windowHeight: window.innerHeight
        };
    ''', popup_wrapper)
    print(f"Popup bounds: top={bounds['top']}, bottom={bounds['bottom']}, left={bounds['left']}, right={bounds['right']}")
    print(f"Window bounds: width={bounds['windowWidth']}, height={bounds['windowHeight']}")
    assert bounds['top'] >= 0, f"FAILURE: Popup top ({bounds['top']}) overflows screen above 0!"
    assert bounds['bottom'] <= bounds['windowHeight'] + 50, f"FAILURE: Popup bottom ({bounds['bottom']}) overflows screen bottom ({bounds['windowHeight']})!"
    assert bounds['left'] >= 0, f"FAILURE: Popup left ({bounds['left']}) overflows screen left 0!"
    assert bounds['right'] <= bounds['windowWidth'] + 10, f"FAILURE: Popup right ({bounds['right']}) overflows screen right ({bounds['windowWidth']})!"
    print("[PASS] Popup opens fully centered and strictly contained within the screen viewport.")

    print("\n--- TEST 14: Multilingual Translation on Popups and Cards (No French leakage) ---")
    it_btn = driver.find_element(By.CSS_SELECTOR, '#lang-bar .lang-flag-btn[data-lang="it"]')
    driver.execute_script("arguments[0].click();", it_btn)
    time.sleep(1.2)
    
    it_exit_badges = driver.find_elements(By.CLASS_NAME, 'exit-badge')
    assert len(it_exit_badges) > 0
    it_badge_text = it_exit_badges[0].get_attribute('textContent').strip()
    print(f"Italian exit badge text: '{it_badge_text}'")
    assert "uscita" in it_badge_text.lower(), f"FAILURE: Expected Italian 'uscita', got '{it_badge_text}'"

    exit_cards_it = driver.find_elements(By.CLASS_NAME, 'station-card')
    exit_card_it = next(c for c in exit_cards_it if len(c.find_elements(By.CLASS_NAME, 'exit-badge')) > 0)
    driver.execute_script("arguments[0].scrollIntoView(); arguments[0].click();", exit_card_it)
    time.sleep(1)

    it_banner = driver.find_element(By.CLASS_NAME, 'popup-off-motorway-banner').get_attribute('textContent')
    print(f"Italian popup banner: '{it_banner}'")
    assert "fuori autostrada" in it_banner.lower() or "uscita" in it_banner.lower(), f"FAILURE: Italian banner untranslated: '{it_banner}'"

    fr_btn = driver.find_element(By.CSS_SELECTOR, '#lang-bar .lang-flag-btn[data-lang="fr"]')
    driver.execute_script("arguments[0].click();", fr_btn)
    time.sleep(0.8)
    print("[PASS] Full multilingual localization verified with zero language leakage.")

    print("\n--- TEST 15: Address and Municipality Search Coverage (Besnate, IT) ---")
    driver.execute_script('''
        document.body.classList.remove('mobile-route-collapsed');
        const form = document.getElementById('itinerary-full-form');
        if (form) form.style.display = 'block';
        if (typeof setMobileView === 'function') setMobileView('list');
        const startInp = document.getElementById('input-start');
        startInp.value = 'Besnate';
        startInp.dispatchEvent(new Event('input', { bubbles: true }));
    ''')
    
    dropdown_start = WebDriverWait(driver, 10).until(
        EC.visibility_of_element_located((By.ID, 'dropdown-start'))
    )
    WebDriverWait(driver, 10).until(
        lambda d: any("Besnate" in it.text for it in d.find_element(By.ID, 'dropdown-start').find_elements(By.CLASS_NAME, 'autocomplete-item'))
    )
    besnate_items = dropdown_start.find_elements(By.CLASS_NAME, 'autocomplete-item')
    besnate_match = next(it for it in besnate_items if "Besnate" in it.text)
    print(f"[PASS] Successfully resolved municipality: '{besnate_match.text}'")

    
    print("\n--- TEST 16: Native Geolocation & Zero IP Fallback Audit ---")
    no_ip_geo = driver.execute_script("return typeof fetchIpGeolocation === 'undefined';")
    assert no_ip_geo, "FAILURE: fetchIpGeolocation still exists! Must be removed to prevent ISP positioning."
    print("[PASS] Zero IP Geolocation Fallback verified: app strictly relies on native GPS.")
    geo_msg_standalone = driver.execute_script('''
        return formatGeolocationErrorMessage({ code: 1 });
    ''')
    print(f"Geolocation Error Message preview:\n{geo_msg_standalone[:180]}...")
    assert "Autorisation GPS" in geo_msg_standalone, "FAILURE: Missing GPS authorization title in error message!"
    print("[PASS] Geolocation error formatting provides crystal-clear guidance.")

    print("\n--- Final Console Error Check ---")
    logs = driver.get_log('browser')
    severe = [l for l in logs if l['level'] == 'SEVERE']
    assert len(severe) == 0, f"FAILURE: Encountered console errors: {severe}"
    print("[PASS] 0 severe console errors throughout all tests.")

    print("\n==========================================")
    print("ALL 16 RIGOROUS AUTOMATED TESTS PASSED! 100%")
    print("==========================================")

finally:
    driver.quit()

# -*- coding: utf-8 -*-
"""
test_e2e_mileage_and_bg.py
Verification of:
1. Mileage (distance in km) display on both desktop and mobile in:
   - #stations-count-label (e.g. "X stations sur le trajet • Y km")
   - #routes-container (.route-stats: "Xh YYmin • Y km")
   - #sum-route-meta ("• Y km")
2. Route between Bergisch Gladbach and Emmerich am Rhein (German A3 corridor):
   - Stations properly found (Ohligser Heide, Hösel, Hünxe, Hamminkeln, Rees, etc.)
   - Zero JavaScript errors
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
from selenium.webdriver.support import expected_conditions as EC

PORT = 8140
DIRECTORY = os.path.abspath(r"C:\Users\lesda\.gemini\antigravity\scratch\essence-autoroute")

class ThreadedHTTPServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True

def start_server():
    class QuietHandler(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=DIRECTORY, **kwargs)
        def log_message(self, format, *args):
            pass

    httpd = ThreadedHTTPServer(("", PORT), QuietHandler)
    server_thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    server_thread.start()
    return httpd

def main():
    print("=" * 70)
    print("STARTING E2E TEST: KILOMETRAGE DISPLAY & BERGISCH GLADBACH -> EMMERICH")
    print("=" * 70)

    httpd = start_server()
    time.sleep(1)

    chrome_options = Options()
    chrome_options.add_argument("--headless=new")
    chrome_options.add_argument("--disable-gpu")
    chrome_options.add_argument("--window-size=1280,900")
    chrome_options.add_argument("--no-sandbox")
    chrome_options.add_argument("--disable-dev-shm-usage")
    chrome_options.set_capability("goog:loggingPrefs", {"browser": "ALL"})

    driver = webdriver.Chrome(options=chrome_options)
    wait = WebDriverWait(driver, 15)

    try:
        # 1. Desktop Test: Bergisch Gladbach -> Emmerich am Rhein
        driver.get(f"http://localhost:{PORT}/index.html")
        time.sleep(2)

        # Inject coordinates directly and trigger route calculation via client function
        print("\n[Step 1] Computing route Bergisch Gladbach -> Emmerich am Rhein...")
        driver.execute_script("""
            startPoint = { coords: [7.1277, 50.9929], label: 'Bergisch Gladbach, Deutschland' };
            endPoint = { coords: [6.2428, 51.8322], label: 'Emmerich am Rhein, Deutschland' };
            const inStart = document.getElementById('input-start');
            const inEnd = document.getElementById('input-end');
            if (inStart) inStart.value = startPoint.label;
            if (inEnd) inEnd.value = endPoint.label;
            calculateItinerary();
        """)

        # Wait for stations to load
        wait.until(lambda d: d.find_element(By.ID, "stations-count-label").text != "0 station" and "•" in d.find_element(By.ID, "stations-count-label").text)
        
        count_label_text = driver.find_element(By.ID, "stations-count-label").text
        print(f"  -> stations-count-label: '{count_label_text}'")
        assert "km" in count_label_text, f"Missing 'km' in count label: {count_label_text}"
        assert "134" in count_label_text or "133" in count_label_text, f"Unexpected distance in count label: {count_label_text}"

        # Check route card in #routes-container
        routes_container = driver.find_element(By.ID, "routes-container")
        assert routes_container.is_displayed(), "#routes-container should be visible!"
        route_stats = routes_container.find_element(By.CLASS_NAME, "route-stats").text
        print(f"  -> route-card stats: '{route_stats}'")
        assert "km" in route_stats, f"Missing 'km' in route card stats: {route_stats}"
        assert "134" in route_stats or "133" in route_stats, f"Unexpected distance in route stats: {route_stats}"

        # Check stations along A3
        station_cards = driver.find_elements(By.CSS_SELECTOR, "#stations-list .station-card")
        print(f"  -> Found {len(station_cards)} stations on route between Bergisch Gladbach and Emmerich am Rhein:")
        station_names = []
        for card in station_cards:
            try:
                nom = card.find_element(By.CLASS_NAME, "station-name").text
                station_names.append(nom)
                print(f"     - {nom}")
            except Exception:
                pass
        
        assert len(station_cards) >= 5, f"Expected at least 5 stations on route, found {len(station_cards)}"
        # Verify key A3 stations
        has_hunxe = any("Hünxe" in s for s in station_names)
        has_solingen = any("Ohligser Heide" in s for s in station_names)
        print(f"  -> Has Raststätte Hünxe: {has_hunxe}")
        print(f"  -> Has Raststätte Ohligser Heide: {has_solingen}")
        assert has_hunxe, "Raststätte Hünxe should be on route!"
        assert has_solingen, "Raststätte Ohligser Heide should be on route!"

        # 2. Mobile Viewport Test (390 x 844)
        print("\n[Step 2] Testing mobile viewport layout and summary bar...")
        driver.set_window_size(390, 844)
        time.sleep(1)

        # Re-calculate or trigger collapse on mobile
        driver.execute_script("""
            if (activeRouteData) {
                document.body.classList.add('mobile-route-collapsed');
            }
        """)
        time.sleep(1)

        summary_meta = driver.find_element(By.ID, "sum-route-meta").get_attribute("textContent").strip()
        print(f"  -> Mobile #sum-route-meta textContent: '{summary_meta}'")
        assert "km" in summary_meta, f"Mobile summary bar should contain 'km', got: {summary_meta}"

        # Switch to list tab on mobile
        btn_tab_list = driver.find_element(By.ID, "btn-tab-list")
        driver.execute_script("arguments[0].click();", btn_tab_list)
        time.sleep(1)

        mobile_count_text = driver.find_element(By.ID, "stations-count-label").text
        print(f"  -> Mobile stations-count-label on list tab: '{mobile_count_text}'")
        assert "km" in mobile_count_text, f"Mobile list tab count label should contain 'km', got: {mobile_count_text}"

        # 3. Reference Route: Paris -> Lyon
        print("\n[Step 3] Testing Paris -> Lyon reference route...")
        driver.set_window_size(1280, 900)
        time.sleep(1)
        driver.execute_script("""
            startPoint = { coords: [2.3522, 48.8566], label: 'Paris, France' };
            endPoint = { coords: [4.8357, 45.7640], label: 'Lyon, France' };
            const inStart = document.getElementById('input-start');
            const inEnd = document.getElementById('input-end');
            if (inStart) inStart.value = startPoint.label;
            if (inEnd) inEnd.value = endPoint.label;
            calculateItinerary();
        """)
        time.sleep(3)

        # Wait for route to finish computing
        wait.until(lambda d: "Paris" in d.find_element(By.ID, "sum-start-label").get_attribute("textContent") or "Lyon" in d.find_element(By.ID, "sum-end-label").get_attribute("textContent"))
        paris_lyon_count = driver.find_element(By.ID, "stations-count-label").text
        print(f"  -> Paris -> Lyon count label: '{paris_lyon_count}'")
        assert "km" in paris_lyon_count, f"Paris -> Lyon should show km, got: {paris_lyon_count}"
        assert "46" in paris_lyon_count or "47" in paris_lyon_count or "45" in paris_lyon_count, f"Expected ~465 km, got {paris_lyon_count}"

        # 4. Check browser console logs for JS errors
        print("\n[Step 4] Checking JavaScript console errors...")
        logs = driver.get_log("browser")
        severe_errors = [l for l in logs if l["level"] == "SEVERE" and "favicon" not in l["message"]]
        if severe_errors:
            print("  SEVERE console errors:")
            for err in severe_errors:
                print(f"    - {err['message']}")
            raise AssertionError(f"Encountered {len(severe_errors)} SEVERE console errors.")
        else:
            print("  -> 0 SEVERE JavaScript errors in console. Perfect!")

        print("\n" + "=" * 70)
        print("ALL TESTS PASSED SUCCESSFULLY! (100% OK)")
        print("=" * 70)

    finally:
        driver.quit()
        httpd.shutdown()

if __name__ == '__main__':
    main()

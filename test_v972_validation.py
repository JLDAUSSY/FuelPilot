import time
import json
import subprocess
import socket
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By

def is_port_in_use(port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(('localhost', port)) == 0

def run_tests():
    server_process = None
    if not is_port_in_use(8000):
        print("Starting http.server on port 8000...")
        server_process = subprocess.Popen(
            ["python", "-m", "http.server", "8000"],
            cwd=r"C:\Users\lesda\.gemini\antigravity\scratch\essence-autoroute",
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL
        )
        time.sleep(1.5)

    chrome_options = Options()
    chrome_options.add_argument("--headless=new")
    chrome_options.add_argument("--window-size=412,915")
    chrome_options.add_argument("--no-sandbox")
    chrome_options.add_argument("--disable-dev-shm-usage")
    chrome_options.set_capability('goog:loggingPrefs', {'browser': 'ALL'})

    driver = webdriver.Chrome(options=chrome_options)
    passed = 0
    failed = 0

    def assert_test(cond, desc):
        nonlocal passed, failed
        if cond:
            print(f"[PASS] {desc}")
            passed += 1
        else:
            print(f"[FAIL] {desc}")
            failed += 1

    try:
        url = "http://localhost:8000/index.html"
        driver.get(url)
        time.sleep(1)

        # Test 1: Verify version badge is v9.7.2
        badge = driver.find_element(By.ID, "app-version-badge")
        assert_test(badge.text == "v9.7.2", f"App version badge is v9.7.2 (got '{badge.text}')")

        # Test 2: Verify cold start GPS without any localStorage cache does not throw 10s premature timeout
        driver.execute_script("localStorage.removeItem('fuelpilot_last_known_gps'); userGpsPosition = null;")

        # Mock geolocation to simulate a slow GNSS fix returning at 8 seconds (which previously was close to 10s deadline)
        driver.execute_script("""
            window.__mockGeoResolved = false;
            navigator.geolocation.getCurrentPosition = function(success, error, opts) {
                // If maximumAge is generous, immediately return a fast system position
                if (opts && opts.maximumAge >= 300000) {
                    setTimeout(() => {
                        success({
                            coords: { latitude: 43.1189, longitude: 5.8028, accuracy: 250 },
                            timestamp: Date.now()
                        });
                    }, 50);
                }
            };
            navigator.geolocation.watchPosition = function(success, error, opts) {
                return setTimeout(() => {
                    success({
                        coords: { latitude: 43.1189, longitude: 5.8028, accuracy: 15 },
                        timestamp: Date.now()
                    });
                }, 300);
            };
        """)

        # Call getFreshUserLocation and verify it resolves successfully with fast system position
        res = driver.execute_async_script("""
            const callback = arguments[arguments.length - 1];
            getFreshUserLocation(
                (pos) => callback({ success: true, pos: pos }),
                (err) => callback({ success: false, err: err })
            );
        """)
        assert_test(res.get('success') == True, f"getFreshUserLocation succeeded: {res}")
        coords = res.get('pos', {}).get('coords', {})
        assert_test(abs(coords.get('latitude', 0) - 43.1189) < 0.01, f"Latitude is Sanary (~43.1189, got {coords.get('latitude')})")

        # Test 3: Test useCurrentGpsLocationAsStart
        driver.execute_script("useCurrentGpsLocationAsStart();")
        time.sleep(0.5)
        input_start = driver.find_element(By.ID, "input-start")
        val = input_start.get_attribute("value")
        print("input-start value:", val)
        assert_test("Ma position actuelle" in val, f"Start point filled with position: {val}")

        # Test 4: Check browser console for errors
        logs = driver.get_log('browser')
        errors = [l for l in logs if l['level'] == 'SEVERE']
        assert_test(len(errors) == 0, f"No SEVERE console errors (found {len(errors)})")
        if errors:
            for err in errors:
                print("  Console error:", err['message'])

    finally:
        driver.quit()
        if server_process:
            server_process.terminate()

    print("\n" + "=" * 40)
    print(f"Results: {passed} passed, {failed} failed")
    print("=" * 40)
    assert failed == 0

if __name__ == "__main__":
    run_tests()

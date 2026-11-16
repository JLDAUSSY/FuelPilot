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

        # Test 1: Verify version badge is v9.7.5
        badge = driver.find_element(By.ID, "app-version-badge")
        assert_test(badge.text == "v9.7.5", f"App version badge is v9.7.5 (got '{badge.text}')")

        # Test 2: Verify APP_VERSION in JS is 9.7.5
        app_ver = driver.execute_script("return typeof APP_VERSION !== 'undefined' ? APP_VERSION : null;")
        assert_test(app_ver == "9.7.5", f"APP_VERSION is 9.7.5 (got '{app_ver}')")

        # Test 3: Fast First OS Fused Location (Wi-Fi/Cell)
        driver.execute_script("localStorage.removeItem('fuelpilot_last_known_gps'); userGpsPosition = null; isAcquiringLocation = false;")

        driver.execute_script("""
            window.__fastCalls = 0;
            window.__deepCalls = 0;
            navigator.geolocation.getCurrentPosition = function(success, error, opts) {
                window.__fastCalls++;
                window.__fastOpts = opts;
                if (!opts || opts.enableHighAccuracy === false) {
                    // Simulate instant OS Fused Location response (50ms) with cellular accuracy (3200m)
                    return setTimeout(() => {
                        success({
                            coords: { latitude: 43.1189, longitude: 5.8028, accuracy: 3200 },
                            timestamp: Date.now()
                        });
                    }, 50);
                } else {
                    window.__deepCalls++;
                    return setTimeout(() => {
                        success({
                            coords: { latitude: 43.1189, longitude: 5.8028, accuracy: 12 },
                            timestamp: Date.now()
                        });
                    }, 200);
                }
            };
        """)

        res = driver.execute_async_script("""
            const callback = arguments[arguments.length - 1];
            getFreshUserLocation(
                (pos) => callback({ success: true, pos: pos, fastCalls: window.__fastCalls, opts: window.__fastOpts }),
                (err) => callback({ success: false, err: err })
            );
        """)
        assert_test(res.get('success') == True, f"Fast Fused Location resolved immediately: {res.get('success')}")
        assert_test(res.get('opts', {}).get('enableHighAccuracy') == False, f"Fast initial query requested low accuracy (Fused OS): {res.get('opts')}")
        coords = res.get('pos', {}).get('coords', {})
        assert_test(coords.get('accuracy') == 3200, f"Cellular accuracy (3200m) is accepted without being rejected (got {coords.get('accuracy')})")
        assert_test(abs(coords.get('latitude', 0) - 43.1189) < 0.001, f"Latitude matches Sanary (got {coords.get('latitude')})")

        # Test 4: Indoors scenario (Satellites fail / timeout, Fused OS location succeeds)
        driver.execute_script("localStorage.removeItem('fuelpilot_last_known_gps'); userGpsPosition = null; isAcquiringLocation = false;")

        driver.execute_script("""
            navigator.geolocation.getCurrentPosition = function(success, error, opts) {
                if (!opts || opts.enableHighAccuracy === false) {
                    // Fast OS network fix available
                    return setTimeout(() => {
                        success({
                            coords: { latitude: 43.1190, longitude: 5.8030, accuracy: 2500 },
                            timestamp: Date.now()
                        });
                    }, 40);
                } else {
                    // High accuracy fails / times out (indoors)
                    return setTimeout(() => {
                        error({ code: 3, message: 'Timeout satellites indoors' });
                    }, 100);
                }
            };
        """)

        res_indoor = driver.execute_async_script("""
            const callback = arguments[arguments.length - 1];
            getFreshUserLocation(
                (pos) => callback({ success: true, pos: pos }),
                (err) => callback({ success: false, err: err })
            );
        """)
        assert_test(res_indoor.get('success') == True, f"Indoors scenario succeeded via Fused OS location despite GNSS satellite timeout: {res_indoor.get('success')}")

        # Test 5: Cache persistence allows up to 8000m
        driver.execute_script("""
            saveCachedUserPosition({ lat: 43.12, lon: 5.80, accuracy: 4500, city: 'Sanary-sur-Mer' });
        """)
        cached = driver.execute_script("return getCachedUserPosition();")
        assert_test(cached is not None and cached.get('accuracy') == 4500, f"getCachedUserPosition preserved cellular fix up to 8000m (got {cached})")

        # Test 6: Center on user with cached position does NOT show red error toast
        driver.execute_script("""
            // Reset toasts
            const toastContainer = document.getElementById('toast-container');
            if (toastContainer) toastContainer.innerHTML = '';
            centerMapOnUser();
        """)
        time.sleep(0.5)
        toasts = driver.find_elements(By.CLASS_NAME, "toast")
        has_warning_toast = any("toast-warning" in t.get_attribute("class") for t in toasts)
        assert_test(not has_warning_toast, f"No red warning toast displayed when centering on user with cached/fast location")

        # Test 7: E2E Route Calculation from Sanary to Nice
        driver.execute_script("""
            startPoint = { coords: [5.8028, 43.1189], label: 'Ma position actuelle (Sanary-sur-Mer)' };
            endPoint = { coords: [7.2620, 43.7102], label: 'Nice' };
            document.getElementById('input-start').value = 'Ma position actuelle (Sanary-sur-Mer)';
            document.getElementById('input-end').value = 'Nice';
            calculateItinerary();
        """)
        time.sleep(4.0)
        route_ok = driver.execute_script("return activeRouteData !== null;")
        st_count = driver.execute_script("return currentRouteStations ? currentRouteStations.length : 0;")
        assert_test(route_ok == True, f"Route calculated successfully (activeRouteData exists): {route_ok}")
        assert_test(st_count > 0, f"Stations found along route: {st_count} stations")

        # Test 8: Check for severe console errors
        logs = driver.get_log('browser')
        severe_errors = [l for l in logs if l['level'] == 'SEVERE' and 'favicon.ico' not in l['message'] and 'fonts.googleapis' not in l['message'] and 'data.gouv.fr' not in l['message']]
        assert_test(len(severe_errors) == 0, f"No severe browser console errors (found {len(severe_errors)})")
        if severe_errors:
            for err in severe_errors:
                print("Severe log:", err)

    finally:
        driver.quit()
        if server_process:
            server_process.terminate()

    print(f"\nTotal: {passed} passed, {failed} failed.")
    return failed == 0

if __name__ == '__main__':
    success = run_tests()
    exit(0 if success else 1)

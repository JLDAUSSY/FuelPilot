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

        # Test 1: Verify version badge is v9.7.6
        badge = driver.find_element(By.ID, "app-version-badge")
        assert_test(badge.text == "v9.7.6", f"App version badge is v9.7.6 (got '{badge.text}')")

        # Test 2: Verify APP_VERSION in JS is 9.7.6
        app_ver = driver.execute_script("return typeof APP_VERSION !== 'undefined' ? APP_VERSION : null;")
        assert_test(app_ver == "9.7.6", f"APP_VERSION is 9.7.6 (got '{app_ver}')")

        # Test 3: Fast Network Fix (Fused OS) with realistic timeout (8000ms)
        driver.execute_script("localStorage.removeItem('fuelpilot_last_known_gps'); userGpsPosition = null; isAcquiringLocation = false;")

        driver.execute_script("""
            window.__fastCalls = 0;
            navigator.geolocation.getCurrentPosition = function(success, error, opts) {
                window.__fastCalls++;
                window.__lastOpts = opts;
                if (!opts || opts.enableHighAccuracy === false) {
                    return setTimeout(() => {
                        success({
                            coords: { latitude: 43.1189, longitude: 5.8028, accuracy: 4200 },
                            timestamp: Date.now()
                        });
                    }, 50);
                } else {
                    return setTimeout(() => {
                        success({
                            coords: { latitude: 43.1189, longitude: 5.8028, accuracy: 12 },
                            timestamp: Date.now()
                        });
                    }, 100);
                }
            };
        """)

        res = driver.execute_async_script("""
            const callback = arguments[arguments.length - 1];
            getFreshUserLocation(
                (pos) => callback({ success: true, pos: pos, calls: window.__fastCalls, opts: window.__lastOpts }),
                (err) => callback({ success: false, err: err })
            );
        """)
        assert_test(res.get('success') == True, f"Network/Cell location resolved: {res.get('success')}")
        assert_test(res.get('opts', {}).get('timeout') >= 8000, f"Network timeout is realistic (>= 8000ms, got {res.get('opts', {}).get('timeout')})")
        coords = res.get('pos', {}).get('coords', {})
        assert_test(coords.get('accuracy') == 4200, f"Cellular accuracy (4200m) is accepted (got {coords.get('accuracy')})")

        # Test 4: Verify cache is NOT wiped out on reload
        driver.execute_script("""
            saveCachedUserPosition({ lat: 43.12, lon: 5.80, accuracy: 4200, city: 'Sanary-sur-Mer' });
        """)
        cached_before = driver.execute_script("return getCachedUserPosition();")
        assert_test(cached_before is not None and cached_before.get('accuracy') == 4200, f"Cache saved before reload: {cached_before}")

        driver.refresh()
        time.sleep(1)

        cached_after = driver.execute_script("return getCachedUserPosition();")
        assert_test(cached_after is not None and cached_after.get('accuracy') == 4200, f"Cache NOT wiped on reload (accuracy 4200m retained): {cached_after}")

        # Test 5: Verify map centered on cached position upon startup
        map_center = driver.execute_script("return map ? [map.getCenter().lat, map.getCenter().lng] : null;")
        assert_test(map_center is not None and abs(map_center[0] - 43.12) < 0.05, f"Map automatically centered on cached Sanary position upon startup: {map_center}")

        # Test 6: Center on user button when cached position exists shows NO warning toast
        driver.execute_script("""
            const toastContainer = document.getElementById('toast-container');
            if (toastContainer) toastContainer.innerHTML = '';
            centerMapOnUser();
        """)
        time.sleep(0.5)
        toasts = driver.find_elements(By.CLASS_NAME, "toast")
        has_warning_toast = any("toast-warning" in t.get_attribute("class") for t in toasts)
        assert_test(not has_warning_toast, f"No red warning toast displayed when centering on user")

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

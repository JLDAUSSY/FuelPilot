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

        # Test 1: Verify version badge is v9.7.4
        badge = driver.find_element(By.ID, "app-version-badge")
        assert_test(badge.text == "v9.7.4", f"App version badge is v9.7.4 (got '{badge.text}')")

        # Test 2: Verify APP_VERSION in JS is 9.7.4
        app_ver = driver.execute_script("return typeof APP_VERSION !== 'undefined' ? APP_VERSION : null;")
        assert_test(app_ver == "9.7.4", f"APP_VERSION is 9.7.4 (got '{app_ver}')")

        # Test 3: WaterMetrics watchPosition Single Stream Engine
        driver.execute_script("localStorage.removeItem('fuelpilot_last_known_gps'); userGpsPosition = null;")

        driver.execute_script("""
            window.__watchCalls = 0;
            navigator.geolocation.watchPosition = function(success, error, opts) {
                window.__watchCalls++;
                window.__watchOpts = opts;
                return setTimeout(() => {
                    success({
                        coords: { latitude: 43.1189, longitude: 5.8028, accuracy: 18 },
                        timestamp: Date.now()
                    });
                }, 100);
            };
        """)

        res = driver.execute_async_script("""
            const callback = arguments[arguments.length - 1];
            getFreshUserLocation(
                (pos) => callback({ success: true, pos: pos, watchCalls: window.__watchCalls, opts: window.__watchOpts }),
                (err) => callback({ success: false, err: err })
            );
        """)
        assert_test(res.get('success') == True, f"WaterMetrics engine resolved position: {res.get('success')}")
        assert_test(res.get('watchCalls') == 1, f"Single watch stream used (no duplicate conflicting calls): {res.get('watchCalls')}")
        assert_test(res.get('opts', {}).get('enableHighAccuracy') == True, f"High accuracy requested: {res.get('opts')}")
        coords = res.get('pos', {}).get('coords', {})
        assert_test(abs(coords.get('latitude', 0) - 43.1189) < 0.001, f"Accurate latitude at Sanary (~43.1189, got {coords.get('latitude')})")

        # Test 4: Cellular / Approximate location (e.g. 1500m <= 3000m) is accepted immediately
        driver.execute_script("""
            userGpsPosition = null;
            isAcquiringLocation = false;
            navigator.geolocation.watchPosition = function(success, error, opts) {
                return setTimeout(() => {
                    success({
                        coords: { latitude: 43.1250, longitude: 5.7950, accuracy: 1500 },
                        timestamp: Date.now()
                    });
                }, 50);
            };
        """)
        res_approx = driver.execute_async_script("""
            const callback = arguments[arguments.length - 1];
            getFreshUserLocation(
                (pos) => callback({ success: true, pos: pos }),
                (err) => callback({ success: false, err: err })
            );
        """)
        assert_test(res_approx.get('success') == True, f"Approximate position (±1500m) accepted: {res_approx.get('success')}")

        # Test 5: Instant start point application with useCurrentGpsLocationAsStart
        driver.execute_script("useCurrentGpsLocationAsStart();")
        time.sleep(0.3)
        input_start = driver.find_element(By.ID, "input-start")
        val = input_start.get_attribute("value")
        assert_test("Ma position actuelle" in val, f"Input start has 'Ma position actuelle': {val}")
        start_pt = driver.execute_script("return startPoint;")
        assert_test(start_pt is not None and len(start_pt.get('coords', [])) == 2, f"startPoint coords registered: {start_pt}")

        # Test 6: Verify cache persistence (getCachedUserPosition & saveCachedUserPosition)
        driver.execute_script("""
            saveCachedUserPosition({
                lat: 43.1189,
                lon: 5.8028,
                accuracy: 25,
                city: 'Sanary-sur-Mer'
            });
        """)
        cached = driver.execute_script("return getCachedUserPosition();")
        assert_test(cached is not None and cached.get('city') == 'Sanary-sur-Mer', f"Cached position correctly saved & retrieved: {cached}")

        # Test 7: 3-tier sequential fallback:
        # watchPosition fails -> getCurrentPosition(highAcc) fails -> getCurrentPosition(lowAcc/Cell/WiFi) succeeds!
        driver.execute_script("""
            userGpsPosition = null;
            isAcquiringLocation = false;
            localStorage.removeItem('fuelpilot_last_known_gps');
            navigator.geolocation.watchPosition = function(success, error, opts) {
                return setTimeout(() => {
                    error({ code: 3, message: 'GNSS satellites obscured' });
                }, 50);
            };
            window.__lowAccCalled = false;
            navigator.geolocation.getCurrentPosition = function(success, error, opts) {
                if (opts && opts.enableHighAccuracy === true) {
                    setTimeout(() => {
                        error({ code: 2, message: 'High accuracy GNSS failed' });
                    }, 50);
                } else {
                    window.__lowAccCalled = true;
                    setTimeout(() => {
                        success({
                            coords: { latitude: 43.1189, longitude: 5.8028, accuracy: 800 },
                            timestamp: Date.now()
                        });
                    }, 50);
                }
            };
        """)
        res_tier3 = driver.execute_async_script("""
            const callback = arguments[arguments.length - 1];
            getFreshUserLocation(
                (pos) => callback({ success: true, pos: pos, lowAccCalled: window.__lowAccCalled }),
                (err) => callback({ success: false, err: err })
            );
        """)
        assert_test(res_tier3.get('success') == True, f"Tier 3 fallback (network/cell/wifi) resolved position: {res_tier3.get('success')}")
        assert_test(res_tier3.get('lowAccCalled') == True, f"Tier 3 low accuracy fallback was reached: {res_tier3.get('lowAccCalled')}")

        # Test 8: Center map on user (centerMapOnUser)
        driver.execute_script("centerMapOnUser();")
        time.sleep(0.3)
        map_center = driver.execute_script("return map ? [map.getCenter().lat, map.getCenter().lng] : null;")
        assert_test(map_center is not None and abs(map_center[0] - 43.1189) < 0.05, f"Map centered on user: {map_center}")

        # Test 9: E2E Route Calculation from Sanary to Nice
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

        # Test 10: Check for any JS console errors
        logs = driver.get_log('browser')
        severe_errors = [l for l in logs if l['level'] == 'SEVERE' and 'favicon.ico' not in l['message'] and 'fonts.googleapis' not in l['message'] and 'data.gouv.fr' not in l['message']]
        assert_test(len(severe_errors) == 0, f"Zero severe console errors (found {len(severe_errors)}: {severe_errors})")

    finally:
        driver.quit()
        if server_process:
            server_process.terminate()

    print(f"\n==============================")
    print(f"RESULTS: {passed} PASSED, {failed} FAILED")
    print(f"==============================")
    return failed == 0

if __name__ == '__main__':
    success = run_tests()
    exit(0 if success else 1)

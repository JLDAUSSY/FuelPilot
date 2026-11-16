import time
import json
import subprocess
import socket
import sys
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
    driver.set_script_timeout(10)
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

        # Test 1: Verify version badge is v9.7.9
        badge = driver.find_element(By.ID, "app-version-badge")
        assert_test(badge.text == "v9.7.9", f"App version badge is v9.7.9 (got '{badge.text}')")

        # Test 2: Verify APP_VERSION in JS is 9.7.9
        app_ver = driver.execute_script("return typeof APP_VERSION !== 'undefined' ? APP_VERSION : null;")
        assert_test(app_ver == "9.7.9", f"APP_VERSION is 9.7.9 (got '{app_ver}')")

        # Test 3: Verify fetchIpLocation does NOT exist
        has_fetch_ip = driver.execute_script("return typeof fetchIpLocation !== 'undefined';")
        assert_test(not has_fetch_ip, "fetchIpLocation is completely removed from JS engine")

        # Test 4: Startup cache purge of stale Évenos / IP fallback data
        purge_test = driver.execute_script("""
            localStorage.setItem('fuelpilot_last_known_gps', JSON.stringify({
                lat: 43.167,
                lon: 5.833,
                accuracy: 8000,
                city: 'Évenos',
                isIpFallback: true,
                timestamp: Date.now()
            }));
            const readBefore = getCachedUserPosition();
            saveCachedUserPosition({
                lat: 43.167,
                lon: 5.833,
                accuracy: 8000,
                city: 'Évenos',
                isIpFallback: true
            });
            const readAfter = getCachedUserPosition();
            return { rejectedBefore: (readBefore === null), rejectedAfter: (readAfter === null) };
        """)
        assert_test(purge_test.get('rejectedBefore') == True, "getCachedUserPosition strictly rejects Évenos / IP fallback")
        assert_test(purge_test.get('rejectedAfter') == True, "saveCachedUserPosition refuses to save IP fallback / Évenos")

        # Test 5: Immediate satellite GPS fix (Sanary, 18m)
        driver.execute_script("""
            userGpsPosition = null;
            isAcquiringLocation = false;
            window._lastGpsAcqStart = 0;
            pendingLocationResolvers = [];
            navigator.geolocation.watchPosition = function(success, error, opts) {
                return 999;
            };
            navigator.geolocation.getCurrentPosition = function(success, error, opts) {
                setTimeout(() => {
                    success({
                        coords: {
                            latitude: 43.118,
                            longitude: 5.802,
                            accuracy: 18,
                            heading: null,
                            speed: null
                        }
                    });
                }, 50);
            };
        """)

        precise_res = driver.execute_async_script("""
            const callback = arguments[arguments.length - 1];
            getFreshUserLocation(
                (pos) => callback({ success: true, pos: pos }),
                (err) => callback({ success: false, err: err })
            );
        """)
        assert_test(precise_res.get('success') == True, f"getFreshUserLocation acquired precise fix: {precise_res.get('pos', {}).get('coords')}")
        pos_coords = precise_res.get('pos', {}).get('coords', {})
        assert_test(abs(pos_coords.get('latitude', 0) - 43.118) < 0.001, f"Latitude matches Sanary-sur-Mer: {pos_coords.get('latitude')}")
        assert_test(pos_coords.get('accuracy') == 18, f"Accuracy matches exact satellite fix: {pos_coords.get('accuracy')}m")

        # Test 6: Intermediate/approximate fix fallback (e.g. WiFi in Sanary, 800m)
        # Instead of timing out, the candidate timer (3.5s) resolves successfully!
        driver.execute_script("""
            userGpsPosition = null;
            isAcquiringLocation = false;
            window._lastGpsAcqStart = 0;
            backgroundGpsWatchId = null;
            pendingLocationResolvers = [];
            // Mock watchPosition returning an 800m approximate fix
            navigator.geolocation.watchPosition = function(success, error, opts) {
                setTimeout(() => {
                    success({
                        coords: {
                            latitude: 43.119,
                            longitude: 5.801,
                            accuracy: 800
                        }
                    });
                }, 50);
                return 123;
            };
            // Mock getCurrentPosition not firing
            navigator.geolocation.getCurrentPosition = function(success, error, opts) {};
        """)

        approx_res = driver.execute_async_script("""
            const callback = arguments[arguments.length - 1];
            getFreshUserLocation(
                (pos) => callback({ success: true, pos: pos }),
                (err) => callback({ success: false, err: err })
            );
        """)
        assert_test(approx_res.get('success') == True, f"Adaptive engine resolved approximate fix gracefully without timing out: {approx_res.get('pos', {}).get('coords')}")
        assert_test(approx_res.get('pos', {}).get('coords', {}).get('accuracy') == 800, "Accuracy of approximate fix is 800m")

        # Test 7: useCurrentGpsLocationAsStart populates start input with user location
        driver.execute_script("""
            useCurrentGpsLocationAsStart();
        """)
        time.sleep(0.5)
        start_val = driver.find_element(By.ID, "input-start").get_attribute("value")
        assert_test("position" in start_val.lower(), f"Departure input automatically populated (got '{start_val}')")
        start_pt_check = driver.execute_script("return { exists: !!window.startPoint, isIp: window.startPoint ? !!window.startPoint.isIpFallback : null };")
        assert_test(start_pt_check.get('exists') == True, "startPoint object exists")
        assert_test(start_pt_check.get('isIp') == False, "startPoint.isIpFallback is strictly false")

        # Test 8: Check console logs for errors
        logs = driver.get_log('browser')
        severe_errors = [l for l in logs if l['level'] == 'SEVERE' and 'favicon' not in l['message'] and '404' not in l['message']]
        assert_test(len(severe_errors) == 0, f"No severe browser console errors (found {len(severe_errors)})")
        if severe_errors:
            for e in severe_errors:
                print(f"   Console SEVERE: {e['message']}")

    finally:
        driver.quit()
        if server_process:
            server_process.terminate()

    print("\n" + "="*50)
    print(f"TEST RESULTS: {passed} PASSED, {failed} FAILED")
    print("="*50)
    return failed == 0

if __name__ == "__main__":
    success = run_tests()
    sys.exit(0 if success else 1)

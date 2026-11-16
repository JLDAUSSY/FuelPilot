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

        # Test 1: Verify version badge is v9.8.0
        badge = driver.find_element(By.ID, "app-version-badge")
        assert_test(badge.text == "v9.8.0", f"App version badge is v9.8.0 (got '{badge.text}')")

        # Test 2: Verify APP_VERSION in JS is 9.8.0
        app_ver = driver.execute_script("return typeof APP_VERSION !== 'undefined' ? APP_VERSION : null;")
        assert_test(app_ver == "9.8.0", f"APP_VERSION is 9.8.0 (got '{app_ver}')")

        # Test 3: Fast Fused fix (0-200ms) with enableHighAccuracy: false resolves instantly
        driver.execute_script("""
            userGpsPosition = null;
            isAcquiringLocation = false;
            window._lastGpsAcqStart = 0;
            backgroundGpsWatchId = null;
            pendingLocationResolvers = [];
            navigator.geolocation.watchPosition = function(success, error, opts) {
                return 111;
            };
            navigator.geolocation.getCurrentPosition = function(success, error, opts) {
                // If fast call (enableHighAccuracy === false), return Sanary location immediately in 30ms!
                if (!opts.enableHighAccuracy) {
                    setTimeout(() => {
                        success({
                            coords: {
                                latitude: 43.118,
                                longitude: 5.802,
                                accuracy: 35
                            }
                        });
                    }, 30);
                }
            };
        """)

        fast_res = driver.execute_async_script("""
            const callback = arguments[arguments.length - 1];
            getFreshUserLocation(
                (pos) => callback({ success: true, pos: pos }),
                (err) => callback({ success: false, err: err })
            );
        """)
        assert_test(fast_res.get('success') == True, f"Fast Fused fix resolved instantly: {fast_res.get('pos', {}).get('coords')}")
        pos_coords = fast_res.get('pos', {}).get('coords', {})
        assert_test(abs(pos_coords.get('latitude', 0) - 43.118) < 0.001, f"Latitude matches Sanary-sur-Mer: {pos_coords.get('latitude')}")
        assert_test(pos_coords.get('accuracy') == 35, f"Accuracy is 35m: {pos_coords.get('accuracy')}m")

        # Test 4: Pure satellite fix (fine) also resolves
        driver.execute_script("""
            userGpsPosition = null;
            isAcquiringLocation = false;
            window._lastGpsAcqStart = 0;
            backgroundGpsWatchId = null;
            pendingLocationResolvers = [];
            navigator.geolocation.watchPosition = function(success, error, opts) {
                return 222;
            };
            navigator.geolocation.getCurrentPosition = function(success, error, opts) {
                if (opts.enableHighAccuracy) {
                    setTimeout(() => {
                        success({
                            coords: {
                                latitude: 43.1182,
                                longitude: 5.8021,
                                accuracy: 12
                            }
                        });
                    }, 50);
                }
            };
        """)

        fine_res = driver.execute_async_script("""
            const callback = arguments[arguments.length - 1];
            getFreshUserLocation(
                (pos) => callback({ success: true, pos: pos }),
                (err) => callback({ success: false, err: err })
            );
        """)
        assert_test(fine_res.get('success') == True, f"Fine satellite fix resolved: {fine_res.get('pos', {}).get('coords')}")
        assert_test(fine_res.get('pos', {}).get('coords', {}).get('accuracy') == 12, "Accuracy is 12m")

        # Test 5: useCurrentGpsLocationAsStart populates departure field
        driver.execute_script("""
            useCurrentGpsLocationAsStart();
        """)
        time.sleep(0.5)
        start_val = driver.find_element(By.ID, "input-start").get_attribute("value")
        assert_test("position" in start_val.lower(), f"Departure input automatically populated (got '{start_val}')")
        start_pt_check = driver.execute_script("return { exists: !!window.startPoint, isIp: window.startPoint ? !!window.startPoint.isIpFallback : null };")
        assert_test(start_pt_check.get('exists') == True, "startPoint object exists")
        assert_test(start_pt_check.get('isIp') == False, "startPoint.isIpFallback is strictly false")

        # Test 6: Check console logs for errors
        logs = driver.get_log('browser')
        severe_errors = [l for l in logs if l['level'] == 'SEVERE' and 'favicon' not in l['message'] and '404' not in l['message']]
        assert_test(len(severe_errors) == 0, f"No severe browser console errors (found {len(severe_errors)})")

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

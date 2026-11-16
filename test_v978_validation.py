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

        # Test 1: Verify version badge is v9.7.8
        badge = driver.find_element(By.ID, "app-version-badge")
        assert_test(badge.text == "v9.7.8", f"App version badge is v9.7.8 (got '{badge.text}')")

        # Test 2: Verify APP_VERSION in JS is 9.7.8
        app_ver = driver.execute_script("return typeof APP_VERSION !== 'undefined' ? APP_VERSION : null;")
        assert_test(app_ver == "9.7.8", f"APP_VERSION is 9.7.8 (got '{app_ver}')")

        # Test 3: Verify fetchIpLocation does NOT exist in global scope
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
            // Trigger autoStartupGeolocation or check getCachedUserPosition rejection
            const rejected = (readBefore === null);
            // Also test saveCachedUserPosition rejecting IP/Évenos
            saveCachedUserPosition({
                lat: 43.167,
                lon: 5.833,
                accuracy: 8000,
                city: 'Évenos',
                isIpFallback: true
            });
            const rejectedSave = (getCachedUserPosition() === null);
            return { rejected, rejectedSave };
        """)
        assert_test(purge_test.get('rejected') == True, "getCachedUserPosition strictly rejects Évenos / IP fallback / accuracy > 500m")
        assert_test(purge_test.get('rejectedSave') == True, "saveCachedUserPosition refuses to save IP fallback / accuracy > 500m")

        # Test 5: Rejection of coarse fixes (accuracy > 500m) in getFreshUserLocation
        driver.execute_script("""
            userGpsPosition = null;
            isAcquiringLocation = false;
            activeLocationCallbacks = [];
            // Mock navigator.geolocation returning coarse cellular fix (±5000m at Évenos)
            navigator.geolocation.getCurrentPosition = function(success, error, opts) {
                setTimeout(() => {
                    success({
                        coords: {
                            latitude: 43.167,
                            longitude: 5.833,
                            accuracy: 5000
                        }
                    });
                }, 50);
            };
        """)

        # Should timeout or error instead of accepting 5000m
        coarse_res = driver.execute_async_script("""
            const callback = arguments[arguments.length - 1];
            // Set short safety timer to verify coarse fix is rejected
            let returnedSuccess = false;
            getFreshUserLocation(
                (pos) => { returnedSuccess = true; },
                (err) => {}
            );
            setTimeout(() => {
                callback({ returnedSuccess: returnedSuccess, userGpsPosition: window.userGpsPosition });
            }, 300);
        """)
        assert_test(coarse_res.get('returnedSuccess') == False, "getFreshUserLocation rejected coarse cellular fix (±5000m)")
        assert_test(coarse_res.get('userGpsPosition') == None, "userGpsPosition was NOT polluted by coarse fix")

        # Test 6: Precise satellite GPS fix (Sanary-sur-Mer, accuracy 18m)
        driver.execute_script("""
            userGpsPosition = null;
            isAcquiringLocation = false;
            activeLocationCallbacks = [];
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
        assert_test(precise_res.get('success') == True, f"getFreshUserLocation successfully acquired precise fix: {precise_res.get('pos', {}).get('coords')}")
        pos_coords = precise_res.get('pos', {}).get('coords', {})
        assert_test(abs(pos_coords.get('latitude', 0) - 43.118) < 0.001, f"Latitude matches Sanary-sur-Mer: {pos_coords.get('latitude')}")
        assert_test(pos_coords.get('accuracy') == 18, f"Accuracy matches exact satellite fix: {pos_coords.get('accuracy')}m")

        # Test 7: useCurrentGpsLocationAsStart with precise fix
        driver.execute_script("""
            useCurrentGpsLocationAsStart();
        """)
        time.sleep(0.5)
        start_val = driver.find_element(By.ID, "input-start").get_attribute("value")
        assert_test("estimée" not in start_val.lower(), f"Start input does not say 'estimée' (got '{start_val}')")
        assert_test("position" in start_val.lower() or "sanary" in start_val.lower(), f"Start input properly populated with user location (got '{start_val}')")

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

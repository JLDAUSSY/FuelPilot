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

        # Test 1: Verify version badge is v9.7.7
        badge = driver.find_element(By.ID, "app-version-badge")
        assert_test(badge.text == "v9.7.7", f"App version badge is v9.7.7 (got '{badge.text}')")

        # Test 2: Verify APP_VERSION in JS is 9.7.7
        app_ver = driver.execute_script("return typeof APP_VERSION !== 'undefined' ? APP_VERSION : null;")
        assert_test(app_ver == "9.7.7", f"APP_VERSION is 9.7.7 (got '{app_ver}')")

        # Test 3: Translations for estimatedPos
        est_pos = driver.execute_script("return typeof t === 'function' ? t().estimatedPos : null;")
        assert_test(est_pos is not None and "estimée" in est_pos, f"Translation estimatedPos exists (got '{est_pos}')")

        # Test 4: fetchIpLocation test
        ip_res = driver.execute_async_script("""
            const callback = arguments[arguments.length - 1];
            fetchIpLocation().then(res => callback(res)).catch(e => callback({ error: String(e) }));
        """)
        assert_test(ip_res is not None and 'coords' in ip_res, f"fetchIpLocation returned valid coordinates: {ip_res.get('coords') if ip_res else None}")
        assert_test(ip_res.get('isIpFallback') == True, f"fetchIpLocation flagged as isIpFallback: {ip_res.get('isIpFallback')}")

        # Test 5: Fallback to IP when hardware GPS times out / fails on first load
        driver.execute_script("""
            localStorage.removeItem('fuelpilot_last_known_gps');
            userGpsPosition = null;
            isAcquiringLocation = false;
            // Mock navigator.geolocation to always time out (code 3)
            navigator.geolocation.getCurrentPosition = function(s, e, opts) {
                setTimeout(() => {
                    e({ code: 3, message: 'Délai GPS dépassé' });
                }, 50);
            };
        """)

        res_geo = driver.execute_async_script("""
            const callback = arguments[arguments.length - 1];
            getFreshUserLocation(
                (pos) => callback({ success: true, pos: pos }),
                (err) => callback({ success: false, err: err })
            );
        """)
        assert_test(res_geo.get('success') == True, f"getFreshUserLocation gracefully fell back to IP location instead of erroring: {res_geo.get('success')}")
        pos_data = res_geo.get('pos', {})
        assert_test(pos_data.get('isIpFallback') == True, f"Position resolved is flagged as isIpFallback: {pos_data.get('isIpFallback')}")

        # Test 6: useCurrentGpsLocationAsStart populates start input with estimated position
        driver.execute_script("""
            useCurrentGpsLocationAsStart();
        """)
        time.sleep(0.5)
        start_val = driver.find_element(By.ID, "input-start").get_attribute("value")
        assert_test("estimée" in start_val or "position" in start_val, f"Departure input automatically populated (got '{start_val}')")

        # Test 7: Upgrade from IP fallback to satellite fix via background GPS watch
        driver.execute_script("""
            // Simulate satellite fix arriving in background watch
            userGpsPosition = {
                lat: 43.1189,
                lon: 5.8028,
                accuracy: 12,
                heading: null,
                speed: null,
                isHighAccuracy: true,
                isIpFallback: false,
                timestamp: Date.now(),
                city: 'Sanary-sur-Mer'
            };
            saveCachedUserPosition(userGpsPosition);
            updateUserGpsMarker(43.1189, 5.8028, 12, false);
            applyGpsAsStartPoint(43.1189, 5.8028, 'Sanary-sur-Mer', false);
        """)
        time.sleep(0.5)
        updated_start = driver.find_element(By.ID, "input-start").get_attribute("value")
        assert_test("Sanary-sur-Mer" in updated_start, f"Start point upgraded to exact satellite fix (got '{updated_start}')")
        cached_pos = driver.execute_script("return getCachedUserPosition();")
        assert_test(cached_pos is not None and cached_pos.get('accuracy') == 12, f"Cached satellite position saved: {cached_pos}")

        # Test 8: Center on user with cached position shows no warning
        driver.execute_script("""
            const toastContainer = document.getElementById('toast-container');
            if (toastContainer) toastContainer.innerHTML = '';
            centerMapOnUser();
        """)
        time.sleep(0.5)
        toasts = driver.find_elements(By.CLASS_NAME, "toast")
        has_warning_toast = any("toast-warning" in t.get_attribute("class") for t in toasts)
        assert_test(not has_warning_toast, f"No warning toast displayed when centering map")

        # Test 9: E2E Route calculation
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

        # Test 10: Check for severe console errors
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

    print(f"\nSummary: {passed} passed, {failed} failed")
    if failed > 0:
        exit(1)

if __name__ == '__main__':
    run_tests()

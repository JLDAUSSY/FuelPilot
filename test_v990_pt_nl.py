import time
import subprocess
import os
import sys
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By

def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    os.chdir(script_dir)

    # Start local HTTP server
    print("Starting http.server on port 8000...")
    server_proc = subprocess.Popen([sys.executable, "-m", "http.server", "8000"])
    time.sleep(1.5)

    options = Options()
    options.add_argument("--headless=new")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--window-size=1280,900")

    driver = webdriver.Chrome(options=options)
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
        time.sleep(2)

        # Test 1: Verify version badge is v9.9.0
        badge = driver.find_element(By.ID, "app-version-badge")
        assert_test(badge.text == "v9.9.0", f"App version badge is v9.9.0 (got '{badge.text}')")

        # Test 2: Verify APP_VERSION in JS is 9.9.0
        app_ver = driver.execute_script("return typeof APP_VERSION !== 'undefined' ? APP_VERSION : null;")
        assert_test(app_ver == "9.9.0", f"APP_VERSION is 9.9.0 (got '{app_ver}')")

        # Test 3: Check all 8 flags are in #lang-bar in expected order
        flags = driver.find_elements(By.CSS_SELECTOR, "#lang-bar .lang-flag-btn")
        flag_langs = [f.get_attribute("data-lang") for f in flags]
        print("Flag order:", flag_langs)
        assert_test('pt' in flag_langs and 'nl' in flag_langs, "Portugal and Netherlands flags exist in #lang-bar")
        assert_test(len(flags) == 8, f"Total 8 flags present in #lang-bar (got {len(flags)})")

        # Test 4: Total stations count
        station_count = driver.execute_script("return typeof allStations !== 'undefined' ? allStations.length : 0;")
        assert_test(station_count >= 2600, f"All network stations loaded (got {station_count} >= 2600)")

        # Test 5: Verify PT and NL stations exist in memory
        pt_count = driver.execute_script("return allStations.filter(s => s.pays === 'PT').length;")
        nl_count = driver.execute_script("return allStations.filter(s => s.pays === 'NL').length;")
        assert_test(pt_count == 65, f"Portuguese stations count is 65 (got {pt_count})")
        assert_test(nl_count == 57, f"Dutch stations count is 57 (got {nl_count})")

        # Test 6: Click Portugal flag and verify UI switches to Portuguese
        pt_btn = driver.find_element(By.CSS_SELECTOR, "#lang-bar .lang-flag-btn[data-lang='pt']")
        pt_btn.click()
        time.sleep(1)

        cur_lang = driver.execute_script("return currentLang;")
        assert_test(cur_lang == 'pt', f"Current language switched to 'pt' (got '{cur_lang}')")

        calc_btn_text = driver.find_element(By.ID, "btn-calculate").text
        assert_test("Calcular" in calc_btn_text, f"Calculate button translated in Portuguese (got '{calc_btn_text}')")

        # Test 7: Click Netherlands flag and verify UI switches to Dutch
        nl_btn = driver.find_element(By.CSS_SELECTOR, "#lang-bar .lang-flag-btn[data-lang='nl']")
        nl_btn.click()
        time.sleep(1)

        cur_lang = driver.execute_script("return currentLang;")
        assert_test(cur_lang == 'nl', f"Current language switched to 'nl' (got '{cur_lang}')")

        # Test 8: Non-regression check: switch back to French and verify French works
        fr_btn = driver.find_element(By.CSS_SELECTOR, "#lang-bar .lang-flag-btn[data-lang='fr']")
        fr_btn.click()
        time.sleep(1)

        cur_lang = driver.execute_script("return currentLang;")
        assert_test(cur_lang == 'fr', f"Current language switched back to 'fr' (got '{cur_lang}')")

        # Test 9: No severe browser console errors
        logs = driver.get_log('browser')
        severe = [l for l in logs if l.get('level') == 'SEVERE']
        assert_test(len(severe) == 0, f"No severe browser console errors (found {len(severe)})")

    finally:
        driver.quit()
        server_proc.terminate()

    print("\n" + "="*50)
    print(f"TEST RESULTS: {passed} PASSED, {failed} FAILED")
    print("="*50)
    if failed > 0:
        sys.exit(1)

if __name__ == '__main__':
    main()

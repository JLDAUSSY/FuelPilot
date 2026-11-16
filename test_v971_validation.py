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

        # Test 2: Seed localStorage with polluted legacy data containing multiple 'Ma position actuelle'
        legacy_data = [
            {"cleanName": "Paris", "label": "Paris", "coords": [2.3522, 48.8566]},
            {"cleanName": "Ma position actuelle (Sanary-sur-Mer)", "label": "Ma position actuelle (Sanary-sur-Mer)", "coords": [5.8028, 43.1189]},
            {"cleanName": "Toulon", "label": "Toulon", "coords": [5.9305, 43.1242]},
            {"cleanName": "Ma position actuelle (Ollioules)", "label": "Ma position actuelle (Ollioules)", "coords": [5.8483, 43.1397]},
            {"cleanName": "Ma position actuelle", "label": "Ma position actuelle", "coords": [5.8, 43.1]},
            {"cleanName": "Marseille", "label": "Marseille", "coords": [5.3698, 43.2965]}
        ]
        driver.execute_script("localStorage.setItem('fuelpilot_recent_locations_v1', arguments[0]);", json.dumps(legacy_data))

        # Test 3: Call getRecentLocations() via JS
        cleaned_list = driver.execute_script("return getRecentLocations();")
        print("Cleaned locations:", [item['cleanName'] for item in cleaned_list])

        assert_test(len(cleaned_list) == 5, f"Filtered out bare 'Ma position actuelle' (5 items left, got {len(cleaned_list)})")
        clean_names = [item['cleanName'] for item in cleaned_list]
        assert_test("Sanary-sur-Mer" in clean_names, "Sanary-sur-Mer extracted properly")
        assert_test("Ollioules" in clean_names, "Ollioules extracted properly")
        assert_test(not any("position actuelle" in name.lower() for name in clean_names), "No 'position actuelle' remaining in cleaned names")

        # Test 4: Open dropdown in UI and inspect DOM items
        input_start = driver.find_element(By.ID, "input-start")
        input_start.click()
        time.sleep(0.5)

        dropdown = driver.find_element(By.ID, "dropdown-start")
        assert_test(dropdown.is_displayed(), "Dropdown is displayed on click")

        items = dropdown.find_elements(By.CLASS_NAME, "autocomplete-item")
        item_texts = [it.text for it in items]
        print("Dropdown items text:", item_texts)

        # First item should be the top current location button
        assert_test("Ma position actuelle" in item_texts[0], f"Top button is current position (got '{item_texts[0]}')")

        # The rest of the items are from recents (starting with 🕒)
        recent_texts = item_texts[1:]
        assert_test(len(recent_texts) == 5, f"5 recent items rendered (got {len(recent_texts)})")
        assert_test(not any("position actuelle" in t.lower() for t in recent_texts), "ZERO 'position actuelle' among recent items")
        assert_test(any("Sanary-sur-Mer" in t for t in recent_texts), "Sanary-sur-Mer is listed as 🕒 Sanary-sur-Mer")
        assert_test(any("Ollioules" in t for t in recent_texts), "Ollioules is listed as 🕒 Ollioules")

        # Test 5: Test saveRecentLocation with a new 'Ma position actuelle (Nice)'
        driver.execute_script("saveRecentLocation('Ma position actuelle (Nice)', [7.2620, 43.7102], 'Ma position actuelle (Nice)');")
        new_list = driver.execute_script("return getRecentLocations();")
        new_names = [item['cleanName'] for item in new_list]
        print("New names after saving Nice:", new_names)
        assert_test(new_names[0] == "Nice", f"Top recent is 'Nice' (got '{new_names[0]}')")
        assert_test(not any("position actuelle" in name.lower() for name in new_names), "Still no 'position actuelle' in recent names")

        # Test 6: Check browser logs for errors
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

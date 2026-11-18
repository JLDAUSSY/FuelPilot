import time
import json
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

def run_tests():
    options = Options()
    options.add_argument('--headless=new')
    options.add_argument('--disable-gpu')
    options.add_argument('--no-sandbox')
    options.add_argument('--window-size=430,932')
    options.set_capability('goog:loggingPrefs', {'browser': 'ALL'})

    driver = webdriver.Chrome(options=options)
    
    # Grant geolocation permission
    try:
        driver.execute_cdp_cmd('Browser.grantPermissions', {
            'permissions': ['geolocation']
        })
    except Exception as e:
        print("grantPermissions:", e)

    # Pre-set mock geolocation in Sanary-sur-Mer (43.1186, 5.8035)
    driver.execute_cdp_cmd('Emulation.setGeolocationOverride', {
        'latitude': 43.1186,
        'longitude': 5.8035,
        'accuracy': 12
    })

    file_url = 'file:///C:/Users/lesda/.gemini/antigravity/scratch/essence-autoroute/index.html'
    driver.get(file_url)

    wait = WebDriverWait(driver, 15)
    wait.until(EC.presence_of_element_located((By.ID, 'map')))
    time.sleep(2)

    print("=== TEST 1: App Version and Initial Map Center ===")
    badge = driver.find_element(By.ID, 'app-version-badge').text
    print(f"App Version: {badge}")
    assert 'v9.9.14' in badge, f"Expected v9.9.14 but got {badge}"

    # Verify startGpsWatch is active
    is_tracking = driver.execute_script("return isTrackingGps;")
    print(f"isTrackingGps: {is_tracking}")
    assert is_tracking == True, "isTrackingGps should be active immediately upon startup"

    print("=== TEST 2: GPS Position Acquisition & Auto-Center ===")
    user_pos = None
    for _ in range(10):
        user_pos = driver.execute_script("return window.userGpsPosition;")
        if user_pos and user_pos.get('lat'):
            break
        time.sleep(0.5)

    print(f"userGpsPosition: {user_pos}")
    assert user_pos is not None, "userGpsPosition should be populated"
    assert abs(user_pos['lat'] - 43.1186) < 0.01
    assert abs(user_pos['lon'] - 5.8035) < 0.01

    saved_lat = driver.execute_script("return localStorage.getItem('fuelpilot_last_lat');")
    saved_lon = driver.execute_script("return localStorage.getItem('fuelpilot_last_lon');")
    print(f"localStorage saved: lat={saved_lat}, lon={saved_lon}")
    assert saved_lat is not None and abs(float(saved_lat) - 43.1186) < 0.01

    print("=== TEST 3: Center Map Button Interaction ===")
    driver.execute_script("setMobileView('map');")
    time.sleep(0.5)

    btn_locate = driver.find_element(By.ID, 'btn-locate-me')
    driver.execute_script("arguments[0].click();", btn_locate)
    time.sleep(1)

    toast_text = driver.execute_script("const t = document.getElementById('app-toast'); return t ? t.innerText : '';")
    print(f"Toast after center: '{toast_text}'")
    assert "Carte recentrée" in toast_text or "Position" in toast_text

    print("=== TEST 4: 'Ma position actuelle' Departure Selection ===")
    driver.execute_script("useCurrentGpsLocationAsStart();")
    time.sleep(1)

    input_val = driver.find_element(By.ID, 'input-start').get_attribute('value')
    print(f"Start input value: '{input_val}'")
    assert "Ma position actuelle" in input_val or "Sanary" in input_val

    start_point = driver.execute_script("return window.startPoint;")
    print(f"startPoint coords: {start_point}")
    assert start_point is not None and len(start_point['coords']) == 2
    assert abs(start_point['coords'][1] - 43.1186) < 0.01

    print("=== TEST 5: Verify NO Timeout Error Toasts ===")
    time.sleep(3)
    toast_classes = driver.execute_script("const t = document.getElementById('app-toast'); return t ? t.className : '';")
    final_toast = driver.execute_script("const t = document.getElementById('app-toast'); return t ? t.innerText : '';")
    print(f"Final toast: '{final_toast}' (classes: {toast_classes})")
    assert "Délai de réponse GPS dépassé" not in final_toast

    print("=== TEST 6: RandoTracker Map Re-opening at Last Known Location ===")
    # Clear live GPS override so it doesn't immediately overwrite with 43.1186
    driver.execute_cdp_cmd('Emulation.clearGeolocationOverride', {})
    driver.execute_script("localStorage.setItem('fuelpilot_last_lat', '45.8336'); localStorage.setItem('fuelpilot_last_lon', '1.2611');")
    driver.get(file_url)
    time.sleep(1)
    map_center = driver.execute_script("const c = map.getCenter(); return [c.lat, c.lng];")
    map_zoom = driver.execute_script("return map.getZoom();")
    print(f"Map center on reload: {map_center}, zoom: {map_zoom}")
    assert abs(map_center[0] - 45.8336) < 0.01, f"Expected lat ~45.8336, got {map_center[0]}"
    assert abs(map_center[1] - 1.2611) < 0.01, f"Expected lon ~1.2611, got {map_center[1]}"
    assert map_zoom == 14, f"Expected zoom 14, got {map_zoom}"

    print("=== ALL 6 TESTS PASSED FLAWLESSLY! ===")
    driver.quit()

if __name__ == '__main__':
    run_tests()

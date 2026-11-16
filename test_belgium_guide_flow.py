# -*- coding: utf-8 -*-
import time
import os
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

opts = Options()
opts.add_argument('--headless=new')
opts.add_argument('--no-sandbox')
opts.add_argument('--disable-dev-shm-usage')
opts.add_argument('--disable-gpu')
opts.add_argument('--window-size=1280,900')

driver = webdriver.Chrome(options=opts)
wait = WebDriverWait(driver, 10)

base_dir = os.path.abspath(r'C:\Users\lesda\.gemini\antigravity\scratch\essence-autoroute')
index_url = f"file:///{base_dir.replace(os.sep, '/')}/index.html"
guide_url = f"file:///{base_dir.replace(os.sep, '/')}/guide.html"

results = []

try:
    print(f"Loading {index_url}...")
    driver.get(index_url)
    time.sleep(2)

    # 1. Test clicking Belgium Flag to open menu
    be_flag_btn = wait.until(EC.element_to_be_clickable((By.ID, 'btn-flag-be')))
    be_flag_btn.click()
    time.sleep(0.5)

    be_menu = driver.find_element(By.ID, 'belgium-lang-menu')
    assert be_menu.is_displayed(), "Belgium lang menu should be displayed after click"
    print("PASS: Belgium flag click opens dropdown menu")
    results.append("BE menu open: OK")

    opts = be_menu.find_elements(By.CLASS_NAME, 'belgium-lang-opt')
    assert len(opts) == 3, f"Expected 3 options, got {len(opts)}"
    print(f"PASS: Exactly 3 options found: {[o.text for o in opts]}")
    results.append("3 BE options: OK")

    # 2. Test Belgium -> NL (Nederlands)
    opt_nl = be_menu.find_element(By.CSS_SELECTOR, '[data-be-lang="nl"]')
    opt_nl.click()
    time.sleep(1)

    guide_btn = driver.find_element(By.ID, 'i18n-guide')
    guide_text_nl = guide_btn.text.strip()
    guide_href_nl = guide_btn.get_attribute('href')
    print(f"BE->NL: Guide button text='{guide_text_nl}', href='{guide_href_nl}'")
    assert guide_text_nl == 'Gids', f"Expected 'Gids', got '{guide_text_nl}'"
    assert 'lang=nl' in guide_href_nl, f"Expected lang=nl in href, got '{guide_href_nl}'"
    results.append(f"BE->NL button text ('{guide_text_nl}') & href: OK")

    # 3. Open guide with lang=nl
    driver.get(f"{guide_url}?lang=nl")
    time.sleep(1)
    title_el = driver.find_element(By.ID, 'title-main')
    back_el = driver.find_element(By.ID, 'lbl-back-btn')
    doc_title = driver.title
    print(f"Guide NL: doc_title='{doc_title}', title_main='{title_el.text}', back='{back_el.text}'")
    assert "Handleiding" in title_el.text, f"Expected 'Handleiding' in title, got '{title_el.text}'"
    assert "Terug naar de applicatie" in back_el.text, f"Expected Dutch back btn, got '{back_el.text}'"
    results.append("Guide NL content rendering: OK")

    # 4. Return to index and test Belgium -> DE (Deutsch)
    driver.get(index_url)
    time.sleep(1)
    be_flag_btn = wait.until(EC.element_to_be_clickable((By.ID, 'btn-flag-be')))
    be_flag_btn.click()
    time.sleep(0.5)

    opt_de = driver.find_element(By.CSS_SELECTOR, '#belgium-lang-menu [data-be-lang="de"]')
    opt_de.click()
    time.sleep(1)

    guide_btn = driver.find_element(By.ID, 'i18n-guide')
    guide_text_de = guide_btn.text.strip()
    guide_href_de = guide_btn.get_attribute('href')
    print(f"BE->DE: Guide button text='{guide_text_de}', href='{guide_href_de}'")
    assert guide_text_de == 'Hilfe', f"Expected 'Hilfe', got '{guide_text_de}'"
    assert 'lang=de' in guide_href_de, f"Expected lang=de in href, got '{guide_href_de}'"
    results.append(f"BE->DE button text ('{guide_text_de}') & href: OK")

    # 5. Open guide with lang=de
    driver.get(f"{guide_url}?lang=de")
    time.sleep(1)
    title_el = driver.find_element(By.ID, 'title-main')
    back_el = driver.find_element(By.ID, 'lbl-back-btn')
    print(f"Guide DE: title_main='{title_el.text}', back='{back_el.text}'")
    assert "Bedienungsanleitung" in title_el.text, f"Expected 'Bedienungsanleitung', got '{title_el.text}'"
    assert "Zurück zur Anwendung" in back_el.text, f"Expected German back btn, got '{back_el.text}'"
    results.append("Guide DE content rendering: OK")

    # 6. Return to index and test Belgium -> FR (Français)
    driver.get(index_url)
    time.sleep(1)
    be_flag_btn = wait.until(EC.element_to_be_clickable((By.ID, 'btn-flag-be')))
    be_flag_btn.click()
    time.sleep(0.5)

    opt_fr = driver.find_element(By.CSS_SELECTOR, '#belgium-lang-menu [data-be-lang="fr"]')
    opt_fr.click()
    time.sleep(1)

    guide_btn = driver.find_element(By.ID, 'i18n-guide')
    guide_text_fr = guide_btn.text.strip()
    guide_href_fr = guide_btn.get_attribute('href')
    print(f"BE->FR: Guide button text='{guide_text_fr}', href='{guide_href_fr}'")
    assert guide_text_fr == 'Guide', f"Expected 'Guide', got '{guide_text_fr}'"
    assert 'lang=fr' in guide_href_fr, f"Expected lang=fr in href, got '{guide_href_fr}'"
    results.append(f"BE->FR button text ('{guide_text_fr}') & href: OK")

    # 7. Open guide with lang=fr
    driver.get(f"{guide_url}?lang=fr")
    time.sleep(1)
    title_el = driver.find_element(By.ID, 'title-main')
    back_el = driver.find_element(By.ID, 'lbl-back-btn')
    print(f"Guide FR: title_main='{title_el.text}', back='{back_el.text}'")
    assert "Mode d'emploi" in title_el.text, f"Expected 'Mode d\\'emploi', got '{title_el.text}'"
    assert "Retourner à l'application" in back_el.text, f"Expected French back btn, got '{back_el.text}'"
    results.append("Guide FR content rendering: OK")

    # 8. Test Portugal (PT) flag button
    driver.get(index_url)
    time.sleep(1)
    pt_btn = driver.find_element(By.CSS_SELECTOR, '#lang-bar [data-lang="pt"]')
    pt_btn.click()
    time.sleep(1)

    guide_btn = driver.find_element(By.ID, 'i18n-guide')
    guide_text_pt = guide_btn.text.strip()
    guide_href_pt = guide_btn.get_attribute('href')
    print(f"PT flag: Guide button text='{guide_text_pt}', href='{guide_href_pt}'")
    assert guide_text_pt == 'Guia', f"Expected 'Guia', got '{guide_text_pt}'"
    assert 'lang=pt' in guide_href_pt, f"Expected lang=pt in href, got '{guide_href_pt}'"
    results.append(f"PT button text ('{guide_text_pt}') & href: OK")

    # 9. Open guide with lang=pt
    driver.get(f"{guide_url}?lang=pt")
    time.sleep(1)
    title_el = driver.find_element(By.ID, 'title-main')
    back_el = driver.find_element(By.ID, 'lbl-back-btn')
    print(f"Guide PT: title_main='{title_el.text}', back='{back_el.text}'")
    assert "Instruções de uso" in title_el.text, f"Expected 'Instruções de uso', got '{title_el.text}'"
    assert "Voltar à aplicação" in back_el.text, f"Expected Portuguese back btn, got '{back_el.text}'"
    results.append("Guide PT content rendering: OK")

    # 10. Check that guide lang-switcher in guide.html has all 7 buttons and works
    guide_buttons = driver.find_elements(By.CSS_SELECTOR, '#lang-switcher .lang-btn')
    assert len(guide_buttons) == 7, f"Expected 7 buttons in guide lang-switcher, got {len(guide_buttons)}"
    results.append(f"Guide switcher 7 flag buttons: OK")

    print("\n==========================================")
    print("ALL TESTS PASSED SUCCESSFULLY! (10/10)")
    for r in results:
        print("  - " + r)
    print("==========================================")

finally:
    driver.quit()

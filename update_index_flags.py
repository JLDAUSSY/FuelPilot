import os

HTML_PATH = r'C:\Users\lesda\.gemini\antigravity\scratch\essence-autoroute\index.html'
with open(HTML_PATH, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add NL flag after Belgium container
nl_flag_btn = """    </div>

    <button type="button" class="lang-flag-btn" data-lang="nl" title="Nederland • Nederlands" aria-label="Nederlands">
      <svg class="lang-flag-svg" viewBox="0 0 60 36" xmlns="http://www.w3.org/2000/svg">
        <rect width="60" height="12" fill="#AE1C28"/>
        <rect y="12" width="60" height="12" fill="#FFFFFF"/>
        <rect y="24" width="60" height="12" fill="#21468B"/>
      </svg>
    </button>"""

if 'data-lang="nl"' not in content:
    content = content.replace('    </div>\n\n    <button type="button" class="lang-flag-btn" data-lang="de"', nl_flag_btn + '\n\n    <button type="button" class="lang-flag-btn" data-lang="de"', 1)

# 2. Add PT flag after ES button
pt_flag_btn = """    </button>

    <button type="button" class="lang-flag-btn" data-lang="pt" title="Portugal • Português" aria-label="Português">
      <svg class="lang-flag-svg" viewBox="0 0 60 36" xmlns="http://www.w3.org/2000/svg">
        <rect width="24" height="36" fill="#046A38"/>
        <rect x="24" width="36" height="36" fill="#DA291C"/>
        <circle cx="24" cy="18" r="7" fill="#FFE600" stroke="#002B7F" stroke-width="1.2"/>
        <rect x="21" y="14" width="6" height="8" rx="1" fill="#FFFFFF" stroke="#DA291C" stroke-width="1"/>
      </svg>
    </button>"""

if 'data-lang="pt"' not in content:
    content = content.replace('    </button>\n\n    <button type="button" class="lang-flag-btn" data-lang="en"', pt_flag_btn + '\n\n    <button type="button" class="lang-flag-btn" data-lang="en"', 1)

# 3. Bump version 9.8.1 to 9.9.0
content = content.replace("var LATEST_BUILD = '9.8.1';", "var LATEST_BUILD = '9.9.0';")
content = content.replace("href=\"style.css?v=9.8.1\"", "href=\"style.css?v=9.9.0\"")
content = content.replace("id=\"app-version-badge\">v9.8.1<", "id=\"app-version-badge\">v9.9.0<")
content = content.replace("title=\"JLDApps 2026 • Version 9.8.1\"", "title=\"JLDApps 2026 • Version 9.9.0\"")
content = content.replace("src=\"app.js?v=9.8.1\"", "src=\"app.js?v=9.9.0\"")

with open(HTML_PATH, 'w', encoding='utf-8') as f:
    f.write(content)

print("SUCCESS: index.html updated")

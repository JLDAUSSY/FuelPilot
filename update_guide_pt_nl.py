import os

GUIDE_PATH = r'C:\Users\lesda\.gemini\antigravity\scratch\essence-autoroute\guide.html'
with open(GUIDE_PATH, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update table 1 in guide.html
old_table1 = """                <tr>
                  <td>🇧🇪 <strong>Belgique</strong></td>
                  <td><strong>76 aires</strong></td>
                  <td>E19, E40, E411, E42, E25...</td>
                </tr>
              </tbody>"""

new_table1 = """                <tr>
                  <td>🇧🇪 <strong>Belgique</strong></td>
                  <td><strong>76 aires</strong></td>
                  <td>E19, E40, E411, E42, E25...</td>
                </tr>
                <tr>
                  <td>🇵🇹 <strong>Portugal</strong></td>
                  <td><strong>65 aires</strong></td>
                  <td>Rede de Autoestradas Brisa & Ascendi (A1 Lisboa-Porto, A2 Algarve, A3, A6, A22, A25...)</td>
                </tr>
                <tr>
                  <td>🇳🇱 <strong>Pays-Bas</strong></td>
                  <td><strong>57 aires</strong></td>
                  <td>Rijkswaterstaat Verzorgingsplaatsen (A1, A2, A4, A12, A16, A27...)</td>
                </tr>
              </tbody>"""

content = content.replace(old_table1, new_table1)

# 2. Update table 2 in guide.html
old_table2 = """                <tr>
                  <td>🇬🇧 <strong>Royaume-Uni</strong></td>
                  <td><span class="status-badge status-ref">Prix calibrés en £</span></td>
                  <td>Opérateurs autoroutiers britanniques et données ouvertes de la CMA</td>
                </tr>
              </tbody>"""

new_table2 = """                <tr>
                  <td>🇬🇧 <strong>Royaume-Uni</strong></td>
                  <td><span class="status-badge status-ref">Prix calibrés en £</span></td>
                  <td>Opérateurs autoroutiers britanniques et données ouvertes de la CMA</td>
                </tr>
                <tr>
                  <td>🇵🇹 <strong>Portugal</strong></td>
                  <td><span class="status-badge status-live">2x par jour</span></td>
                  <td>Direction Générale de l'Énergie et de la Géologie DGEG (<em>precoscombustiveis.dgeg.gov.pt</em>)</td>
                </tr>
                <tr>
                  <td>🇳🇱 <strong>Pays-Bas</strong></td>
                  <td><span class="status-badge status-ref">Prix de référence autoroutiers</span></td>
                  <td>Barèmes autoroutiers néerlandais (Brandstofprijzen Rijkswaterstaat)</td>
                </tr>
              </tbody>"""

content = content.replace(old_table2, new_table2)

# 3. Update languages list in French guide section
old_lang_list = """          <p>FuelCoPilot est intégralement traduit et utilisable en <strong>5 langues</strong> :</p>
          <ul>
            <li>🇫🇷 <strong>Français</strong> (Langue par défaut)</li>
            <li>🇩🇪 <strong>Deutsch</strong> (Allemand)</li>
            <li>🇮🇹 <strong>Italiano</strong> (Italien)</li>
            <li>🇪🇸 <strong>Español</strong> (Espagnol)</li>
            <li>🇬🇧 <strong>English</strong> (Anglais)</li>
          </ul>"""

new_lang_list = """          <p>FuelCoPilot est intégralement traduit et utilisable en <strong>7 langues</strong> :</p>
          <ul>
            <li>🇫🇷 <strong>Français</strong> (Langue par défaut)</li>
            <li>🇩🇪 <strong>Deutsch</strong> (Allemand)</li>
            <li>🇳🇱 <strong>Nederlands</strong> (Néerlandais)</li>
            <li>🇮🇹 <strong>Italiano</strong> (Italien)</li>
            <li>🇪🇸 <strong>Español</strong> (Espagnol)</li>
            <li>🇵🇹 <strong>Português</strong> (Portugais)</li>
            <li>🇬🇧 <strong>English</strong> (Anglais)</li>
          </ul>"""

content = content.replace(old_lang_list, new_lang_list)

# 4. Bump version in guide.html
content = content.replace("v9.8.0", "v9.9.0").replace("v9.8.1", "v9.9.0").replace("v9.6", "v9.9")

with open(GUIDE_PATH, 'w', encoding='utf-8') as f:
    f.write(content)

print("SUCCESS: guide.html updated")

import re

with open('reasonableredactor-offline.html', 'r', encoding='utf-8', errors='ignore') as f:
    html = f.read()

# Extract head and body before script
head_body_match = re.search(r'^(.*?)<script\s+type="module">', html, re.DOTALL)
if head_body_match:
    with open('app_markup.html', 'w', encoding='utf-8') as f:
        f.write(head_body_match.group(1) + '\n</body>\n</html>')
    print("Saved app_markup.html")

# Extract the application code (from line 3334 to end)
script_match = re.search(r'<script\s+type="module">(.*?)</script>', html, re.DOTALL)
if script_match:
    script = script_match.group(1)
    lines = script.split('\n')
    app_lines = lines[3333:]  # line 3334 0-indexed
    app_code = '\n'.join(app_lines)
    with open('app_logic.js', 'w', encoding='utf-8') as f:
        f.write(app_code)
    print(f"Saved app_logic.js ({len(app_lines)} lines, {len(app_code):,} chars)")

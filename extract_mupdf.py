import os

os.makedirs('js/vendor', exist_ok=True)

with open('reasonableredactor-offline-fixed.html', 'r', encoding='utf-8', errors='ignore') as f:
    text = f.read()

start_tag = '<script type="module">'
start = text.find(start_tag) + len(start_tag)
marker = '// ===== ReasonableRedactor application ====='
end = text.find(marker, start)

if end != -1:
    mupdf_code = text[start:end].strip()
    with open('js/vendor/mupdf-engine.js', 'w', encoding='utf-8') as f:
        f.write(mupdf_code)
    print(f"Extracted js/vendor/mupdf-engine.js: {len(mupdf_code):,} chars")
else:
    print("Marker not found!")

# Move xlsx.full.min.js into js/vendor
if os.path.exists('xlsx.full.min.js'):
    os.replace('xlsx.full.min.js', 'js/vendor/xlsx.full.min.js')
    print("Moved xlsx.full.min.js to js/vendor/")

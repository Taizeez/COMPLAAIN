import re

with open('reasonableredactor-offline.html', 'r', encoding='utf-8', errors='ignore') as f:
    html = f.read()

# Extract the script content
script_match = re.search(r'<script\s+type="module">(.*?)</script>', html, re.DOTALL)
if not script_match:
    print("Script not found!")
    exit(1)

script = script_match.group(1)
print(f"Total script length: {len(script):,} characters")

# Find comments or markers in script
lines = script.split('\n')
print(f"Total lines: {len(lines):,}")

# Let's inspect lines that start with // or /* or function or const or let
markers = []
for idx, line in enumerate(lines[:100]):
    if line.strip().startswith('//') or line.strip().startswith('/*') or 'wasm' in line.lower() or 'mupdf' in line.lower():
        markers.append((idx + 1, line[:100]))

print("First 100 lines markers:")
for lno, text in markers[:20]:
    print(f"L{lno}: {text}")

# Check where the giant base64 or wasm ends
print("\nScanning for large lines / structures...")
for idx, line in enumerate(lines):
    if len(line) > 50000:
        print(f"Line {idx+1} has length {len(line):,}")
    elif line.startswith('// =====') or line.startswith('/* =====') or 'function ' in line[:30] or 'class ' in line[:30]:
        if idx > 10:  # skip first few
            markers.append((idx + 1, line[:100]))

# Let's search for the application code after MuPDF
# Let's look for lines around the end of the giant base64/mupdf bundle
print("\nMarkers across the script:")
for idx, line in enumerate(lines):
    stripped = line.strip()
    if stripped.startswith('// =====') or 'ReasonableRedactor' in stripped or 'addEventListener' in stripped or 'document.getElementById' in stripped or 'function redact' in stripped or 'applyRedactions' in stripped:
        print(f"L{idx+1}: {stripped[:120]}")

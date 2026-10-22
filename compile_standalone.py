import os
import re

def read_file(path):
    with open(path, 'r', encoding='utf-8', errors='ignore') as f:
        return f.read()

# Load source components
html = read_file('index.html')
css = read_file('css/styles.css')
pii_js = read_file('js/pii-engine.js')
sheet_js = read_file('js/spreadsheet-redactor.js')
pdf_js = read_file('js/pdf-redactor.js')
ocr_js = read_file('js/ocr-engine.js')
app_js = read_file('js/app.js')
vendor_xlsx = read_file('js/vendor/xlsx.full.min.js')
vendor_tesseract = read_file('js/vendor/tesseract.min.js')

# Strip external link and script tags from HTML
html = re.sub(r'<link\s+rel="stylesheet"[^>]*>', '', html, flags=re.IGNORECASE)
html = re.sub(r'<link\s+rel="manifest"[^>]*>', '', html, flags=re.IGNORECASE)
html = re.sub(r'<script\s+src="[^"]*"[^>]*></script>', '', html, flags=re.IGNORECASE)

# Insert inline style tag before </head>
inline_style = f"<style>\n{css}\n</style>"
html = html.replace('</head>', f'{inline_style}\n</head>')

# Insert strict offline CSP
csp_tag = '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'unsafe-inline\' \'wasm-unsafe-eval\'; style-src \'unsafe-inline\' https://fonts.googleapis.com; img-src blob: data:; font-src data: https://fonts.gstatic.com; worker-src blob:; child-src blob:; connect-src \'none\'; base-uri \'none\'; form-action \'none\'">'
html = html.replace('<head>', f'<head>\n  {csp_tag}')

# Insert bundled scripts before </body>
bundle_script = f"""<script>
// safeRedact Portable Single-File Offline Edition
// Runs 100% locally with zero internet connection required.

// --- 1. Vendor: SheetJS (XLSX Parser & Generator) ---
{vendor_xlsx}

// --- 2. Vendor: Tesseract.js (Offline OCR Engine) ---
{vendor_tesseract}

// --- 3. Offline OCR Engine ---
{ocr_js}

// --- 4. PII Detection & Anonymization Engine ---
{pii_js}

// --- 5. Spreadsheet Column Anonymizer ---
{sheet_js}

// --- 6. PDF Redactor Engine (MuPDF + OCR + Image Burn) ---
{pdf_js}

// --- 7. UI Application Controller ---
{app_js}
</script>"""

html = html.replace('</body>', f'{bundle_script}\n</body>')

output_path = 'complaain-portable-offline.html'
with open(output_path, 'w', encoding='utf-8') as f:
    f.write(html)
print(f"Successfully generated {output_path} ({len(html):,} bytes)")

# Keep safeRedact-portable-offline.html for backward compatibility
with open('safeRedact-portable-offline.html', 'w', encoding='utf-8') as f:
    f.write(html)
print(f"Successfully generated safeRedact-portable-offline.html ({len(html):,} bytes)")

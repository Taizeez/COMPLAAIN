import re
import os

with open('reasonableredactor-offline.html', 'r', encoding='utf-8', errors='ignore') as f:
    html = f.read()

print(f"Total HTML size: {len(html)} bytes")

# Script tags
scripts = list(re.finditer(r'<script([^>]*)>(.*?)</script>', html, re.DOTALL | re.IGNORECASE))
print(f"Found {len(scripts)} <script> tags:")
for i, m in enumerate(scripts):
    attrs = m.group(1).strip()
    body = m.group(2)
    preview = body.strip()[:200].replace('\n', ' ')
    print(f"  [{i+1}] attrs='{attrs}' | length={len(body):,} chars")
    print(f"      preview: {preview[:120]}...")

# Let's inspect non-script HTML elements or structure
body_match = re.search(r'<body[^>]*>(.*?)<script', html, re.DOTALL | re.IGNORECASE)
if body_match:
    print(f"\nHTML Body length before scripts: {len(body_match.group(1)):,} chars")

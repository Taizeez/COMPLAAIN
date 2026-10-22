with open('reasonableredactor-offline-fixed.html', 'r', encoding='utf-8', errors='ignore') as f:
    text = f.read()

start = text.find('<script type="module">') + len('<script type="module">')
end = text.find('</script>')
script_fixed = text[start:end]

with open('extracted_fixed.mjs', 'w', encoding='utf-8') as out:
    out.write(script_fixed)

print(f"Extracted fixed script size: {len(script_fixed):,} bytes")

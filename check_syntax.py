with open('reasonableredactor-offline.html', 'r', encoding='utf-8', errors='ignore') as f:
    text = f.read()

start = text.find('<script type="module">') + len('<script type="module">')
end = text.find('</script>')
script1 = text[start:end]

with open('extracted_script.mjs', 'w', encoding='utf-8') as out:
    out.write(script1)

print(f"Extracted script size: {len(script1):,} bytes")

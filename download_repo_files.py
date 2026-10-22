import urllib.request

for fname in ['README.md', 'build-offline.mjs', 'NOTICE']:
    url = f'https://raw.githubusercontent.com/ReasonableMedia/ReasonableRedactor/main/{fname}'
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    try:
        with urllib.request.urlopen(req) as resp:
            content = resp.read().decode('utf-8')
            with open(fname, 'w', encoding='utf-8') as out:
                out.write(content)
            print(f"Downloaded {fname} ({len(content)} chars)")
    except Exception as e:
        print(f"Failed {fname}: {e}")

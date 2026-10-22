import urllib.request

url = 'https://raw.githubusercontent.com/ReasonableMedia/ReasonableRedactor/main/src/reasonableredactor-hosted.html'
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
try:
    with urllib.request.urlopen(req) as resp:
        content = resp.read().decode('utf-8')
        with open('reasonableredactor-hosted.html', 'w', encoding='utf-8') as out:
            out.write(content)
        print(f"Downloaded reasonableredactor-hosted.html ({len(content)} chars)")
except Exception as e:
    print(f"Failed to fetch reasonableredactor-hosted.html: {e}")

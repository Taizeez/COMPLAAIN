import urllib.request
import json

url = 'https://api.github.com/repos/ReasonableMedia/ReasonableRedactor/git/trees/ee042c63?recursive=1'
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
try:
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read().decode('utf-8'))
        for item in data.get('tree', []):
            print(f"{item['path']} ({item.get('size', 'dir')})")
except Exception as e:
    print('Error:', e)

import urllib.request
import json

url = 'https://api.github.com/repos/ReasonableMedia/ReasonableRedactor/commits'
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
try:
    with urllib.request.urlopen(req) as resp:
        commits = json.loads(resp.read().decode('utf-8'))
        print(f"Total commits returned: {len(commits)}")
        for c in commits:
            print(f"{c['sha'][:8]} - {c['commit']['message'].splitlines()[0]}")
except Exception as e:
    print('Error:', e)

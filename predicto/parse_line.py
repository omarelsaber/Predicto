import json
import os

with open('line283.json', 'r', encoding='utf-16') as f:
    line = f.read()
    data = json.loads(line)
    text = data.get('content', data.get('text', ''))
    with open('v3_bundle_raw.txt', 'w', encoding='utf-8') as out:
        out.write(text)
    print("Extracted to v3_bundle_raw.txt")
    print(f"Length: {len(text)}")

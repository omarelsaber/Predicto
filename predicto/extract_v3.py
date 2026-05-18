import json
import os

path = r'C:\Users\ASUS\OneDrive\Desktop\Predicto\predicto\v3_bundle_code.txt'
log_path = r'C:\Users\ASUS\.gemini\antigravity\brain\526a667e-06ff-4652-b6f4-2b7ad56f1bfc\.system_generated\logs\overview.txt'

found_code = False
with open(log_path, 'r', encoding='utf-8', errors='ignore') as f:
    for line in f:
        if 'godtier_v3_router1.py' in line and '"type":"USER_INPUT"' in line:
            try:
                data = json.loads(line)
                content = data.get('content', data.get('text', ''))
                if '=======' in content:
                    with open(path, 'w', encoding='utf-8') as out:
                        out.write(content)
                    print(f"Extracted content to {path}")
                    found_code = True
                    break
            except Exception as e:
                print(f"Error parsing line: {e}")

if not found_code:
    print("Could not find the code block in overview.txt")

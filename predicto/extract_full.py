import json

log_path = r'C:\Users\ASUS\.gemini\antigravity\brain\526a667e-06ff-4652-b6f4-2b7ad56f1bfc\.system_generated\logs\overview.txt'
with open(log_path, 'r', encoding='utf-8', errors='ignore') as f:
    lines = f.readlines()
    # Line 232 is index 231
    line = lines[231]
    data = json.loads(line)
    content = data.get('content', data.get('text', ''))
    with open('v3_bundle_full.txt', 'w', encoding='utf-8') as out:
        out.write(content)
    print(f"Extracted {len(content)} characters to v3_bundle_full.txt")

import json
import sys

def main():
    target_index = 1336
    log_path = r'C:\Users\ASUS\.gemini\antigravity\brain\526a667e-06ff-4652-b6f4-2b7ad56f1bfc\.system_generated\logs\overview.txt'
    
    with open(log_path, 'r', encoding='utf-8') as f:
        for line in f:
            try:
                data = json.loads(line)
                if data.get('step_index') == target_index:
                    # Found it. Now extract the content and print it in chunks to avoid terminal truncation
                    content = data.get('content', '')
                    print(f"FOUND_CONTENT_LENGTH: {len(content)}")
                    chunk_size = 3000
                    for i in range(0, len(content), chunk_size):
                        print(f"--- CHUNK {i//chunk_size} ---")
                        print(content[i:i+chunk_size])
                        print(f"--- END CHUNK {i//chunk_size} ---")
                    return
            except Exception:
                continue
    print("NOT FOUND")

if __name__ == "__main__":
    main()

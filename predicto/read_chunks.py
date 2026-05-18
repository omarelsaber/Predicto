import json
import sys

def main():
    try:
        with open('c:/Users/ASUS/OneDrive/Desktop/Predicto/predicto/chunk1.json', 'r', encoding='utf-8-sig') as f:
            data = json.load(f)
            content = data.get('content', '')
            
            chunk_size = 2000
            for i in range(0, len(content), chunk_size):
                print(f"--- CHUNK {i//chunk_size} ---")
                print(content[i:i+chunk_size])
                print(f"--- END CHUNK {i//chunk_size} ---")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    main()

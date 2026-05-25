import os
import zipfile
import pandas as pd

def main():
    zip_path = r"c:\Users\ASUS\OneDrive\Desktop\data\predicto_v3_data.zip"
    if not os.path.exists(zip_path):
        print(f"Zip file not found at: {zip_path}")
        return
    with zipfile.ZipFile(zip_path, 'r') as z:
        for name in z.namelist():
            if name.endswith('.csv'):
                with z.open(name) as f:
                    df = pd.read_csv(f, nrows=2)
                    print(f"File: {name}")
                    print(f"  Columns: {list(df.columns)}")

if __name__ == "__main__":
    main()


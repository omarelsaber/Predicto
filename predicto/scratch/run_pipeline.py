import asyncio
import os
import pandas as pd
from app.services.ingestion_service_v2 import ingest_data_files
from app.api.v2.intelligence import _build_headline_kpis
from app.core.cache import predicto_cache_v2

async def main():
    zip_path = r"c:\Users\ASUS\OneDrive\Desktop\data\predicto_v3_data.zip"
    with open(zip_path, 'rb') as f:
        content = f.read()
    
    files_data = [("data.zip", content)]
    cache = await ingest_data_files(files_data)
    
    print("\nOriginal columns:", list(cache.snapshots_df.columns))
    
    print("\nCalculating KPIs with original code (month_col not detected):")
    kpis = _build_headline_kpis(cache)
    for k in kpis:
        if k.key in ["current_mrr", "mrr_delta_30d"]:
            print(f"  {k.key}: value={k.value}, delta_label={k.delta_label}")

    # Now let's temporarily modify month_col candidates detection by adding month_number
    # and run it to see what the values are.
    # We can do this by monkey-patching _detect_col in intelligence.py or simulating it here.
    import app.api.v2.intelligence as intel
    original_detect = intel._detect_col
    
    def patched_detect(df, candidates):
        # Add month_number and snapshot_date to month candidates if searching for month
        if "month" in candidates or "date" in candidates:
            # Let's add them to the candidates
            new_candidates = ["month_number", "snapshot_date"] + candidates
            return original_detect(df, new_candidates)
        return original_detect(df, candidates)
        
    intel._detect_col = patched_detect
    
    print("\nCalculating KPIs with patched code (month_col = month_number):")
    kpis_patched = _build_headline_kpis(cache)
    for k in kpis_patched:
        if k.key in ["current_mrr", "mrr_delta_30d"]:
            print(f"  {k.key}: value={k.value}, delta_label={k.delta_label}")
            
    # Clean up
    intel._detect_col = original_detect

if __name__ == "__main__":
    asyncio.run(main())

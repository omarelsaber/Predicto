"""
app/ml/segmentation.py
──────────────────────────────────────────────────────────────────────────────
Pillar 3 — Economic Persona Segmentation (K-Means)
──────────────────────────────────────────────────────────────────────────────

Clusters customers into 4 distinct economic personas based on their 
transactional behavior (Sales, Margin, and Discount patterns).

Architecture:
    1. Feature Engineering: Aggregates raw_df to the customer level.
    2. Scaling: Uses StandardScaler to normalize features for K-Means.
    3. Clustering: Runs KMeans with K=4 (optimized for this business case).
    4. Persona Mapping: Assigns business names (Champions, Seekers, etc.) 
       based on the economic profile of each cluster's centroid.
    5. ROI Analysis: Calculates the potential margin recovery opportunity.

Outputs:
    - Persona assignments for every customer.
    - Cluster statistics (centroids).
    - Silhouette Score (Separation quality).
    - Total ROI recovery dollar figure.
"""

import logging
from dataclasses import dataclass, field
from typing import Dict, List

import pandas as pd

from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import silhouette_score

from app.core.cache import predicto_cache
from app.core.config import get_settings

logger = logging.getLogger(__name__)

# ------------------------------------------------------------------------------
# Data Structures
# ------------------------------------------------------------------------------

@dataclass
class PersonaStats:
    name: str
    count: int
    avg_sales: float
    avg_margin: float
    avg_discount: float
    action_signal: str  # e.g., "Upsell", "Reprice"

@dataclass
class SegmentationResult:
    """State stored in cache after training."""
    kmeans: KMeans
    scaler: StandardScaler
    persona_map: Dict[int, str]  # Cluster ID -> Persona Name
    stats: List[PersonaStats]
    silhouette: float
    roi_recovery_usd: float
    customer_profiles: pd.DataFrame = field(repr=False) # The scored customer list

# ------------------------------------------------------------------------------
# Internal Constants
# ------------------------------------------------------------------------------
_MIN_CUSTOMERS: int = 20
_MARGIN_COL: str = "Margin_Rate"
_DISCOUNT_COL: str = "Discount"
_SALES_COL: str = "Sales"
_CUSTOMER_COL: str = "Customer"

# ------------------------------------------------------------------------------
# Public API
# ------------------------------------------------------------------------------

def train_segmentation() -> SegmentationResult:
    """
    Train the K-Means model on raw transaction data.
    """
    logger.info("Pillar 3 — Training Economic Persona Segmentation...")
    
    settings = get_settings()
    raw_df = predicto_cache.get_raw_data()
    
    if raw_df is None or raw_df.empty:
        raise RuntimeError("raw_df not found in cache. Ingestion required.")

    # 1. Customer-Level Rollup
    profiles = raw_df.groupby(_CUSTOMER_COL).agg({
        _SALES_COL: "sum",
        _MARGIN_COL: "mean",
        _DISCOUNT_COL: "mean"
    }).reset_index()

    if len(profiles) < _MIN_CUSTOMERS:
        raise RuntimeError(f"Insufficient customers ({len(profiles)}) for clustering.")

    # 2. Scaling
    features = settings.kmeans_features # ["Total_Sales", "Avg_Margin_Rate", "Avg_Discount"]
    # Map internal names to dataframe columns if necessary
    feature_map = {
        "Total_Sales": _SALES_COL,
        "Avg_Margin_Rate": _MARGIN_COL,
        "Avg_Discount": _DISCOUNT_COL
    }
    target_features = [feature_map[f] for f in features]
    
    scaler = StandardScaler()
    scaled_data = scaler.fit_transform(profiles[target_features])

    # 3. K-Means
    n_clusters = settings.kmeans_n_clusters # Default 4
    kmeans = KMeans(
        n_clusters=n_clusters, 
        n_init=settings.kmeans_n_init, 
        random_state=settings.kmeans_random_state
    )
    profiles["Cluster"] = kmeans.fit_predict(scaled_data)

    # 4. Evaluation
    sil = float(silhouette_score(scaled_data, profiles["Cluster"]))
    logger.info(f"Segmentation Complete. Silhouette Score: {sil:.3f}")

    # 5. Persona Mapping & ROI
    persona_map, stats = _map_personas_to_clusters(profiles, target_features)
    profiles["Persona"] = profiles["Cluster"].map(persona_map)
    
    roi_recovery = _calculate_roi_opportunity(profiles)

    return SegmentationResult(
        kmeans=kmeans,
        scaler=scaler,
        persona_map=persona_map,
        stats=stats,
        silhouette=round(sil, 3),
        roi_recovery_usd=round(roi_recovery, 2),
        customer_profiles=profiles
    )

# ------------------------------------------------------------------------------
# Internal Helpers
# ------------------------------------------------------------------------------

def _map_personas_to_clusters(df: pd.DataFrame, features: List[str]) -> tuple:
    """
    Dynamically maps cluster IDs to personas based on economic centroids.
    """
    centers = df.groupby("Cluster")[features].mean()
    persona_map = {}
    stats_list = []

    # Logic:
    # 🏆 Champions: Highest Margin
    # 🤑 Discount Seekers: Highest Discount
    # 💼 Volume Accounts: Highest Sales
    # ⚠️ At-Risk: The remaining cluster
    
    chmp_id = centers[_MARGIN_COL].idxmax()
    ds_id = centers[_DISCOUNT_COL].idxmax()
    vol_id = centers[_SALES_COL].idxmax()
    
    # Handle overlap (if one cluster is both max sales and max margin)
    assigned = {chmp_id: "🏆 Champions", ds_id: "🤑 Discount Seekers", vol_id: "💼 Volume Accounts"}
    
    for cluster_id in centers.index:
        name = assigned.get(cluster_id, "⚠️ At-Risk")
        persona_map[cluster_id] = name
        
        row = centers.loc[cluster_id]
        stats_list.append(PersonaStats(
            name=name,
            count=int(len(df[df["Cluster"] == cluster_id])),
            avg_sales=round(float(row[_SALES_COL]), 2),
            avg_margin=round(float(row[_MARGIN_COL]), 4),
            avg_discount=round(float(row[_DISCOUNT_COL]), 4),
            action_signal=_get_action_signal(name)
        ))

    return persona_map, stats_list

def _get_action_signal(name: str) -> str:
    signals = {
        "🏆 Champions": "Protect & Upsell",
        "🤑 Discount Seekers": "Reprice & Cap Discounts",
        "💼 Volume Accounts": "Retention Strategy",
        "⚠️ At-Risk": "Immediate Intervention"
    }
    return signals.get(name, "Analyze Behavior")

def _calculate_roi_opportunity(df: pd.DataFrame) -> float:
    """
    Estimates annual margin recovery if 'Discount Seekers' were repriced 
    to match 'Champion' margin levels.
    """
    try:
        champs = df[df["Persona"].str.contains("Champions")]
        seekers = df[df["Persona"].str.contains("Discount Seekers")]
        
        if champs.empty or seekers.empty:
            return 0.0
            
        margin_gap = champs[_MARGIN_COL].mean() - seekers[_MARGIN_COL].mean()
        # Recovery = Total Sales of Seekers * Margin Gap
        total_recovery = seekers[_SALES_COL].sum() * margin_gap
        return max(0.0, float(total_recovery))
    except Exception:
        return 0.0

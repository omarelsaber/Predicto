"""
╔══════════════════════════════════════════════════════════════════════════════╗
║  app/ml/hybrid_engine.py                                                    ║
║  Predicto V2 — Core ML Engine                                               ║
║                                                                              ║
║  Zero FastAPI imports in this file by design.                               ║
║  All public symbols used by the service layer:                              ║
║    - CRITICAL_COLUMNS          : degradation rule-set                       ║
║    - apply_schema_degradation  : per-table repair function                  ║
║    - engineer_revops_features  : 7-KPI feature factory                      ║
║    - build_sequences           : GRU array builder                          ║
║    - ColdStartRouter           : dual-model handler (fit / predict)         ║
║    - DealPriorityScorer        : AI Innovation 1                            ║
║    - CompetitiveChurnPredictor : AI Innovation 2                            ║
║    - RevenueExpansionRecommender: AI Innovation 3                           ║
║    - evaluate                  : regression + classification metrics        ║
╚══════════════════════════════════════════════════════════════════════════════╝
"""

from __future__ import annotations

import math
import logging
import warnings
from typing import Any

import numpy as np
import pandas as pd
import torch
import torch.nn as nn
from torch.utils.data import Dataset, DataLoader
import xgboost as xgb
from sklearn.preprocessing import StandardScaler, LabelEncoder
from sklearn.metrics import (
    r2_score,
    mean_absolute_error,
    mean_squared_error,
    roc_auc_score,
    precision_score,
    recall_score,
    f1_score,
)

warnings.filterwarnings("ignore")

# ── Module-level logger (no basicConfig — caller controls root handler) ───────
log = logging.getLogger("predicto.v2.engine")

SEED = 42
np.random.seed(SEED)
torch.manual_seed(SEED)
DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")


# ─────────────────────────────────────────────────────────────────────────────
# CONFIGURATION
# ─────────────────────────────────────────────────────────────────────────────

# Sequence design constants
INPUT_SEQ_LEN  = 3
TOTAL_MONTHS   = 12
TARGET_MONTHS  = TOTAL_MONTHS - INPUT_SEQ_LEN   # 9 prediction steps

# Feature column names
FEATURE_COLS = [
    "mrr_at_snapshot",
    "active_users_at_snapshot",
    "features_active_at_snapshot",
]
TARGET_COL = "churn_risk_at_snapshot"

# Cold-start threshold: below this → lightweight XGBoost, above → full Hybrid
COLD_START_THRESHOLD = 1_000

# Hybrid GRU hyperparameters
GRU_HIDDEN   = 128
GRU_LAYERS   = 2
GRU_DROPOUT  = 0.30
BATCH_SIZE   = 64
NUM_EPOCHS   = 100
LR           = 1e-3
PATIENCE     = 15
CHECKPOINT   = "hybrid_best.pt"   # temp file written during training


# ─────────────────────────────────────────────────────────────────────────────
# SCHEMA DEGRADATION RULES
# ─────────────────────────────────────────────────────────────────────────────

# Each entry maps a column to its fallback strategy:
#   "median_impute"     – fill NaN with column median (mode for categoricals)
#   "constant_<value>"  – fill NaN with the literal after "constant_"
#   "drop_row"          – remove any row where this column is null
CRITICAL_COLUMNS: dict[str, dict[str, str]] = {
    "snapshots": {
        "mrr_at_snapshot":             "median_impute",
        "active_users_at_snapshot":    "median_impute",
        "features_active_at_snapshot": "median_impute",
        "churn_risk_at_snapshot":      "drop_row",   # target — no imputation
        "month_number":                "drop_row",
        "customer_id":                 "drop_row",
    },
    "product": {
        "time_to_first_value_days": "constant_14",
        "subscription_tier":        "constant_Professional",
        "churn_risk_score":         "median_impute",
        "nps_score":                "median_impute",
    },
    "sales": {
        "discount_percentage": "constant_0.10",
        "segment":             "constant_SMB",
        "arr":                 "median_impute",
        "sales_cycle_days":    "median_impute",
        "win_loss_status":     "drop_row",
    },
    "marketing": {
        "channel":         "constant_Email",
        "cac":             "median_impute",
        "mqls_generated":  "median_impute",
        "sqls_generated":  "median_impute",
    },
}


# ─────────────────────────────────────────────────────────────────────────────
# SCHEMA DEGRADATION
# ─────────────────────────────────────────────────────────────────────────────

def apply_schema_degradation(
    df: pd.DataFrame,
    table_key: str,
    degradation_log: list[dict],   # <── caller passes in their own log list
) -> pd.DataFrame:
    """
    Detect missing or null columns in *df* and apply the fallback strategy
    defined in CRITICAL_COLUMNS[table_key].

    The function is PURE with respect to side-effects: all degradation events
    are appended to *degradation_log* (a list the caller owns), so the API
    layer can retrieve and return them without reading console output.

    Parameters
    ----------
    df              : Raw DataFrame for one table.
    table_key       : Key into CRITICAL_COLUMNS ('snapshots', 'product', …).
    degradation_log : Mutable list; dicts are appended for every repair event.

    Returns
    -------
    Repaired DataFrame (copy — original is untouched).
    """
    rules = CRITICAL_COLUMNS.get(table_key, {})
    df    = df.copy()

    def _record(column: str, strategy: str, n_affected: int) -> None:
        entry = {
            "table":      table_key,
            "column":     column,
            "strategy":   strategy,
            "n_affected": n_affected,
        }
        degradation_log.append(entry)
        log.warning(
            "[SCHEMA DEGRADATION] %s.%s missing → %s (%d rows)",
            table_key, column, strategy, n_affected,
        )

    for col, strategy in rules.items():
        # ── Column entirely absent from upload ────────────────────────────────
        if col not in df.columns:
            null_count = len(df)
            if strategy == "drop_row":
                # Synthesise null column then drop — result is empty table for
                # that column, which downstream handles gracefully.
                df[col] = np.nan
                df = df.dropna(subset=[col])
                _record(col, "column_absent_dropped_all", null_count)
            elif strategy == "median_impute":
                df[col] = 0.0
                _record(col, "column_absent_filled_zero", null_count)
            elif strategy.startswith("constant_"):
                fill_val: Any = strategy.split("constant_", 1)[1]
                try:
                    fill_val = float(fill_val)
                except ValueError:
                    pass   # keep as string (e.g. "Professional", "SMB")
                df[col] = fill_val
                _record(col, strategy, null_count)
            continue   # column was absent — nothing more to check

        # ── Column present but has NaN values ────────────────────────────────
        null_count = int(df[col].isna().sum())
        if null_count == 0:
            continue   # healthy — skip

        if strategy == "drop_row":
            df = df.dropna(subset=[col])
            _record(col, "drop_row", null_count)

        elif strategy == "median_impute":
            if pd.api.types.is_numeric_dtype(df[col]):
                fill_val = df[col].median()
            else:
                mode = df[col].mode()
                fill_val = mode.iloc[0] if not mode.empty else "Unknown"
            df[col] = df[col].fillna(fill_val)
            _record(col, "median_impute", null_count)

        elif strategy.startswith("constant_"):
            fill_val = strategy.split("constant_", 1)[1]
            try:
                fill_val = float(fill_val)
            except ValueError:
                pass
            df[col] = df[col].fillna(fill_val)
            _record(col, strategy, null_count)

    return df.reset_index(drop=True)


# ─────────────────────────────────────────────────────────────────────────────
# REVOPS FEATURE ENGINEERING  (7 Hidden KPIs)
# ─────────────────────────────────────────────────────────────────────────────

def engineer_revops_features(tables: dict[str, pd.DataFrame]) -> pd.DataFrame:
    """
    Build the training-ready feature matrix by joining all 5 tables and
    computing the 7 RevOps KPIs.

    KPI 1  Feature Adoption Velocity (FAV)
    KPI 2  Revenue Efficiency Ratio  (RER)   — implicit via arr/cac
    KPI 3  Engagement Decay Index    (EDI)
    KPI 4  Support Burden Score      (SBS)
    KPI 5  Onboarding Risk Composite (ORC)
    KPI 6  Campaign Quality Score    (CQS)
    KPI 7  Rep Segment Fit Score     (RSFS)

    Returns an empty DataFrame (with a warning log) if required tables are absent.
    """
    snaps   = tables.get("snapshots",  pd.DataFrame())
    product = tables.get("product",    pd.DataFrame())
    sales   = tables.get("sales",      pd.DataFrame())
    mkt     = tables.get("marketing",  pd.DataFrame())

    if snaps.empty or product.empty:
        log.error(
            "engineer_revops_features: 'snapshots' or 'product' table is empty. "
            "Returning empty DataFrame."
        )
        return pd.DataFrame()

    # ── KPI 1: Feature Adoption Velocity ─────────────────────────────────────
    snaps = snaps.sort_values(["customer_id", "month_number"])
    snaps["fav"] = (
        snaps.groupby("customer_id")["features_active_at_snapshot"]
        .transform(lambda x: x.diff().fillna(0))
    )

    # ── KPI 3: Engagement Decay Index ────────────────────────────────────────
    first_users = (
        snaps[snaps["month_number"] == 1][["customer_id", "active_users_at_snapshot"]]
        .rename(columns={"active_users_at_snapshot": "users_month1"})
    )
    snaps = snaps.merge(first_users, on="customer_id", how="left")
    snaps["edi"] = np.where(
        snaps["users_month1"] > 0,
        (snaps["users_month1"] - snaps["active_users_at_snapshot"]) / snaps["users_month1"],
        0.0,
    ).clip(-1, 1)

    # ── KPI 4: Support Burden Score ───────────────────────────────────────────
    snaps["cumulative_tickets"] = (
        snaps.groupby("customer_id")["support_tickets_at_snapshot"]
        .transform("cumsum")
    )
    snaps["sbs"] = (
        snaps["cumulative_tickets"] / snaps["mrr_at_snapshot"].replace(0, np.nan)
    ).fillna(0).clip(0, 5)

    # ── Merge product features ────────────────────────────────────────────────
    product_slim = product[[
        "customer_id", "time_to_first_value_days", "features_adopted_count",
        "subscription_tier", "churn_risk_score", "nps_score",
    ]].drop_duplicates("customer_id")
    merged = snaps.merge(product_slim, on="customer_id", how="inner")

    # ── Merge sales features ──────────────────────────────────────────────────
    # Known rep → segment mapping used for RSFS calculation
    REP_SPEC: dict[str, str] = {
        "REP_001": "Enterprise", "REP_002": "Enterprise",
        "REP_003": "SMB",        "REP_004": "SMB",
        "REP_005": "Enterprise", "REP_006": "SMB",
        "REP_007": "Enterprise", "REP_008": "SMB",
    }

    if not sales.empty and "win_loss_status" in sales.columns:
        won_sales = sales[sales["win_loss_status"] == "Closed_Won"].copy()

        # KPI 5: Onboarding Risk Composite (using arr as TFV proxy)
        won_sales["orc"] = (
            won_sales["arr"].fillna(won_sales["arr"].median())
            * (1 + won_sales["discount_percentage"].fillna(0.10))
        )

        # KPI 7: Rep Segment Fit Score
        # Accept any common alias for the rep column
        _rep_col = next(
            (c for c in ("sales_rep", "sales_rep_id", "rep_id", "rep", "owner") if c in won_sales.columns),
            None,
        )
        if _rep_col:
            won_sales["rep_spec"] = won_sales[_rep_col].map(REP_SPEC).fillna("SMB")
        else:
            won_sales["rep_spec"] = "SMB"
        won_sales["rsfs"] = (
            np.where(won_sales["rep_spec"] == won_sales["segment"], 1.0, 0.78)
            * (1 - won_sales["discount_percentage"].fillna(0.10) / 0.50)
        )


        sales_slim = won_sales[[
            "customer_id", "discount_percentage", "segment",
            "arr", "sales_cycle_days", "contract_term_months",
            "orc", "rsfs", "deal_source",
        ]].drop_duplicates("customer_id")
        merged = merged.merge(sales_slim, on="customer_id", how="left")
    else:
        # Graceful degradation — fill columns with sensible defaults
        log.warning("Sales table absent or missing win_loss_status — using zero-fill defaults.")
        for col in ["discount_percentage", "arr", "sales_cycle_days", "contract_term_months", "orc", "rsfs"]:
            merged[col] = 0.0
        merged["segment"]     = "SMB"
        merged["deal_source"] = "Inbound"
        won_sales             = pd.DataFrame()   # keep reference for marketing merge

    # ── Merge marketing features ──────────────────────────────────────────────
    has_campaign_link = (
        not mkt.empty
        and not won_sales.empty  # type: ignore[union-attr]
        and "primary_campaign_id" in won_sales.columns
    )

    if has_campaign_link:
        camp_link = won_sales[["customer_id", "primary_campaign_id"]].drop_duplicates("customer_id")  # type: ignore[union-attr]
        mkt_slim  = mkt[["campaign_id", "channel", "cac", "mqls_generated", "sqls_generated"]].copy()

        # KPI 6: Campaign Quality Score
        mkt_slim["cqs"] = (
            (mkt_slim["sqls_generated"] / mkt_slim["mqls_generated"].replace(0, np.nan)).fillna(0)
            / mkt_slim["cac"].replace(0, np.nan).fillna(mkt_slim["cac"].median())
        ).clip(0, 10)

        camp_link = camp_link.merge(
            mkt_slim.rename(columns={"campaign_id": "primary_campaign_id"}),
            on="primary_campaign_id",
            how="left",
        )
        merged = merged.merge(
            camp_link[["customer_id", "channel", "cac", "cqs"]],
            on="customer_id",
            how="left",
        )
    else:
        merged["channel"] = "Email"
        merged["cac"]     = merged.get("arr", pd.Series(0, index=merged.index)) / 10
        merged["cqs"]     = 0.5

    # ── KPI 5 final: Onboarding Risk Composite (with actual TFV from product) ─
    if "time_to_first_value_days" in merged.columns:
        merged["orc"] = (
            merged["time_to_first_value_days"].fillna(14)
            * (1 - merged["features_adopted_count"].fillna(5) / 10)
            * (1 + merged["discount_percentage"].fillna(0.10))
        )

    # ── Encode categorical features ───────────────────────────────────────────
    for col in ["subscription_tier", "segment", "deal_source", "channel"]:
        if col in merged.columns:
            merged[col] = LabelEncoder().fit_transform(
                merged[col].fillna("Unknown").astype(str)
            )

    log.info(
        "Feature engineering complete: %d rows, %d columns.",
        len(merged), merged.shape[1],
    )
    return merged.reset_index(drop=True)


# ─────────────────────────────────────────────────────────────────────────────
# SEQUENCE BUILDER  (GRU branch input)
# ─────────────────────────────────────────────────────────────────────────────

def build_sequences(
    df: pd.DataFrame,
    scaler: StandardScaler | None = None,
) -> tuple[np.ndarray, np.ndarray, np.ndarray, StandardScaler]:
    """
    Convert the feature-engineered DataFrame into tensor-ready arrays.

    Returns
    -------
    X_seq  : (N, INPUT_SEQ_LEN, n_time_features)   — time-varying telemetry
    y      : (N, TARGET_MONTHS)                    — churn risk targets
    X_tab  : (N, n_tab_features)                   — static sales/mkt features
    scaler : fitted StandardScaler for time-varying features
    """
    time_feat_cols = FEATURE_COLS + ["fav", "edi", "sbs"]
    time_feat_cols = [c for c in time_feat_cols if c in df.columns]

    tab_feat_cols = [
        "time_to_first_value_days", "features_adopted_count",
        "discount_percentage", "arr", "sales_cycle_days",
        "contract_term_months", "orc", "rsfs", "cqs",
        "subscription_tier", "segment", "deal_source", "channel",
        "nps_score",
    ]
    tab_feat_cols = [c for c in tab_feat_cols if c in df.columns]

    # Scale time-varying features
    if scaler is None:
        scaler = StandardScaler()
        df[time_feat_cols] = scaler.fit_transform(df[time_feat_cols])
    else:
        df[time_feat_cols] = scaler.transform(df[time_feat_cols])

    X_seq_list, y_list, X_tab_list = [], [], []

    for _cust_id, grp in df.groupby("customer_id"):
        grp = grp.sort_values("month_number").head(TOTAL_MONTHS)
        if len(grp) < TOTAL_MONTHS:
            continue

        x_seq = grp[time_feat_cols].values[:INPUT_SEQ_LEN]
        y_seq = grp[TARGET_COL].values[INPUT_SEQ_LEN:]
        if len(y_seq) != TARGET_MONTHS:
            continue

        x_tab = grp[tab_feat_cols].iloc[0].values   # static — first month row
        X_seq_list.append(x_seq)
        y_list.append(y_seq)
        X_tab_list.append(x_tab)

    X_seq = np.array(X_seq_list, dtype=np.float32)
    y     = np.array(y_list,     dtype=np.float32)
    X_tab = np.array(X_tab_list, dtype=np.float32)

    # Scale tabular branch separately to avoid gradient explosion in the MLP
    tab_scaler = StandardScaler()
    X_tab = tab_scaler.fit_transform(X_tab).astype(np.float32)

    log.info(
        "build_sequences: X_seq=%s  X_tab=%s  y=%s",
        X_seq.shape, X_tab.shape, y.shape,
    )
    return X_seq, y, X_tab, scaler


# ─────────────────────────────────────────────────────────────────────────────
# PYTORCH INTERNALS  (Dataset, Branches, Fusion Head)
# ─────────────────────────────────────────────────────────────────────────────

class HybridDataset(Dataset):
    """Wraps numpy arrays as a PyTorch Dataset for DataLoader compatibility."""

    def __init__(self, X_seq: np.ndarray, X_tab: np.ndarray, y: np.ndarray):
        self.X_seq = torch.from_numpy(X_seq)
        self.X_tab = torch.from_numpy(X_tab)
        self.y     = torch.from_numpy(y)

    def __len__(self) -> int:
        return len(self.y)

    def __getitem__(self, idx: int):
        return self.X_seq[idx], self.X_tab[idx], self.y[idx]


class _TabularBranch(nn.Module):
    """Lightweight MLP embedding static sales + marketing features → (batch, 64)."""

    def __init__(self, n_tab_features: int, dropout: float = 0.2):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(n_tab_features, 128),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(128, 64),
            nn.ReLU(),
            nn.Dropout(dropout * 0.5),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.net(x)


class _SequentialBranch(nn.Module):
    """Stacked GRU encoder for time-series telemetry → (batch, hidden_size)."""

    def __init__(
        self,
        n_features:  int,
        hidden_size: int   = GRU_HIDDEN,
        num_layers:  int   = GRU_LAYERS,
        dropout:     float = GRU_DROPOUT,
    ):
        super().__init__()
        self.gru = nn.GRU(
            input_size  = n_features,
            hidden_size = hidden_size,
            num_layers  = num_layers,
            batch_first = True,
            dropout     = dropout if num_layers > 1 else 0.0,
        )
        self.dropout = nn.Dropout(dropout)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        _, h_n = self.gru(x)          # h_n: (num_layers, batch, hidden)
        return self.dropout(h_n[-1])  # (batch, hidden_size)


class HybridFusionModel(nn.Module):
    """
    Late-fusion architecture:
      GRU branch (time-varying telemetry)   → 128-dim embedding
      MLP branch (static sales/mkt features)→  64-dim embedding
      Fusion: concat [128 ∥ 64] → LayerNorm → MLP → (batch, TARGET_MONTHS)

    Late fusion prevents tabular noise from drowning the temporal signal that
    occurs with early input-level concatenation.
    """

    def __init__(
        self,
        n_seq_features: int,
        n_tab_features: int,
        hidden_size:    int   = GRU_HIDDEN,
        num_layers:     int   = GRU_LAYERS,
        gru_dropout:    float = GRU_DROPOUT,
        target_months:  int   = TARGET_MONTHS,
    ):
        super().__init__()
        self.seq_branch = _SequentialBranch(n_seq_features, hidden_size, num_layers, gru_dropout)
        self.tab_branch = _TabularBranch(n_tab_features)

        fused_dim = hidden_size + 64
        self.fusion_head = nn.Sequential(
            nn.LayerNorm(fused_dim),
            nn.Linear(fused_dim, 128),
            nn.ReLU(),
            nn.Dropout(0.20),
            nn.Linear(128, target_months),
            nn.Sigmoid(),
        )

    def forward(self, x_seq: torch.Tensor, x_tab: torch.Tensor) -> torch.Tensor:
        seq_emb = self.seq_branch(x_seq)              # (batch, 128)
        tab_emb = self.tab_branch(x_tab)              # (batch,  64)
        fused   = torch.cat([seq_emb, tab_emb], dim=-1)  # (batch, 192)
        return self.fusion_head(fused)                # (batch, TARGET_MONTHS)


# ─────────────────────────────────────────────────────────────────────────────
# TRAINING LOOP
# ─────────────────────────────────────────────────────────────────────────────

def _train_hybrid(
    model:        nn.Module,
    train_loader: DataLoader,
    val_loader:   DataLoader,
    num_epochs:   int   = NUM_EPOCHS,
    lr:           float = LR,
    patience:     int   = PATIENCE,
    checkpoint:   str   = CHECKPOINT,
) -> dict:
    """Internal training function; saves best weights to *checkpoint*."""
    criterion = nn.MSELoss()
    optimizer = torch.optim.Adam(model.parameters(), lr=5e-4, weight_decay=1e-5)
    scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(
        optimizer, mode="min", factor=0.5, patience=5
    )
    model.to(DEVICE)

    history      = {"train_loss": [], "val_mae": []}
    best_mae     = math.inf
    patience_ctr = 0

    for epoch in range(1, num_epochs + 1):
        model.train()
        total_loss = 0.0
        for xseq, xtab, yb in train_loader:
            xseq, xtab, yb = xseq.to(DEVICE), xtab.to(DEVICE), yb.to(DEVICE)
            optimizer.zero_grad()
            preds = model(xseq, xtab)
            loss  = criterion(preds, yb)
            loss.backward()
            nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()
            total_loss += loss.item() * xseq.size(0)

        avg_loss = total_loss / len(train_loader.dataset)

        model.eval()
        vp, vt = [], []
        with torch.no_grad():
            for xseq, xtab, yb in val_loader:
                p = model(xseq.to(DEVICE), xtab.to(DEVICE)).cpu().numpy()
                vp.append(p)
                vt.append(yb.numpy())

        val_mae = mean_absolute_error(np.vstack(vt).ravel(), np.vstack(vp).ravel())
        history["train_loss"].append(avg_loss)
        history["val_mae"].append(val_mae)
        scheduler.step(val_mae)

        if epoch % 10 == 0 or epoch == 1:
            log.info(
                "Epoch %4d/%d | Train MSE: %.5f | Val MAE: %.5f",
                epoch, num_epochs, avg_loss, val_mae,
            )

        if val_mae < best_mae:
            best_mae     = val_mae
            patience_ctr = 0
            torch.save(model.state_dict(), checkpoint)
        else:
            patience_ctr += 1
            if patience_ctr >= patience:
                log.info("Early stop @ epoch %d  (best MAE=%.5f)", epoch, best_mae)
                break

    return history


# ─────────────────────────────────────────────────────────────────────────────
# COLD-START ROUTER
# ─────────────────────────────────────────────────────────────────────────────

class ColdStartRouter:
    """
    Dual-model handler that routes training and inference based on data volume.

    Decision logic
    --------------
    n_records < COLD_START_THRESHOLD (1 000)
        → Lightweight XGBRegressor on tabular features only.
          Trains in < 5 s; safe against overfitting on tiny datasets.

    n_records ≥ COLD_START_THRESHOLD
        → Full HybridFusionModel (GRU + MLP late fusion).
          Requires ≥ 12 monthly snapshots per customer.

    Public interface
    ----------------
    .fit(X_seq, X_tab, y)      — selects model, trains, stores weights
    .predict(X_seq, X_tab)     — returns (N, TARGET_MONTHS) array
    .active_model              — "full" | "lite" | None
    .feature_importance()      — DataFrame or None (lite model only)
    """

    def __init__(self, threshold: int = COLD_START_THRESHOLD):
        self.threshold:    int                       = threshold
        self.full_model:   HybridFusionModel | None  = None
        self.lite_model:   xgb.XGBRegressor | None   = None
        self.active_model: str | None                = None
        self.scaler:       StandardScaler | None     = None

    # ── Public: fit ──────────────────────────────────────────────────────────

    def fit(self, X_seq: np.ndarray, X_tab: np.ndarray, y: np.ndarray) -> None:
        n = len(X_seq)
        log.info(
            "ColdStartRouter.fit — %d records (threshold=%d)", n, self.threshold
        )

        if n < self.threshold:
            log.info("  → COLD START: deploying lightweight XGBoost model.")
            self._fit_lite(X_tab, y)
            self.active_model = "lite"
        else:
            log.info("  → FULL DATA: deploying Hybrid Fusion model.")
            self._fit_full(X_seq, X_tab, y)
            self.active_model = "full"

    # ── Public: predict ───────────────────────────────────────────────────────

    def predict(self, X_seq: np.ndarray, X_tab: np.ndarray) -> np.ndarray:
        """
        Returns
        -------
        full model → (N, TARGET_MONTHS) predicted churn trajectories
        lite model → (N, TARGET_MONTHS) constant-replicated mean churn risk
        """
        if self.active_model == "lite":
            mean_risk = self.lite_model.predict(X_tab)  # type: ignore[union-attr]
            return np.tile(mean_risk[:, None], (1, TARGET_MONTHS))

        # Full hybrid inference
        self.full_model.eval()   # type: ignore[union-attr]
        self.full_model.to(DEVICE)  # type: ignore[union-attr]
        preds: list[np.ndarray] = []
        dummy_y = np.zeros((len(X_seq), TARGET_MONTHS), dtype=np.float32)
        ds = HybridDataset(X_seq, X_tab, dummy_y)
        dl = DataLoader(ds, batch_size=BATCH_SIZE)
        with torch.no_grad():
            for xseq, xtab, _ in dl:
                p = self.full_model(  # type: ignore[union-attr]
                    xseq.to(DEVICE), xtab.to(DEVICE)
                ).cpu().numpy()
                preds.append(p)
        return np.vstack(preds)

    # ── Public: feature_importance ───────────────────────────────────────────

    def feature_importance(self) -> pd.DataFrame | None:
        """Lite model only; full model uses SHAP (out of scope here)."""
        if self.active_model == "lite" and self.lite_model is not None:
            scores = self.lite_model.feature_importances_
            return pd.DataFrame({"importance": scores}).sort_values(
                "importance", ascending=False
            )
        return None

    # ── Private helpers ───────────────────────────────────────────────────────

    def _fit_lite(self, X_tab: np.ndarray, y: np.ndarray) -> None:
        y_mean = y.mean(axis=1) if y.ndim == 2 else y
        self.lite_model = xgb.XGBRegressor(
            n_estimators=300,
            max_depth=4,
            learning_rate=0.05,
            subsample=0.8,
            colsample_bytree=0.8,
            reg_alpha=0.1,
            reg_lambda=1.0,
            random_state=SEED,
            eval_metric="mae",
        )
        self.lite_model.fit(X_tab, y_mean)
        log.info("  Lightweight XGBoost fitted.")

    def _fit_full(
        self, X_seq: np.ndarray, X_tab: np.ndarray, y: np.ndarray
    ) -> None:
        n_seq_feat = X_seq.shape[-1]
        n_tab_feat = X_tab.shape[-1]
        self.full_model = HybridFusionModel(n_seq_feat, n_tab_feat).to(DEVICE)

        # Internal 85/15 validation split for early stopping
        idx   = np.random.permutation(len(X_seq))
        n_val = max(1, int(len(X_seq) * 0.15))
        val_i, tr_i = idx[:n_val], idx[n_val:]

        tr_ds = HybridDataset(X_seq[tr_i], X_tab[tr_i], y[tr_i])
        vl_ds = HybridDataset(X_seq[val_i], X_tab[val_i], y[val_i])
        tr_dl = DataLoader(tr_ds, batch_size=BATCH_SIZE, shuffle=True)
        vl_dl = DataLoader(vl_ds, batch_size=BATCH_SIZE, shuffle=False)

        _train_hybrid(self.full_model, tr_dl, vl_dl)

        # Reload best checkpoint
        self.full_model.load_state_dict(
            torch.load(CHECKPOINT, map_location=DEVICE)
        )
        log.info("  Full Hybrid Fusion model fitted and best weights restored.")


# ─────────────────────────────────────────────────────────────────────────────
# EVALUATION  (regression + classification metrics)
# ─────────────────────────────────────────────────────────────────────────────

def evaluate(
    preds:           np.ndarray,
    targets:         np.ndarray,
    label:           str   = "Model",
    churn_threshold: float = 0.60,
) -> dict:
    """Compute regression (MAE / RMSE / R²) and classification (AUC / P / R / F1) metrics."""
    p_flat = preds.ravel()
    t_flat = targets.ravel()

    mae  = mean_absolute_error(t_flat, p_flat)
    rmse = math.sqrt(mean_squared_error(t_flat, p_flat))
    r2   = r2_score(t_flat, p_flat)

    t_bin = (t_flat >= churn_threshold).astype(int)
    p_bin = (p_flat >= churn_threshold).astype(int)

    try:
        auc  = roc_auc_score(t_bin, p_flat)
        prec = precision_score(t_bin, p_bin, zero_division=0)
        rec  = recall_score(t_bin, p_bin, zero_division=0)
        f1   = f1_score(t_bin, p_bin, zero_division=0)
    except Exception:
        auc = prec = rec = f1 = float("nan")

    results = dict(
        model=label, mae=mae, rmse=rmse, r2=r2,
        auc=auc, precision=prec, recall=rec, f1=f1,
    )
    log.info(
        "\n%s\n  %s — Test Evaluation\n  MAE: %.4f  RMSE: %.4f  R²: %.4f\n"
        "  AUC: %.4f  Prec: %.4f  Rec: %.4f  F1: %.4f\n%s",
        "─" * 55, label, mae, rmse, r2, auc, prec, rec, f1, "─" * 55,
    )
    return results


# ─────────────────────────────────────────────────────────────────────────────
# AI INNOVATION MODULES  (1, 2, 3)
# ─────────────────────────────────────────────────────────────────────────────

class DealPriorityScorer:
    """
    AI Innovation 1 — Real-Time Deal Priority Scorer (DPS)

    Composite score = 0.50 × P(win) + 0.35 × RQI + 0.15 × Urgency
    where P(win) is XGBoost-predicted win probability on closed sales history.
    """

    WEIGHTS = {"win_prob": 0.50, "rqi": 0.35, "urgency": 0.15}

    def __init__(self, sales_df: pd.DataFrame):
        self.model: xgb.XGBClassifier | None = None
        self.sales = sales_df
        self._fit()

    def _fit(self) -> None:
        df    = self.sales.copy()
        y     = (df["win_loss_status"] == "Closed_Won").astype(int)
        feats = ["discount_percentage", "sales_cycle_days", "contract_term_months", "arr"]
        for c in feats:
            df[c] = pd.to_numeric(df[c], errors="coerce").fillna(0)

        X = df[feats].fillna(0).values
        if len(X) < 10:
            return
        self.model = xgb.XGBClassifier(
            n_estimators=200, max_depth=4,
            use_label_encoder=False, eval_metric="logloss",
            random_state=SEED,
        )
        self.model.fit(X, y)

    def score(self, deal_row: dict) -> float:
        if self.model is None:
            return 0.5
        feats    = ["discount_percentage", "sales_cycle_days", "contract_term_months", "arr"]
        x        = np.array([[deal_row.get(c, 0) for c in feats]], dtype=float)
        win_prob = float(self.model.predict_proba(x)[0, 1])

        arr     = float(deal_row.get("arr", 0))
        disc    = float(deal_row.get("discount_percentage", 0.10))
        rsfs    = float(deal_row.get("rsfs", 0.78))
        rqi     = (arr * (1 - disc) * rsfs) / (self.sales["arr"].median() + 1e-9)
        rqi     = min(rqi, 2.0) / 2.0

        cycle   = float(deal_row.get("sales_cycle_days", 45))
        urgency = max(0.0, 1 - cycle / 120)

        return round(
            self.WEIGHTS["win_prob"] * win_prob
            + self.WEIGHTS["rqi"]   * rqi
            + self.WEIGHTS["urgency"] * urgency,
            4,
        )


class CompetitiveChurnPredictor:
    """
    AI Innovation 2 — Competitive Churn Early-Warning System (CCEW)

    Trains a binary XGBoost classifier on product-struggle signals to predict
    P(competitive_churn) per customer before the renewal call.
    """

    def __init__(self, product_df: pd.DataFrame, snapshots_df: pd.DataFrame):
        self.model:      xgb.XGBClassifier | None = None
        self.feat_names: list[str]                 = []
        self._fit(product_df, snapshots_df)

    def _fit(self, product_df: pd.DataFrame, snapshots_df: pd.DataFrame) -> None:
        snap_agg = snapshots_df.groupby("customer_id").agg(
            ticket_velocity    = ("support_tickets_at_snapshot", lambda x: x.diff().mean()),
            nps_momentum       = ("nps_at_snapshot",             lambda x: x.diff().mean()),
            churn_acceleration = ("churn_risk_at_snapshot",      lambda x: x.diff().mean()),
        ).reset_index()

        df = product_df[[
            "customer_id", "features_adopted_count",
            "struggle_feature_signal", "churn_risk_score",
        ]].copy()
        df["low_adoption_flag"]       = (df["features_adopted_count"] < 4).astype(int)
        df["feature_struggle_binary"] = df["struggle_feature_signal"].notna().astype(int)
        df["competitive_churn_label"] = (df["churn_risk_score"] > 0.65).astype(int)
        df = df.merge(snap_agg, on="customer_id", how="left").fillna(0)

        features = [
            "low_adoption_flag", "feature_struggle_binary",
            "ticket_velocity", "nps_momentum", "churn_acceleration",
        ]
        X = df[features].values
        y = df["competitive_churn_label"].values
        if len(X) < 20:
            return

        self.feat_names = features
        self.model = xgb.XGBClassifier(
            n_estimators=150, max_depth=3,
            use_label_encoder=False, eval_metric="logloss",
            random_state=SEED,
        )
        self.model.fit(X, y)

    def predict_risk(self, customer_features: dict) -> dict:
        if self.model is None:
            return {"competitive_churn_prob": 0.5, "top_signal": "unknown"}
        x    = np.array([[customer_features.get(f, 0) for f in self.feat_names]])
        prob = float(self.model.predict_proba(x)[0, 1])
        top  = self.feat_names[int(np.argmax(self.model.feature_importances_))]
        return {"competitive_churn_prob": round(prob, 4), "top_signal": top}


class RevenueExpansionRecommender:
    """
    AI Innovation 3 — Intelligent Expansion Revenue Recommender (IERR)

    K-Means (k=4) segmentation on customer health vectors to identify
    "Growth" / "Champion" cohorts, then attaches predicted expansion ARR.
    """

    CLUSTER_NAMES       = {0: "At_Risk", 1: "Stable", 2: "Growth", 3: "Champion"}
    EXPANSION_MULTIPLIERS = {"Champion": 0.30, "Growth": 0.18, "Stable": 0.05, "At_Risk": 0.0}

    def __init__(self):
        from sklearn.cluster import KMeans
        self.kmeans = KMeans(n_clusters=4, random_state=SEED, n_init=10)
        self.fitted = False

    def fit_and_score(
        self,
        snapshots_df: pd.DataFrame,
        product_df:   pd.DataFrame,
    ) -> pd.DataFrame:
        from sklearn.preprocessing import MinMaxScaler

        snap_agg = snapshots_df.groupby("customer_id").agg(
            avg_nps      = ("nps_at_snapshot",             "mean"),
            avg_features = ("features_active_at_snapshot", "mean"),
            mrr_growth   = ("mrr_at_snapshot",              lambda x: x.pct_change().mean()),
            avg_tickets  = ("support_tickets_at_snapshot",  "mean"),
        ).reset_index().fillna(0)

        X = snap_agg[["avg_nps", "avg_features", "mrr_growth", "avg_tickets"]].values.copy()
        X[:, 3] = -X[:, 3]   # invert tickets (fewer = healthier)
        X = MinMaxScaler().fit_transform(X)

        snap_agg["cluster_id"]    = self.kmeans.fit_predict(X)
        snap_agg["cluster_name"]  = snap_agg["cluster_id"].map(self.CLUSTER_NAMES)
        snap_agg["expansion_mult"] = snap_agg["cluster_name"].map(self.EXPANSION_MULTIPLIERS)

        product_slim = product_df[["customer_id", "mrr"]].copy()
        product_slim["current_arr"] = product_slim["mrr"] * 12
        result = snap_agg.merge(product_slim, on="customer_id", how="left")
        result["predicted_expansion_arr"] = (
            result["current_arr"].fillna(0) * result["expansion_mult"]
        ).round(2)

        self.fitted = True
        return result.sort_values("predicted_expansion_arr", ascending=False)
import logging
import math
import random
from typing import Dict, List, Optional, Tuple

import numpy as np
import pandas as pd

from app.core.cache import predicto_cache_v2
from app.core.schema_resolver import resolve_canonical_df
from app.models.response_models import (
    DealWarRoomResponse,
    DealWarRoomRecommendation,
    StrategyMixEntry,
    CompetitorProfile,
    ParetoPoint,
    SellerAction,
    CompetitorAction,
    FeatureAvailability,
    ConfidenceLevel,
)

log = logging.getLogger("predicto.v2.war_room")

# ── Game constants ────────────────────────────────────────────────────────────
SELLER_ACTIONS: List[SellerAction] = list(SellerAction)
COMPETITOR_ACTIONS: List[CompetitorAction] = list(CompetitorAction)
N_SELLER    = len(SELLER_ACTIONS)
N_COMP      = len(COMPETITOR_ACTIONS)
TREE_DEPTH  = 3
CFR_ITERATIONS = 1000   # iterations per deal; fast enough for online inference

# Payoff matrix: seller_action × competitor_action → (win_rate_delta, margin_delta)
_WIN_RATE_DELTAS = np.array([
    [ 0.05, -0.02,  0.01,  0.10],   # DISCOUNT_GUARD_5
    [ 0.12, -0.04, -0.01,  0.15],   # DISCOUNT_GUARD_10
    [-0.03,  0.10,  0.12,  0.08],   # EXECUTIVE_TOUCH
    [-0.02,  0.08,  0.10,  0.06],   # CSM_INTERVENTION
    [-0.08, -0.05, -0.02,  0.04],   # HOLD_LINE
], dtype=float)

_MARGIN_DELTAS = np.array([
    [ 0.05,  0.05,  0.05,  0.05],   # DISCOUNT_GUARD_5  — protects margin
    [ 0.00,  0.00,  0.00,  0.00],   # DISCOUNT_GUARD_10 — break-even margin
    [-0.00,  0.00,  0.01,  0.02],   # EXECUTIVE_TOUCH
    [-0.00,  0.01,  0.01,  0.01],   # CSM_INTERVENTION
    [ 0.10,  0.10,  0.10,  0.10],   # HOLD_LINE         — maximum margin
], dtype=float)

# Base competitor frequencies (prior; updated from lost deal data)
_COMP_BASE_FREQ = np.array([0.30, 0.25, 0.20, 0.25], dtype=float)


def _extract_competitor_profiles(sales_df: Optional[pd.DataFrame]) -> np.ndarray:
    """Infer competitor action frequencies from historical lost deal data."""
    freq = _COMP_BASE_FREQ.copy()

    if sales_df is None or sales_df.empty:
        return freq

    lost = sales_df[sales_df.get("outcome", pd.Series(dtype=str)) == "lost"] \
        if "outcome" in sales_df.columns \
        else pd.DataFrame()

    if lost.empty:
        return freq

    comp_col = next((c for c in ("competitor_action", "loss_reason") if c in lost.columns), None)
    if comp_col is None:
        return freq

    action_map = {
        "price":      0,
        "discount":   0,
        "evaluation": 1,
        "extend":     1,
        "fud":        2,
        "fear":       2,
        "no_action":  3,
        "none":       3,
    }

    counts = np.ones(N_COMP)  # Laplace smoothing
    for val in lost[comp_col].dropna().astype(str).str.lower():
        for keyword, idx in action_map.items():
            if keyword in val:
                counts[idx] += 1
                break

    freq = counts / counts.sum()
    return freq


class _CFRSolver:
    """Counterfactual Regret Minimisation over a 3-stage game tree."""

    def __init__(
        self,
        competitor_freq: np.ndarray,
        base_win_rate: float,
        base_margin: float,
        arr: float,
        rng: np.random.Generator,
    ):
        self.competitor_freq = competitor_freq
        self.base_win_rate   = base_win_rate
        self.base_margin     = base_margin
        self.arr             = arr
        self.rng             = rng
        self.regret_sum: Dict[tuple, np.ndarray] = {}
        self.strategy_sum: Dict[tuple, np.ndarray] = {}

    def _info_set_key(self, stage: int, prev_seller_action: int) -> tuple:
        return (stage, prev_seller_action)

    def _get_strategy(self, key: tuple) -> np.ndarray:
        regrets = self.regret_sum.get(key, np.zeros(N_SELLER))
        positive = np.maximum(regrets, 0.0)
        total    = positive.sum()
        if total > 0:
            return positive / total
        return np.ones(N_SELLER) / N_SELLER

    def _accumulate_strategy(self, key: tuple, strategy: np.ndarray, weight: float):
        if key not in self.strategy_sum:
            self.strategy_sum[key] = np.zeros(N_SELLER)
        self.strategy_sum[key] += weight * strategy

    def _payoff(self, seller_actions: List[int], comp_actions: List[int]) -> Tuple[float, float]:
        win_rate = self.base_win_rate
        margin   = self.base_margin
        for sa, ca in zip(seller_actions, comp_actions):
            win_rate = np.clip(win_rate + _WIN_RATE_DELTAS[sa, ca], 0.0, 1.0)
            margin   = np.clip(margin   + _MARGIN_DELTAS[sa, ca],   0.0, 1.0)
        return float(win_rate), float(margin)

    def _cfr_traverse(self, stage: int, seller_history: List[int], comp_history: List[int], reach_prob: float) -> np.ndarray:
        if stage == TREE_DEPTH:
            wr, mg = self._payoff(seller_history, comp_history)
            expected_r = self.arr * wr
            util = 0.6 * expected_r / max(self.arr, 1.0) + 0.4 * mg
            return np.full(N_SELLER, util)

        key      = self._info_set_key(stage, seller_history[-1] if seller_history else -1)
        strategy = self._get_strategy(key)
        self._accumulate_strategy(key, strategy, reach_prob)

        comp_action = int(self.rng.choice(N_COMP, p=self.competitor_freq))

        action_values = np.zeros(N_SELLER)
        for sa in range(N_SELLER):
            child_vals = self._cfr_traverse(
                stage         = stage + 1,
                seller_history= seller_history + [sa],
                comp_history  = comp_history  + [comp_action],
                reach_prob    = reach_prob * strategy[sa],
            )
            action_values[sa] = child_vals[sa]

        node_value = float(strategy @ action_values)
        if key not in self.regret_sum:
            self.regret_sum[key] = np.zeros(N_SELLER)
        for sa in range(N_SELLER):
            self.regret_sum[key][sa] += reach_prob * (action_values[sa] - node_value)

        return action_values

    def solve(self, n_iterations: int = CFR_ITERATIONS) -> np.ndarray:
        for _ in range(n_iterations):
            self._cfr_traverse(stage=0, seller_history=[], comp_history=[], reach_prob=1.0)
        root_key = self._info_set_key(0, -1)
        avg = self.strategy_sum.get(root_key, np.ones(N_SELLER))
        total = avg.sum()
        return avg / total if total > 0 else np.ones(N_SELLER) / N_SELLER


def _pareto_front(objectives: np.ndarray) -> List[int]:
    n   = len(objectives)
    dominated = [False] * n
    for i in range(n):
        for j in range(n):
            if i == j:
                continue
            if (objectives[j] >= objectives[i]).all() and (objectives[j] > objectives[i]).any():
                dominated[i] = True
                break
    return [i for i in range(n) if not dominated[i]]


def _analyse_deal(deal_id: str, deal_name: str, arr: float, win_probability: float, discount_pct: float, competitor_freq: np.ndarray, rng: np.random.Generator) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    base_margin = max(0.0, 1.0 - discount_pct)
    solver      = _CFRSolver(
        competitor_freq = competitor_freq,
        base_win_rate   = win_probability,
        base_margin     = base_margin,
        arr             = arr,
        rng             = rng,
    )
    mix = solver.solve()

    wr_vec = np.zeros(N_SELLER)
    mg_vec = np.zeros(N_SELLER)
    for sa in range(N_SELLER):
        wr_acc = 0.0
        mg_acc = 0.0
        for ca in range(N_COMP):
            p    = competitor_freq[ca]
            wr_t = win_probability
            mg_t = base_margin
            for _ in range(TREE_DEPTH):
                ca_t = int(rng.choice(N_COMP, p=competitor_freq))
                wr_t = float(np.clip(wr_t + _WIN_RATE_DELTAS[sa, ca_t], 0, 1))
                mg_t = float(np.clip(mg_t + _MARGIN_DELTAS[sa, ca_t], 0, 1))
            wr_acc += p * wr_t
            mg_acc += p * mg_t
        wr_vec[sa] = wr_acc
        mg_vec[sa] = mg_acc

    return mix, wr_vec, mg_vec


def _build_rationale(action: SellerAction, wr: float, mg: float, arr: float) -> str:
    rationales = {
        SellerAction.DISCOUNT_GUARD_5:  f"A 5% discount guardrail protects margin ({mg:.0%}) while improving win rate. Expected revenue: ${arr * wr:,.0f}.",
        SellerAction.DISCOUNT_GUARD_10: f"A 10% guardrail offers a stronger price signal against undercutting. Win rate: {wr:.0%}, margin: {mg:.0%}.",
        SellerAction.EXECUTIVE_TOUCH:   f"Executive engagement neutralises FUD and builds champion credibility. Win rate lifts to {wr:.0%}.",
        SellerAction.CSM_INTERVENTION:  f"CSM intervention addresses technical evaluation delays and strengthens adoption story. Win rate: {wr:.0%}.",
        SellerAction.HOLD_LINE:         f"Holding price maximises margin ({mg:.0%}). Recommended only when competitive pressure is low (win rate: {wr:.0%}).",
    }
    return rationales.get(action, f"Win rate: {wr:.0%}, Margin: {mg:.0%}.")


def calculate_war_room() -> DealWarRoomResponse:
    warnings: List[str] = []
    raw_sales = predicto_cache_v2.sales_df

    if raw_sales is None or raw_sales.empty:
        log.warning("war_room_service: sales_df absent — OFFLINE.")
        return DealWarRoomResponse(
            summary_narrative="No sales pipeline data available. Upload a sales table to enable war-room analysis.",
            data_availability=FeatureAvailability.OFFLINE,
            overall_confidence=ConfidenceLevel.LOW,
        )

    # Apply Intelligent Schema Alignment
    sales_df = resolve_canonical_df(raw_sales)

    competitor_freq = _extract_competitor_profiles(sales_df)
    competitor_profiles = [
        CompetitorProfile(competitor_action=COMPETITOR_ACTIONS[i], historical_frequency=round(float(competitor_freq[i]), 4))
        for i in range(N_COMP)
    ]

    stage_col = next((c for c in ("stage", "deal_stage", "status") if c in sales_df.columns), None)
    if stage_col:
        open_mask = ~sales_df[stage_col].astype(str).str.lower().isin(["closed won", "closed lost", "won", "lost", "closed"])
        active_df = sales_df[open_mask].copy()
    else:
        active_df = sales_df.copy()
        warnings.append("No deal stage column found; treating all rows as active pipeline.")

    if active_df.empty:
        return DealWarRoomResponse(
            summary_narrative="No open deals found in pipeline.",
            data_availability=FeatureAvailability.PARTIAL,
            overall_confidence=ConfidenceLevel.LOW,
            competitor_profiles=competitor_profiles,
            warnings=warnings,
        )

    id_col      = next((c for c in ("deal_id", "id", "opportunity_id") if c in active_df.columns), None)
    name_col    = next((c for c in ("deal_name", "company", "account_name") if c in active_df.columns), None)
    arr_col     = next((c for c in ("arr", "amount", "deal_value") if c in active_df.columns), None)
    prob_col    = next((c for c in ("win_probability", "probability") if c in active_df.columns), None)
    disc_col    = next((c for c in ("discount_pct", "discount", "discount_rate") if c in active_df.columns), None)

    rng = np.random.default_rng(seed=42)
    recommendations: List[DealWarRoomRecommendation] = []
    portfolio_mix_acc  = np.zeros(N_SELLER)
    portfolio_wr_acc   = np.zeros(N_SELLER)
    portfolio_mg_acc   = np.zeros(N_SELLER)
    total_arr          = 0.0

    for _, row in active_df.iterrows():
        deal_id  = str(row[id_col]) if id_col else str(row.name)
        deal_name = str(row[name_col]) if name_col else deal_id
        arr      = float(row[arr_col]) if arr_col else 0.0
        base_wr  = float(row[prob_col]) / 100.0 if prob_col and row[prob_col] > 1 else float(row[prob_col]) if prob_col else 0.5
        base_wr  = float(np.clip(base_wr, 0.0, 1.0))
        disc     = float(row[disc_col]) if disc_col else 0.0

        mix, wr_vec, mg_vec = _analyse_deal(deal_id, deal_name, arr, base_wr, disc, competitor_freq, rng)
        best_sa   = int(np.argmax(mix))
        best_act  = SELLER_ACTIONS[best_sa]
        best_wr   = float(wr_vec[best_sa])
        best_mg   = float(mg_vec[best_sa])
        n_deals   = len(active_df)

        confidence = ConfidenceLevel.HIGH if n_deals >= 20 and arr > 0 else ConfidenceLevel.MEDIUM if n_deals >= 5 else ConfidenceLevel.LOW

        recommendations.append(DealWarRoomRecommendation(
            deal_id            = deal_id,
            deal_name          = deal_name,
            arr                = round(arr, 2),
            recommended_action = best_act,
            action_probability = round(float(mix[best_sa]), 4),
            expected_win_rate  = round(best_wr, 4),
            expected_margin    = round(best_mg, 4),
            confidence         = confidence,
            rationale          = _build_rationale(best_act, best_wr, best_mg, arr),
        ))

        weight               = arr if arr > 0 else 1.0
        portfolio_mix_acc   += weight * mix
        portfolio_wr_acc    += weight * wr_vec
        portfolio_mg_acc    += weight * mg_vec
        total_arr           += arr

    recommendations.sort(key=lambda r: r.arr, reverse=True)
    n_deals = len(recommendations)

    if total_arr > 0:
        portfolio_mix_acc  /= total_arr
        portfolio_wr_acc   /= total_arr
        portfolio_mg_acc   /= total_arr
    else:
        portfolio_mix_acc  /= max(n_deals, 1)
        portfolio_wr_acc   /= max(n_deals, 1)
        portfolio_mg_acc   /= max(n_deals, 1)

    rev_vec        = portfolio_wr_acc * (total_arr / max(n_deals, 1))
    objectives     = np.stack([rev_vec, portfolio_mg_acc], axis=1)
    pareto_indices = _pareto_front(objectives)

    pareto_frontier = [
        ParetoPoint(action=SELLER_ACTIONS[i], expected_win_rate=round(float(portfolio_wr_acc[i]), 4), expected_margin=round(float(portfolio_mg_acc[i]), 4), expected_revenue=round(float(rev_vec[i]), 2))
        for i in pareto_indices
    ]

    pareto_set = set(pareto_indices)
    portfolio_strategy_mix = [
        StrategyMixEntry(action=SELLER_ACTIONS[i], probability=round(float(portfolio_mix_acc[i]), 4), expected_win_rate=round(float(portfolio_wr_acc[i]), 4), expected_margin=round(float(portfolio_mg_acc[i]), 4), expected_revenue=round(float(rev_vec[i]), 2), is_pareto_efficient=(i in pareto_set))
        for i in range(N_SELLER)
    ]
    portfolio_strategy_mix.sort(key=lambda s: s.probability, reverse=True)

    top_action = max(portfolio_strategy_mix, key=lambda s: s.probability)
    narrative  = (
        f"War room CFR analysis across {n_deals} active deals recommends '{top_action.action.value}' as the dominant strategy "
        f"(equilibrium probability: {top_action.probability:.0%}). {len(pareto_frontier)} actions form the Pareto efficiency frontier "
        f"balancing win rate vs gross margin. Total pipeline ARR under analysis: ${total_arr:,.0f}."
    )

    overall_confidence = ConfidenceLevel.HIGH if n_deals >= 20 else ConfidenceLevel.MEDIUM if n_deals >= 5 else ConfidenceLevel.LOW

    log.info("war_room_service: %d deals analysed, top_action=%s, confidence=%s", n_deals, top_action.action.value, overall_confidence)

    return DealWarRoomResponse(
        recommendations         = recommendations,
        portfolio_strategy_mix  = portfolio_strategy_mix,
        pareto_frontier         = pareto_frontier,
        competitor_profiles     = competitor_profiles,
        n_deals_analyzed        = n_deals,
        cfr_iterations          = CFR_ITERATIONS,
        tree_depth              = TREE_DEPTH,
        summary_narrative       = narrative,
        data_availability       = FeatureAvailability.ACTIVE,
        overall_confidence      = overall_confidence,
        warnings                = warnings,
    )

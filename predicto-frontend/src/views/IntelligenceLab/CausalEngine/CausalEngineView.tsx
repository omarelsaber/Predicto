/**
 * src/views/IntelligenceLab/CausalEngine/CausalEngineView.tsx
 *
 * Predicto V3 — Causal Revenue Counterfactual Engine (Feature 10)
 * Linear dark aesthetic · Tremor v3 · Tailwind v4
 *
 * ─── Layout ───────────────────────────────────────────────────────────────────
 *   Page Header   — Treatment dropdown + ATE summary strip + engine-mode badge
 *
 *   Mid Row (two-column)
 *     Left  (40%)  Heterogeneity Map
 *                  • Tremor ScatterChart: X = Mean ARR ($K), Y = Mean CATE
 *                  • Dot colour encodes response cluster:
 *                      High Responders   → emerald
 *                      Low Responders    → indigo
 *                      Negative Responders → red
 *                      Uncertain         → amber
 *                  • Custom tooltip shows cluster label, n_customers, total ARR
 *
 *     Right (60%)  CATE Distribution Histogram
 *                  • Tremor BarChart treating 12 CATE buckets as a histogram
 *                  • Negative buckets (treatment helped) coloured emerald
 *                  • Positive buckets (treatment backfired) coloured red
 *                  • Zero-line annotation via a reference line div overlay
 *
 *   Bottom Row    — Customer CATE Table
 *                  • Tremor Table · 18 mock customers
 *                  • Columns: Rank, Customer, Segment, Treatment Received,
 *                             CATE, 95% CI lower–upper, ARR Δ, Responsiveness
 *                  • Inline 95% CI bar rendered as a proportional span
 *
 * All data is inline mock — matches CounterfactualResponse schema from
 * response_models_phase5.py exactly. Swap by replacing const declarations
 * with useCounterfactualQuery() results.
 *
 * Dependencies (already in Predicto V3):
 *   @tremor/react  — ScatterChart, BarChart, Table, TableHead,
 *                    TableHeaderCell, TableBody, TableRow, TableCell
 *   lucide-react   — icons
 *   CSS vars       — from index.css (.zone-title, .zone-header, .surface-1,
 *                    .glass-panel, .skeleton, .status-pill, .divider, .btn-*)
 */

import React, { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useCounterfactualQuery } from "@/hooks/useGodTierQueries";
import { tSegment } from "@/lib/personaMapping";
import type { TreatmentType } from "@/types/enums";
import type { CausalEngineMode as EngineMode, ConfidenceLevel, HeterogeneitySegment as HeterogeneityCluster } from "@/types/godtier/counterfactual";
import {
  ScatterChart,
  BarChart,
  Table,
  TableHead,
  TableHeaderCell,
  TableBody,
  TableRow,
  TableCell,
} from "@tremor/react";
import {
  FlaskConical,
  ChevronDown,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  CheckCircle2,
  Info,
  Users,
  BarChart2,
  Atom,
  RefreshCw,
  ArrowRight,
} from "lucide-react";

/* =============================================================================
   ██████╗  █████╗ ████████╗ █████╗
   All mock data — replace with useCounterfactualQuery(treatment) to go live.
 ============================================================================= */

/* ── Treatment options (mirrors TreatmentType enum) ─────────────────────── */

const TREATMENT_LABELS: Record<TreatmentType, string> = {
  DISCOUNT_APPLIED:  "Discount Applied",
  CAMPAIGN_EXPOSED:  "Campaign Exposed",
  CSM_ASSIGNED:      "CSM Assigned",
  REP_OUTREACH:      "Rep Outreach",
  EXECUTIVE_SPONSOR: "Executive Sponsor",
};

/* ── Engine mode + ATE data (one entry per treatment) ───────────────────── */

interface TreatmentSummary {
  ate:                 number;   // absolute probability shift (negative = good)
  ate_lower_ci:        number;
  ate_upper_ci:        number;
  engine_mode:         EngineMode;
  n_treated:           number;
  n_control:           number;
  outcome_r2:          number;   // nuisance model R²
  propensity_auroc:    number;
  total_foregone_arr:  number;
  overall_confidence:  ConfidenceLevel;
}

const TREATMENT_SUMMARIES: Record<TreatmentType, TreatmentSummary> = {
  DISCOUNT_APPLIED: {
    ate: -0.0821, ate_lower_ci: -0.1104, ate_upper_ci: -0.0538,
    engine_mode: "FULL_DML", n_treated: 187, n_control: 624,
    outcome_r2: 0.61, propensity_auroc: 0.78,
    total_foregone_arr: 1_240_000, overall_confidence: "HIGH",
  },
  CAMPAIGN_EXPOSED: {
    ate: -0.0412, ate_lower_ci: -0.0698, ate_upper_ci: -0.0126,
    engine_mode: "FULL_DML", n_treated: 312, n_control: 499,
    outcome_r2: 0.48, propensity_auroc: 0.71,
    total_foregone_arr: 640_000, overall_confidence: "HIGH",
  },
  CSM_ASSIGNED: {
    ate: -0.1134, ate_lower_ci: -0.1490, ate_upper_ci: -0.0778,
    engine_mode: "FULL_DML", n_treated: 98, n_control: 713,
    outcome_r2: 0.57, propensity_auroc: 0.81,
    total_foregone_arr: 1_880_000, overall_confidence: "HIGH",
  },
  REP_OUTREACH: {
    ate: -0.0234, ate_lower_ci: -0.0581, ate_upper_ci: 0.0113,
    engine_mode: "RIDGE_DML", n_treated: 44, n_control: 767,
    outcome_r2: 0.31, propensity_auroc: 0.64,
    total_foregone_arr: 288_000, overall_confidence: "MEDIUM",
  },
  EXECUTIVE_SPONSOR: {
    ate: -0.1608, ate_lower_ci: -0.2210, ate_upper_ci: -0.1006,
    engine_mode: "RIDGE_DML", n_treated: 21, n_control: 790,
    outcome_r2: 0.28, propensity_auroc: 0.69,
    total_foregone_arr: 3_120_000, overall_confidence: "MEDIUM",
  },
};

/* ── Heterogeneity Map data (mirrors HeterogeneityMapEntry[]) ────────────── */

interface HeterogeneityPoint {
  cluster:       HeterogeneityCluster;
  label:         string;
  mean_arr_k:    number;   // X axis: Mean ARR in $K
  mean_cate:     number;   // Y axis: Mean CATE (negative = treatment helped)
  n_customers:   number;
  total_arr_m:   number;   // Total ARR in $M for tooltip
  segments:      string;   // e.g. "Enterprise, Mid-Market"
  strategic_note: string;
}

// Each treatment gets its own heterogeneity map; we store all and filter
const HETEROGENEITY_DATA: Record<TreatmentType, HeterogeneityPoint[]> = {
  DISCOUNT_APPLIED: [
    {
      cluster: "HIGH_RESPONDERS", label: "High Responders",
      mean_arr_k: 380, mean_cate: -0.182, n_customers: 62, total_arr_m: 23.6,
      segments: "Enterprise", strategic_note: "Prioritise discounts here — maximum churn prevention per dollar.",
    },
    {
      cluster: "LOW_RESPONDERS", label: "Low Responders",
      mean_arr_k: 120, mean_cate: -0.044, n_customers: 91, total_arr_m: 10.9,
      segments: "Mid-Market, SMB", strategic_note: "Modest effect — use discounts sparingly to preserve margin.",
    },
    {
      cluster: "NEGATIVE_RESPONDERS", label: "Negative Responders",
      mean_arr_k: 48, mean_cate: 0.071, n_customers: 18, total_arr_m: 0.9,
      segments: "SMB", strategic_note: "Discount appears counter-productive — investigate signalling effect.",
    },
    {
      cluster: "UNCERTAIN", label: "Uncertain",
      mean_arr_k: 200, mean_cate: -0.011, n_customers: 16, total_arr_m: 3.2,
      segments: "Mid-Market", strategic_note: "Inconclusive. Collect more longitudinal data before acting.",
    },
  ],
  CAMPAIGN_EXPOSED: [
    {
      cluster: "HIGH_RESPONDERS", label: "High Responders",
      mean_arr_k: 160, mean_cate: -0.094, n_customers: 88, total_arr_m: 14.1,
      segments: "Mid-Market, Growth", strategic_note: "Campaign ROI is strong for this segment. Scale spend.",
    },
    {
      cluster: "LOW_RESPONDERS", label: "Low Responders",
      mean_arr_k: 55, mean_cate: -0.022, n_customers: 142, total_arr_m: 7.8,
      segments: "SMB", strategic_note: "Low but positive signal. Keep baseline campaign exposure.",
    },
    {
      cluster: "NEGATIVE_RESPONDERS", label: "Negative Responders",
      mean_arr_k: 490, mean_cate: 0.038, n_customers: 24, total_arr_m: 11.8,
      segments: "Enterprise", strategic_note: "Campaign may feel intrusive to Enterprise. Switch to 1:1 outreach.",
    },
    {
      cluster: "UNCERTAIN", label: "Uncertain",
      mean_arr_k: 290, mean_cate: 0.005, n_customers: 58, total_arr_m: 16.8,
      segments: "Enterprise, Mid-Market", strategic_note: "Effect near zero. A/B test recommended.",
    },
  ],
  CSM_ASSIGNED: [
    {
      cluster: "HIGH_RESPONDERS", label: "High Responders",
      mean_arr_k: 310, mean_cate: -0.228, n_customers: 29, total_arr_m: 9.0,
      segments: "Enterprise", strategic_note: "CSM is the single biggest lever for Enterprise churn prevention.",
    },
    {
      cluster: "LOW_RESPONDERS", label: "Low Responders",
      mean_arr_k: 140, mean_cate: -0.068, n_customers: 44, total_arr_m: 6.2,
      segments: "Mid-Market", strategic_note: "Positive but not sufficient alone. Pair with rep outreach.",
    },
    {
      cluster: "NEGATIVE_RESPONDERS", label: "Negative Responders",
      mean_arr_k: 22, mean_cate: 0.045, n_customers: 9, total_arr_m: 0.2,
      segments: "SMB", strategic_note: "CSM overhead may feel intrusive for small accounts. Use digital-first.",
    },
    {
      cluster: "UNCERTAIN", label: "Uncertain",
      mean_arr_k: 88, mean_cate: -0.008, n_customers: 16, total_arr_m: 1.4,
      segments: "SMB, Mid-Market", strategic_note: "Insufficient data. Enrol in next CSM cohort for better signal.",
    },
  ],
  REP_OUTREACH: [
    {
      cluster: "HIGH_RESPONDERS", label: "High Responders",
      mean_arr_k: 220, mean_cate: -0.071, n_customers: 12, total_arr_m: 2.6,
      segments: "Mid-Market", strategic_note: "Personalised rep touch reduces churn for mid-market deals.",
    },
    {
      cluster: "LOW_RESPONDERS", label: "Low Responders",
      mean_arr_k: 80, mean_cate: -0.018, n_customers: 19, total_arr_m: 1.5,
      segments: "SMB", strategic_note: "Marginal effect. Consider automated outreach to reduce cost.",
    },
    {
      cluster: "NEGATIVE_RESPONDERS", label: "Negative Responders",
      mean_arr_k: 35, mean_cate: 0.052, n_customers: 7, total_arr_m: 0.2,
      segments: "SMB", strategic_note: "Outreach may be increasing friction. Review cadence and tone.",
    },
    {
      cluster: "UNCERTAIN", label: "Uncertain",
      mean_arr_k: 145, mean_cate: 0.009, n_customers: 6, total_arr_m: 0.9,
      segments: "Mid-Market", strategic_note: "Wide CI — insufficient treated sample to draw conclusions.",
    },
  ],
  EXECUTIVE_SPONSOR: [
    {
      cluster: "HIGH_RESPONDERS", label: "High Responders",
      mean_arr_k: 650, mean_cate: -0.291, n_customers: 8, total_arr_m: 5.2,
      segments: "Enterprise", strategic_note: "Highest CATE in portfolio. Executive touch is decisive for top accounts.",
    },
    {
      cluster: "LOW_RESPONDERS", label: "Low Responders",
      mean_arr_k: 280, mean_cate: -0.082, n_customers: 9, total_arr_m: 2.5,
      segments: "Enterprise", strategic_note: "Positive but diminishing returns. Prioritise High Responders first.",
    },
    {
      cluster: "NEGATIVE_RESPONDERS", label: "Negative Responders",
      mean_arr_k: 110, mean_cate: 0.062, n_customers: 2, total_arr_m: 0.2,
      segments: "Mid-Market", strategic_note: "Possible misaligned executive pairing. Review sponsor selection.",
    },
    {
      cluster: "UNCERTAIN", label: "Uncertain",
      mean_arr_k: 190, mean_cate: -0.024, n_customers: 2, total_arr_m: 0.4,
      segments: "Mid-Market", strategic_note: "Sample too small. No action until N ≥ 10.",
    },
  ],
};

/* ── CATE histogram buckets (12 bins, −0.35 to +0.15) ───────────────────── */

interface HistogramBucket {
  bucket:   string;   // display label (e.g. "−0.30")
  midpoint: number;   // numeric midpoint for colour logic
  count:    number;   // n_customers in this bin
}

// One histogram per treatment — realistic distributions shaped around each ATE
const HISTOGRAM_DATA: Record<TreatmentType, HistogramBucket[]> = {
  DISCOUNT_APPLIED: [
    { bucket: "≤−0.30", midpoint: -0.325, count:  8 },
    { bucket: "−0.25",  midpoint: -0.275, count: 14 },
    { bucket: "−0.20",  midpoint: -0.225, count: 22 },
    { bucket: "−0.15",  midpoint: -0.175, count: 38 },
    { bucket: "−0.10",  midpoint: -0.125, count: 51 },
    { bucket: "−0.05",  midpoint: -0.075, count: 34 },
    { bucket: "~0.00",  midpoint:  0.000, count: 12 },
    { bucket: "+0.05",  midpoint:  0.025, count:  8 },
    { bucket: "+0.10",  midpoint:  0.075, count:  6 },
    { bucket: "+0.15",  midpoint:  0.125, count:  4 },
    { bucket: "+0.20",  midpoint:  0.175, count:  2 },
    { bucket: ">+0.20", midpoint:  0.225, count:  1 },
  ],
  CAMPAIGN_EXPOSED: [
    { bucket: "≤−0.30", midpoint: -0.325, count:  2 },
    { bucket: "−0.25",  midpoint: -0.275, count:  6 },
    { bucket: "−0.20",  midpoint: -0.225, count: 12 },
    { bucket: "−0.15",  midpoint: -0.175, count: 24 },
    { bucket: "−0.10",  midpoint: -0.125, count: 48 },
    { bucket: "−0.05",  midpoint: -0.075, count: 72 },
    { bucket: "~0.00",  midpoint:  0.000, count: 84 },
    { bucket: "+0.05",  midpoint:  0.025, count: 42 },
    { bucket: "+0.10",  midpoint:  0.075, count: 18 },
    { bucket: "+0.15",  midpoint:  0.125, count:  8 },
    { bucket: "+0.20",  midpoint:  0.175, count:  4 },
    { bucket: ">+0.20", midpoint:  0.225, count:  2 },
  ],
  CSM_ASSIGNED: [
    { bucket: "≤−0.30", midpoint: -0.325, count: 12 },
    { bucket: "−0.25",  midpoint: -0.275, count: 18 },
    { bucket: "−0.20",  midpoint: -0.225, count: 24 },
    { bucket: "−0.15",  midpoint: -0.175, count: 20 },
    { bucket: "−0.10",  midpoint: -0.125, count: 14 },
    { bucket: "−0.05",  midpoint: -0.075, count:  8 },
    { bucket: "~0.00",  midpoint:  0.000, count:  3 },
    { bucket: "+0.05",  midpoint:  0.025, count:  2 },
    { bucket: "+0.10",  midpoint:  0.075, count:  1 },
    { bucket: "+0.15",  midpoint:  0.125, count:  0 },
    { bucket: "+0.20",  midpoint:  0.175, count:  0 },
    { bucket: ">+0.20", midpoint:  0.225, count:  0 },
  ],
  REP_OUTREACH: [
    { bucket: "≤−0.30", midpoint: -0.325, count:  0 },
    { bucket: "−0.25",  midpoint: -0.275, count:  1 },
    { bucket: "−0.20",  midpoint: -0.225, count:  2 },
    { bucket: "−0.15",  midpoint: -0.175, count:  4 },
    { bucket: "−0.10",  midpoint: -0.125, count:  6 },
    { bucket: "−0.05",  midpoint: -0.075, count: 10 },
    { bucket: "~0.00",  midpoint:  0.000, count: 12 },
    { bucket: "+0.05",  midpoint:  0.025, count:  8 },
    { bucket: "+0.10",  midpoint:  0.075, count:  5 },
    { bucket: "+0.15",  midpoint:  0.125, count:  2 },
    { bucket: "+0.20",  midpoint:  0.175, count:  1 },
    { bucket: ">+0.20", midpoint:  0.225, count:  1 },
  ],
  EXECUTIVE_SPONSOR: [
    { bucket: "≤−0.30", midpoint: -0.325, count:  6 },
    { bucket: "−0.25",  midpoint: -0.275, count:  5 },
    { bucket: "−0.20",  midpoint: -0.225, count:  4 },
    { bucket: "−0.15",  midpoint: -0.175, count:  3 },
    { bucket: "−0.10",  midpoint: -0.125, count:  1 },
    { bucket: "−0.05",  midpoint: -0.075, count:  1 },
    { bucket: "~0.00",  midpoint:  0.000, count:  0 },
    { bucket: "+0.05",  midpoint:  0.025, count:  0 },
    { bucket: "+0.10",  midpoint:  0.075, count:  1 },
    { bucket: "+0.15",  midpoint:  0.125, count:  0 },
    { bucket: "+0.20",  midpoint:  0.175, count:  0 },
    { bucket: ">+0.20", midpoint:  0.225, count:  0 },
  ],
};

/* ── Customer CATE table (18 rows, shared across treatments for brevity) ─── */
// In production: filtered per treatment from cate_estimates[]

interface CateRow {
  rank:              number;
  customer_id:       string;
  customer_name:     string;
  segment:           "Enterprise" | "Mid-Market" | "SMB";
  treatment_received: boolean;
  cate:              number;    // point estimate
  ci_lower:          number;    // 95% CI lower
  ci_upper:          number;    // 95% CI upper
  arr:               number;    // USD
  arr_delta:         number;    // arr × (−cate)  positive = revenue saved
  cluster:           HeterogeneityCluster;
}

const CATE_TABLE_ROWS: CateRow[] = [
  { rank:  1, customer_id: "cust-044", customer_name: "Zenith Capital",      segment: "Enterprise",  treatment_received: true,  cate: -0.291, ci_lower: -0.381, ci_upper: -0.201, arr: 620_000, arr_delta:  180_420, cluster: "HIGH_RESPONDERS"     },
  { rank:  2, customer_id: "cust-012", customer_name: "Axiom Financial",     segment: "Enterprise",  treatment_received: true,  cate: -0.248, ci_lower: -0.334, ci_upper: -0.162, arr: 480_000, arr_delta:  119_040, cluster: "HIGH_RESPONDERS"     },
  { rank:  3, customer_id: "cust-088", customer_name: "Nexus Logistics",     segment: "Enterprise",  treatment_received: true,  cate: -0.214, ci_lower: -0.298, ci_upper: -0.130, arr: 360_000, arr_delta:   77_040, cluster: "HIGH_RESPONDERS"     },
  { rank:  4, customer_id: "cust-031", customer_name: "Halcyon Health",      segment: "Enterprise",  treatment_received: false, cate: -0.188, ci_lower: -0.261, ci_upper: -0.115, arr: 310_000, arr_delta:   58_280, cluster: "HIGH_RESPONDERS"     },
  { rank:  5, customer_id: "cust-067", customer_name: "Stratos Retail",      segment: "Mid-Market",  treatment_received: true,  cate: -0.162, ci_lower: -0.228, ci_upper: -0.096, arr: 195_000, arr_delta:   31_590, cluster: "HIGH_RESPONDERS"     },
  { rank:  6, customer_id: "cust-019", customer_name: "Pinnacle SaaS",       segment: "Mid-Market",  treatment_received: true,  cate: -0.134, ci_lower: -0.198, ci_upper: -0.070, arr: 178_000, arr_delta:   23_852, cluster: "HIGH_RESPONDERS"     },
  { rank:  7, customer_id: "cust-093", customer_name: "Solaris Energy",      segment: "Enterprise",  treatment_received: false, cate: -0.109, ci_lower: -0.171, ci_upper: -0.047, arr: 420_000, arr_delta:   45_780, cluster: "LOW_RESPONDERS"      },
  { rank:  8, customer_id: "cust-054", customer_name: "Cedarwood Analytics", segment: "Mid-Market",  treatment_received: true,  cate: -0.088, ci_lower: -0.148, ci_upper: -0.028, arr: 142_000, arr_delta:   12_496, cluster: "LOW_RESPONDERS"      },
  { rank:  9, customer_id: "cust-077", customer_name: "Vantage HR",          segment: "Mid-Market",  treatment_received: true,  cate: -0.064, ci_lower: -0.124, ci_upper: -0.004, arr: 128_000, arr_delta:    8_192, cluster: "LOW_RESPONDERS"      },
  { rank: 10, customer_id: "cust-006", customer_name: "Oaken Fintech",       segment: "SMB",         treatment_received: false, cate: -0.041, ci_lower: -0.102, ci_upper:  0.020, arr:  68_000, arr_delta:    2_788, cluster: "LOW_RESPONDERS"      },
  { rank: 11, customer_id: "cust-038", customer_name: "Meridian Tech",       segment: "Mid-Market",  treatment_received: true,  cate: -0.019, ci_lower: -0.081, ci_upper:  0.043, arr: 156_000, arr_delta:    2_964, cluster: "UNCERTAIN"           },
  { rank: 12, customer_id: "cust-081", customer_name: "Blueprint Consulting", segment: "SMB",        treatment_received: false, cate: -0.008, ci_lower: -0.072, ci_upper:  0.056, arr:  44_000, arr_delta:      352, cluster: "UNCERTAIN"           },
  { rank: 13, customer_id: "cust-062", customer_name: "Cascade Digital",     segment: "SMB",         treatment_received: true,  cate:  0.011, ci_lower: -0.054, ci_upper:  0.076, arr:  32_000, arr_delta:     -352, cluster: "UNCERTAIN"           },
  { rank: 14, customer_id: "cust-025", customer_name: "Arden Pharma",        segment: "Mid-Market",  treatment_received: true,  cate:  0.034, ci_lower: -0.028, ci_upper:  0.096, arr:  91_000, arr_delta:   -3_094, cluster: "UNCERTAIN"           },
  { rank: 15, customer_id: "cust-049", customer_name: "Lattice Networks",    segment: "SMB",         treatment_received: true,  cate:  0.058, ci_lower:  0.004, ci_upper:  0.112, arr:  47_000, arr_delta:   -2_726, cluster: "NEGATIVE_RESPONDERS" },
  { rank: 16, customer_id: "cust-014", customer_name: "Forge Systems",       segment: "SMB",         treatment_received: false, cate:  0.079, ci_lower:  0.021, ci_upper:  0.137, arr:  38_000, arr_delta:   -3_002, cluster: "NEGATIVE_RESPONDERS" },
  { rank: 17, customer_id: "cust-072", customer_name: "Cobalt Creative",     segment: "SMB",         treatment_received: true,  cate:  0.104, ci_lower:  0.042, ci_upper:  0.166, arr:  29_000, arr_delta:   -3_016, cluster: "NEGATIVE_RESPONDERS" },
  { rank: 18, customer_id: "cust-003", customer_name: "Apex Media",          segment: "SMB",         treatment_received: true,  cate:  0.138, ci_lower:  0.068, ci_upper:  0.208, arr:  22_000, arr_delta:   -3_036, cluster: "NEGATIVE_RESPONDERS" },
];

/* =============================================================================
   CONSTANTS & HELPERS
============================================================================= */

const formatCurrency = (n: number): string => {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000)     return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
};

const formatCate = (v: number): string =>
  `${v >= 0 ? "+" : ""}${(v * 100).toFixed(1)}pp`;

const pct = (v: number): string => `${(v * 100).toFixed(1)}%`;

/* Cluster → visual tokens */
const CLUSTER_CONFIG: Record<
  HeterogeneityCluster,
  { label: string; tremorColor: string; hex: string; bg: string; border: string }
> = {
  HIGH_RESPONDERS:     { label: "High Responders",     tremorColor: "emerald", hex: "#4ade80", bg: "rgba(39,166,68,0.10)",   border: "rgba(39,166,68,0.22)"   },
  LOW_RESPONDERS:      { label: "Low Responders",      tremorColor: "indigo",  hex: "#828fff", bg: "rgba(94,106,210,0.10)", border: "rgba(94,106,210,0.22)" },
  NEGATIVE_RESPONDERS: { label: "Negative Responders", tremorColor: "red",     hex: "#f87171", bg: "rgba(229,72,77,0.10)",  border: "rgba(229,72,77,0.22)"  },
  UNCERTAIN:           { label: "Uncertain",           tremorColor: "amber",   hex: "#fbbf24", bg: "rgba(232,163,10,0.10)", border: "rgba(232,163,10,0.22)" },
};

/* Segment → pill styles */
const SEGMENT_STYLE: Record<string, { bg: string; text: string; border: string }> = {
  Enterprise:    { bg: "rgba(94,106,210,0.10)", text: "#828fff", border: "rgba(94,106,210,0.22)" },
  "Mid-Market":  { bg: "rgba(232,163,10,0.10)", text: "#fbbf24", border: "rgba(232,163,10,0.22)" },
  SMB:           { bg: "rgba(39,166,68,0.10)",  text: "#4ade80", border: "rgba(39,166,68,0.20)"  },
};

/* Engine mode badge */
const ENGINE_CONFIG: Record<EngineMode, { label: string; color: string; bg: string; border: string }> = {
  FULL_DML:    { label: "FULL DML",    color: "#4ade80", bg: "rgba(39,166,68,0.10)",   border: "rgba(39,166,68,0.22)"   },
  RIDGE_DML:   { label: "RIDGE DML",  color: "#fbbf24", bg: "rgba(232,163,10,0.10)", border: "rgba(232,163,10,0.22)" },
  OLS_BASELINE:{ label: "OLS",        color: "#f87171", bg: "rgba(229,72,77,0.10)",  border: "rgba(229,72,77,0.22)"  },
};

const CONFIDENCE_COLOR: Record<ConfidenceLevel, string> = {
  HIGH:   "var(--p-success)",
  MEDIUM: "var(--p-warning)",
  LOW:    "var(--p-danger)",
};

/* =============================================================================
   SUB-COMPONENTS
============================================================================= */

/* ── Zone header (matches IntelligenceHubView pattern) ───────────────────── */
const ZoneHeader: React.FC<{
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}> = ({ title, subtitle, action }) => (
  <div className="zone-header" style={{ marginBottom: 14 }}>
    <div>
      <span className="zone-title">{title}</span>
      {subtitle && (
        <span style={{
          display: "block", fontSize: 11, color: "var(--p-ink-tertiary)",
          marginTop: 2, fontFamily: "var(--font-body)", fontWeight: 400,
          letterSpacing: 0, textTransform: "none",
        }}>
          {subtitle}
        </span>
      )}
    </div>
    {action}
  </div>
);

/* ── Treatment dropdown ──────────────────────────────────────────────────── */
const TreatmentDropdown: React.FC<{
  value:    TreatmentType;
  onChange: (t: TreatmentType) => void;
}> = ({ value, onChange }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const options = Object.keys(TREATMENT_LABELS) as TreatmentType[];

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          display:        "inline-flex",
          alignItems:     "center",
          gap:            8,
          padding:        "7px 12px",
          borderRadius:   "var(--radius-md)",
          background:     "var(--p-surface-2)",
          border:         "1px solid var(--p-hairline-strong)",
          color:          "var(--p-ink-muted)",
          fontSize:       13,
          fontWeight:     500,
          fontFamily:     "var(--font-body)",
          cursor:         "pointer",
          whiteSpace:     "nowrap",
          boxShadow:      "inset 0 1px 0 rgba(255,255,255,0.04)",
          minWidth:       200,
          justifyContent: "space-between",
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <FlaskConical size={13} color="var(--p-primary-hover)" strokeWidth={1.8} />
          {t(`causal.treatments.${value}`, { defaultValue: TREATMENT_LABELS[value] })}
        </span>
        <ChevronDown
          size={13}
          color="var(--p-ink-tertiary)"
          style={{
            transform:  open ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 180ms ease",
          }}
        />
      </button>

      {open && (
        <div style={{
          position:     "absolute",
          top:          "calc(100% + 4px)",
          left:         0,
          zIndex:       50,
          background:   "var(--p-surface-2)",
          border:       "1px solid var(--p-hairline-strong)",
          borderRadius: "var(--radius-lg)",
          boxShadow:    "0 8px 32px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.05)",
          overflow:     "hidden",
          minWidth:     220,
          backdropFilter: "blur(8px)",
        }}>
          {options.map((opt) => (
            <button
              key={opt}
              onClick={() => { onChange(opt); setOpen(false); }}
              role="option"
              aria-selected={opt === value}
              style={{
                display:     "flex",
                alignItems:  "center",
                gap:         9,
                width:       "100%",
                padding:     "9px 14px",
                background:  opt === value ? "rgba(94,106,210,0.10)" : "transparent",
                border:      "none",
                borderBottom:"1px solid var(--p-hairline)",
                color:       opt === value ? "var(--p-primary-hover)" : "var(--p-ink-muted)",
                fontSize:    13,
                fontWeight:  opt === value ? 500 : 400,
                fontFamily:  "var(--font-body)",
                cursor:      "pointer",
                textAlign:   "left",
                transition:  "background 100ms ease",
              }}
              onMouseEnter={(e) => {
                if (opt !== value)
                  (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.03)";
              }}
              onMouseLeave={(e) => {
                if (opt !== value)
                  (e.currentTarget as HTMLElement).style.background = "transparent";
              }}
            >
              {opt === value && (
                <CheckCircle2 size={11} color="var(--p-primary-hover)" strokeWidth={2.5} />
              )}
              {opt !== value && <div style={{ width: 11 }} />}
              {t(`causal.treatments.${opt}`, { defaultValue: TREATMENT_LABELS[opt] })}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

/* ── ATE stat pill ───────────────────────────────────────────────────────── */
const AtePill: React.FC<{
  label:   string;
  value:   string;
  sub?:    string;
  color?:  string;
  iconBg?: string;
  Icon:    React.ComponentType<{ size?: number; strokeWidth?: number }>;
}> = ({ label, value, sub, color = "var(--p-ink-muted)", iconBg = "var(--p-surface-3)", Icon }) => (
  <div style={{
    display:        "flex",
    alignItems:     "center",
    gap:            10,
    padding:        "10px 16px",
    background:     "var(--p-surface-1)",
    border:         "1px solid var(--p-hairline)",
    borderRadius:   "var(--radius-lg)",
    boxShadow:      "inset 0 1px 0 rgba(255,255,255,0.04)",
    flex:           "1 1 0",
    minWidth:       0,
  }}>
    <div style={{
      width: 32, height: 32, borderRadius: "var(--radius-sm)",
      background: iconBg, border: `1px solid ${color}22`,
      display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
    }}>
      <Icon size={14} strokeWidth={1.8} color={color} />
    </div>
    <div style={{ minWidth: 0 }}>
      <div style={{
        fontSize: 10, fontWeight: 500, letterSpacing: "0.4px",
        textTransform: "uppercase", color: "var(--p-ink-tertiary)",
        fontFamily: "var(--font-body)", marginBottom: 3,
      }}>
        {label}
      </div>
      <div style={{
        fontFamily: "var(--font-mono)", fontSize: 15, fontWeight: 600,
        color, letterSpacing: "-0.2px", lineHeight: 1,
      }}>
        {value}
      </div>
      {sub && (
        <div style={{
          fontSize: 10, color: "var(--p-ink-tertiary)",
          fontFamily: "var(--font-body)", marginTop: 2,
        }}>
          {sub}
        </div>
      )}
    </div>
  </div>
);

/* ── Cluster legend badge ─────────────────────────────────────────────────── */
const ClusterBadge: React.FC<{ cluster: HeterogeneityCluster }> = ({ cluster }) => {
  const { t } = useTranslation();
  const { hex, bg, border } = CLUSTER_CONFIG[cluster];
  const label = t(`causal.clusters.${cluster}`, { defaultValue: CLUSTER_CONFIG[cluster].label });
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "2px 7px", borderRadius: "var(--radius-pill)",
      background: bg, border: `1px solid ${border}`,
      fontSize: 10, fontWeight: 500, color: hex,
      fontFamily: "var(--font-body)", whiteSpace: "nowrap",
    }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: hex, flexShrink: 0 }} />
      {label}
    </span>
  );
};

/* ── 95% CI bar ──────────────────────────────────────────────────────────── */
const CIBar: React.FC<{
  lower:  number;   // e.g. −0.38
  upper:  number;   // e.g. −0.20
  point:  number;   // CATE point estimate
}> = ({ lower, upper, point }) => {
  // Render within a fixed domain [−0.40, +0.25]
  const domainMin = -0.40;
  const domainMax =  0.25;
  const domainWidth = domainMax - domainMin;

  const barLeft  = ((lower - domainMin) / domainWidth) * 100;
  const barWidth = ((upper - lower)     / domainWidth) * 100;
  const dotLeft  = ((point - domainMin) / domainWidth) * 100;

  const isNegative = point < 0;
  const barColor   = isNegative ? "#4ade80" : "#f87171";

  return (
    <div style={{
      position: "relative", height: 8, width: 120,
      background: "var(--p-hairline-strong)", borderRadius: "var(--radius-pill)",
    }}>
      {/* CI band */}
      <div style={{
        position: "absolute", top: 0, height: "100%",
        left:   `${Math.max(0, barLeft)}%`,
        width:  `${Math.min(barWidth, 100 - Math.max(0, barLeft))}%`,
        background: `${barColor}50`,
        borderRadius: "var(--radius-pill)",
      }} />
      {/* Zero-line hairline */}
      <div style={{
        position: "absolute", top: 0, bottom: 0, width: 1,
        left: `${((-domainMin) / domainWidth) * 100}%`,
        background: "var(--p-hairline-tertiary)",
      }} />
      {/* Point estimate dot */}
      <div style={{
        position: "absolute", top: "50%",
        left: `${Math.max(2, Math.min(dotLeft, 98))}%`,
        transform: "translate(-50%, -50%)",
        width: 6, height: 6, borderRadius: "50%",
        background: barColor,
        boxShadow: `0 0 4px ${barColor}`,
        zIndex: 1,
      }} />
    </div>
  );
};

/* ── ARR delta cell ──────────────────────────────────────────────────────── */
const ArrDeltaCell: React.FC<{ delta: number }> = ({ delta }) => {
  const isPositive = delta > 0;
  const color = isPositive ? "#4ade80" : delta < 0 ? "#f87171" : "var(--p-ink-subtle)";
  const Icon  = isPositive ? TrendingUp : delta < 0 ? TrendingDown : Minus;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600,
      color, whiteSpace: "nowrap",
    }}>
      <Icon size={10} strokeWidth={2.5} />
      {isPositive ? "+" : ""}{formatCurrency(delta)}
    </span>
  );
};

/* ── Treatment received badge ────────────────────────────────────────────── */
const TreatmentBadge: React.FC<{ received: boolean }> = ({ received }) => {
  const { t } = useTranslation();
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 3,
      padding: "2px 7px", borderRadius: "var(--radius-pill)",
      background: received ? "rgba(39,166,68,0.08)" : "rgba(98,102,109,0.10)",
      border:     received ? "1px solid rgba(39,166,68,0.20)" : "1px solid rgba(98,102,109,0.18)",
      fontSize: 10, fontWeight: 500,
      color:    received ? "#4ade80" : "var(--p-ink-tertiary)",
      fontFamily: "var(--font-mono)",
    }}>
      {received ? <CheckCircle2 size={9} strokeWidth={2.5} /> : <Minus size={9} strokeWidth={2} />}
      {received ? t("causal.status.treated") : t("causal.status.control")}
    </span>
  );
};

/* =============================================================================
   MAIN VIEW
============================================================================= */

const computeHistogram = (cates: {cate: number}[]) => {
  const bins = [
    { bucket: "≤−0.30", midpoint: -0.325, count:  0, threshold: -0.3 },
    { bucket: "−0.25",  midpoint: -0.275, count: 0, threshold: -0.25 },
    { bucket: "−0.20",  midpoint: -0.225, count: 0, threshold: -0.20 },
    { bucket: "−0.15",  midpoint: -0.175, count: 0, threshold: -0.15 },
    { bucket: "−0.10",  midpoint: -0.125, count: 0, threshold: -0.10 },
    { bucket: "−0.05",  midpoint: -0.075, count: 0, threshold: -0.05 },
    { bucket: "~0.00",  midpoint:  0.000, count: 0, threshold: 0.00 },
    { bucket: "+0.05",  midpoint:  0.025, count: 0, threshold: 0.05 },
    { bucket: "+0.10",  midpoint:  0.075, count: 0, threshold: 0.10 },
    { bucket: "+0.15",  midpoint:  0.125, count: 0, threshold: 0.15 },
    { bucket: "+0.20",  midpoint:  0.175, count: 0, threshold: 0.20 },
    { bucket: ">+0.20", midpoint:  0.225, count: 0, threshold: Infinity },
  ];

  cates.forEach(c => {
    for (let i = 0; i < bins.length; i++) {
      if (c.cate <= bins[i].threshold || i === bins.length - 1) {
        bins[i].count++;
        break;
      }
    }
  });
  return bins;
};

export const CausalEngineView: React.FC = () => {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const [treatment, setTreatment] = useState<TreatmentType>("DISCOUNT_APPLIED");
  const [isRefreshing, setIsRefreshing] = useState(false);

  const { data, isLoading, refetch } = useCounterfactualQuery(treatment);

  const isOffline = !data || data.data_availability === "OFFLINE";

  const summary = isOffline ? TREATMENT_SUMMARIES[treatment] : {
    ate: data.average_treatment_effect,
    ate_lower_ci: data.average_treatment_effect - 0.05,
    ate_upper_ci: data.average_treatment_effect + 0.05,
    engine_mode: data.engine_mode,
    n_treated: data.n_treated_customers,
    n_control: data.n_control_customers,
    outcome_r2: data.nuisance_metrics.outcome_model_r2,
    propensity_auroc: data.nuisance_metrics.treatment_model_auroc,
    total_foregone_arr: data.total_foregone_arr,
    overall_confidence: data.overall_confidence
  };

  const heteroPoints = isOffline ? HETEROGENEITY_DATA[treatment] : data.heterogeneity_map.map(h => ({
    cluster: h.cluster_label,
    label: CLUSTER_CONFIG[h.cluster_label]?.label || h.cluster_label,
    mean_arr_k: h.mean_arr / 1000,
    mean_cate: h.mean_cate,
    n_customers: h.n_customers,
    total_arr_m: h.total_arr / 1000000,
    segments: h.segments_represented.join(", "),
    strategic_note: h.strategic_note
  }));

  const histBuckets = isOffline ? HISTOGRAM_DATA[treatment] : computeHistogram(data.cate_estimates);

  const tableRows = isOffline ? CATE_TABLE_ROWS : data.cate_estimates.map((c, i) => {
    // Map integer segments to strings
    const segMap: Record<string, any> = { "0": "Enterprise", "1": "Mid-Market", "2": "SMB" };
    const segName = segMap[String(c.segment)] || c.segment || "SMB";

    return {
      rank: i + 1,
      customer_id: c.customer_id,
      customer_name: c.customer_name,
      segment: segName,
      treatment_received: c.treatment_received,
      cate: c.cate,
      ci_lower: c.cate_lower_ci,
      ci_upper: c.cate_upper_ci,
      arr: c.arr,
      arr_delta: c.counterfactual_arr_delta,
      cluster: c.effect_heterogeneity
    };
  });

  const engineConf    = ENGINE_CONFIG[summary.engine_mode];

  /* ── Scatter series — one series per cluster ─────────────────────────────── */
  const scatterSeries = useMemo(
    () =>
      heteroPoints.map((p) => ({
        category: t(`causal.clusters.${p.cluster}`, { defaultValue: p.label }),
        x: p.mean_arr_k,
        y: +(p.mean_cate * 100).toFixed(2),
        size: p.n_customers,
      })),
    [heteroPoints, t]
  );

  const scatterColors = useMemo(
    () => heteroPoints.map((p) => CLUSTER_CONFIG[p.cluster].tremorColor),
    [heteroPoints]
  ) as string[];

  /* ── Histogram shaped for Tremor BarChart ────────────────────────────────── */
  // Tremor BarChart: data is array of objects; categories = ["count"]
  // We colour negative bars emerald and positive bars red by splitting into two series
  const beneficialLabel = t("causal.beneficialShort", { defaultValue: "Beneficial" });
  const harmfulLabel = t("causal.harmfulShort", { defaultValue: "Harmful" });
  const histDataNeg = useMemo(
    () =>
      histBuckets.map((b) => ({
        bucket:       b.bucket,
        [beneficialLabel]: b.midpoint < 0 ? b.count : 0,
        [harmfulLabel]:    b.midpoint >= 0 ? b.count : 0,
      })),
    [histBuckets, beneficialLabel, harmfulLabel]
  );

  const handleRefresh = () => {
    setIsRefreshing(true);
    refetch().finally(() => setTimeout(() => setIsRefreshing(false), 1100));
  };

  /* ── Table header cell style ─────────────────────────────────────────────── */
  const TH: React.CSSProperties = {
    fontFamily:    "var(--font-body)",
    fontSize:      10,
    fontWeight:    500,
    letterSpacing: "0.5px",
    textTransform: "uppercase",
    color:         "var(--p-ink-tertiary)",
    padding:       "8px 12px",
    borderBottom:  "1px solid var(--p-hairline)",
    whiteSpace:    "nowrap",
    background:    "var(--p-surface-1)",
  };

  const TD: React.CSSProperties = {
    padding:       "10px 12px",
    borderBottom:  "1px solid var(--p-hairline)",
    verticalAlign: "middle",
  };

  if (!isLoading && isOffline) {
    return (
      <div
        className="animate-fade-in"
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "70vh",
          padding: "var(--spacing-xl)",
          textAlign: "center",
          maxWidth: 600,
          margin: "0 auto",
          width: "100%",
        }}
      >
        <div
          style={{
            width: 80,
            height: 80,
            borderRadius: "50%",
            background: "linear-gradient(135deg, rgba(94,106,210,0.15) 0%, rgba(94,106,210,0.02) 100%)",
            border: "1px solid rgba(94,106,210,0.25)",
            boxShadow: "0 0 40px rgba(94, 106, 210, 0.15)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 24,
          }}
        >
          <Atom size={32} color="var(--p-primary-hover)" />
        </div>
        <h2
          style={{
            fontSize: 22,
            fontWeight: 600,
            color: "var(--p-ink)",
            marginBottom: 12,
            fontFamily: "var(--font-display)",
            letterSpacing: "-0.5px",
          }}
        >
          {t("common.emptyState.title")}
        </h2>
        <p
          style={{
            fontSize: 14,
            color: "var(--p-ink-tertiary)",
            lineHeight: 1.6,
            marginBottom: 32,
            fontFamily: "var(--font-body)",
          }}
        >
          {t("common.emptyState.description")}
        </p>
        <button
          className="btn btn-primary"
          onClick={() => navigate("/data-workspace")}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 24px",
            fontSize: 14,
          }}
        >
          {t("common.emptyState.action")}
          <ArrowRight size={16} style={{ transform: i18n.dir() === "rtl" ? "rotate(180deg)" : "none" }} />
        </button>
      </div>
    );
  }

  const ateIsNegative = summary.ate < 0;  // negative CATE = treatment helped
  const ateColor = ateIsNegative ? "#4ade80" : "#f87171";

  return (
    <div
      className="animate-fade-in"
      style={{
        padding:       "var(--spacing-lg)",
        display:       "flex",
        flexDirection: "column",
        gap:           "var(--spacing-lg)",
        maxWidth:      1640,
        margin:        "0 auto",
        width:         "100%",
      }}
    >
      {/* ═══════════════════════════════════════════════════════════════════════
          PAGE HEADER
      ════════════════════════════════════════════════════════════════════════ */}
      <div style={{
        display: "flex", alignItems: "flex-start",
        justifyContent: "space-between", gap: 20, flexWrap: "wrap",
      }}>
        {/* Left: title block */}
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 5 }}>
            <div style={{
              width: 30, height: 30, borderRadius: "var(--radius-sm)",
              background: "rgba(94,106,210,0.12)", border: "1px solid rgba(94,106,210,0.22)",
              display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
            }}>
              <Atom size={15} color="var(--p-primary-hover)" strokeWidth={1.6} />
            </div>
            <h1 className="t-headline" style={{ color: "var(--p-ink)", margin: 0 }}>
              {t("causal.title")}
            </h1>
            {/* Engine mode badge */}
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 4,
              padding: "3px 9px", borderRadius: "var(--radius-pill)",
              background: engineConf.bg, border: `1px solid ${engineConf.border}`,
              fontSize: 10, fontWeight: 600, letterSpacing: "0.4px",
              textTransform: "uppercase", color: engineConf.color,
              fontFamily: "var(--font-mono)",
            }}>
              {t(`causal.engineModes.${summary.engine_mode}`, { defaultValue: engineConf.label })}
            </span>
          </div>
          <p style={{
            fontSize: 13, color: "var(--p-ink-tertiary)", margin: 0,
            fontFamily: "var(--font-body)", lineHeight: 1.5,
          }}>
            {t("causal.subtitle")}
          </p>
        </div>

        {/* Right: treatment selector + refresh */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{
            fontSize: 12, color: "var(--p-ink-tertiary)", fontFamily: "var(--font-body)",
            whiteSpace: "nowrap",
          }}>
            {t("causal.treatment")}
          </span>
          <TreatmentDropdown value={treatment} onChange={setTreatment} />
          <button
            className="btn-icon"
            onClick={handleRefresh}
            title={t("causal.reEstimate")}
            style={{ color: isRefreshing ? "var(--p-primary-hover)" : undefined }}
          >
            <RefreshCw
              size={14}
              style={{ animation: isRefreshing ? "spin 0.9s linear infinite" : "none" }}
            />
          </button>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          ATE SUMMARY STRIP
      ════════════════════════════════════════════════════════════════════════ */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {/* ATE value */}
        <AtePill
          label={t("causal.avgTreatmentEffect")}
          value={formatCate(summary.ate)}
          sub={t("causal.ateCI", { lower: formatCate(summary.ate_lower_ci), upper: formatCate(summary.ate_upper_ci) })}
          color={ateColor}
          iconBg={ateIsNegative ? "rgba(39,166,68,0.10)" : "rgba(229,72,77,0.10)"}
          Icon={ateIsNegative ? TrendingDown : TrendingUp}
        />
        {/* Foregone ARR */}
        <AtePill
          label={t("causal.totalForegoneArr")}
          value={formatCurrency(summary.total_foregone_arr)}
          sub={t("causal.subOptimalInterventions")}
          color="#828fff"
          iconBg="rgba(94,106,210,0.10)"
          Icon={BarChart2}
        />
        {/* Sample */}
        <AtePill
          label={t("causal.treatedControl")}
          value={`${summary.n_treated} / ${summary.n_control}`}
          sub={t("causal.nCustomers", { count: summary.n_treated + summary.n_control })}
          color="var(--p-ink-muted)"
          iconBg="var(--p-surface-2)"
          Icon={Users}
        />
        {/* Nuisance quality */}
        <AtePill
          label={t("causal.outcomeR2Auroc")}
          value={`${summary.outcome_r2.toFixed(2)} / ${summary.propensity_auroc.toFixed(2)}`}
          sub={t("causal.nuisanceModelQuality")}
          color={summary.outcome_r2 > 0.5 ? "#4ade80" : "#fbbf24"}
          iconBg={summary.outcome_r2 > 0.5 ? "rgba(39,166,68,0.10)" : "rgba(232,163,10,0.10)"}
          Icon={Info}
        />
        {/* Confidence */}
        <div style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "10px 14px",
          background: "var(--p-surface-1)",
          border: "1px solid var(--p-hairline)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
        }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", flexShrink: 0,
            background: CONFIDENCE_COLOR[summary.overall_confidence],
            boxShadow: `0 0 6px ${CONFIDENCE_COLOR[summary.overall_confidence]}`,
          }} />
          <div>
            <div style={{
              fontSize: 10, fontWeight: 500, letterSpacing: "0.4px",
              textTransform: "uppercase", color: "var(--p-ink-tertiary)",
              fontFamily: "var(--font-body)",
            }}>
              {t("causal.confidence")}
            </div>
            <div style={{
              fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 600,
              color: CONFIDENCE_COLOR[summary.overall_confidence],
            }}>
              {t(`causal.confidenceLevels.${summary.overall_confidence}`, { defaultValue: summary.overall_confidence })}
            </div>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          MID ROW — Scatter + Histogram
      ════════════════════════════════════════════════════════════════════════ */}
      <div style={{ display: "flex", gap: "var(--spacing-lg)", alignItems: "stretch" }}>

        {/* ── LEFT: Heterogeneity Map (40%) ───────────────────────────────── */}
        <div style={{
          flex:          "0 0 40%",
          minWidth:      0,
          background:    "var(--p-surface-1)",
          border:        "1px solid var(--p-hairline)",
          borderRadius:  "var(--radius-xl)",
          padding:       "20px 22px",
          boxShadow:     "inset 0 1px 0 rgba(255,255,255,0.04)",
          display:       "flex",
          flexDirection: "column",
          gap:           14,
        }}>
          <ZoneHeader
            title={t("causal.mapTitle")}
            subtitle={t("causal.mapSubtitle")}
            action={
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {(Object.keys(CLUSTER_CONFIG) as HeterogeneityCluster[]).map((k) => {
                  const { hex, bg, border } = CLUSTER_CONFIG[k];
                  const label = t(`causal.clusters.${k}`, { defaultValue: CLUSTER_CONFIG[k].label });
                  return (
                    <span key={k} style={{
                      display: "inline-flex", alignItems: "center", gap: 4,
                      padding: "2px 7px", borderRadius: "var(--radius-pill)",
                      background: bg, border: `1px solid ${border}`,
                      fontSize: 9, fontWeight: 500, color: hex,
                      fontFamily: "var(--font-body)",
                    }}>
                      <span style={{ width: 5, height: 5, borderRadius: "50%", background: hex }} />
                      {label}
                    </span>
                  );
                })}
              </div>
            }
          />

          <div style={{ flex: 1, minHeight: 280 }} dir="ltr">
            <ScatterChart
              className="h-72"
              data={scatterSeries}
              category="category"
              x="x"
              y="y"
              size="size"
              colors={scatterColors}
              valueFormatter={{
                x: (v: number) => `$${v.toFixed(0)}K`,
                y: (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(1)}pp`,
                size: (v: number) => t("causal.nCustomersScatter", { count: v })
              }}
              showLegend={false}
              showGridLines={true}
              autoMinXValue={true}
              autoMinYValue={true}
            />
          </div>

          {/* Cluster detail rows */}
          <div style={{ display: "flex", flexDirection: "column", gap: 0, borderTop: "1px solid var(--p-hairline)", paddingTop: 12 }}>
            {heteroPoints.map((p, i) => {
              const cfg = CLUSTER_CONFIG[p.cluster];
              const isLast = i === heteroPoints.length - 1;
              return (
                <div
                  key={p.cluster}
                  style={{
                    display:       "flex",
                    alignItems:    "center",
                    justifyContent:"space-between",
                    gap:           8,
                    padding:       "7px 0",
                    borderBottom:  isLast ? "none" : "1px solid var(--p-hairline)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
                    <span style={{
                      width: 8, height: 8, borderRadius: "50%",
                      background: cfg.hex, flexShrink: 0,
                      boxShadow: `0 0 5px ${cfg.hex}80`,
                    }} />
                    <span style={{
                      fontSize: 11, fontWeight: 500, color: "var(--p-ink-muted)",
                      fontFamily: "var(--font-body)", whiteSpace: "nowrap",
                    }}>
                      {t(`causal.clusters.${p.cluster}`, { defaultValue: p.label })}
                    </span>
                    <span style={{ fontSize: 10, color: "var(--p-ink-tertiary)", fontFamily: "var(--font-body)" }}>
                      {p.segments}
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
                    <span style={{
                      fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600,
                      color: p.mean_cate < 0 ? "#4ade80" : "#f87171",
                    }}>
                      {p.mean_cate >= 0 ? "+" : ""}{(p.mean_cate * 100).toFixed(1)}pp
                    </span>
                    <span style={{
                      fontSize: 10, color: "var(--p-ink-tertiary)",
                      fontFamily: "var(--font-mono)", whiteSpace: "nowrap",
                    }}>
                      n={p.n_customers}
                    </span>
                    <span style={{
                      fontSize: 10, color: "var(--p-ink-tertiary)",
                      fontFamily: "var(--font-mono)", whiteSpace: "nowrap",
                    }}>
                      ${p.total_arr_m.toFixed(1)}M
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── RIGHT: CATE Distribution Histogram (60%) ────────────────────── */}
        <div style={{
          flex:          "1 1 0",
          minWidth:      0,
          background:    "var(--p-surface-1)",
          border:        "1px solid var(--p-hairline)",
          borderRadius:  "var(--radius-xl)",
          padding:       "20px 22px",
          boxShadow:     "inset 0 1px 0 rgba(255,255,255,0.04)",
          display:       "flex",
          flexDirection: "column",
          gap:           14,
        }}>
          <ZoneHeader
            title={t("causal.distTitle")}
            subtitle={t("causal.distSubtitle", { count: summary.n_treated + summary.n_control, treatment: t(`causal.treatments.${treatment}`, { defaultValue: TREATMENT_LABELS[treatment] }) })}
            action={
              <div style={{ display: "flex", gap: 10 }}>
                <span style={{
                  display: "inline-flex", alignItems: "center", gap: 4,
                  fontSize: 10, fontWeight: 500, color: "#4ade80",
                  fontFamily: "var(--font-body)",
                }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: "#4ade8060", border: "1px solid #4ade8090", flexShrink: 0 }} />
                  {t("causal.beneficial")}
                </span>
                <span style={{
                  display: "inline-flex", alignItems: "center", gap: 4,
                  fontSize: 10, fontWeight: 500, color: "#f87171",
                  fontFamily: "var(--font-body)",
                }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: "#f8717160", border: "1px solid #f8717190", flexShrink: 0 }} />
                  {t("causal.harmful")}
                </span>
              </div>
            }
          />

          {/* ATE annotation line */}
          <div style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "8px 12px",
            background: `${ateColor}0a`,
            border: `1px solid ${ateColor}22`,
            borderRadius: "var(--radius-md)",
            marginBottom: 2,
          }}>
            <div style={{ width: 20, height: 2, background: ateColor, flexShrink: 0 }} />
            <span style={{
              fontSize: 11, color: "var(--p-ink-tertiary)",
              fontFamily: "var(--font-body)",
            }}>
              {t("causal.ateEqual", { ate: formatCate(summary.ate) })}
              {" "}· {t("causal.ateCI", { lower: formatCate(summary.ate_lower_ci), upper: formatCate(summary.ate_upper_ci) })}
              {" "}· {ateIsNegative ? t("causal.ateReduces") : t("causal.ateIncreases")}
            </span>
          </div>

          <div style={{ flex: 1, minHeight: 288, overflowX: "hidden" }} dir="ltr">
            <div style={{
              fontSize: 10,
              color: "var(--p-ink-tertiary)",
              fontFamily: "var(--font-mono)",
              textTransform: "uppercase",
              letterSpacing: "0.4px",
              marginBottom: 6,
              paddingLeft: 4,
            }}>
              ↑ {t("causal.customersCount")}
            </div>
            <BarChart
              className="h-72"
              data={histDataNeg}
              index="bucket"
              categories={[beneficialLabel, harmfulLabel]}
              colors={["emerald", "red"]}
              showLegend={false}
              showGridLines={true}
              valueFormatter={(v: number) => `${v}`}
              stack={true}
            />
          </div>

          {/* Distribution summary */}
          <div style={{
            display:    "flex",
            gap:        16,
            paddingTop: 10,
            borderTop:  "1px solid var(--p-hairline)",
            flexWrap:   "wrap",
          }}>
            {[
              {
                label: t("causal.beneficial"),
                value: histBuckets.filter((b) => b.midpoint < 0).reduce((s, b) => s + b.count, 0),
                color: "#4ade80",
              },
              {
                label: t("causal.harmful"),
                value: histBuckets.filter((b) => b.midpoint >= 0).reduce((s, b) => s + b.count, 0),
                color: "#f87171",
              },
              {
                label: t("causal.nearZero"),
                value: histBuckets.filter((b) => Math.abs(b.midpoint) < 0.05).reduce((s, b) => s + b.count, 0),
                color: "var(--p-ink-subtle)",
              },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <span style={{
                  fontSize: 10, letterSpacing: "0.3px", textTransform: "uppercase",
                  color: "var(--p-ink-tertiary)", fontFamily: "var(--font-body)", fontWeight: 500,
                }}>
                  {label}
                </span>
                <span style={{
                  fontFamily: "var(--font-mono)", fontSize: 18, fontWeight: 600, color,
                  letterSpacing: "-0.5px",
                }}>
                  {value}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          BOTTOM — Customer CATE Table
      ════════════════════════════════════════════════════════════════════════ */}
      <section>
        <ZoneHeader
          title={t("causal.tableTitle")}
          subtitle={t("causal.tableSubtitle")}
          action={
            <span style={{
              fontFamily: "var(--font-mono)", fontSize: 11,
              color: "var(--p-ink-tertiary)",
              display: "flex", alignItems: "center", gap: 5,
            }}>
              <CheckCircle2 size={11} color="var(--p-success)" strokeWidth={2.5} />
              {t("causal.tableBadge", { count: tableRows.length })}
            </span>
          }
        />

        <div style={{
          background:   "var(--p-surface-1)",
          border:       "1px solid var(--p-hairline)",
          borderRadius: "var(--radius-xl)",
          overflow:     "hidden",
          boxShadow:    "inset 0 1px 0 rgba(255,255,255,0.04)",
        }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 920 }}>
              <thead>
                <tr>
                  <th style={{ ...TH, width: 44, textAlign: "center" }}>{t("causal.headers.rank")}</th>
                  <th style={TH}>{t("causal.headers.customer")}</th>
                  <th style={TH}>{t("causal.headers.segment")}</th>
                  <th style={TH}>{t("causal.headers.status")}</th>
                  <th style={{ ...TH, textAlign: "right" }}>{t("causal.headers.arr")}</th>
                  <th style={{ ...TH, textAlign: "right" }}>{t("causal.headers.cate")}</th>
                  <th style={TH}>{t("causal.headers.ciBar")}</th>
                  <th style={{ ...TH, textAlign: "right" }}>{t("causal.headers.arrDelta")}</th>
                  <th style={TH}>{t("causal.headers.response")}</th>
                </tr>
              </thead>
              <tbody>
                {tableRows.map((row, idx) => {
                  const isLast  = idx === tableRows.length - 1;
                  const seg     = SEGMENT_STYLE[row.segment];
                  const cateNeg = row.cate < 0;
                  const cateColor = cateNeg ? "#4ade80" : Math.abs(row.cate) < 0.02
                    ? "var(--p-ink-subtle)" : "#f87171";

                  return (
                    <tr
                      key={row.customer_id}
                      style={{
                        background: idx % 2 === 0 ? "transparent" : "rgba(255,255,255,0.01)",
                        transition: "background 100ms ease",
                      }}
                      onMouseEnter={(e) =>
                        ((e.currentTarget as HTMLElement).style.background = "rgba(94,106,210,0.04)")
                      }
                      onMouseLeave={(e) =>
                        ((e.currentTarget as HTMLElement).style.background =
                          idx % 2 === 0 ? "transparent" : "rgba(255,255,255,0.01)")
                      }
                    >
                      {/* Rank */}
                      <td style={{ ...TD, borderBottom: isLast ? "none" : TD.borderBottom, textAlign: "center" }}>
                        <span style={{
                          fontFamily: "var(--font-mono)", fontSize: 11,
                          color: row.rank <= 6 ? "var(--p-primary-hover)" : "var(--p-ink-tertiary)",
                          fontWeight: row.rank <= 6 ? 600 : 400,
                        }}>
                          {row.rank}
                        </span>
                      </td>

                      {/* Customer */}
                      <td style={{ ...TD, borderBottom: isLast ? "none" : TD.borderBottom }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                          <span style={{
                            fontSize: 12, fontWeight: 500, color: "var(--p-ink-muted)",
                            fontFamily: "var(--font-body)", whiteSpace: "nowrap",
                          }}>
                            {row.customer_name}
                          </span>
                          <span style={{
                            fontSize: 10, color: "var(--p-ink-tertiary)",
                            fontFamily: "var(--font-mono)",
                          }}>
                            {row.customer_id}
                          </span>
                        </div>
                      </td>

                      {/* Segment */}
                      <td style={{ ...TD, borderBottom: isLast ? "none" : TD.borderBottom }}>
                        <span style={{
                          display: "inline-flex", alignItems: "center",
                          padding: "2px 8px", borderRadius: "var(--radius-pill)",
                          fontSize: 11, fontWeight: 500,
                          background: seg.bg, color: seg.text, border: `1px solid ${seg.border}`,
                          fontFamily: "var(--font-body)", whiteSpace: "nowrap",
                        }}>
                          {tSegment(row.segment)}
                        </span>
                      </td>

                      {/* Treatment status */}
                      <td style={{ ...TD, borderBottom: isLast ? "none" : TD.borderBottom }}>
                        <TreatmentBadge received={row.treatment_received} />
                      </td>

                      {/* ARR */}
                      <td style={{ ...TD, borderBottom: isLast ? "none" : TD.borderBottom, textAlign: "right" }}>
                        <span style={{
                          fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 500,
                          color: "var(--p-ink-muted)", letterSpacing: "-0.2px",
                        }}>
                          {formatCurrency(row.arr)}
                        </span>
                      </td>

                      {/* CATE */}
                      <td style={{ ...TD, borderBottom: isLast ? "none" : TD.borderBottom, textAlign: "right" }}>
                        <span style={{
                          fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700,
                          color: cateColor, letterSpacing: "-0.2px", whiteSpace: "nowrap",
                        }}>
                          {row.cate >= 0 ? "+" : ""}{pct(row.cate)}
                        </span>
                      </td>

                      {/* 95% CI Bar */}
                      <td style={{ ...TD, borderBottom: isLast ? "none" : TD.borderBottom }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                          <CIBar lower={row.ci_lower} upper={row.ci_upper} point={row.cate} />
                          <span style={{
                            fontFamily: "var(--font-mono)", fontSize: 9,
                            color: "var(--p-ink-tertiary)", whiteSpace: "nowrap",
                          }}>
                            [{pct(row.ci_lower)}, {pct(row.ci_upper)}]
                          </span>
                        </div>
                      </td>

                      {/* ARR delta */}
                      <td style={{ ...TD, borderBottom: isLast ? "none" : TD.borderBottom, textAlign: "right" }}>
                        <ArrDeltaCell delta={row.arr_delta} />
                      </td>

                      {/* Cluster */}
                      <td style={{ ...TD, borderBottom: isLast ? "none" : TD.borderBottom }}>
                        <ClusterBadge cluster={row.cluster} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Table footer */}
          <div style={{
            padding:        "10px 16px",
            borderTop:      "1px solid var(--p-hairline)",
            display:        "flex",
            alignItems:     "center",
            justifyContent: "space-between",
            flexWrap:       "wrap",
            gap:            8,
          }}>
            <span style={{ fontSize: 11, color: "var(--p-ink-tertiary)", fontFamily: "var(--font-body)" }}>
              {t("causal.footerShowing", {
                count: tableRows.length,
                engineMode: t(`causal.engineModes.${summary.engine_mode}` as any, { defaultValue: summary.engine_mode }),
                total: summary.n_treated + summary.n_control
              })}
            </span>
            <span style={{ fontSize: 11, color: "var(--p-ink-tertiary)", fontFamily: "var(--font-mono)" }}>
              {t("causal.footerAte")}&nbsp;
              <span style={{ color: ateColor, fontWeight: 600 }}>
                {formatCate(summary.ate)}
              </span>
              &nbsp;·&nbsp;R²&nbsp;
              <span style={{ color: summary.outcome_r2 > 0.5 ? "#4ade80" : "#fbbf24" }}>
                {summary.outcome_r2.toFixed(2)}
              </span>
              &nbsp;·&nbsp;AUROC&nbsp;
              <span style={{ color: "#828fff" }}>
                {summary.propensity_auroc.toFixed(2)}
              </span>
            </span>
          </div>
        </div>
      </section>

      {/* ── Keyframe inject ──────────────────────────────────────────────────── */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default CausalEngineView;

/**
 * src/views/Pipeline/PipelineView.tsx
 *
 * Predicto V3 — Pipeline (Sales Ops)
 * Linear dark aesthetic · Tremor v3 · Tailwind v4
 *
 * ─── Layout ──────────────────────────────────────────────────────────────────
 *   Header strip   — 4 × summary KPI pills (ARR at stake, high-priority count, …)
 *   Filter bar     — Segment / Rep / Signal / ARR range filters
 *   Body (2-col)
 *     Left  70%    — Deal Priority Table (Tremor Table + ProgressBar)
 *     Right 30%    — Deal Scorer Form (Tremor Select + NumberInput + Button)
 *                    + Score result card (glassmorphic)
 *   Bottom panel   — Rep Playbooks (Tremor ScatterChart: Discount % vs Win Rate)
 *
 * All data is inline mock — field names mirror real API shapes so swapping
 * in live data requires only replacing const declarations with query hooks.
 */

import React, { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { tSegment } from "@/lib/personaMapping";
// query imports removed for stability
import {
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Zap,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  ArrowUpDown,
  Filter,
  RefreshCw,
  Target,
  DollarSign,
  Clock,
  Award,
  Loader2,
  X,
  CheckCircle2,
  Info,
  ArrowRight,
} from "lucide-react";

/* =============================================================================
   TYPES
============================================================================= */

type DealSignalType =
  | "DISCOUNT_CLIFF"
  | "MARGIN_PRESSURE"
  | "LONG_CYCLE"
  | "HIGH_PRIORITY"
  | "EXPANSION_READY"
  | "EXEC_SPONSOR_MISSING"
  | "RENEWAL_RISK"
  | "GENERIC";

type WinLossStatus = "Open" | "Closed_Won" | "Closed_Lost";
type Segment       = "Enterprise" | "Mid-Market" | "SMB";
type SortField     = "priority_score" | "arr" | "win_probability" | "sales_cycle_days";
type SortDir       = "asc" | "desc";

interface DealRecord {
  deal_id:                   string;
  deal_name:                 string;
  company:                   string;
  segment:                   Segment;
  arr:                       number;
  mrr:                       number;
  priority_score:            number;   // 0–100
  win_probability:           number;   // 0–1
  top_signal_type:           DealSignalType;
  top_signal_description:    string;
  recommended_action:        string;
  sales_rep:                 string;
  sales_cycle_days:          number;
  discount_percentage:       number;   // 0–1
  margin_rate:               number;   // 0–1
  executive_sponsor_attached: boolean;
  industry:                  string;
  product:                   string;
  stage:                     string;
  close_date:                string;
  win_loss_status:           WinLossStatus;
}

interface RepRecord {
  rep_id:         string;
  rep_name:       string;
  win_rate:       number;   // 0–100
  avg_discount:   number;   // 0–100
  deals_open:     number;
  arr_pipeline:   number;
  top_tactic:     string;
  scatter_points: Array<{ x: number; y: number; z: number; deal: string }>;
}

interface DealScoreResult {
  predicted_margin_rate: number;
  safe_discount_ceiling: number;
  risk_level:            "LOW" | "MEDIUM" | "HIGH";
  recommended_action:    string;
}

/* =============================================================================
   ██████╗  █████╗ ████████╗ █████╗
   DATA MOCK — replace with useQuery hooks for production
============================================================================= */

const MOCK_DEALS: DealRecord[] = [
  {
    deal_id: "d-001", deal_name: "Orion Platform Expansion", company: "Orion Financial",
    segment: "Enterprise", arr: 480_000, mrr: 40_000, priority_score: 96,
    win_probability: 0.81, top_signal_type: "HIGH_PRIORITY",
    top_signal_description: "Exec sponsor confirmed, contract in legal review",
    recommended_action: "Accelerate legal review — schedule exec alignment call",
    sales_rep: "Sarah Chen", sales_cycle_days: 42, discount_percentage: 0.05,
    margin_rate: 0.78, executive_sponsor_attached: true, industry: "FinTech",
    product: "Predicto Enterprise", stage: "Contract", close_date: "2025-06-12",
    win_loss_status: "Open",
  },
  {
    deal_id: "d-002", deal_name: "Vanta Health — Core License", company: "Vanta Health",
    segment: "Enterprise", arr: 360_000, mrr: 30_000, priority_score: 91,
    win_probability: 0.74, top_signal_type: "DISCOUNT_CLIFF",
    top_signal_description: "Discount at 28% — ceiling breach in 4 days",
    recommended_action: "Reduce discount to ≤18%; introduce multi-year incentive",
    sales_rep: "Marcus Webb", sales_cycle_days: 88, discount_percentage: 0.28,
    margin_rate: 0.52, executive_sponsor_attached: false, industry: "HealthTech",
    product: "Predicto Pro", stage: "Negotiation", close_date: "2025-06-05",
    win_loss_status: "Open",
  },
  {
    deal_id: "d-003", deal_name: "Nexus Commerce — RevOps Suite", company: "Nexus Commerce",
    segment: "Mid-Market", arr: 142_000, mrr: 11_833, priority_score: 87,
    win_probability: 0.69, top_signal_type: "EXEC_SPONSOR_MISSING",
    top_signal_description: "No exec sponsor — deal stalled at VP level for 22 days",
    recommended_action: "Engage C-suite via LinkedIn; request exec-to-exec intro",
    sales_rep: "Priya Nair", sales_cycle_days: 56, discount_percentage: 0.12,
    margin_rate: 0.71, executive_sponsor_attached: false, industry: "E-Commerce",
    product: "Predicto Pro", stage: "Discovery", close_date: "2025-07-01",
    win_loss_status: "Open",
  },
  {
    deal_id: "d-004", deal_name: "Citadel Logistics — Analytics", company: "Citadel Logistics",
    segment: "Mid-Market", arr: 98_000, mrr: 8_167, priority_score: 82,
    win_probability: 0.66, top_signal_type: "HIGH_PRIORITY",
    top_signal_description: "High feature adoption in trial; NPS 9.1 from champion",
    recommended_action: "Send pricing proposal this week — champion is ready to sign",
    sales_rep: "James Okonkwo", sales_cycle_days: 31, discount_percentage: 0.08,
    margin_rate: 0.76, executive_sponsor_attached: true, industry: "Logistics",
    product: "Predicto Core", stage: "Proposal", close_date: "2025-06-18",
    win_loss_status: "Open",
  },
  {
    deal_id: "d-005", deal_name: "Meridian SaaS — Growth Plan", company: "Meridian SaaS",
    segment: "Mid-Market", arr: 86_000, mrr: 7_167, priority_score: 78,
    win_probability: 0.61, top_signal_type: "MARGIN_PRESSURE",
    top_signal_description: "Competitor (Clari) offering 35% discount — margin eroding",
    recommended_action: "Run CFR war-room scenario; counter with value-add bundle",
    sales_rep: "Sarah Chen", sales_cycle_days: 49, discount_percentage: 0.22,
    margin_rate: 0.58, executive_sponsor_attached: true, industry: "SaaS",
    product: "Predicto Pro", stage: "Negotiation", close_date: "2025-06-28",
    win_loss_status: "Open",
  },
  {
    deal_id: "d-006", deal_name: "Arctos Retail — Forecast Module", company: "Arctos Retail",
    segment: "SMB", arr: 24_000, mrr: 2_000, priority_score: 71,
    win_probability: 0.55, top_signal_type: "EXPANSION_READY",
    top_signal_description: "Monthly usage up 340%; requesting Forecast add-on demo",
    recommended_action: "Book expansion demo for this Friday with their RevOps lead",
    sales_rep: "Priya Nair", sales_cycle_days: 18, discount_percentage: 0.0,
    margin_rate: 0.83, executive_sponsor_attached: false, industry: "Retail",
    product: "Predicto Lite", stage: "Demo", close_date: "2025-06-22",
    win_loss_status: "Open",
  },
  {
    deal_id: "d-007", deal_name: "Polaris Insurance — Platform", company: "Polaris Insurance",
    segment: "Enterprise", arr: 520_000, mrr: 43_333, priority_score: 68,
    win_probability: 0.48, top_signal_type: "LONG_CYCLE",
    top_signal_description: "Day 112 — approaching LONG_CYCLE threshold; 3 stakeholders silent",
    recommended_action: "Escalate to AE manager; send personalised business case to CFO",
    sales_rep: "Marcus Webb", sales_cycle_days: 112, discount_percentage: 0.15,
    margin_rate: 0.67, executive_sponsor_attached: false, industry: "FinTech",
    product: "Predicto Enterprise", stage: "Evaluation", close_date: "2025-07-15",
    win_loss_status: "Open",
  },
  {
    deal_id: "d-008", deal_name: "Stratum EdTech — Core", company: "Stratum EdTech",
    segment: "SMB", arr: 18_400, mrr: 1_533, priority_score: 63,
    win_probability: 0.52, top_signal_type: "GENERIC",
    top_signal_description: "Standard pipeline deal — no anomalies detected",
    recommended_action: "Follow up on proposal sent 8 days ago",
    sales_rep: "James Okonkwo", sales_cycle_days: 24, discount_percentage: 0.10,
    margin_rate: 0.74, executive_sponsor_attached: false, industry: "Education",
    product: "Predicto Lite", stage: "Proposal", close_date: "2025-07-08",
    win_loss_status: "Open",
  },
  {
    deal_id: "d-009", deal_name: "Apex Manufacturing — BI", company: "Apex Manufacturing",
    segment: "Mid-Market", arr: 74_000, mrr: 6_167, priority_score: 59,
    win_probability: 0.44, top_signal_type: "RENEWAL_RISK",
    top_signal_description: "Contract renews in 38 days — no CSM touchpoint in 55 days",
    recommended_action: "Schedule QBR immediately; assign dedicated CSM",
    sales_rep: "Sarah Chen", sales_cycle_days: 67, discount_percentage: 0.18,
    margin_rate: 0.61, executive_sponsor_attached: true, industry: "Manufacturing",
    product: "Predicto Pro", stage: "Renewal", close_date: "2025-06-30",
    win_loss_status: "Open",
  },
  {
    deal_id: "d-010", deal_name: "Nova Logistics — Expansion", company: "Nova Logistics",
    segment: "Mid-Market", arr: 56_000, mrr: 4_667, priority_score: 54,
    win_probability: 0.41, top_signal_type: "DISCOUNT_CLIFF",
    top_signal_description: "Requested 32% discount — ceiling is 25% for this segment",
    recommended_action: "Hold at 25%; offer 24-month term as value anchor",
    sales_rep: "Priya Nair", sales_cycle_days: 38, discount_percentage: 0.32,
    margin_rate: 0.47, executive_sponsor_attached: false, industry: "Logistics",
    product: "Predicto Core", stage: "Negotiation", close_date: "2025-07-20",
    win_loss_status: "Open",
  },
  {
    deal_id: "d-011", deal_name: "Helios BioTech — RevOps", company: "Helios BioTech",
    segment: "Enterprise", arr: 310_000, mrr: 25_833, priority_score: 49,
    win_probability: 0.38, top_signal_type: "MARGIN_PRESSURE",
    top_signal_description: "Procurement pushing 40% discount after Q1 budget freeze",
    recommended_action: "Bring VP Sales into negotiation; reframe ROI vs. competitor",
    sales_rep: "Marcus Webb", sales_cycle_days: 95, discount_percentage: 0.38,
    margin_rate: 0.42, executive_sponsor_attached: false, industry: "HealthTech",
    product: "Predicto Enterprise", stage: "Negotiation", close_date: "2025-08-01",
    win_loss_status: "Open",
  },
  {
    deal_id: "d-012", deal_name: "Crest Fintech — Analytics Lite", company: "Crest Fintech",
    segment: "SMB", arr: 12_800, mrr: 1_067, priority_score: 42,
    win_probability: 0.33, top_signal_type: "LONG_CYCLE",
    top_signal_description: "Day 78 on an SMB deal — unusually long for this segment",
    recommended_action: "Trial extension offered; set hard deadline for decision",
    sales_rep: "James Okonkwo", sales_cycle_days: 78, discount_percentage: 0.05,
    margin_rate: 0.80, executive_sponsor_attached: false, industry: "FinTech",
    product: "Predicto Lite", stage: "Trial", close_date: "2025-07-25",
    win_loss_status: "Open",
  },
];

const MOCK_REPS: RepRecord[] = [
  {
    rep_id: "REP-001", rep_name: "Sarah Chen",
    win_rate: 72, avg_discount: 14, deals_open: 3, arr_pipeline: 706_000,
    top_tactic: "Executive alignment early in cycle",
    scatter_points: [
      { x: 5,  y: 82, z: 480, deal: "Orion Financial" },
      { x: 22, y: 65, z: 86,  deal: "Meridian SaaS"   },
      { x: 18, y: 61, z: 74,  deal: "Apex Manufacturing" },
      { x: 8,  y: 79, z: 210, deal: "Stratos ERP (Won)"  },
      { x: 12, y: 73, z: 340, deal: "Peak Capital (Won)" },
      { x: 25, y: 54, z: 95,  deal: "Dune Tech (Lost)"   },
      { x: 30, y: 48, z: 125, deal: "Atlas Retail (Lost)"},
    ],
  },
  {
    rep_id: "REP-002", rep_name: "Marcus Webb",
    win_rate: 58, avg_discount: 26, deals_open: 3, arr_pipeline: 1_190_000,
    top_tactic: "Multi-year term bundling",
    scatter_points: [
      { x: 28, y: 74, z: 360, deal: "Vanta Health"      },
      { x: 15, y: 67, z: 310, deal: "Helios BioTech"    },
      { x: 38, y: 42, z: 520, deal: "Polaris Insurance" },
      { x: 10, y: 78, z: 290, deal: "Flux Capital (Won)"},
      { x: 35, y: 45, z: 180, deal: "Grid SaaS (Lost)"  },
      { x: 20, y: 62, z: 240, deal: "Crown ERP (Won)"   },
      { x: 42, y: 35, z: 410, deal: "Peak Finance (Lost)"},
    ],
  },
  {
    rep_id: "REP-003", rep_name: "Priya Nair",
    win_rate: 65, avg_discount: 11, deals_open: 3, arr_pipeline: 252_000,
    top_tactic: "Product-led expansion — usage signals as close trigger",
    scatter_points: [
      { x: 12, y: 69, z: 142, deal: "Nexus Commerce"   },
      { x: 0,  y: 84, z: 24,  deal: "Arctos Retail"    },
      { x: 32, y: 44, z: 56,  deal: "Nova Logistics"   },
      { x: 8,  y: 77, z: 98,  deal: "Mira Health (Won)"},
      { x: 15, y: 66, z: 74,  deal: "Slate Tech (Won)" },
      { x: 18, y: 59, z: 110, deal: "Arc Fintech (Lost)"},
      { x: 5,  y: 80, z: 62,  deal: "Opal EdTech (Won)"},
    ],
  },
  {
    rep_id: "REP-004", rep_name: "James Okonkwo",
    win_rate: 61, avg_discount: 9, deals_open: 3, arr_pipeline: 105_200,
    top_tactic: "ROI-first discovery — quantify value before demo",
    scatter_points: [
      { x: 8,  y: 66, z: 98,  deal: "Citadel Logistics" },
      { x: 5,  y: 74, z: 18,  deal: "Stratum EdTech"    },
      { x: 5,  y: 79, z: 13,  deal: "Crest Fintech"     },
      { x: 10, y: 68, z: 52,  deal: "Anvil ERP (Won)"   },
      { x: 12, y: 63, z: 88,  deal: "Lumen SaaS (Won)"  },
      { x: 15, y: 55, z: 44,  deal: "Tide Retail (Lost)"},
      { x: 0,  y: 82, z: 35,  deal: "Zest EdTech (Won)" },
    ],
  },
];

/* ── Summary stats derived from mock data ──────────────────────────────────── */
const TOTAL_ARR_AT_STAKE = MOCK_DEALS.reduce((s, d) => s + d.arr, 0);
const HIGH_PRIORITY_COUNT = MOCK_DEALS.filter((d) => d.priority_score >= 80).length;
const AVG_WIN_PROB = (
  MOCK_DEALS.reduce((s, d) => s + d.win_probability, 0) / MOCK_DEALS.length
) * 100;
const DISCOUNT_CLIFF_COUNT = MOCK_DEALS.filter(
  (d) => d.top_signal_type === "DISCOUNT_CLIFF" || d.top_signal_type === "MARGIN_PRESSURE"
).length;

/* =============================================================================
   SIGNAL BADGE CONFIG
============================================================================= */

const SIGNAL_CONFIG: Record<
  DealSignalType,
  { label: string; bg: string; border: string; color: string; icon: React.ComponentType<{ size?: number; color?: string }> }
> = {
  DISCOUNT_CLIFF: {
    label: "DISCOUNT CLIFF", bg: "rgba(229,72,77,0.10)", border: "rgba(229,72,77,0.25)",
    color: "#f87171", icon: AlertTriangle,
  },
  MARGIN_PRESSURE: {
    label: "MARGIN PRESSURE", bg: "rgba(232,163,10,0.10)", border: "rgba(232,163,10,0.25)",
    color: "#fbbf24", icon: TrendingDown,
  },
  LONG_CYCLE: {
    label: "LONG CYCLE", bg: "rgba(98,102,109,0.12)", border: "rgba(98,102,109,0.25)",
    color: "var(--p-ink-subtle)", icon: Clock,
  },
  HIGH_PRIORITY: {
    label: "HIGH PRIORITY", bg: "rgba(94,106,210,0.12)", border: "rgba(94,106,210,0.25)",
    color: "var(--p-primary-hover)", icon: Zap,
  },
  EXPANSION_READY: {
    label: "EXPANSION READY", bg: "rgba(39,166,68,0.10)", border: "rgba(39,166,68,0.25)",
    color: "#4ade80", icon: TrendingUp,
  },
  EXEC_SPONSOR_MISSING: {
    label: "NO EXEC SPONSOR", bg: "rgba(232,163,10,0.10)", border: "rgba(232,163,10,0.25)",
    color: "#fbbf24", icon: AlertTriangle,
  },
  RENEWAL_RISK: {
    label: "RENEWAL RISK", bg: "rgba(229,72,77,0.10)", border: "rgba(229,72,77,0.25)",
    color: "#f87171", icon: AlertTriangle,
  },
  GENERIC: {
    label: "STANDARD", bg: "rgba(98,102,109,0.08)", border: "rgba(98,102,109,0.18)",
    color: "var(--p-ink-tertiary)", icon: Info,
  },
};

/* =============================================================================
   UTILITY HELPERS
============================================================================= */

const formatCurrency = (n: number): string => {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
};

const formatPct = (n: number, decimals = 0): string =>
  `${(n * 100).toFixed(decimals)}%`;

/* Priority score → Tremor ProgressBar colour */
const priorityColor = (score: number): "red" | "amber" | "indigo" | "emerald" => {
  if (score >= 85) return "indigo";
  if (score >= 70) return "emerald";
  if (score >= 50) return "amber";
  return "red";
};

/* =============================================================================
   SUB-COMPONENTS
============================================================================= */

/* ── Native Select ─────────────────────────────────────────────────────────── */
const NativeSelect: React.FC<React.SelectHTMLAttributes<HTMLSelectElement>> = (props) => {
  const { i18n } = useTranslation();
  const isRtl = i18n.dir() === "rtl";
  return (
    <div style={{ position: "relative" }}>
      <select
        {...props}
        style={{
          width: "100%",
          padding: isRtl ? "8px 12px 8px 32px" : "8px 32px 8px 12px",
          borderRadius: 8,
          background: "var(--p-surface-1)",
          border: "1px solid var(--p-hairline)",
          color: "var(--p-ink-muted)",
          fontSize: 13,
          outline: "none",
          appearance: "none",
          cursor: "pointer",
          ...props.style,
        }}
      />
      <ChevronDown
        size={14}
        color="var(--p-ink-tertiary)"
        style={{
          position: "absolute",
          [isRtl ? "left" : "right"]: 12,
          top: "50%",
          transform: "translateY(-50%)",
          pointerEvents: "none"
        }}
      />
    </div>
  );
};

const Table: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ width: "100%", overflowX: "auto" }}>
    <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "start" }}>
      {children}
    </table>
  </div>
);

const TableHead: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <thead>{children}</thead>
);

const TableRow: React.FC<React.HTMLAttributes<HTMLTableRowElement>> = (props) => (
  <tr {...props} />
);

const TableHeaderCell: React.FC<React.ThHTMLAttributes<HTMLTableCellElement>> = (props) => (
  <th {...props} />
);

const TableBody: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <tbody>{children}</tbody>
);

const TableCell: React.FC<React.TdHTMLAttributes<HTMLTableCellElement>> = (props) => (
  <td {...props} />
);

const ProgressBar: React.FC<{ value: number; color: "red" | "amber" | "indigo" | "emerald"; className?: string }> = ({ value, color, className }) => {
  const bgMap = {
    red: "#f87171",
    amber: "#fbbf24",
    indigo: "#818cf8",
    emerald: "#4ade80",
  };
  return (
    <div className={className} style={{ width: "100%", height: 6, borderRadius: 9999, background: "var(--p-surface-2)", overflow: "hidden" }}>
      <div style={{ width: `${Math.min(100, Math.max(0, value))}%`, height: "100%", background: bgMap[color] || bgMap.indigo, borderRadius: 9999 }} />
    </div>
  );
};

const NumberInput: React.FC<{ value?: number; onValueChange: (v?: number) => void; placeholder?: string; min?: number; max?: number; step?: number }> = ({ value, onValueChange, placeholder, min, max, step }) => (
  <input
    type="number"
    value={value ?? ""}
    onChange={(e) => onValueChange(e.target.value ? Number(e.target.value) : undefined)}
    placeholder={placeholder}
    min={min}
    max={max}
    step={step}
    style={{
      width: "100%",
      padding: "8px 12px",
      borderRadius: 8,
      background: "var(--p-surface-1)",
      border: "1px solid var(--p-hairline)",
      color: "var(--p-ink)",
      fontSize: 13,
      outline: "none",
    }}
  />
);

const Button: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { icon?: React.ElementType; color?: string; size?: string }> = ({ children, icon: Icon, disabled, style, ...props }) => (
  <button
    {...props}
    disabled={disabled}
    style={{
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      padding: "8px 14px",
      borderRadius: 8,
      background: disabled ? "var(--p-surface-2)" : "var(--p-primary)",
      color: disabled ? "var(--p-ink-tertiary)" : "#ffffff",
      fontSize: 13,
      fontWeight: 500,
      border: "none",
      cursor: disabled ? "not-allowed" : "pointer",
      ...style,
    }}
  >
    {Icon && <Icon size={14} />}
    {children}
  </button>
);

/* ── Custom Scatter Plot ───────────────────────────────────────────────────── */
const RepScatterPlot: React.FC<{ series: any[] }> = ({ series }) => {
  const { t } = useTranslation();
  const width = 600, height = 250, padding = 40;
  const plotW = width - padding * 2, plotH = height - padding * 2;
  const colors = ["#818cf8", "#a78bfa", "#34d399", "#fbbf24"];
  return (
    <div style={{ width: "100%", overflowX: "auto" }}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ overflow: "visible", minWidth: 500 }}>
        <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="var(--p-hairline)" />
        <line x1={padding} y1={padding} x2={padding} y2={height - padding} stroke="var(--p-hairline)" />
        {[0, 10, 20, 30, 40].map((v) => (
           <text key={`x-${v}`} x={padding + (v / 40) * plotW} y={height - padding + 15} fontSize={10} fill="var(--p-ink-tertiary)" textAnchor="middle">{v}%</text>
        ))}
        {[30, 50, 70, 90].map((v) => (
           <text key={`y-${v}`} x={padding - 10} y={height - padding - ((v - 30) / 60) * plotH} fontSize={10} fill="var(--p-ink-tertiary)" textAnchor="end" alignmentBaseline="middle">{v}%</text>
        ))}
        {series.map((s, idx) => s.data.map((p: any, i: number) => {
           const cx = padding + (Math.max(0, Math.min(p.x, 40)) / 40) * plotW;
           const cy = height - padding - ((Math.max(30, Math.min(p.y, 90)) - 30) / 60) * plotH;
           return (
             <g key={`${idx}-${i}`}>
               <circle cx={cx} cy={cy} r={4 + (p.z / 600) * 12} fill={colors[idx % colors.length]} opacity={0.6} stroke={colors[idx % colors.length]} strokeWidth={1} />
               <title>{`${s.name}: ${p.x}% ${t("pipeline.discountPct")}, ${p.y}% ${t("pipeline.winRate")}, $${p.z}K ${t("pipeline.arr")}`}</title>
             </g>
           );
        }))}
      </svg>
    </div>
  );
};

/* ── Summary stat pill ─────────────────────────────────────────────────────── */
const SummaryPill: React.FC<{
  icon: React.ComponentType<{ size?: number; color?: string }>;
  label: string;
  value: string;
  accent?: string;
}> = ({ icon: Icon, label, value, accent = "var(--p-primary)" }) => (
  <div
    style={{
      display:      "flex",
      alignItems:   "center",
      gap:          10,
      padding:      "10px 16px",
      borderRadius: 10,
      background:   "var(--p-surface-1)",
      border:       "1px solid var(--p-hairline)",
      boxShadow:    "inset 0 1px 0 0 rgba(255,255,255,0.04)",
      flex:         "1 1 0",
      minWidth:     0,
    }}
  >
    <div
      style={{
        width:          32,
        height:         32,
        borderRadius:   8,
        background:     `${accent}14`,
        border:         `1px solid ${accent}28`,
        display:        "flex",
        alignItems:     "center",
        justifyContent: "center",
        flexShrink:     0,
      }}
    >
      <Icon size={14} color={accent} />
    </div>
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 10, color: "var(--p-ink-tertiary)", letterSpacing: "0.3px", textTransform: "uppercase", fontFamily: "var(--font-mono)" }}>
        {label}
      </div>
      <div style={{ fontSize: 18, fontWeight: 600, color: "var(--p-ink)", letterSpacing: "-0.5px", fontVariantNumeric: "tabular-nums" }}>
        {value}
      </div>
    </div>
  </div>
);

/* ── Signal badge ──────────────────────────────────────────────────────────── */
const SignalBadge: React.FC<{ signal: DealSignalType }> = ({ signal }) => {
  const { t } = useTranslation();
  const cfg = SIGNAL_CONFIG[signal];
  const Icon = cfg.icon;
  return (
    <span
      style={{
        display:       "inline-flex",
        alignItems:    "center",
        gap:           4,
        padding:       "2px 8px",
        borderRadius:  "9999px",
        background:    cfg.bg,
        border:        `1px solid ${cfg.border}`,
        color:         cfg.color,
        fontSize:      10,
        fontWeight:    600,
        letterSpacing: "0.4px",
        fontFamily:    "var(--font-mono)",
        whiteSpace:    "nowrap",
        textTransform: "uppercase",
      }}
    >
      <Icon size={9} color={cfg.color} />
      {t(`pipeline.signals.${signal}`)}
    </span>
  );
};

/* ── Score result card (glassmorphic) ──────────────────────────────────────── */
const ScoreResultCard: React.FC<{ result: DealScoreResult }> = ({ result }) => {
  const { t } = useTranslation();
  const riskColor =
    result.risk_level === "HIGH"
      ? "#f87171"
      : result.risk_level === "MEDIUM"
      ? "#fbbf24"
      : "#4ade80";

  const riskBg =
    result.risk_level === "HIGH"
      ? "rgba(229,72,77,0.08)"
      : result.risk_level === "MEDIUM"
      ? "rgba(232,163,10,0.08)"
      : "rgba(39,166,68,0.08)";

  return (
    <div
      className="glass-panel animate-fade-in"
      style={{ padding: 16, marginTop: 12 }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 14 }}>
        <CheckCircle2 size={13} color="#4ade80" />
        <span style={{ fontSize: 11, fontWeight: 600, color: "#4ade80", letterSpacing: "0.3px", fontFamily: "var(--font-mono)" }}>
          {t("pipeline.scoreResult")}
        </span>
      </div>

      {/* Metrics grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
        {[
          { label: t("pipeline.predictedMargin"), value: `${(result.predicted_margin_rate * 100).toFixed(1)}%` },
          { label: t("pipeline.safeDiscountCeiling"), value: `${(result.safe_discount_ceiling * 100).toFixed(1)}%` },
        ].map(({ label, value }) => (
          <div
            key={label}
            style={{
              padding:      "10px 12px",
              borderRadius: 8,
              background:   "rgba(255,255,255,0.03)",
              border:       "1px solid var(--p-hairline)",
            }}
          >
            <div style={{ fontSize: 10, color: "var(--p-ink-tertiary)", marginBottom: 4, fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.3px" }}>
              {label}
            </div>
            <div style={{ fontSize: 20, fontWeight: 700, color: "var(--p-ink)", letterSpacing: "-0.5px", fontVariantNumeric: "tabular-nums" }}>
              {value}
            </div>
          </div>
        ))}
      </div>

      {/* Risk level badge */}
      <div
        style={{
          display:      "flex",
          alignItems:   "center",
          gap:          8,
          padding:      "8px 12px",
          borderRadius: 8,
          background:   riskBg,
          border:       `1px solid ${riskColor}28`,
          marginBottom: 10,
        }}
      >
        <span style={{ fontSize: 10, fontWeight: 600, color: riskColor, fontFamily: "var(--font-mono)", letterSpacing: "0.4px" }}>
          {t("pipeline.riskLevel", { level: result.risk_level })}
        </span>
      </div>

      {/* Recommended action */}
      <div
        style={{
          padding:      "10px 12px",
          borderRadius: 8,
          background:   "rgba(94,106,210,0.07)",
          border:       "1px solid rgba(94,106,210,0.18)",
        }}
      >
        <div style={{ fontSize: 10, color: "var(--p-primary-hover)", fontWeight: 600, fontFamily: "var(--font-mono)", letterSpacing: "0.3px", marginBottom: 4 }}>
          {t("pipeline.recommendedAction")}
        </div>
        <p style={{ fontSize: 12, color: "var(--p-ink-muted)", lineHeight: 1.55, margin: 0 }}>
          {result.recommended_action}
        </p>
      </div>
    </div>
  );
};

/* ── Expanded row drawer ───────────────────────────────────────────────────── */
const ExpandedRow: React.FC<{ deal: DealRecord }> = ({ deal }) => {
  const { t } = useTranslation();
  return (
    <div
      className="animate-fade-in"
      style={{
        padding:    "12px 20px 16px",
        background: "rgba(94,106,210,0.03)",
        borderTop:  "1px solid var(--p-hairline)",
        display:    "grid",
        gridTemplateColumns: "1fr 1fr 1fr",
        gap:        16,
      }}
    >
      {/* Win probability gauge */}
      <div>
        <div style={{ fontSize: 10, color: "var(--p-ink-tertiary)", marginBottom: 6, fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.3px" }}>
          {t("pipeline.winProbability")}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 22, fontWeight: 700, color: "var(--p-ink)", letterSpacing: "-0.5px", fontVariantNumeric: "tabular-nums" }}>
            {Math.round(deal.win_probability * 100)}%
          </span>
        </div>
        <ProgressBar
          value={deal.win_probability * 100}
          color={deal.win_probability >= 0.7 ? "emerald" : deal.win_probability >= 0.5 ? "amber" : "red"}
          className="mt-1.5"
        />
      </div>

      {/* Deal details */}
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {[
          { k: t("pipeline.stageKey"),    v: deal.stage },
          { k: t("pipeline.industryKey"), v: deal.industry },
          { k: t("pipeline.productKey"),  v: deal.product },
          { k: t("pipeline.closeKey"),    v: deal.close_date },
        ].map(({ k, v }) => (
          <div key={k} style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontSize: 11, color: "var(--p-ink-tertiary)" }}>{k}</span>
            <span style={{ fontSize: 11, color: "var(--p-ink-muted)", fontWeight: 500 }}>{v}</span>
          </div>
        ))}
      </div>

      {/* Recommended action */}
      <div>
        <div style={{ fontSize: 10, color: "var(--p-ink-tertiary)", marginBottom: 6, fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.3px" }}>
          {t("pipeline.recommendedActionKey")}
        </div>
        <p style={{ fontSize: 12, color: "var(--p-ink-muted)", lineHeight: 1.55, margin: 0 }}>
          {deal.recommended_action}
        </p>
        <div style={{ marginTop: 8, display: "flex", gap: 6 }}>
          <span style={{ fontSize: 10, color: "var(--p-ink-tertiary)" }}>{t("pipeline.execSponsorKey")}</span>
          <span style={{ fontSize: 10, color: deal.executive_sponsor_attached ? "#4ade80" : "#f87171", fontWeight: 600 }}>
            {deal.executive_sponsor_attached ? t("pipeline.attached") : t("pipeline.missing")}
          </span>
        </div>
      </div>
    </div>
  );
};

/* ── Zone header ────────────────────────────────────────────────────────────── */
const ZoneHeader: React.FC<{
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}> = ({ title, subtitle, right }) => (
  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16 }}>
    <div>
      <span style={{ fontSize: 11, fontWeight: 500, letterSpacing: "0.4px", textTransform: "uppercase", color: "var(--p-ink-tertiary)", fontFamily: "var(--font-body)" }}>
        {title}
      </span>
      {subtitle && (
        <span style={{ display: "block", fontSize: 11, color: "var(--p-ink-tertiary)", marginTop: 2, letterSpacing: 0, textTransform: "none", fontWeight: 400 }}>
          {subtitle}
        </span>
      )}
    </div>
    {right}
  </div>
);

/* ── Sort button ───────────────────────────────────────────────────────────── */
const SortableHeader: React.FC<{
  field: SortField;
  label: string;
  sortField: SortField;
  sortDir: SortDir;
  onSort: (f: SortField) => void;
}> = ({ field, label, sortField, sortDir, onSort }) => (
  <button
    onClick={() => onSort(field)}
    style={{
      background:    "transparent",
      border:        "none",
      cursor:        "pointer",
      display:       "inline-flex",
      alignItems:    "center",
      gap:           4,
      color:         sortField === field ? "var(--p-ink-muted)" : "var(--p-ink-tertiary)",
      fontSize:      11,
      fontWeight:    500,
      fontFamily:    "var(--font-body)",
      letterSpacing: "0.3px",
      padding:       0,
    }}
  >
    {label}
    {sortField === field ? (
      sortDir === "desc" ? <ChevronDown size={11} /> : <ChevronUp size={11} />
    ) : (
      <ArrowUpDown size={10} style={{ opacity: 0.4 }} />
    )}
  </button>
);

/* =============================================================================
   REP PLAYBOOKS BOTTOM PANEL
============================================================================= */

const RepPlaybooksPanel: React.FC<{ reps: RepRecord[] }> = ({ reps }) => {
  const { t, i18n } = useTranslation();
  const [selectedRepId, setSelectedRepId] = useState<string>("REP-001");
  const [expanded, setExpanded] = useState(true);

  const rep = reps.find((r) => r.rep_id === selectedRepId) ?? reps[0];

  const scatterSeries = reps.map((r) => ({
    name: r.rep_name,
    data: r.scatter_points.map((p) => ({ x: p.x, y: p.y, z: p.z })),
  }));

  const isRtl = i18n.dir() === "rtl";

  return (
    <div
      className="surface-1"
      style={{ borderRadius: 16, overflow: "hidden" }}
    >
      {/* Collapsible header */}
      <button
        onClick={() => setExpanded((v) => !v)}
        style={{
          width:          "100%",
          display:        "flex",
          alignItems:     "center",
          justifyContent: "space-between",
          padding:        "14px 20px",
          background:     "transparent",
          border:         "none",
          cursor:         "pointer",
          borderBottom:   expanded ? "1px solid var(--p-hairline)" : "none",
        }}
        onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.02)")}
        onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.background = "transparent")}
        aria-expanded={expanded}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 11, fontWeight: 500, letterSpacing: "0.4px", textTransform: "uppercase", color: "var(--p-ink-tertiary)" }}>
            {t("pipeline.repPlaybooks")}
          </span>
          <span style={{ fontSize: 11, color: "var(--p-ink-tertiary)" }}>
            {t("pipeline.repPlaybooksDesc")}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ display: "flex", gap: 8 }}>
            {reps.map((r) => (
              <span
                key={r.rep_id}
                style={{
                  fontSize: 11,
                  color:    r.rep_id === selectedRepId ? "var(--p-ink-muted)" : "var(--p-ink-tertiary)",
                  fontWeight: r.rep_id === selectedRepId ? 600 : 400,
                }}
              >
                {r.rep_name.split(" ")[0]}
                {r.rep_id === selectedRepId && ` ${r.win_rate}%`}
              </span>
            ))}
          </div>
          {expanded ? <ChevronUp size={14} color="var(--p-ink-subtle)" /> : <ChevronDown size={14} color="var(--p-ink-subtle)" />}
        </div>
      </button>

      {expanded && (
        <div
          className="animate-fade-in"
          style={{ padding: "20px 24px", display: "grid", gridTemplateColumns: "1fr 300px", gap: 24 }}
        >
          {/* Scatter chart */}
          <div style={{ height: 256 }}>
            {/* Force chart container direction to LTR to prevent Recharts/SVG layout issues */}
            <div dir="ltr">
              <RepScatterPlot series={scatterSeries} />
            </div>

            {/* Pareto hint */}
            <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ flex: 1, height: 1, background: "var(--p-hairline)" }} />
              <span style={{ fontSize: 10, color: "var(--p-ink-tertiary)", fontFamily: "var(--font-mono)", whiteSpace: "nowrap" }}>
                {t("pipeline.efficientZone")}
              </span>
              <div style={{ flex: 1, height: 1, background: "var(--p-hairline)" }} />
            </div>
          </div>

          {/* Rep detail cards */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {reps.map((r) => {
              const isSelected = r.rep_id === selectedRepId;
              return (
                <button
                  key={r.rep_id}
                  onClick={() => setSelectedRepId(r.rep_id)}
                  style={{
                    width:        "100%",
                    textAlign:    "start",
                    padding:      "12px 14px",
                    borderRadius: 10,
                    background:   isSelected ? "rgba(94,106,210,0.10)" : "var(--p-surface-2)",
                    border:       `1px solid ${isSelected ? "rgba(94,106,210,0.30)" : "var(--p-hairline)"}`,
                    cursor:       "pointer",
                    transition:   "all 120ms",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: isSelected ? "var(--p-ink)" : "var(--p-ink-muted)", letterSpacing: "-0.2px" }}>
                      {r.rep_name}
                    </span>
                    <span style={{
                      fontSize: 13, fontWeight: 700, letterSpacing: "-0.3px",
                      color: r.win_rate >= 70 ? "#4ade80" : r.win_rate >= 60 ? "#fbbf24" : "#f87171",
                      fontVariantNumeric: "tabular-nums",
                    }}>
                      {r.win_rate}%
                    </span>
                  </div>

                  <div style={{ display: "flex", gap: 12, marginBottom: isSelected ? 8 : 0 }}>
                    {[
                      { k: t("pipeline.avgDiscountShort"), v: `${r.avg_discount}%` },
                      { k: t("pipeline.openDealsShort"), v: String(r.deals_open) },
                      { k: t("pipeline.pipelineShort"),   v: formatCurrency(r.arr_pipeline) },
                    ].map(({ k, v }) => (
                      <div key={k}>
                        <div style={{ fontSize: 9, color: "var(--p-ink-tertiary)", textTransform: "uppercase", letterSpacing: "0.3px", fontFamily: "var(--font-mono)" }}>{k}</div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--p-ink-muted)", fontVariantNumeric: "tabular-nums" }}>{v}</div>
                      </div>
                    ))}
                  </div>

                  {isSelected && (
                    <div style={{ fontSize: 11, color: "var(--p-primary-hover)", lineHeight: 1.5, marginTop: 4, paddingTop: 8, borderTop: "1px solid rgba(94,106,210,0.15)" }}>
                      💡 {r.top_tactic}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

/* =============================================================================
   MAIN VIEW
============================================================================= */

const REP_NAMES = ["Sarah J.", "Mike T.", "Elena R.", "David K.", "Alex W.", "John D.", "Emma L.", "Chris P.", "Olivia M.", "Daniel S."];
const DEAL_NAMES = [
  "Acme Corp", "GlobalTech", "Stark Ind.", "Wayne Ent.", "Cyberdyne",
  "Umbrella Corp", "Massive Dynamic", "Initech", "Soylent Corp", "Hooli",
  "Pied Piper", "Dunder Mifflin", "Aperture Science", "Black Mesa", "Oscorp",
  "LexCorp", "Virtucon", "Oceanic Airlines", "Wonka Ind.", "Tyrell Corp"
];

const humanizeId = (id: string, type: "rep" | "deal") => {
  if (!id || (!id.includes("-") && id.length < 15)) return id; 
  const sum = id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return type === "rep" ? REP_NAMES[sum % REP_NAMES.length] : DEAL_NAMES[sum % DEAL_NAMES.length];
};

export const PipelineView: React.FC = () => {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const [deals, setDeals] = useState<DealRecord[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [hasRealData, setHasRealData] = useState<boolean | null>(null);

  const [liveTotalArr, setLiveTotalArr] = useState<number | null>(null);
  const [liveWeightedArr, setLiveWeightedArr] = useState<number | null>(null);
  const [liveAvgWinProb, setLiveAvgWinProb] = useState<number | null>(null);
  const [liveDiscountRisk, setLiveDiscountRisk] = useState<number | null>(null);

  useEffect(() => {
    setIsLoading(true);
    const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8001";
    fetch(`${API_URL}/api/v2/deals/priority?limit=500`)
      .then((r) => r.json())
      .then((data) => {
        const hasData = data && data.data_availability !== "OFFLINE" && Array.isArray(data.deals) && data.deals.length > 0;
        setHasRealData(hasData);
        if (hasData) {
          const mappedDeals: DealRecord[] = data.deals.map((d: any) => ({
            deal_id: d.deal_id || String(Math.random()),
            deal_name: humanizeId(d.deal_name || d.company || "Deal", "deal"),
            company: humanizeId(d.company || d.deal_name || "Company", "deal"),
            segment: d.segment || "Enterprise",
            arr: d.arr ?? 0,
            mrr: (d.arr ?? 0) / 12,
            priority_score: d.priority_score ?? 50,
            win_probability: d.win_probability != null
              ? (d.win_probability > 1 ? d.win_probability / 100 : d.win_probability)
              : (d.priority_score ?? 50) / 100,
            top_signal_type: d.top_signal_type || "GENERIC",
            top_signal_description: d.top_signal || d.top_signal_description || "",
            recommended_action: d.recommended_action || "",
            sales_rep: humanizeId(d.rep || d.sales_rep || "Unknown Rep", "rep"),
            sales_cycle_days: d.days_in_pipeline || d.sales_cycle_days || 30,
            discount_percentage: d.discount_pct || d.discount_percentage || 0,
            margin_rate: d.margin_rate || (1 - (d.discount_pct ?? 0)),
            executive_sponsor_attached: d.executive_sponsor_attached ?? false,
            industry: d.industry || "Technology",
            product: d.product || "Predicto Enterprise",
            stage: d.stage || "Proposal",
            close_date: d.close_date || "",
            win_loss_status: d.win_loss_status || "Open",
          }));
          setDeals(mappedDeals);

          const total = mappedDeals.reduce((s: number, d: any) => s + (d.arr ?? 0), 0);

          const weighted = mappedDeals.reduce((s: number, d: any) => {
            const p = d.win_probability;
            return s + (d.arr ?? 0) * p;
          }, 0);

          const avgProb = mappedDeals.reduce((s: number, d: any) => {
            return s + d.win_probability * 100;
          }, 0) / mappedDeals.length;

          const riskCount = mappedDeals.filter((d: any) =>
            d.top_signal_type === "DISCOUNT_CLIFF" ||
            d.top_signal_type === "MARGIN_PRESSURE"
          ).length;

          setLiveTotalArr(total);
          setLiveWeightedArr(weighted);
          setLiveAvgWinProb(avgProb);
          setLiveDiscountRisk(riskCount);
        } else {
          setDeals([]);
          setLiveTotalArr(null);
          setLiveWeightedArr(null);
          setLiveAvgWinProb(null);
          setLiveDiscountRisk(null);
        }
      })
      .catch((err) => {
        console.error("Pipeline deals fetch failed:", err);
        setHasRealData(false);
        setDeals([]);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  const LIVE_DEALS: DealRecord[] = useMemo(() => {
    return deals;
  }, [deals]);

  const LIVE_REPS: RepRecord[] = useMemo(() => {
    if (deals.length === 0) return [];
    const repNames = Array.from(new Set(deals.map(d => d.sales_rep)));
    return repNames.map((name, i) => {
      const repDeals = deals.filter(d => d.sales_rep === name);
      const openCount = repDeals.length;
      const totalArr = repDeals.reduce((s, d) => s + d.arr, 0);
      const avgDiscount = repDeals.reduce((s, d) => s + d.discount_percentage, 0) / (openCount || 1) * 100;
      const winRate = repDeals.reduce((s, d) => s + d.win_probability, 0) / (openCount || 1) * 100;
      
      return {
        rep_id: `REP-00${i+1}`,
        rep_name: name,
        win_rate: Math.round(winRate),
        avg_discount: Math.round(avgDiscount),
        deals_open: openCount,
        arr_pipeline: totalArr,
        top_tactic: "Value-based discovery",
        scatter_points: repDeals.map(d => ({
          x: Math.round(d.discount_percentage * 100),
          y: Math.round(d.win_probability * 100),
          z: Math.round(d.arr / 1000),
          deal: d.deal_name
        }))
      };
    });
  }, [deals]);



  /* ── Filter state ─────────────────────────────────────────────────────────── */
  const [segmentFilter, setSegmentFilter]       = useState<string>("all");
  const [repFilter,     setRepFilter]           = useState<string>("all");
  const [signalFilter,  setSignalFilter]        = useState<string>("all");
  const [expandedDealId, setExpandedDealId]     = useState<string | null>(null);
  const [sortField, setSortField]               = useState<SortField>("priority_score");
  const [sortDir,   setSortDir]                 = useState<SortDir>("desc");

  /* ── Deal Scorer form state ───────────────────────────────────────────────── */
  const [scorerSegment,  setScorerSegment]      = useState<string>("");
  const [scorerIndustry, setScorerIndustry]     = useState<string>("");
  const [scorerProduct,  setScorerProduct]      = useState<string>("");
  const [scorerRegion,   setScorerRegion]       = useState<string>("");
  const [scorerRevenue,  setScorerRevenue]      = useState<number | undefined>(undefined);
  const [scorerDiscount, setScorerDiscount]     = useState<number | undefined>(undefined);
  const [scorerQuantity, setScorerQuantity]     = useState<number | undefined>(undefined);
  const [scoreResult,    setScoreResult]        = useState<DealScoreResult | null>(null);
  const [isScoring,      setIsScoring]          = useState(false);
  const [scorerError,    setScorerError]        = useState<string | null>(null);

  /* ── Sort handler ─────────────────────────────────────────────────────────── */
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  };

  /* ── Filtered + sorted deals ──────────────────────────────────────────────── */
  const visibleDeals = useMemo(() => {
    let filtered = [...LIVE_DEALS];

    if (segmentFilter !== "all") {
      filtered = filtered.filter((d) => d.segment === segmentFilter);
    }
    if (repFilter !== "all") {
      filtered = filtered.filter((d) => d.sales_rep === repFilter);
    }
    if (signalFilter !== "all") {
      filtered = filtered.filter((d) => d.top_signal_type === signalFilter);
    }

    filtered.sort((a, b) => {
      const multiplier = sortDir === "desc" ? -1 : 1;
      return (a[sortField] - b[sortField]) * multiplier;
    });

    return filtered;
  }, [segmentFilter, repFilter, signalFilter, sortField, sortDir]);

  const totalArr = visibleDeals.reduce((sum, d) => sum + (d.arr ?? 0), 0);

  const weightedPipeline = visibleDeals.reduce((sum, d) => {
    const prob = (d.win_probability ?? 0) > 1 
      ? (d.win_probability ?? 0) / 100 
      : (d.win_probability ?? 0);
    return sum + (d.arr ?? 0) * prob;
  }, 0);

  const avgWinProb = visibleDeals.length > 0
    ? visibleDeals.reduce((sum, d) => {
        const prob = (d.win_probability ?? 0) > 1 
          ? (d.win_probability ?? 0) 
          : (d.win_probability ?? 0) * 100;
        return sum + prob;
      }, 0) / visibleDeals.length
    : 0;

  const discountRiskCount = visibleDeals.filter(d => 
    d.top_signal_type === "DISCOUNT_CLIFF" || 
    d.top_signal_type === "MARGIN_PRESSURE"
  ).length;

  /* ── Deal Scorer calculation ─────────────────────────────────────────── */
  const handleScore = async () => {
    if (!scorerSegment || !scorerIndustry || !scorerProduct || !scorerRegion || scorerRevenue == null || scorerDiscount == null || scorerQuantity == null) {
      setScorerError(t("pipeline.fillAllFields"));
      return;
    }
    setScorerError(null);
    setIsScoring(true);
    setScoreResult(null);

    try {
      const res = await fetch("/api/v1/deals/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          segment: scorerSegment,
          industry: scorerIndustry,
          product: scorerProduct,
          region: scorerRegion,
          sales: scorerRevenue * scorerQuantity,
          discount: scorerDiscount / 100,
        }),
      });
      if (!res.ok) throw new Error("Scoring failed");
      const data = await res.json();
      
      setScoreResult({
        predicted_margin_rate: data.predicted_margin ?? 0,
        safe_discount_ceiling: data.safe_discount_ceiling ?? 0,
        risk_level: data.risk_level ?? "MEDIUM",
        recommended_action: data.recommendation ?? t("pipeline.reviewDealTerms", "Review deal terms."),
      });
    } catch (e) {
      console.warn("Scoring API failed, falling back to mock", e);
      const discountFrac = (scorerDiscount ?? 0) / 100;
      const baseMarginsMap: Record<string, number> = {
        Enterprise: 0.76, "Mid-Market": 0.68, SMB: 0.72,
      };
      const industryPenalty: Record<string, number> = {
        FinTech: 0.02, HealthTech: 0.01, "E-Commerce": -0.03,
        SaaS: 0.03, Manufacturing: -0.01, Retail: -0.02, Education: 0.0, Logistics: -0.01,
      };
      const baseMargin = (baseMarginsMap[scorerSegment] ?? 0.68) + (industryPenalty[scorerIndustry] ?? 0);
      const predictedMargin = Math.max(0.1, baseMargin - discountFrac * 0.9);
      const safeDiscountCeiling = Math.min(baseMargin - 0.15, 0.30);
      const riskLevel: "LOW" | "MEDIUM" | "HIGH" =
        discountFrac > safeDiscountCeiling + 0.05
          ? "HIGH"
          : discountFrac > safeDiscountCeiling
          ? "MEDIUM"
          : "LOW";
  
      const mappedSegment = t(`common.${scorerSegment === 'Mid-Market' ? 'midMarket' : scorerSegment.toLowerCase()}`);
      const actionMap: Record<string, string> = {
        HIGH:   t("pipeline.actionHigh", {
          discount: scorerDiscount,
          ceiling: (safeDiscountCeiling * 100).toFixed(0),
          segment: mappedSegment,
          industry: scorerIndustry,
        }),
        MEDIUM: t("pipeline.actionMedium"),
        LOW:    t("pipeline.actionLow"),
      };
  
      setScoreResult({
        predicted_margin_rate: predictedMargin,
        safe_discount_ceiling: safeDiscountCeiling,
        risk_level:            riskLevel,
        recommended_action:    actionMap[riskLevel],
      });
    }
    setIsScoring(false);
  };

  const handleClearScore = () => {
    setScoreResult(null);
    setScorerError(null);
    setScorerSegment("");
    setScorerIndustry("");
    setScorerProduct("");
    setScorerRegion("");
    setScorerRevenue(undefined);
    setScorerDiscount(undefined);
    setScorerQuantity(undefined);
  };

  if (!isLoading && hasRealData === false) {
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
          <Target size={32} color="var(--p-primary-hover)" />
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

  return (
    <div
      className="animate-fade-in"
      style={{
        padding:       "var(--spacing-lg)",
        display:       "flex",
        flexDirection: "column",
        gap:           16,
        maxWidth:      1640,
        margin:        "0 auto",
        width:         "100%",
      }}
    >
      {/* ════════════════════════════════════════════════════════════════════
          PAGE HEADER
      ════════════════════════════════════════════════════════════════════ */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
        <div>
          <h1 className="t-headline" style={{ color: "var(--p-ink)", marginBottom: 4 }}>
            {t("pipeline.title")}
          </h1>
          <p style={{ fontSize: 13, color: "var(--p-ink-tertiary)", margin: 0 }}>
            {t("pipeline.subtitle")}
          </p>
        </div>
        <button className="btn-icon" title={t("common.refresh")}>
          <RefreshCw size={14} />
        </button>
      </div>

      {/* ════════════════════════════════════════════════════════════════════
          SUMMARY STAT PILLS
      ════════════════════════════════════════════════════════════════════ */}
      <div style={{ display: "flex", gap: 10 }}>
        <SummaryPill icon={DollarSign} label={t("pipeline.totalPipeline")} value={formatCurrency(liveTotalArr ?? totalArr)} accent="var(--p-primary)" />
        <SummaryPill icon={TrendingUp} label={t("pipeline.weightedPipeline")} value={formatCurrency(liveWeightedArr ?? weightedPipeline)} accent="#828fff" />
        <SummaryPill icon={Target}     label={t("pipeline.avgWinProb")}  value={`${Math.round(liveAvgWinProb ?? avgWinProb)}%`}      accent="#4ade80" />
        <SummaryPill icon={AlertTriangle} label={t("pipeline.discountMarginRisk")} value={t("pipeline.dealsCount", { count: liveDiscountRisk ?? discountRiskCount })} accent="#f87171" />
      </div>

      {/* ════════════════════════════════════════════════════════════════════
          FILTER BAR
      ════════════════════════════════════════════════════════════════════ */}
      <div
        style={{
          display:      "flex",
          alignItems:   "center",
          gap:          8,
          padding:      "10px 14px",
          borderRadius: 10,
          background:   "var(--p-surface-1)",
          border:       "1px solid var(--p-hairline)",
        }}
      >
        <Filter size={13} color="var(--p-ink-tertiary)" style={{ flexShrink: 0 }} />
        <span style={{ fontSize: 11, color: "var(--p-ink-tertiary)", fontFamily: "var(--font-mono)", marginInlineEnd: 6 }}>
          {t("pipeline.filter")}
        </span>

        {/* Segment */}
        <div style={{ minWidth: 140 }}>
          <NativeSelect
            value={segmentFilter}
            onChange={(e) => setSegmentFilter(e.target.value)}
          >
            <option value="all">{t("common.allSegments")}</option>
            <option value="Enterprise">{t("common.enterprise")}</option>
            <option value="Mid-Market">{t("common.midMarket")}</option>
            <option value="SMB">{t("common.smb")}</option>
          </NativeSelect>
        </div>

        {/* Rep */}
        <div style={{ minWidth: 148 }}>
          <NativeSelect
            value={repFilter}
            onChange={(e) => setRepFilter(e.target.value)}
          >
            <option value="all">{t("pipeline.allReps")}</option>
            {LIVE_REPS.map((r) => (
              <option key={r.rep_id} value={r.rep_name}>{r.rep_name}</option>
            ))}
          </NativeSelect>
        </div>

        {/* Signal */}
        <div style={{ minWidth: 168 }}>
          <NativeSelect
            value={signalFilter}
            onChange={(e) => setSignalFilter(e.target.value)}
          >
            <option value="all">{t("pipeline.allSignals")}</option>
            <option value="DISCOUNT_CLIFF">{t("pipeline.signals.DISCOUNT_CLIFF")}</option>
            <option value="MARGIN_PRESSURE">{t("pipeline.signals.MARGIN_PRESSURE")}</option>
            <option value="HIGH_PRIORITY">{t("pipeline.signals.HIGH_PRIORITY")}</option>
            <option value="EXPANSION_READY">{t("pipeline.signals.EXPANSION_READY")}</option>
            <option value="LONG_CYCLE">{t("pipeline.signals.LONG_CYCLE")}</option>
            <option value="EXEC_SPONSOR_MISSING">{t("pipeline.signals.EXEC_SPONSOR_MISSING")}</option>
            <option value="RENEWAL_RISK">{t("pipeline.signals.RENEWAL_RISK")}</option>
          </NativeSelect>
        </div>

        {/* Result count */}
        <span style={{ marginInlineStart: "auto", fontSize: 11, color: "var(--p-ink-tertiary)", fontFamily: "var(--font-mono)", whiteSpace: "nowrap" }}>
          {t("pipeline.dealsCountShort", { visible: visibleDeals.length, total: LIVE_DEALS.length })}
        </span>

        {/* Clear filters */}
        {(segmentFilter !== "all" || repFilter !== "all" || signalFilter !== "all") && (
          <button
            onClick={() => { setSegmentFilter("all"); setRepFilter("all"); setSignalFilter("all"); }}
            style={{
              display:      "inline-flex",
              alignItems:   "center",
              gap:          4,
              padding:      "3px 8px",
              borderRadius: "9999px",
              background:   "rgba(229,72,77,0.08)",
              border:       "1px solid rgba(229,72,77,0.20)",
              color:        "#f87171",
              fontSize:     11,
              fontWeight:   500,
              cursor:       "pointer",
              fontFamily:   "var(--font-mono)",
            }}
          >
            <X size={9} />
            {t("common.clear")}
          </button>
        )}
      </div>

      {/* ════════════════════════════════════════════════════════════════════
          BODY: DEAL TABLE (70%) + SCORER FORM (30%)
      ════════════════════════════════════════════════════════════════════ */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 12, alignItems: "start" }}>

        {/* ── LEFT: Deal Priority Table ───────────────────────────────────── */}
        <div
          className="surface-1"
          style={{ borderRadius: 16, overflow: "hidden" }}
        >
          {/* Table header bar */}
          <div style={{ padding: "16px 20px 12px", borderBottom: "1px solid var(--p-hairline)" }}>
            <ZoneHeader
              title={t("pipeline.dealPriorityQueue")}
              subtitle={t("pipeline.sortedBy", {
                field: sortField === "priority_score" ? t("pipeline.priorityScore") : sortField === "win_probability" ? t("pipeline.winProb") : sortField === "arr" ? t("pipeline.arr") : t("pipeline.cycle"),
                dir: sortDir === "desc" ? t("pipeline.highestFirst") : t("pipeline.lowestFirst")
              })}
            />
          </div>

          {/* Tremor Table */}
          <Table>
            <TableHead>
              <TableRow
                style={{ borderBottom: "1px solid var(--p-hairline)" }}
              >
                {/* Expand column */}
                <TableHeaderCell style={{ width: 36, padding: "10px 8px 10px 16px" }} />

                <TableHeaderCell style={{ padding: "10px 12px", fontSize: 11, color: "var(--p-ink-tertiary)", fontWeight: 500, letterSpacing: "0.3px", fontFamily: "var(--font-body)" }}>
                  {t("pipeline.dealCompany")}
                </TableHeaderCell>

                <TableHeaderCell style={{ padding: "10px 12px", fontSize: 11, color: "var(--p-ink-tertiary)", fontWeight: 500, letterSpacing: "0.3px", textAlign: "right", fontFamily: "var(--font-body)" }}>
                  <SortableHeader field="arr" label={t("pipeline.arr")} sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                </TableHeaderCell>

                <TableHeaderCell style={{ padding: "10px 12px", fontSize: 11, color: "var(--p-ink-tertiary)", fontWeight: 500, letterSpacing: "0.3px", fontFamily: "var(--font-body)" }}>
                  <SortableHeader field="priority_score" label={t("pipeline.priorityScore")} sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                </TableHeaderCell>

                <TableHeaderCell style={{ padding: "10px 12px", fontSize: 11, color: "var(--p-ink-tertiary)", fontWeight: 500, letterSpacing: "0.3px", fontFamily: "var(--font-body)" }}>
                  <SortableHeader field="win_probability" label={t("pipeline.winProb")} sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                </TableHeaderCell>

                <TableHeaderCell style={{ padding: "10px 12px", fontSize: 11, color: "var(--p-ink-tertiary)", fontWeight: 500, letterSpacing: "0.3px", fontFamily: "var(--font-body)" }}>
                  {t("pipeline.signal")}
                </TableHeaderCell>

                <TableHeaderCell style={{ padding: "10px 12px", fontSize: 11, color: "var(--p-ink-tertiary)", fontWeight: 500, letterSpacing: "0.3px", fontFamily: "var(--font-body)" }}>
                  {t("pipeline.rep")}
                </TableHeaderCell>

                <TableHeaderCell style={{ padding: "10px 16px 10px 12px", fontSize: 11, color: "var(--p-ink-tertiary)", fontWeight: 500, letterSpacing: "0.3px", textAlign: "right", fontFamily: "var(--font-body)" }}>
                  <SortableHeader field="sales_cycle_days" label={t("pipeline.cycle")} sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                </TableHeaderCell>
              </TableRow>
            </TableHead>

            <TableBody>
              {visibleDeals.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    style={{ textAlign: "center", padding: "48px 20px", color: "var(--p-ink-tertiary)", fontSize: 13 }}
                  >
                    {t("pipeline.noDealsFilters")}
                  </TableCell>
                </TableRow>
              ) : (
                visibleDeals.map((deal, idx) => {
                  const isExpanded = expandedDealId === deal.deal_id;
                  const pColor     = priorityColor(deal.priority_score);

                  return (
                    <React.Fragment key={deal.deal_id}>
                      <TableRow
                        style={{
                          borderBottom: "1px solid var(--p-hairline)",
                          background:   isExpanded ? "rgba(94,106,210,0.04)" : idx % 2 === 1 ? "rgba(255,255,255,0.008)" : "transparent",
                          cursor:       "pointer",
                          transition:   "background 120ms",
                        }}
                        onMouseEnter={(e) => { if (!isExpanded) (e.currentTarget as HTMLTableRowElement).style.background = "rgba(255,255,255,0.025)"; }}
                        onMouseLeave={(e) => { if (!isExpanded) (e.currentTarget as HTMLTableRowElement).style.background = idx % 2 === 1 ? "rgba(255,255,255,0.008)" : "transparent"; }}
                      >
                        {/* Expand toggle */}
                        <TableCell
                          style={{ padding: "12px 8px 12px 16px", width: 36 }}
                          onClick={() => setExpandedDealId(isExpanded ? null : deal.deal_id)}
                        >
                          {isExpanded
                            ? <ChevronUp   size={13} color="var(--p-primary-hover)" />
                            : <ChevronRight size={13} color="var(--p-ink-tertiary)" />
                          }
                        </TableCell>

                        {/* Deal name + company */}
                        <TableCell
                          style={{ padding: "12px" }}
                          onClick={() => setExpandedDealId(isExpanded ? null : deal.deal_id)}
                        >
                          <div style={{ fontWeight: 500, fontSize: 13, color: "var(--p-ink-muted)", letterSpacing: "-0.1px", marginBottom: 2 }}>
                            {deal.deal_name}
                          </div>
                          <div style={{ fontSize: 11, color: "var(--p-ink-tertiary)" }}>
                            {deal.company}
                            <span
                              style={{
                                marginInlineStart: 6,
                                padding:       "1px 6px",
                                borderRadius:  "9999px",
                                background:    "rgba(94,106,210,0.08)",
                                border:        "1px solid rgba(94,106,210,0.15)",
                                color:         "var(--p-primary-hover)",
                                fontSize:      9,
                                fontWeight:    600,
                                letterSpacing: "0.3px",
                                textTransform: "uppercase",
                              }}
                            >
                              {tSegment(deal.segment)}
                            </span>
                          </div>
                        </TableCell>

                        {/* ARR */}
                        <TableCell style={{ padding: "12px", textAlign: "right" }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--p-ink)", letterSpacing: "-0.3px", fontVariantNumeric: "tabular-nums" }}>
                            {formatCurrency(deal.arr)}
                          </span>
                          <div style={{ fontSize: 10, color: "var(--p-ink-tertiary)", textAlign: "right", marginTop: 1 }}>
                            {t("pipeline.arr")}
                          </div>
                        </TableCell>

                        {/* Priority Score with ProgressBar */}
                        <TableCell style={{ padding: "12px", minWidth: 140 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                            <span style={{
                              fontSize: 13, fontWeight: 700, color: "var(--p-ink)",
                              fontVariantNumeric: "tabular-nums", letterSpacing: "-0.3px",
                              minWidth: 26,
                            }}>
                              {deal.priority_score}
                            </span>
                            <span style={{ fontSize: 10, color: "var(--p-ink-tertiary)" }}>/100</span>
                          </div>
                          <ProgressBar
                            value={deal.priority_score}
                            color={pColor}
                            className="h-1"
                          />
                        </TableCell>

                        {/* Win probability */}
                        <TableCell style={{ padding: "12px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{
                              fontSize: 13, fontWeight: 600, letterSpacing: "-0.3px",
                              fontVariantNumeric: "tabular-nums",
                              color: deal.win_probability >= 0.70 ? "#4ade80" : deal.win_probability >= 0.50 ? "#fbbf24" : "#f87171",
                            }}>
                              {Math.round(deal.win_probability * 100)}%
                            </span>
                          </div>
                        </TableCell>

                        {/* Signal badge */}
                        <TableCell style={{ padding: "12px" }}>
                          <SignalBadge signal={deal.top_signal_type} />
                        </TableCell>

                        {/* Rep */}
                        <TableCell style={{ padding: "12px" }}>
                          <span style={{ fontSize: 12, color: "var(--p-ink-subtle)" }}>
                            {deal.sales_rep.split(" ")[0]}
                          </span>
                        </TableCell>

                        {/* Sales cycle days */}
                        <TableCell style={{ padding: "12px 16px 12px 12px", textAlign: "right" }}>
                          <span style={{
                            fontSize: 12, fontVariantNumeric: "tabular-nums",
                            color: deal.sales_cycle_days > 90 ? "#f87171" : deal.sales_cycle_days > 60 ? "#fbbf24" : "var(--p-ink-subtle)",
                          }}>
                            {deal.sales_cycle_days}d
                          </span>
                        </TableCell>
                      </TableRow>

                      {/* Expanded row */}
                      {isExpanded && (
                        <TableRow style={{ borderBottom: "1px solid var(--p-hairline)" }}>
                          <TableCell colSpan={8} style={{ padding: 0 }}>
                            <ExpandedRow deal={deal} />
                          </TableCell>
                        </TableRow>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </TableBody>
          </Table>

          {/* Table footer */}
          <div
            style={{
              padding:        "10px 20px",
              borderTop:      "1px solid var(--p-hairline)",
              display:        "flex",
              justifyContent: "space-between",
              alignItems:     "center",
            }}
          >
            <span style={{ fontSize: 11, color: "var(--p-ink-tertiary)" }}>
              {t("pipeline.totalPipelineValue", { value: formatCurrency(visibleDeals.reduce((s, d) => s + d.arr, 0)) })}
            </span>
            <span style={{ fontSize: 11, color: "var(--p-ink-tertiary)", fontFamily: "var(--font-mono)" }}>
              {t("pipeline.dealsShown", { count: visibleDeals.length })}
            </span>
          </div>
        </div>

        {/* ── RIGHT: Deal Scorer Form ─────────────────────────────────────── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          <div
            className="glass-panel"
            style={{ padding: "18px 18px 16px" }}
          >
            {/* Form header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 500, letterSpacing: "0.4px", textTransform: "uppercase", color: "var(--p-ink-tertiary)", fontFamily: "var(--font-body)", marginBottom: 2 }}>
                  {t("pipeline.dealScorer")}
                </div>
                <div style={{ fontSize: 11, color: "var(--p-ink-tertiary)" }}>
                  {t("pipeline.marginEngine")}
                </div>
              </div>
              {scoreResult && (
                <button onClick={handleClearScore} className="btn-icon" title={t("pipeline.clear", "Clear")}>
                  <X size={13} />
                </button>
              )}
            </div>

            {/* Form fields */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>

              {/* Segment */}
              <div>
                <label style={{ display: "block", fontSize: 11, color: "var(--p-ink-tertiary)", marginBottom: 4, fontFamily: "var(--font-body)" }}>
                  {t("pipeline.segmentKey")}
                </label>
                <NativeSelect value={scorerSegment} onChange={(e) => setScorerSegment(e.target.value)}>
                  <option value="" disabled hidden>{t("pipeline.selectSegment")}</option>
                  <option value="Enterprise">{t("common.enterprise")}</option>
                  <option value="Mid-Market">{t("common.midMarket")}</option>
                  <option value="SMB">{t("common.smb")}</option>
                </NativeSelect>
              </div>

              {/* Industry */}
              <div>
                <label style={{ display: "block", fontSize: 11, color: "var(--p-ink-tertiary)", marginBottom: 4, fontFamily: "var(--font-body)" }}>
                  {t("pipeline.industryKey")}
                </label>
                <NativeSelect value={scorerIndustry} onChange={(e) => setScorerIndustry(e.target.value)}>
                  <option value="" disabled hidden>{t("pipeline.selectIndustry")}</option>
                  {["FinTech", "HealthTech", "E-Commerce", "SaaS", "Manufacturing", "Retail", "Education", "Logistics"].map((i) => (
                    <option key={i} value={i}>{i}</option>
                  ))}
                </NativeSelect>
              </div>

              {/* Product */}
              <div>
                <label style={{ display: "block", fontSize: 11, color: "var(--p-ink-tertiary)", marginBottom: 4, fontFamily: "var(--font-body)" }}>
                  {t("pipeline.productKey")}
                </label>
                <NativeSelect value={scorerProduct} onChange={(e) => setScorerProduct(e.target.value)}>
                  <option value="" disabled hidden>{t("pipeline.selectProduct")}</option>
                  {["Predicto Enterprise", "Predicto Pro", "Predicto Core", "Predicto Lite"].map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </NativeSelect>
              </div>

              {/* Region */}
              <div>
                <label style={{ display: "block", fontSize: 11, color: "var(--p-ink-tertiary)", marginBottom: 4, fontFamily: "var(--font-body)" }}>
                  {t("pipeline.regionKey")}
                </label>
                <NativeSelect value={scorerRegion} onChange={(e) => setScorerRegion(e.target.value)}>
                  <option value="" disabled hidden>{t("pipeline.selectRegion")}</option>
                  {["North America", "EMEA", "APAC", "LATAM"].map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </NativeSelect>
              </div>

              {/* Revenue per unit */}
              <div>
                <label style={{ display: "block", fontSize: 11, color: "var(--p-ink-tertiary)", marginBottom: 4, fontFamily: "var(--font-body)" }}>
                  {t("pipeline.revenuePerUnit")}
                </label>
                <NumberInput
                  value={scorerRevenue}
                  onValueChange={setScorerRevenue}
                  placeholder="e.g. 12000"
                  min={0}
                  step={1000}
                />
              </div>

              {/* Two-column: Discount + Quantity */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <div>
                  <label style={{ display: "block", fontSize: 11, color: "var(--p-ink-tertiary)", marginBottom: 4, fontFamily: "var(--font-body)" }}>
                    {t("pipeline.discountPct")}
                  </label>
                  <NumberInput
                    value={scorerDiscount}
                    onValueChange={setScorerDiscount}
                    placeholder="0–40"
                    min={0}
                    max={40}
                    step={1}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 11, color: "var(--p-ink-tertiary)", marginBottom: 4, fontFamily: "var(--font-body)" }}>
                    {t("pipeline.quantity")}
                  </label>
                  <NumberInput
                    value={scorerQuantity}
                    onValueChange={setScorerQuantity}
                    placeholder="e.g. 5"
                    min={1}
                    step={1}
                  />
                </div>
              </div>

              {/* Error */}
              {scorerError && (
                <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 10px", borderRadius: 7, background: "rgba(229,72,77,0.08)", border: "1px solid rgba(229,72,77,0.20)" }}>
                  <AlertTriangle size={11} color="#f87171" />
                  <span style={{ fontSize: 11, color: "#f87171" }}>{scorerError}</span>
                </div>
              )}

              {/* Submit */}
              <Button
                onClick={handleScore}
                disabled={isScoring}
                color="indigo"
                size="sm"
                style={{ width: "100%", marginTop: 2 }}
                icon={isScoring ? undefined : Target}
              >
                {isScoring ? (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <Loader2 size={13} style={{ animation: "spin 0.8s linear infinite" }} />
                    {t("pipeline.scoring")}
                  </span>
                ) : (
                  t("pipeline.scoreThisDeal")
                )}
              </Button>
            </div>

            {/* Score result */}
            {scoreResult && <ScoreResultCard result={scoreResult} />}
          </div>

          {/* Quick fill hint */}
          {!scoreResult && (
            <div
              style={{
                marginTop:    10,
                padding:      "8px 12px",
                borderRadius: 8,
                background:   "rgba(94,106,210,0.06)",
                border:       "1px solid rgba(94,106,210,0.14)",
                display:      "flex",
                alignItems:   "flex-start",
                gap:          6,
              }}
            >
              <Info size={11} color="var(--p-primary-hover)" style={{ marginTop: 1, flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: "var(--p-ink-tertiary)", lineHeight: 1.5 }}>
                {t("pipeline.scorerHint")}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════════════
          BOTTOM: REP PLAYBOOKS + SCATTER CHART
      ════════════════════════════════════════════════════════════════════ */}
      <RepPlaybooksPanel reps={LIVE_REPS} />

      {/* ── Inline keyframes ──────────────────────────────────────────────── */}
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @media (max-width: 1200px) {
          .pipeline-body { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
};

export default PipelineView;

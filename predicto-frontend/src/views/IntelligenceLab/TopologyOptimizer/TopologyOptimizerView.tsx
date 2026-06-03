/**
 * src/views/IntelligenceLab/TopologyOptimizer/TopologyOptimizerView.tsx
 *
 * Predicto V3 — Autonomous Revenue Topology Optimizer (Feature 09)
 * Linear dark aesthetic · Tremor v3 · Tailwind v4
 *
 * ─── Layout ───────────────────────────────────────────────────────────────────
 *   Left Panel  (30%)  Optimizer Controls
 *     • 4 interactive sliders: Rep Hours, CSM Touches, Campaign Spend, Churn Weight
 *     • Glassmorphic surface-1 card with `glass-panel` accent
 *     • Solver Status badge with animated pulse glow
 *     • Live objective value counter that reacts to slider changes
 *
 *   Right Panel (70%)  Results Workspace
 *     • Page Header    — breadcrumb + run button + last-solved timestamp
 *     • Zone A         — Budget Utilisation  (Tremor BarList, 3 rows)
 *     • Zone B         — Portfolio Summary   (3 × stat tiles)
 *     • Zone C         — Master Schedule     (Tremor Table, 12 mock customers)
 *
 * All data is inline mock — matches TopologyOptimizationResponse schema so
 * swapping to live data requires only replacing const declarations with
 * `useTopologyOptimizerQuery` hook results.
 *
 * Dependencies (all already in Predicto V3):
 *   @tremor/react   — BarList, Table, TableHead, TableHeaderCell, TableBody,
 *                     TableRow, TableCell, Card, Badge
 *   lucide-react    — icons
 *   CSS vars        — from index.css (--p-*, --font-*, --radius-*, .glass-panel,
 *                     .skeleton, .status-pill, .surface-1)
 */

import React, { useState, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useTopologyOptimizerMutation } from "@/hooks/useGodTierQueries";
import { tSegment } from "@/lib/personaMapping";
import {
  BarList,
  Table,
  TableHead,
  TableHeaderCell,
  TableBody,
  TableRow,
  TableCell,
  Card,
  Badge,
} from "@tremor/react";
import {
  Cpu,
  Play,
  RefreshCw,
  CheckCircle2,
  Clock,
  Users,
  DollarSign,
  TrendingUp,
  ChevronRight,
  Zap,
  Target,
  Headphones,
  Megaphone,
  UserCheck,
  Briefcase,
  SlidersHorizontal,
} from "lucide-react";

/* =============================================================================
   ██████╗  █████╗ ████████╗ █████╗
   ██╔══██╗██╔══██╗╚══██╔══╝██╔══██╗
   ██║  ██║███████║   ██║   ███████║
   ██║  ██║██╔══██║   ██║   ██╔══██║
   ██████╔╝██║  ██║   ██║   ██║  ██║
   ╚═════╝ ╚═╝  ╚═╝   ╚═╝   ╚═╝  ╚═╝
   All mock data — replace with useTopologyOptimizerQuery() to go live.
============================================================================= */

/* ── Budget Defaults (mirrors TopologyOptimizationRequest) ─────────────────── */

const SLIDER_DEFAULTS = {
  repHours:   200,    // max = 400
  csmTouches: 50,     // max = 100
  campaignK:  10,     // max = 50   (in $K; API receives × 1000)
  churnWeight: 0.7,   // 0.0 – 1.0
};

/* ── Master Schedule Rows (12 customers, mirrors CustomerIntervention[]) ────── */

type InterventionIcon = "rep" | "csm" | "campaign" | "exec" | "discount";

interface ScheduleRow {
  rank:          number;
  customerId:    string;
  customerName:  string;
  segment:       "Enterprise" | "Mid-Market" | "SMB";
  churnProb:     number;   // 0-1
  arr:           number;   // raw USD
  interventionType: InterventionIcon;
  interventionLabel: string;
  repHours:      number;
  csmSessions:   number;
  campaignSpend: number;   // USD
  arrRetained:   number;   // USD
  roiScore:      number;   // ratio
  deadlineDays:  number;
}

const MASTER_SCHEDULE: ScheduleRow[] = [
  {
    rank: 1, customerId: "cust-001", customerName: "Axiom Financial",
    segment: "Enterprise", churnProb: 0.81, arr: 480_000,
    interventionType: "exec", interventionLabel: "Executive Sponsor",
    repHours: 18, csmSessions: 4, campaignSpend: 2_400,
    arrRetained: 168_480, roiScore: 18.7, deadlineDays: 7,
  },
  {
    rank: 2, customerId: "cust-002", customerName: "Nexus Logistics",
    segment: "Enterprise", churnProb: 0.74, arr: 360_000,
    interventionType: "csm", interventionLabel: "CSM Intervention",
    repHours: 14, csmSessions: 5, campaignSpend: 0,
    arrRetained: 112_320, roiScore: 12.4, deadlineDays: 10,
  },
  {
    rank: 3, customerId: "cust-003", customerName: "Halcyon Health",
    segment: "Enterprise", churnProb: 0.69, arr: 310_000,
    interventionType: "rep", interventionLabel: "Rep Hours",
    repHours: 20, csmSessions: 3, campaignSpend: 1_200,
    arrRetained: 97_400, roiScore: 9.8, deadlineDays: 14,
  },
  {
    rank: 4, customerId: "cust-004", customerName: "Stratos Retail",
    segment: "Mid-Market", churnProb: 0.67, arr: 195_000,
    interventionType: "campaign", interventionLabel: "Campaign Spend",
    repHours: 8, csmSessions: 2, campaignSpend: 3_800,
    arrRetained: 61_230, roiScore: 8.6, deadlineDays: 14,
  },
  {
    rank: 5, customerId: "cust-005", customerName: "Pinnacle SaaS",
    segment: "Mid-Market", churnProb: 0.63, arr: 178_000,
    interventionType: "exec", interventionLabel: "Executive Sponsor",
    repHours: 10, csmSessions: 3, campaignSpend: 800,
    arrRetained: 52_260, roiScore: 7.9, deadlineDays: 21,
  },
  {
    rank: 6, customerId: "cust-006", customerName: "Solaris Energy",
    segment: "Enterprise", churnProb: 0.61, arr: 420_000,
    interventionType: "rep", interventionLabel: "Rep Hours",
    repHours: 16, csmSessions: 2, campaignSpend: 0,
    arrRetained: 98_280, roiScore: 7.4, deadlineDays: 21,
  },
  {
    rank: 7, customerId: "cust-007", customerName: "Cedarwood Analytics",
    segment: "Mid-Market", churnProb: 0.58, arr: 142_000,
    interventionType: "csm", interventionLabel: "CSM Intervention",
    repHours: 6, csmSessions: 4, campaignSpend: 600,
    arrRetained: 38_220, roiScore: 6.8, deadlineDays: 21,
  },
  {
    rank: 8, customerId: "cust-008", customerName: "Vantage HR",
    segment: "Mid-Market", churnProb: 0.54, arr: 128_000,
    interventionType: "discount", interventionLabel: "Discount Offer",
    repHours: 5, csmSessions: 1, campaignSpend: 1_200,
    arrRetained: 29_440, roiScore: 5.3, deadlineDays: 30,
  },
  {
    rank: 9, customerId: "cust-009", customerName: "Oaken Fintech",
    segment: "SMB", churnProb: 0.51, arr: 68_000,
    interventionType: "campaign", interventionLabel: "Campaign Spend",
    repHours: 3, csmSessions: 1, campaignSpend: 900,
    arrRetained: 15_640, roiScore: 4.6, deadlineDays: 30,
  },
  {
    rank: 10, customerId: "cust-010", customerName: "Meridian Tech",
    segment: "Mid-Market", churnProb: 0.49, arr: 156_000,
    interventionType: "rep", interventionLabel: "Rep Hours",
    repHours: 9, csmSessions: 0, campaignSpend: 0,
    arrRetained: 26_268, roiScore: 3.9, deadlineDays: 30,
  },
  {
    rank: 11, customerId: "cust-011", customerName: "Blueprint Consulting",
    segment: "SMB", churnProb: 0.46, arr: 44_000,
    interventionType: "csm", interventionLabel: "CSM Intervention",
    repHours: 2, csmSessions: 2, campaignSpend: 400,
    arrRetained: 9_240, roiScore: 3.1, deadlineDays: 30,
  },
  {
    rank: 12, customerId: "cust-012", customerName: "Cascade Digital",
    segment: "SMB", churnProb: 0.41, arr: 32_000,
    interventionType: "campaign", interventionLabel: "Campaign Spend",
    repHours: 1, csmSessions: 0, campaignSpend: 600,
    arrRetained: 5_248, roiScore: 2.4, deadlineDays: 30,
  },
];

/* ── Segment config ─────────────────────────────────────────────────────────── */

const SEGMENT_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  Enterprise: {
    bg:     "rgba(94, 106, 210, 0.10)",
    text:   "#828fff",
    border: "rgba(94, 106, 210, 0.22)",
  },
  "Mid-Market": {
    bg:     "rgba(232, 163, 10, 0.10)",
    text:   "#fbbf24",
    border: "rgba(232, 163, 10, 0.22)",
  },
  SMB: {
    bg:     "rgba(39, 166, 68, 0.10)",
    text:   "#4ade80",
    border: "rgba(39, 166, 68, 0.22)",
  },
};

/* ── Intervention icon map ──────────────────────────────────────────────────── */

const INTERVENTION_CONFIG: Record<InterventionIcon, {
  Icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  color: string;
  bg: string;
}> = {
  exec:     { Icon: Briefcase,  color: "#828fff", bg: "rgba(94,106,210,0.12)" },
  csm:      { Icon: Headphones, color: "#4ade80", bg: "rgba(39,166,68,0.10)" },
  rep:      { Icon: UserCheck,  color: "#93c5fd", bg: "rgba(59,130,246,0.10)" },
  campaign: { Icon: Megaphone,  color: "#fbbf24", bg: "rgba(232,163,10,0.10)" },
  discount: { Icon: Target,     color: "#f87171", bg: "rgba(229,72,77,0.10)"  },
};

/* =============================================================================
   INTERNAL SUB-COMPONENTS
============================================================================= */

/* ── Slider component ───────────────────────────────────────────────────────── */

interface SliderControlProps {
  label:    string;
  sublabel: string;
  value:    number;
  min:      number;
  max:      number;
  step:     number;
  unit:     string;
  color:    string;         // CSS color for the fill & thumb
  onChange: (v: number) => void;
  formatValue?: (v: number) => string;
}

const SliderControl: React.FC<SliderControlProps> = ({
  label, sublabel, value, min, max, step, unit, color, onChange, formatValue,
}) => {
  const pct = ((value - min) / (max - min)) * 100;
  const display = formatValue ? formatValue(value) : `${value}${unit}`;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {/* Label row */}
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <div>
          <span style={{
            fontSize: 13, fontWeight: 500, color: "var(--p-ink-muted)",
            fontFamily: "var(--font-body)", display: "block",
          }}>
            {label}
          </span>
          <span style={{
            fontSize: 11, color: "var(--p-ink-tertiary)",
            fontFamily: "var(--font-body)", letterSpacing: "0.1px",
          }}>
            {sublabel}
          </span>
        </div>
        <span style={{
          fontFamily: "var(--font-mono)",
          fontSize: 13,
          fontWeight: 500,
          color,
          background: `${color}18`,
          border: `1px solid ${color}28`,
          borderRadius: "var(--radius-sm)",
          padding: "2px 8px",
          letterSpacing: "-0.2px",
          whiteSpace: "nowrap",
        }}>
          {display}
        </span>
      </div>

      {/* Range input with custom track */}
      <div style={{ position: "relative", height: 20, display: "flex", alignItems: "center" }}>
        {/* Track background */}
        <div style={{
          position: "absolute", left: 0, right: 0, height: 4,
          borderRadius: "var(--radius-pill)",
          background: "var(--p-hairline-strong)",
          overflow: "hidden",
        }}>
          {/* Fill */}
          <div style={{
            position: "absolute", left: 0, height: "100%",
            width: `${pct}%`,
            background: `linear-gradient(90deg, ${color}99, ${color})`,
            borderRadius: "var(--radius-pill)",
            transition: "width 80ms ease",
          }} />
        </div>

        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          style={{
            position: "absolute",
            width: "100%",
            height: "100%",
            opacity: 0,
            cursor: "pointer",
            zIndex: 2,
            margin: 0,
          }}
          aria-label={label}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={value}
        />

        {/* Custom thumb */}
        <div style={{
          position: "absolute",
          left: `calc(${pct}% - 8px)`,
          width: 16,
          height: 16,
          borderRadius: "50%",
          background: color,
          boxShadow: `0 0 0 3px ${color}30, 0 0 12px ${color}50`,
          border: "2px solid var(--p-surface-1)",
          transition: "left 80ms ease",
          zIndex: 1,
          pointerEvents: "none",
        }} />
      </div>

      {/* Min/max labels */}
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <span style={{ fontSize: 10, color: "var(--p-ink-tertiary)", fontFamily: "var(--font-mono)" }}>
          {formatValue ? formatValue(min) : `${min}${unit}`}
        </span>
        <span style={{ fontSize: 10, color: "var(--p-ink-tertiary)", fontFamily: "var(--font-mono)" }}>
          {formatValue ? formatValue(max) : `${max}${unit}`}
        </span>
      </div>
    </div>
  );
};

/* ── Solver Status Badge ────────────────────────────────────────────────────── */

type SolverStatus = "OPTIMAL" | "FEASIBLE" | "RUNNING" | "DEGRADED";

const SOLVER_CONFIG: Record<SolverStatus, { label: string; color: string; glow: string; pulse: boolean }> = {
  OPTIMAL:  { label: "OPTIMAL",  color: "#4ade80", glow: "rgba(39,166,68,0.35)",   pulse: true  },
  FEASIBLE: { label: "FEASIBLE", color: "#fbbf24", glow: "rgba(232,163,10,0.30)",  pulse: false },
  RUNNING:  { label: "RUNNING",  color: "#828fff", glow: "rgba(94,106,210,0.40)",  pulse: true  },
  DEGRADED: { label: "DEGRADED", color: "#f87171", glow: "rgba(229,72,77,0.30)",   pulse: false },
};

const SolverStatusBadge: React.FC<{ status: SolverStatus; objectiveValue: number }> = ({
  status, objectiveValue,
}) => {
  const { t } = useTranslation();
  const { label, color, glow, pulse } = SOLVER_CONFIG[status];
  const isRunning = status === "RUNNING";

  return (
    <div style={{
      background: "rgba(20,21,22,0.72)",
      backdropFilter: "blur(12px)",
      WebkitBackdropFilter: "blur(12px)",
      border: `1px solid ${color}28`,
      borderRadius: "var(--radius-lg)",
      padding: "14px 16px",
      boxShadow: `0 0 24px ${glow}, inset 0 1px 0 rgba(255,255,255,0.05)`,
      display: "flex",
      flexDirection: "column",
      gap: 10,
    }}>
      {/* Status row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Cpu size={13} color={color} strokeWidth={1.5} />
          <span style={{
            fontSize: 11,
            fontWeight: 500,
            letterSpacing: "0.5px",
            textTransform: "uppercase",
            color: "var(--p-ink-tertiary)",
            fontFamily: "var(--font-body)",
          }}>
            {t("topology.solverStatus")}
          </span>
        </div>
        {/* Animated indicator dot */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ position: "relative", width: 8, height: 8 }}>
            <div style={{
              width: 8, height: 8, borderRadius: "50%",
              background: color,
              boxShadow: `0 0 6px ${color}`,
            }} />
            {pulse && (
              <div style={{
                position: "absolute", inset: -3,
                borderRadius: "50%",
                border: `1.5px solid ${color}`,
                animation: "ping 1.4s cubic-bezier(0,0,0.2,1) infinite",
                opacity: 0.6,
              }} />
            )}
          </div>
          <span style={{
            fontFamily: "var(--font-mono)",
            fontSize: 12,
            fontWeight: 600,
            color,
            letterSpacing: "0.2px",
          }}>
            {t(`topology.solverStatuses.${status}` as any, { defaultValue: label })}
          </span>
        </div>
      </div>

      {/* Divider */}
      <div className="divider" />

      {/* Objective value */}
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 6 }}>
        <span style={{ fontSize: 11, color: "var(--p-ink-tertiary)", fontFamily: "var(--font-body)" }}>
          {t("topology.objectiveValue")}
        </span>
        <span style={{
          fontFamily: "var(--font-mono)",
          fontSize: 15,
          fontWeight: 600,
          color: isRunning ? "var(--p-ink-subtle)" : color,
          letterSpacing: "-0.3px",
          transition: "color 400ms ease",
        }}>
          {isRunning ? "···" : objectiveValue.toFixed(4)}
        </span>
      </div>
    </div>
  );
};

/* ── Stat tile ──────────────────────────────────────────────────────────────── */

const StatTile: React.FC<{
  Icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  iconColor: string;
  label: string;
  value: string;
  sub?: string;
}> = ({ Icon, iconColor, label, value, sub }) => (
  <div style={{
    background: "var(--p-surface-1)",
    border: "1px solid var(--p-hairline)",
    borderRadius: "var(--radius-lg)",
    padding: "16px 18px",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
    display: "flex",
    flexDirection: "column",
    gap: 8,
    flex: "1 1 0",
    minWidth: 0,
  }}>
    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
      <div style={{
        width: 28, height: 28, borderRadius: "var(--radius-sm)",
        background: `${iconColor}14`,
        border: `1px solid ${iconColor}22`,
        display: "flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0,
      }}>
        <Icon size={13} strokeWidth={1.8} color={iconColor} />
      </div>
      <span style={{
        fontSize: 11, fontWeight: 500, letterSpacing: "0.3px",
        textTransform: "uppercase", color: "var(--p-ink-tertiary)",
        fontFamily: "var(--font-body)",
      }}>
        {label}
      </span>
    </div>
    <span style={{
      fontFamily: "var(--font-display)",
      fontSize: 24,
      fontWeight: 600,
      letterSpacing: "-0.8px",
      lineHeight: 1.1,
      color: "var(--p-ink)",
      fontVariantNumeric: "tabular-nums",
    }}>
      {value}
    </span>
    {sub && (
      <span style={{ fontSize: 11, color: "var(--p-ink-tertiary)", fontFamily: "var(--font-body)" }}>
        {sub}
      </span>
    )}
  </div>
);

/* ── Churn probability bar ──────────────────────────────────────────────────── */

const ChurnBar: React.FC<{ value: number }> = ({ value }) => {
  const color =
    value >= 0.7 ? "var(--p-danger)"
    : value >= 0.5 ? "var(--p-warning)"
    : "var(--p-success)";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{
        flex: 1, height: 5, borderRadius: "var(--radius-pill)",
        background: "var(--p-hairline-strong)", overflow: "hidden", maxWidth: 60,
      }}>
        <div style={{
          height: "100%",
          width: `${value * 100}%`,
          background: color,
          borderRadius: "var(--radius-pill)",
        }} />
      </div>
      <span style={{
        fontFamily: "var(--font-mono)", fontSize: 11,
        color: "var(--p-ink-subtle)", minWidth: 30, textAlign: "right",
      }}>
        {(value * 100).toFixed(0)}%
      </span>
    </div>
  );
};

/* ── ROI score pill ─────────────────────────────────────────────────────────── */

const RoiPill: React.FC<{ value: number }> = ({ value }) => {
  const [bg, text, border] =
    value >= 10 ? ["rgba(94,106,210,0.12)", "#828fff", "rgba(94,106,210,0.22)"]
    : value >= 6  ? ["rgba(39,166,68,0.10)",  "#4ade80", "rgba(39,166,68,0.20)"]
    : value >= 3  ? ["rgba(232,163,10,0.10)", "#fbbf24", "rgba(232,163,10,0.22)"]
    :               ["rgba(229,72,77,0.10)",  "#f87171", "rgba(229,72,77,0.22)"];

  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 3,
      padding: "3px 8px", borderRadius: "var(--radius-pill)",
      background: bg, border: `1px solid ${border}`, color: text,
      fontSize: 11, fontWeight: 600, fontFamily: "var(--font-mono)",
      letterSpacing: "0.1px", whiteSpace: "nowrap",
    }}>
      <TrendingUp size={9} strokeWidth={2.5} />
      {value.toFixed(1)}×
    </span>
  );
};

/* ── Deadline badge ─────────────────────────────────────────────────────────── */

const DeadlineBadge: React.FC<{ days: number }> = ({ days }) => {
  const { t } = useTranslation();
  const [bg, text, border] =
    days <= 7  ? ["rgba(229,72,77,0.10)",  "#f87171", "rgba(229,72,77,0.22)"]
    : days <= 14 ? ["rgba(232,163,10,0.10)", "#fbbf24", "rgba(232,163,10,0.22)"]
    :              ["rgba(98,102,109,0.10)", "var(--p-ink-subtle)", "rgba(98,102,109,0.18)"];
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 3,
      padding: "2px 7px", borderRadius: "var(--radius-pill)",
      background: bg, border: `1px solid ${border}`, color: text,
      fontSize: 10, fontWeight: 500, fontFamily: "var(--font-mono)",
      whiteSpace: "nowrap",
    }}>
      <Clock size={8} strokeWidth={2} />
      {days} {t("common.days")}
    </span>
  );
};

/* ── Intervention cell ──────────────────────────────────────────────────────── */

const InterventionCell: React.FC<{ type: InterventionIcon; label: string }> = ({ type, label }) => {
  const { t } = useTranslation();
  const { Icon, color, bg } = INTERVENTION_CONFIG[type];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
      <div style={{
        width: 24, height: 24, borderRadius: "var(--radius-xs)",
        background: bg, border: `1px solid ${color}28`,
        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
      }}>
        <Icon size={11} strokeWidth={1.8} color={color} />
      </div>
      <span style={{
        fontSize: 12, fontWeight: 500, color: "var(--p-ink-muted)",
        fontFamily: "var(--font-body)", whiteSpace: "nowrap",
      }}>
        {t(`topology.interventions.${label}` as any, { defaultValue: t(`topology.interventions.${type}` as any, { defaultValue: label }) })}
      </span>
    </div>
  );
};

/* ── Rank badge ─────────────────────────────────────────────────────────────── */

const RankBadge: React.FC<{ rank: number }> = ({ rank }) => {
  const isTop3 = rank <= 3;
  return (
    <div style={{
      width: 26, height: 26, borderRadius: "var(--radius-sm)",
      background: isTop3 ? "rgba(94,106,210,0.12)" : "var(--p-surface-2)",
      border: isTop3 ? "1px solid rgba(94,106,210,0.22)" : "1px solid var(--p-hairline)",
      display: "flex", alignItems: "center", justifyContent: "center",
      flexShrink: 0,
    }}>
      <span style={{
        fontFamily: "var(--font-mono)",
        fontSize: 11, fontWeight: 600,
        color: isTop3 ? "#828fff" : "var(--p-ink-tertiary)",
      }}>
        {rank}
      </span>
    </div>
  );
};

/* =============================================================================
   MAIN VIEW COMPONENT
============================================================================= */

const formatCurrency = (n: number): string => {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
};

export const TopologyOptimizerView: React.FC = () => {
  const { t } = useTranslation();
  /* ── Slider state ─────────────────────────────────────────────────────────── */
  const [repHours,   setRepHours]   = useState(SLIDER_DEFAULTS.repHours);
  const [csmTouches, setCsmTouches] = useState(SLIDER_DEFAULTS.csmTouches);
  const [campaignK,  setCampaignK]  = useState(SLIDER_DEFAULTS.campaignK);
  const [churnWeight, setChurnWeight] = useState(SLIDER_DEFAULTS.churnWeight);

  /* ── Simulated solver state ───────────────────────────────────────────────── */
  const [solverStatus, setSolverStatus] = useState<SolverStatus>("OPTIMAL");
  const [isSolving,    setIsSolving]    = useState(false);
  const [lastSolved,   setLastSolved]   = useState("2 min ago");
  const [optimizerData, setOptimizerData] = useState<any>(null);
  const topologyMutation = useTopologyOptimizerMutation();

  const activeSchedule = useMemo(() => {
    if (!optimizerData) return MASTER_SCHEDULE;
    return optimizerData.master_schedule.map((row: any) => ({
      rank: row.priority_rank,
      customerId: row.customer_id || "unknown",
      customerName: row.customer,
      segment: row.segment,
      arr: row.arr,
      churnProb: row.projected_churn_reduction,
      interventionType: row.intervention_type === "REP_CALL" ? "REP_HOURS" : row.intervention_type === "CSM_TOUCH" ? "CSM" : row.intervention_type === "MARKETING_CAMPAIGN" ? "CAMPAIGN" : "NO_ACTION",
      interventionLabel: row.intervention_type === "REP_CALL" ? "Outbound Call" : row.intervention_type === "CSM_TOUCH" ? "Strategy Session" : row.intervention_type === "MARKETING_CAMPAIGN" ? "Promo Email" : "None",
      arrRetained: row.projected_arr_retained,
      roiScore: row.roi_score,
      deadlineDays: row.action_deadline_days
    }));
  }, [optimizerData]);


  /* ── Derived objective value — linear mock of what the MILP returns ─────── */
  const objectiveValue = useMemo(() => {
    /* Simulates the LP objective: weighted sum of ARR-retention contributions */
    const arrBase  = 714_000;   // sum of projected_arr_retained at defaults
    const repRatio = repHours   / SLIDER_DEFAULTS.repHours;
    const csmRatio = csmTouches / SLIDER_DEFAULTS.csmTouches;
    const camRatio = campaignK  / SLIDER_DEFAULTS.campaignK;
    const obj = (
      churnWeight         * 0.55 * arrBase * repRatio
      + churnWeight       * 0.30 * arrBase * csmRatio
      + (1 - churnWeight) * 0.15 * arrBase * camRatio
    ) / arrBase;
    return obj;
  }, [repHours, csmTouches, campaignK, churnWeight]);

  /* ── Budget utilisation (for BarList) ────────────────────────────────────── */
  const BAR_LIST_DATA = useMemo(() => {
    if (optimizerData && optimizerData.budget_utilisation) {
      const rep = optimizerData.budget_utilisation.find((b: any) => b.resource === "rep_hours");
      const csm = optimizerData.budget_utilisation.find((b: any) => b.resource === "csm_interventions");
      const cam = optimizerData.budget_utilisation.find((b: any) => b.resource === "campaign_spend");

      return [
        {
          name:  t("topology.resourceLabels.repHours", {
            used: rep ? rep.budget_used.toFixed(0) : repHours.toFixed(0),
            total: rep ? rep.budget_total : 400
          }),
          value: rep ? Math.round(rep.utilisation_pct * 100) : Math.round((repHours / 400) * 100),
          icon:  () => <UserCheck size={12} color="#93c5fd" style={{ marginRight: 4 }} />,
        },
        {
          name:  t("topology.resourceLabels.csmTouches", {
            used: csm ? csm.budget_used : csmTouches,
            total: csm ? csm.budget_total : 100
          }),
          value: csm ? Math.round(csm.utilisation_pct * 100) : Math.round((csmTouches / 100) * 100),
          icon:  () => <Headphones size={12} color="#4ade80" style={{ marginRight: 4 }} />,
        },
        {
          name:  t("topology.resourceLabels.campaignSpend", {
            used: cam ? (cam.budget_used/1000).toFixed(1) : campaignK.toFixed(1),
            total: cam ? (cam.budget_total/1000).toFixed(0) : 50
          }),
          value: cam ? Math.round(cam.utilisation_pct * 100) : Math.round((campaignK / 50) * 100),
          icon:  () => <Megaphone size={12} color="#fbbf24" style={{ marginRight: 4 }} />,
        },
      ];
    }
    
    return [
      {
        name:  t("topology.resourceLabels.repHours", { used: repHours.toFixed(0), total: 400 }),
        value: Math.round((repHours / 400) * 100),
        icon:  () => <UserCheck size={12} color="#93c5fd" style={{ marginRight: 4 }} />,
      },
      {
        name:  t("topology.resourceLabels.csmTouches", { used: csmTouches, total: 100 }),
        value: Math.round((csmTouches / 100) * 100),
        icon:  () => <Headphones size={12} color="#4ade80" style={{ marginRight: 4 }} />,
      },
      {
        name:  t("topology.resourceLabels.campaignSpend", { used: campaignK.toFixed(1), total: 50 }),
        value: Math.round((campaignK / 50) * 100),
        icon:  () => <Megaphone size={12} color="#fbbf24" style={{ marginRight: 4 }} />,
      },
    ];
  }, [repHours, csmTouches, campaignK, optimizerData, t]);

  /* ── Portfolio summary metrics (react to sliders) ────────────────────────── */
  const totalArrRetained = useMemo(() => {
    if (optimizerData) return optimizerData.segment_breakdown.reduce((s: number, r: any) => s + r.projected_arr_retained, 0);
    const base = activeSchedule.reduce((s, r) => s + r.arrRetained, 0);
    return base * (repHours / SLIDER_DEFAULTS.repHours) * 0.6
      + base * (csmTouches / SLIDER_DEFAULTS.csmTouches) * 0.25
      + base * (campaignK  / SLIDER_DEFAULTS.campaignK)  * 0.15;
  }, [repHours, csmTouches, campaignK, activeSchedule, optimizerData]);

  const totalCost = useMemo(() => {
    if (optimizerData) return optimizerData.budget_utilisation.reduce((s: number, r: any) => s + r.budget_used, 0);
    return repHours * 150 + csmTouches * 200 + campaignK * 1_000;
  }, [repHours, csmTouches, campaignK, optimizerData]);

  const portfolioROI = totalCost > 0 ? totalArrRetained / totalCost : 0;

  /* ── Run solver (simulated 1.4s) ─────────────────────────────────────────── */
  const handleRun = useCallback(() => {
    if (topologyMutation.isPending) return;
    setSolverStatus("RUNNING");
    
    topologyMutation.mutate({
      max_rep_hours: repHours,
      max_csm_interventions: csmTouches,
      max_campaign_spend: campaignK * 1000,
      planning_period_days: 30,
      churn_weight: churnWeight
    }, {
      onSuccess: (data) => {
        setOptimizerData(data);
        setSolverStatus("OPTIMAL");
        setLastSolved("just now");
      },
      onError: () => {
        setSolverStatus("INFEASIBLE");
      }
    });
  }, [repHours, csmTouches, campaignK, churnWeight, topologyMutation]);

  /* ── Table header cell style ──────────────────────────────────────────────── */
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

  /* ─────────────────────────────────────────────────────────────────────────── */
  /*  RENDER                                                                     */
  /* ─────────────────────────────────────────────────────────────────────────── */

  return (
    <div
      className="animate-fade-in"
      style={{
        display:       "flex",
        height:        "100%",
        minHeight:     0,
        gap:           0,
        overflow:      "hidden",
        background:    "var(--p-canvas)",
      }}
    >
      {/* ════════════════════════════════════════════════════════════════════════
          LEFT PANEL — Optimizer Controls (30%)
      ═══════════════════════════════════════════════════════════════════════════ */}
      <aside
        style={{
          width:          "30%",
          minWidth:       280,
          maxWidth:       360,
          flexShrink:     0,
          borderRight:    "1px solid var(--p-hairline)",
          background:     "var(--p-surface-1)",
          display:        "flex",
          flexDirection:  "column",
          overflowY:      "auto",
          boxShadow:      "inset 0 1px 0 rgba(255,255,255,0.04)",
        }}
      >
        {/* Panel header */}
        <div style={{
          padding:     "20px 20px 16px",
          borderBottom:"1px solid var(--p-hairline)",
          flexShrink:  0,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <div style={{
              width: 28, height: 28, borderRadius: "var(--radius-sm)",
              background: "rgba(94,106,210,0.12)",
              border:     "1px solid rgba(94,106,210,0.22)",
              display:    "flex", alignItems: "center", justifyContent: "center",
            }}>
              <SlidersHorizontal size={13} color="var(--p-primary)" strokeWidth={1.8} />
            </div>
            <span style={{
              fontFamily: "var(--font-display)",
              fontSize:   14, fontWeight: 600,
              letterSpacing: "-0.2px",
              color: "var(--p-ink)",
            }}>
              {t("topology.controls")}
            </span>
          </div>
          <p style={{
            fontSize: 11, color: "var(--p-ink-tertiary)",
            fontFamily: "var(--font-body)", lineHeight: 1.5, marginTop: 2,
          }}>
            {t("topology.subtitle")}
          </p>
        </div>

        {/* Scrollable content */}
        <div style={{
          flex:    1,
          padding: "20px",
          display: "flex", flexDirection: "column", gap: 24,
          overflowY: "auto",
        }}>
          {/* Solver Status badge */}
          <SolverStatusBadge status={solverStatus} objectiveValue={objectiveValue} />

          {/* Sliders */}
          <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
            <SliderControl
              label={t("topology.sliders.repHours.label")}
              sublabel={t("topology.sliders.repHours.sublabel")}
              value={repHours}
              min={20} max={400} step={10}
              unit="h"
              color="#93c5fd"
              onChange={setRepHours}
            />

            <SliderControl
              label={t("topology.sliders.csmTouches.label")}
              sublabel={t("topology.sliders.csmTouches.sublabel")}
              value={csmTouches}
              min={5} max={100} step={1}
              unit=" sessions"
              color="#4ade80"
              onChange={setCsmTouches}
            />

            <SliderControl
              label={t("topology.sliders.campaignSpend.label")}
              sublabel={t("topology.sliders.campaignSpend.sublabel")}
              value={campaignK}
              min={1} max={50} step={1}
              unit="K"
              color="#fbbf24"
              onChange={setCampaignK}
              formatValue={(v) => `$${v}K`}
            />

            <SliderControl
              label={t("topology.sliders.churnWeight.label")}
              sublabel={t("topology.sliders.churnWeight.sublabel")}
              value={churnWeight}
              min={0} max={1} step={0.05}
              unit=""
              color="#828fff"
              onChange={setChurnWeight}
              formatValue={(v) => t("topology.sliders.churnWeight.format", { pct: (v * 100).toFixed(0) })}
            />
          </div>

          {/* Divider */}
          <div className="divider" />

          {/* Constraint summary */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <span style={{
              fontSize: 10, fontWeight: 500, letterSpacing: "0.5px",
              textTransform: "uppercase", color: "var(--p-ink-tertiary)",
              fontFamily: "var(--font-body)",
            }}>
              {t("topology.estimatedCost")}
            </span>
            {[
              { label: t("topology.repCost"),      value: formatCurrency(repHours * 150),    color: "#93c5fd" },
              { label: t("topology.csmCost"),      value: formatCurrency(csmTouches * 200),  color: "#4ade80" },
              { label: t("topology.campaign"),      value: formatCurrency(campaignK * 1_000), color: "#fbbf24" },
              { label: t("topology.totalBudget"),  value: formatCurrency(totalCost),          color: "var(--p-ink-muted)" },
            ].map(({ label, value, color }) => (
              <div key={label} style={{
                display: "flex", justifyContent: "space-between",
                alignItems: "center",
              }}>
                <span style={{ fontSize: 12, color: "var(--p-ink-tertiary)", fontFamily: "var(--font-body)" }}>
                  {label}
                </span>
                <span style={{
                  fontFamily: "var(--font-mono)", fontSize: 12,
                  fontWeight: 500, color,
                }}>
                  {value}
                </span>
              </div>
            ))}
          </div>

          {/* Run button */}
          <button
            className="btn btn-primary"
            onClick={handleRun}
            disabled={isSolving}
            style={{
              width:      "100%",
              gap:        8,
              background: isSolving ? "var(--p-surface-2)" : undefined,
              color:      isSolving ? "var(--p-ink-subtle)" : undefined,
              border:     isSolving ? "1px solid var(--p-hairline)" : undefined,
              transition: "all 200ms ease",
              boxShadow:  isSolving ? "none" : "0 0 16px rgba(94,106,210,0.25)",
            }}
            aria-label={t("topology.runOptimizer")}
          >
            {isSolving
              ? <><RefreshCw size={14} style={{ animation: "spin 1s linear infinite" }} /> {t("topology.solving")}</>
              : <><Play size={14} strokeWidth={2} /> {t("topology.runOptimizer")}</>
            }
          </button>

          {/* Footnote */}
          <p style={{
            fontSize: 10, color: "var(--p-ink-tertiary)",
            fontFamily: "var(--font-body)", lineHeight: 1.5, textAlign: "center",
          }}>
            {t("topology.scipyHint")}
          </p>
        </div>
      </aside>

      {/* ════════════════════════════════════════════════════════════════════════
          RIGHT PANEL — Results Workspace (70%)
      ═══════════════════════════════════════════════════════════════════════════ */}
      <main
        style={{
          flex:          1,
          minWidth:      0,
          display:       "flex",
          flexDirection: "column",
          overflowY:     "auto",
          background:    "var(--p-canvas)",
        }}
      >
        {/* ── Page Header ────────────────────────────────────────────────────── */}
        <div style={{
          padding:      "20px 28px 16px",
          borderBottom: "1px solid var(--p-hairline)",
          flexShrink:   0,
          display:      "flex",
          alignItems:   "center",
          justifyContent: "space-between",
          gap: 16,
          background: "var(--p-surface-1)",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)",
        }}>
          {/* Breadcrumb */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, color: "var(--p-ink-tertiary)", fontFamily: "var(--font-body)" }}>
              {t("topology.breadcrumbs.intelligenceLab")}
            </span>
            <ChevronRight size={12} color="var(--p-ink-tertiary)" />
            <span style={{ fontSize: 12, color: "var(--p-ink-muted)", fontFamily: "var(--font-body)", fontWeight: 500 }}>
              {t("topology.breadcrumbs.topologyOptimizer")}
            </span>
            {/* Solver badge */}
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <div style={{ width: 4, height: 4, borderRadius: "50%", background: "var(--p-hairline-strong)" }} />
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <div style={{
                  width: 5, height: 5, borderRadius: "50%",
                  background: SOLVER_CONFIG[solverStatus].color,
                  boxShadow: `0 0 5px ${SOLVER_CONFIG[solverStatus].color}`,
                }} />
                <span style={{
                  fontFamily: "var(--font-mono)", fontSize: 10,
                  color: SOLVER_CONFIG[solverStatus].color, fontWeight: 500,
                }}>
                  {t(`topology.solverStatuses.${solverStatus}` as any, { defaultValue: solverStatus })}
                </span>
              </div>
            </div>
          </div>

          {/* Right: meta */}
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{
              fontSize: 11, color: "var(--p-ink-tertiary)",
              fontFamily: "var(--font-body)",
              display: "flex", alignItems: "center", gap: 5,
            }}>
              <Clock size={11} strokeWidth={1.5} />
              {t("topology.lastSolved", { time: lastSolved })}
            </span>
            <div style={{
              height: 16, width: 1, background: "var(--p-hairline-strong)",
            }} />
            <span style={{
              fontSize: 11, color: "var(--p-ink-tertiary)",
              fontFamily: "var(--font-body)",
              display: "flex", alignItems: "center", gap: 5,
            }}>
              <Users size={11} strokeWidth={1.5} />
              {t("topology.optimizedCount", { count: activeSchedule.length })}
            </span>
          </div>
        </div>

        {/* ── Body ───────────────────────────────────────────────────────────── */}
        <div style={{
          flex: 1, padding: "24px 28px 32px",
          display: "flex", flexDirection: "column", gap: 24,
        }}>

          {/* ── Zone A: Budget Utilisation (BarList) ─────────────────────────── */}
          <section>
            <div className="zone-header">
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span className="zone-title">{t("topology.resourceUtilisation")}</span>
                <span style={{
                  fontFamily: "var(--font-mono)", fontSize: 10,
                  color: "var(--p-ink-tertiary)",
                  background: "var(--p-surface-2)",
                  border: "1px solid var(--p-hairline)",
                  borderRadius: "var(--radius-sm)",
                  padding: "1px 6px",
                }}>
                  {t("topology.budgetConsumed")}
                </span>
              </div>
              <Zap size={13} color="var(--p-ink-tertiary)" strokeWidth={1.5} />
            </div>

            <div style={{
              background:   "var(--p-surface-1)",
              border:       "1px solid var(--p-hairline)",
              borderRadius: "var(--radius-xl)",
              padding:      "20px 22px",
              boxShadow:    "inset 0 1px 0 rgba(255,255,255,0.04)",
            }}>
              <BarList
                data={BAR_LIST_DATA}
                valueFormatter={(v) => `${v}%`}
                color="indigo"
                className="mt-0"
              />

              {/* Supplemental stats under BarList */}
              <div style={{
                display:       "flex",
                gap:           16,
                marginTop:     16,
                paddingTop:    14,
                borderTop:     "1px solid var(--p-hairline)",
                flexWrap:      "wrap",
              }}>
                {[
                  { label: t("topology.repCostHr"),   value: "$150",                     color: "#93c5fd" },
                  { label: t("topology.csmCostSession"), value: "$200",                  color: "#4ade80" },
                  { label: t("topology.nVariables"),   value: `${activeSchedule.length * 3}`, color: "var(--p-ink-subtle)" },
                  { label: t("topology.nConstraints"), value: `${3 + activeSchedule.length * 3}`, color: "var(--p-ink-subtle)" },
                ].map(({ label, value, color }) => (
                  <div key={label} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                    <span style={{ fontSize: 10, color: "var(--p-ink-tertiary)", fontFamily: "var(--font-body)", letterSpacing: "0.3px", textTransform: "uppercase" }}>
                      {label}
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 500, color, fontFamily: "var(--font-mono)" }}>
                      {value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* ── Zone B: Portfolio Summary tiles ──────────────────────────────── */}
          <section>
            <div className="zone-header">
              <span className="zone-title">{t("topology.portfolioImpact")}</span>
            </div>
            <div style={{ display: "flex", gap: 12 }}>
              <StatTile
                Icon={DollarSign}
                iconColor="#828fff"
                label={t("topology.arrRetained")}
                value={formatCurrency(totalArrRetained)}
                sub={t("topology.atRiskCustomers", { count: activeSchedule.length })}
              />
              <StatTile
                Icon={TrendingUp}
                iconColor="#4ade80"
                label={t("topology.portfolioRoi")}
                value={`${portfolioROI.toFixed(1)}×`}
                sub={t("topology.retainedTotalCost")}
              />
              <StatTile
                Icon={Target}
                iconColor="#fbbf24"
                label={t("topology.totalResourceCost")}
                value={formatCurrency(totalCost)}
                sub={t("topology.repCsmCampaign")}
              />
            </div>
          </section>

          {/* ── Zone C: Master Schedule Table ────────────────────────────────── */}
          <section style={{ flex: 1, minHeight: 0 }}>
            <div className="zone-header">
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span className="zone-title">{t("topology.masterSchedule")}</span>
                <span style={{
                  display: "inline-flex", alignItems: "center", gap: 4,
                  fontFamily: "var(--font-mono)", fontSize: 10,
                  color: "#828fff",
                  background: "rgba(94,106,210,0.10)",
                  border: "1px solid rgba(94,106,210,0.20)",
                  borderRadius: "var(--radius-pill)",
                  padding: "2px 8px",
                }}>
                  <CheckCircle2 size={9} strokeWidth={2.5} />
                  {t("topology.actionsQueued", { count: activeSchedule.length })}
                </span>
              </div>
              <span style={{ fontSize: 11, color: "var(--p-ink-tertiary)", fontFamily: "var(--font-body)" }}>
                {t("topology.sortedByRoi")}
              </span>
            </div>

            <div style={{
              background:   "var(--p-surface-1)",
              border:       "1px solid var(--p-hairline)",
              borderRadius: "var(--radius-xl)",
              overflow:     "hidden",
              boxShadow:    "inset 0 1px 0 rgba(255,255,255,0.04)",
            }}>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 780 }}>
                  <thead>
                    <tr>
                      <th style={{ ...TH, width: 44, textAlign: "center" }}>{t("topology.headers.rank")}</th>
                      <th style={{ ...TH }}>{t("topology.headers.customer")}</th>
                      <th style={{ ...TH }}>{t("topology.headers.segment")}</th>
                      <th style={{ ...TH, textAlign: "right" }}>{t("topology.headers.arr")}</th>
                      <th style={{ ...TH }}>{t("topology.headers.churnRisk")}</th>
                      <th style={{ ...TH }}>{t("topology.headers.intervention")}</th>
                      <th style={{ ...TH, textAlign: "right" }}>{t("topology.headers.arrRetained")}</th>
                      <th style={{ ...TH, textAlign: "center" }}>{t("topology.headers.roi")}</th>
                      <th style={{ ...TH, textAlign: "center" }}>{t("topology.headers.actBy")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeSchedule.map((row, idx) => {
                      const isLast = idx === activeSchedule.length - 1;
                      const seg = SEGMENT_STYLES[row.segment];
                      return (
                        <tr
                          key={row.customerId}
                          style={{
                            background: idx % 2 === 0 ? "transparent" : "rgba(255,255,255,0.01)",
                            transition: "background 100ms ease",
                          }}
                          onMouseEnter={(e) => {
                            (e.currentTarget as HTMLElement).style.background = "rgba(94,106,210,0.04)";
                          }}
                          onMouseLeave={(e) => {
                            (e.currentTarget as HTMLElement).style.background =
                              idx % 2 === 0 ? "transparent" : "rgba(255,255,255,0.01)";
                          }}
                        >
                          {/* Rank */}
                          <td style={{ ...TD, borderBottom: isLast ? "none" : TD.borderBottom, textAlign: "center", paddingLeft: 12, paddingRight: 8 }}>
                            <RankBadge rank={row.rank} />
                          </td>

                          {/* Customer */}
                          <td style={{ ...TD, borderBottom: isLast ? "none" : TD.borderBottom }}>
                            <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                              <span style={{
                                fontSize: 12, fontWeight: 500,
                                color: "var(--p-ink-muted)",
                                fontFamily: "var(--font-body)",
                                whiteSpace: "nowrap",
                              }}>
                                {row.customerName}
                              </span>
                              <span style={{
                                fontSize: 10, color: "var(--p-ink-tertiary)",
                                fontFamily: "var(--font-mono)",
                              }}>
                                {row.customerId}
                              </span>
                            </div>
                          </td>

                          {/* Segment */}
                          <td style={{ ...TD, borderBottom: isLast ? "none" : TD.borderBottom }}>
                            <span style={{
                              display: "inline-flex",
                              alignItems: "center",
                              padding: "2px 8px",
                              borderRadius: "var(--radius-pill)",
                              fontSize: 11, fontWeight: 500,
                              background: seg.bg,
                              color: seg.text,
                              border: `1px solid ${seg.border}`,
                              fontFamily: "var(--font-body)",
                              whiteSpace: "nowrap",
                            }}>
                              {tSegment(row.segment)}
                            </span>
                          </td>

                          {/* ARR */}
                          <td style={{ ...TD, borderBottom: isLast ? "none" : TD.borderBottom, textAlign: "right" }}>
                            <span style={{
                              fontFamily: "var(--font-mono)", fontSize: 12,
                              fontWeight: 500, color: "var(--p-ink-muted)",
                              letterSpacing: "-0.2px",
                            }}>
                              {formatCurrency(row.arr)}
                            </span>
                          </td>

                          {/* Churn risk */}
                          <td style={{ ...TD, borderBottom: isLast ? "none" : TD.borderBottom, minWidth: 110 }}>
                            <ChurnBar value={row.churnProb} />
                          </td>

                          {/* Intervention */}
                          <td style={{ ...TD, borderBottom: isLast ? "none" : TD.borderBottom }}>
                            <InterventionCell type={row.interventionType} label={row.interventionLabel} />
                          </td>

                          {/* ARR Retained */}
                          <td style={{ ...TD, borderBottom: isLast ? "none" : TD.borderBottom, textAlign: "right" }}>
                            <span style={{
                              fontFamily: "var(--font-mono)", fontSize: 12,
                              fontWeight: 600, color: "#4ade80",
                              letterSpacing: "-0.2px",
                            }}>
                              {formatCurrency(row.arrRetained)}
                            </span>
                          </td>

                          {/* ROI */}
                          <td style={{ ...TD, borderBottom: isLast ? "none" : TD.borderBottom, textAlign: "center" }}>
                            <RoiPill value={row.roiScore} />
                          </td>

                          {/* Deadline */}
                          <td style={{ ...TD, borderBottom: isLast ? "none" : TD.borderBottom, textAlign: "center" }}>
                            <DeadlineBadge days={row.deadlineDays} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Table footer */}
              <div style={{
                padding:    "10px 16px",
                borderTop:  "1px solid var(--p-hairline)",
                display:    "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}>
                <span style={{ fontSize: 11, color: "var(--p-ink-tertiary)", fontFamily: "var(--font-body)" }}>
                  {t("topology.showingAllCustomers", { count: activeSchedule.length })}
                </span>
                <span style={{
                  fontFamily: "var(--font-mono)", fontSize: 11,
                  color: "var(--p-ink-tertiary)",
                }}>
                  {t("topology.totalArrAtRisk", { value: formatCurrency(activeSchedule.reduce((s, r) => s + r.arr, 0)) })}
                </span>
              </div>
            </div>
          </section>
        </div>
      </main>

      {/* ── Keyframe for CSS ping animation (inline) ─────────────────────────── */}
      <style>{`
        @keyframes ping {
          75%, 100% { transform: scale(2); opacity: 0; }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default TopologyOptimizerView;

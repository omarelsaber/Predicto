/**
 * src/components/primitives/KpiCard.tsx
 *
 * Predicto V3 — Reusable KPI Card
 * Linear dark aesthetic · Tremor v3 · Tailwind v4
 *
 * Uses:
 *  - Tremor <Card>        → base container (overridden to surface-1 via index.css)
 *  - Tremor <SparkAreaChart> → 7-day mini trend inside the card
 *  - Custom delta badge   → replaces Tremor BadgeDelta for pixel-perfect control
 *
 * Props surface every dimension a Revenue Intelligence card needs:
 *  value        — primary KPI number (pre-formatted string, e.g. "$4.2M")
 *  label        — eyebrow label (e.g. "Total ARR")
 *  delta        — signed delta string (e.g. "+3.2%")
 *  deltaType    — "increase" | "decrease" | "unchanged"
 *  confidence   — "HIGH" | "MEDIUM" | "LOW" (mutes card when LOW)
 *  sparkData    — 7-element array for the mini SparkAreaChart
 *  sparkColor   — Tremor colour token for the spark (e.g. "indigo")
 *  suffix       — optional unit suffix rendered subscript (e.g. "ARR")
 *  isLoading    — renders shimmer skeleton when true
 *  onClick      — optional click handler
 */

import React from "react";
import { Card, SparkAreaChart } from "@tremor/react";
import { TrendingUp, TrendingDown, Minus, AlertTriangle } from "lucide-react";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

export type KpiDeltaType = "increase" | "decrease" | "unchanged";
export type KpiConfidence = "HIGH" | "MEDIUM" | "LOW";
export type TremorColor =
  | "indigo"
  | "emerald"
  | "red"
  | "amber"
  | "sky"
  | "violet"
  | "slate"
  | "neutral";

export interface KpiSparkPoint {
  date: string;   // short label (e.g. "Mon", "May 12")
  value: number;
}

export interface KpiCardProps {
  /** Primary metric value — pass pre-formatted (e.g. "$4.2M", "68%", "7.1") */
  value: string;
  /** Eyebrow label shown above the metric */
  label: string;
  /** Delta string including sign and unit (e.g. "+3.2%", "−0.8pp") */
  delta: string;
  deltaType: KpiDeltaType;
  /** Confidence from the ML backend. LOW mutes the card visually. */
  confidence?: KpiConfidence;
  /** 7 data points for the mini SparkAreaChart */
  sparkData?: KpiSparkPoint[];
  /** Tremor colour token used for the spark line + fill */
  sparkColor?: TremorColor;
  /** Optional unit shown as a muted suffix after the value */
  suffix?: string;
  /** Show skeleton shimmer instead of content */
  isLoading?: boolean;
  /** Accessible description for screen readers */
  description?: string;
  onClick?: () => void;
}

/* --------------------------------------------------------------------------
   Delta badge
   -------------------------------------------------------------------------- */

const DELTA_STYLES: Record<
  KpiDeltaType,
  { bg: string; border: string; text: string; Icon: React.ComponentType<{ size?: number }> }
> = {
  increase: {
    bg:     "rgba(39, 166, 68, 0.10)",
    border: "rgba(39, 166, 68, 0.20)",
    text:   "#4ade80",
    Icon:   TrendingUp,
  },
  decrease: {
    bg:     "rgba(229, 72, 77, 0.10)",
    border: "rgba(229, 72, 77, 0.20)",
    text:   "#f87171",
    Icon:   TrendingDown,
  },
  unchanged: {
    bg:     "rgba(98, 102, 109, 0.12)",
    border: "rgba(98, 102, 109, 0.22)",
    text:   "var(--p-ink-subtle)",
    Icon:   Minus,
  },
};

const DeltaBadge: React.FC<{ delta: string; deltaType: KpiDeltaType }> = ({
  delta,
  deltaType,
}) => {
  const { bg, border, text, Icon } = DELTA_STYLES[deltaType];
  return (
    <span
      style={{
        display:        "inline-flex",
        alignItems:     "center",
        gap:            3,
        padding:        "2px 7px",
        borderRadius:   "9999px",
        background:     bg,
        border:         `1px solid ${border}`,
        color:          text,
        fontSize:       11,
        fontWeight:     500,
        lineHeight:     1.4,
        letterSpacing:  "0.1px",
        fontFamily:     "var(--font-mono)",
        whiteSpace:     "nowrap",
      }}
    >
      <Icon size={10} />
      {delta}
    </span>
  );
};

/* --------------------------------------------------------------------------
   Confidence badge
   -------------------------------------------------------------------------- */

const ConfidenceBadge: React.FC<{ confidence: KpiConfidence }> = ({
  confidence,
}) => {
  const map: Record<KpiConfidence, { label: string; color: string }> = {
    HIGH:   { label: "HIGH",   color: "var(--p-success)"  },
    MEDIUM: { label: "MED",    color: "var(--p-warning)"  },
    LOW:    { label: "LOW",    color: "var(--p-danger)"   },
  };
  const { label, color } = map[confidence];
  return (
    <span
      style={{
        display:       "inline-flex",
        alignItems:    "center",
        gap:           3,
        fontSize:      10,
        fontWeight:    500,
        letterSpacing: "0.4px",
        textTransform: "uppercase",
        color,
        fontFamily:    "var(--font-mono)",
        opacity:       confidence === "LOW" ? 1 : 0.6,
      }}
    >
      <span
        style={{
          width:        5,
          height:       5,
          borderRadius: "50%",
          background:   color,
          flexShrink:   0,
          boxShadow:    confidence === "LOW" ? `0 0 6px ${color}` : "none",
        }}
      />
      {label}
    </span>
  );
};

/* --------------------------------------------------------------------------
   Loading skeleton
   -------------------------------------------------------------------------- */

const KpiCardSkeleton: React.FC = () => (
  <div
    className="kpi-card"
    style={{ display: "flex", flexDirection: "column", gap: 14, minHeight: 140 }}
    aria-busy="true"
    aria-label="Loading metric"
  >
    <div className="skeleton" style={{ height: 12, width: "55%", borderRadius: 4 }} />
    <div className="skeleton" style={{ height: 30, width: "75%", borderRadius: 4 }} />
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <div className="skeleton" style={{ height: 20, width: 60, borderRadius: 9999 }} />
      <div className="skeleton" style={{ height: 36, width: 100, borderRadius: 6 }} />
    </div>
  </div>
);

/* --------------------------------------------------------------------------
   Primary component
   -------------------------------------------------------------------------- */

export const KpiCard: React.FC<KpiCardProps> = ({
  value,
  label,
  delta,
  deltaType,
  confidence = "HIGH",
  sparkData,
  sparkColor = "indigo",
  suffix,
  isLoading = false,
  description,
  onClick,
}) => {
  if (isLoading) return <KpiCardSkeleton />;

  const isLowConfidence  = confidence === "LOW";
  const cardOpacity      = isLowConfidence ? 0.6 : 1;

  return (
    <div
      className="kpi-card"
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => { if (e.key === "Enter" || e.key === " ") onClick(); }
          : undefined
      }
      aria-label={description ?? `${label}: ${value}, ${delta}`}
      style={{
        cursor:  onClick ? "pointer" : "default",
        opacity: cardOpacity,
        display: "flex",
        flexDirection: "column",
        gap: 0,
        /* LOW confidence gets a subtle danger left-border accent */
        borderLeftColor: isLowConfidence ? "var(--p-danger)" : undefined,
        borderLeftWidth: isLowConfidence ? 2 : undefined,
      }}
    >
      {/* ── Top row: eyebrow label + confidence ────────────────────────────── */}
      <div
        style={{
          display:        "flex",
          alignItems:     "center",
          justifyContent: "space-between",
          marginBottom:   10,
        }}
      >
        <span
          className="t-eyebrow"
          style={{
            color:   "var(--p-ink-tertiary)",
            fontSize: 11,
          }}
        >
          {label}
        </span>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {isLowConfidence && (
            <AlertTriangle
              size={11}
              color="var(--p-danger)"
              aria-label="Low data confidence"
            />
          )}
          <ConfidenceBadge confidence={confidence} />
        </div>
      </div>

      {/* ── Primary value ───────────────────────────────────────────────────── */}
      <div
        style={{
          display:     "flex",
          alignItems:  "baseline",
          gap:         5,
          marginBottom: 12,
        }}
      >
        <span
          style={{
            fontFamily:    "var(--font-display)",
            fontSize:      28,
            fontWeight:    600,
            letterSpacing: "-1px",
            lineHeight:    1.1,
            color:         "var(--p-ink)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {value}
        </span>
        {suffix && (
          <span
            style={{
              fontSize:   12,
              fontWeight: 500,
              color:      "var(--p-ink-tertiary)",
              letterSpacing: "0.2px",
            }}
          >
            {suffix}
          </span>
        )}
      </div>

      {/* ── Bottom row: delta badge + spark chart ──────────────────────────── */}
      <div
        style={{
          display:        "flex",
          alignItems:     "flex-end",
          justifyContent: "space-between",
          gap:            8,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <DeltaBadge delta={delta} deltaType={deltaType} />
          <span
            style={{
              fontSize: 10,
              color:    "var(--p-ink-tertiary)",
              fontFamily: "var(--font-body)",
            }}
          >
            vs. prior 30 days
          </span>
        </div>

        {/* 7-day SparkAreaChart */}
        {sparkData && sparkData.length > 0 && (
          <div style={{ flex: "0 0 108px" }}>
            <SparkAreaChart
              data={sparkData}
              categories={["value"]}
              index="date"
              colors={[sparkColor]}
              className="h-9"
              showAnimation={true}
              curveType="monotone"
              /* Tremor CSS variables are overridden in index.css;
                 the chart inherits the canvas dark background automatically */
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default KpiCard;

/**
 * src/views/RiskRetention/RiskRetentionView.tsx
 *
 * Predicto V3 — Risk & Retention Intelligence View
 * Linear dark aesthetic · Tremor v3 · Tailwind v4
 *
 * Three tab panels:
 *  1. Churn Warnings    — At-risk customer ranking table with ML probability bars
 *  2. Expansion Candidates — Upsell opportunity card grid with signal indicators
 *  3. Scenario Simulator   — Glassmorphic lever controls + ARR trajectory AreaChart
 */

import React, { useState, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { createPortal } from "react-dom";
import {
  Card,
  Table,
  TableHead,
  TableHeaderCell,
  TableBody,
  TableRow,
  TableCell,
  ProgressBar,
  AreaChart,
  Badge,
  Text,
  Title,
} from "@tremor/react";
import {
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Zap,
  Users,
  DollarSign,
  ArrowUpRight,
  ChevronRight,
  Shield,
  Target,
  BarChart3,
  SlidersHorizontal,
  Activity,
  Calendar,
  Building2,
  Cpu,
  Star,
  Info,
  ArrowRight,
} from "lucide-react";
import { useShell } from "@/components/shell/AppShell";
import { useTranslation } from "react-i18next";

const API_URL = import.meta.env.VITE_API_URL || "";

/* ==========================================================================
   Types
   ========================================================================== */

type TabId = "churn" | "expansion" | "simulator";

interface ChurnRecord {
  id: string;
  customer: string;
  industry: string;
  tier: "Enterprise" | "Growth" | "Startup";
  arr: number;                    // Annual Recurring Revenue in USD
  churnProbability: number;       // 0–100
  trend: "worsening" | "stable" | "improving";
  lastActivity: string;           // ISO date string
  csmOwner: string;
  riskSignals: string[];
  daysToRenewal: number;
}

interface ExpansionCandidate {
  id: string;
  customer: string;
  industry: string;
  currentArr: number;
  expansionPotential: number;     // Incremental ARR opportunity
  confidence: "HIGH" | "MEDIUM" | "LOW";
  signals: string[];
  recommendedProduct: string;
  recommendedAction: string;
  score: number;                  // 0–100 expansion readiness
  csmOwner: string;
  lastEngagement: string;
}

interface TrajectoryPoint {
  month: string;
  Base: number;
  Optimistic: number;
  Pessimistic: number;
}

/* ==========================================================================
   Mock Data — Churn Warnings
   ========================================================================== */

const CHURN_DATA: ChurnRecord[] = [
  {
    id: "c001",
    customer: "Meridian Financial Corp",
    industry: "Financial Services",
    tier: "Enterprise",
    arr: 1_240_000,
    churnProbability: 87,
    trend: "worsening",
    lastActivity: "2025-04-18",
    csmOwner: "Sarah Kim",
    riskSignals: ["Login frequency −62%", "3 open P1 tickets", "Champion left"],
    daysToRenewal: 34,
  },
  {
    id: "c002",
    customer: "Northbridge Healthcare",
    industry: "Healthcare",
    tier: "Enterprise",
    arr: 890_000,
    churnProbability: 74,
    trend: "worsening",
    lastActivity: "2025-04-22",
    csmOwner: "Marcus Webb",
    riskSignals: ["Budget freeze", "Competitor eval active", "NPS score 4"],
    daysToRenewal: 61,
  },
  {
    id: "c003",
    customer: "Tectonic Labs",
    industry: "Technology",
    tier: "Growth",
    arr: 420_000,
    churnProbability: 68,
    trend: "stable",
    lastActivity: "2025-04-29",
    csmOwner: "Priya Nair",
    riskSignals: ["API usage −44%", "No QBR in 6 months"],
    daysToRenewal: 89,
  },
  {
    id: "c004",
    customer: "Crestwood Retail Group",
    industry: "Retail",
    tier: "Enterprise",
    arr: 710_000,
    churnProbability: 61,
    trend: "stable",
    lastActivity: "2025-05-01",
    csmOwner: "James Okafor",
    riskSignals: ["Acquisition uncertainty", "Decision freeze Q2"],
    daysToRenewal: 112,
  },
  {
    id: "c005",
    customer: "Solace Therapeutics",
    industry: "Biotech",
    tier: "Growth",
    arr: 290_000,
    churnProbability: 55,
    trend: "improving",
    lastActivity: "2025-05-05",
    csmOwner: "Lena Hartmann",
    riskSignals: ["Exec sponsor change", "Seats down 18%"],
    daysToRenewal: 147,
  },
  {
    id: "c006",
    customer: "Vantage Logistics",
    industry: "Logistics",
    tier: "Enterprise",
    arr: 560_000,
    churnProbability: 49,
    trend: "improving",
    lastActivity: "2025-05-07",
    csmOwner: "Sarah Kim",
    riskSignals: ["Integration issues open", "Low feature adoption"],
    daysToRenewal: 78,
  },
  {
    id: "c007",
    customer: "Axiom Insurance",
    industry: "Insurance",
    tier: "Enterprise",
    arr: 1_100_000,
    churnProbability: 43,
    trend: "stable",
    lastActivity: "2025-05-06",
    csmOwner: "Marcus Webb",
    riskSignals: ["New procurement head", "Manual data pulls 3×/week"],
    daysToRenewal: 190,
  },
  {
    id: "c008",
    customer: "BlueSky EdTech",
    industry: "Education",
    tier: "Growth",
    arr: 180_000,
    churnProbability: 38,
    trend: "improving",
    lastActivity: "2025-05-09",
    csmOwner: "Priya Nair",
    riskSignals: ["Budget review", "Low dashboard logins"],
    daysToRenewal: 220,
  },
];

/* ==========================================================================
   Mock Data — Expansion Candidates
   ========================================================================== */

const EXPANSION_DATA: ExpansionCandidate[] = [
  {
    id: "e001",
    customer: "Pinnacle Capital",
    industry: "Private Equity",
    currentArr: 680_000,
    expansionPotential: 340_000,
    confidence: "HIGH",
    signals: [
      "Added 4 new business units in 90 days",
      "Requested Analytics+ demo",
      "Power user cohort up 38%",
    ],
    recommendedProduct: "Analytics+ Suite",
    recommendedAction: "Schedule expansion QBR with CRO",
    score: 91,
    csmOwner: "Lena Hartmann",
    lastEngagement: "2025-05-08",
  },
  {
    id: "e002",
    customer: "Starfield Pharma",
    industry: "Pharmaceuticals",
    currentArr: 920_000,
    expansionPotential: 280_000,
    confidence: "HIGH",
    signals: [
      "Hiring 22 ops analysts (LinkedIn signal)",
      "API rate nearing plan limits",
      "NPS 9 — promoter tier",
    ],
    recommendedProduct: "Seat Expansion + Data Lake",
    recommendedAction: "Propose seat add-on during next sync",
    score: 88,
    csmOwner: "James Okafor",
    lastEngagement: "2025-05-06",
  },
  {
    id: "e003",
    customer: "Arclight Media",
    industry: "Media & Entertainment",
    currentArr: 390_000,
    expansionPotential: 195_000,
    confidence: "MEDIUM",
    signals: [
      "New VP Revenue hired",
      "Running 3 POCs on adjacent modules",
      "Support ticket: 'need multi-region'",
    ],
    recommendedProduct: "Global Deployment Module",
    recommendedAction: "Technical deep-dive on multi-region infra",
    score: 74,
    csmOwner: "Sarah Kim",
    lastEngagement: "2025-05-03",
  },
  {
    id: "e004",
    customer: "Quantum Dynamics",
    industry: "Manufacturing",
    currentArr: 540_000,
    expansionPotential: 210_000,
    confidence: "MEDIUM",
    signals: [
      "ERP integration request submitted",
      "2 new subsidiary accounts needed",
      "Monthly usage hitting cap 4 of last 5 months",
    ],
    recommendedProduct: "Enterprise Connector Pack",
    recommendedAction: "Send ROI deck for ERP integration",
    score: 70,
    csmOwner: "Marcus Webb",
    lastEngagement: "2025-04-30",
  },
  {
    id: "e005",
    customer: "Clearview Analytics",
    industry: "Business Intelligence",
    currentArr: 310_000,
    expansionPotential: 160_000,
    confidence: "MEDIUM",
    signals: [
      "Feature request: advanced ML models",
      "Joined customer advisory board",
      "Referral given to 2 prospects",
    ],
    recommendedProduct: "AI Intelligence Layer",
    recommendedAction: "Co-sell with product team on AI roadmap",
    score: 67,
    csmOwner: "Priya Nair",
    lastEngagement: "2025-05-07",
  },
  {
    id: "e006",
    customer: "Horizon Security",
    industry: "Cybersecurity",
    currentArr: 460_000,
    expansionPotential: 120_000,
    confidence: "LOW",
    signals: [
      "Recent renewal (auto-renewed)",
      "Low admin engagement but high end-user NPS",
      "New CISO onboarding",
    ],
    recommendedProduct: "Compliance & Audit Module",
    recommendedAction: "CISO briefing on compliance use cases",
    score: 52,
    csmOwner: "Lena Hartmann",
    lastEngagement: "2025-04-20",
  },
];

/* ==========================================================================
   Mock Data — Scenario Simulator (ARR Trajectory)
   ========================================================================== */

const buildTrajectory = (
  discountRate: number,
  csmIntensity: number
): TrajectoryPoint[] => {
  // Base ARR: $28.4M as starting point. Growth influenced by levers.
  const BASE_START = 28.4;
  const monthNames = ["Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb"];

  // discountRate 0–100 → 0–10% churn reduction benefit (negative for high discount)
  const discountEffect = (discountRate / 100) * -0.004; // too many discounts erode NRR
  const csmEffect      = (csmIntensity  / 100) *  0.008; // more CSM = better retention
  const netBaseGrowth  = 0.022 + csmEffect + discountEffect; // ~2.2% organic monthly

  return monthNames.map((month, i) => {
    const compoundBase = BASE_START * Math.pow(1 + netBaseGrowth, i + 1);
    return {
      month,
      Base:        parseFloat(compoundBase.toFixed(2)),
      Optimistic:  parseFloat((compoundBase * (1 + 0.06 + (csmIntensity / 100) * 0.04)).toFixed(2)),
      Pessimistic: parseFloat((compoundBase * (1 - 0.04 - (discountRate / 100) * 0.02)).toFixed(2)),
    };
  });
};

/* ==========================================================================
   Utility helpers
   ========================================================================== */

const formatArr = (n: number): string => {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
};

const getChurnColor = (p: number): string => {
  if (p >= 75) return "var(--p-danger)";
  if (p >= 50) return "var(--p-warning)";
  return "#4ade80";
};

const getTremorChurnColor = (p: number): "red" | "amber" | "emerald" => {
  if (p >= 75) return "red";
  if (p >= 50) return "amber";
  return "emerald";
};

const getConfidenceStyle = (
  c: "HIGH" | "MEDIUM" | "LOW"
): { bg: string; border: string; text: string } => ({
  HIGH:   { bg: "rgba(39,166,68,0.10)",   border: "rgba(39,166,68,0.22)",   text: "#4ade80" },
  MEDIUM: { bg: "rgba(232,163,10,0.10)",  border: "rgba(232,163,10,0.22)",  text: "#fbbf24" },
  LOW:    { bg: "rgba(229,72,77,0.10)",   border: "rgba(229,72,77,0.22)",   text: "#f87171" },
}[c]);

/* ==========================================================================
   Sub-component: Tab Button
   ========================================================================== */

interface TabButtonProps {
  id: TabId;
  label: string;
  icon: React.ReactNode;
  count?: number;
  activeTab: TabId;
  onSelect: (id: TabId) => void;
}

const TabButton: React.FC<TabButtonProps> = ({ id, label, icon, count, activeTab, onSelect }) => {
  const isActive = activeTab === id;
  return (
    <button
      onClick={() => onSelect(id)}
      style={{
        display:         "inline-flex",
        alignItems:      "center",
        gap:             7,
        padding:         "8px 14px",
        borderRadius:    "var(--radius-md)",
        border:          isActive ? "1px solid var(--p-hairline-strong)" : "1px solid transparent",
        background:      isActive ? "var(--p-surface-2)" : "transparent",
        color:           isActive ? "var(--p-ink)" : "var(--p-ink-subtle)",
        fontFamily:      "var(--font-body)",
        fontSize:        14,
        fontWeight:      isActive ? 500 : 400,
        cursor:          "pointer",
        transition:      "all 120ms ease",
        whiteSpace:      "nowrap",
      }}
    >
      {icon}
      {label}
      {count !== undefined && (
        <span
          style={{
            display:       "inline-flex",
            alignItems:    "center",
            justifyContent:"center",
            minWidth:      18,
            height:        18,
            borderRadius:  "var(--radius-pill)",
            background:    isActive ? "var(--p-primary)" : "var(--p-hairline-strong)",
            color:         isActive ? "#fff" : "var(--p-ink-subtle)",
            fontSize:      10,
            fontWeight:    600,
            padding:       "0 5px",
            fontFamily:    "var(--font-mono)",
          }}
        >
          {count}
        </span>
      )}
    </button>
  );
};

/* ==========================================================================
   Sub-component: Trend indicator
   ========================================================================== */

const TrendIndicator: React.FC<{ trend: ChurnRecord["trend"] }> = ({ trend }) => {
  const map = {
    worsening: { Icon: TrendingDown, color: "#f87171", label: "Worsening" },
    stable:    { Icon: Activity,     color: "#fbbf24", label: "Stable"    },
    improving: { Icon: TrendingUp,   color: "#4ade80", label: "Improving" },
  };
  const { Icon, color, label } = map[trend];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color, fontSize: 12, fontFamily: "var(--font-mono)" }}>
      <Icon size={12} />
      {label}
    </span>
  );
};

/* ==========================================================================
   Tab 1: Churn Warnings
   ========================================================================== */

interface ChurnWarningsTabProps {
  onIntervene: (query: string) => void;
}

const ChurnWarningsTab: React.FC<ChurnWarningsTabProps> = ({ onIntervene }) => {
  const { t } = useTranslation();
  const [liveChurnData, setLiveChurnData] = useState<ChurnRecord[] | null>(null);
  const [churnMeta, setChurnMeta] = useState<{
    criticalCount: number;
    warningCount: number;
    totalArrAtRisk: number;
    totalCustomers: number;
  } | null>(null);
  const [isLoadingChurn, setIsLoadingChurn] = useState(true);

  useEffect(() => {
    setIsLoadingChurn(true);
    fetch(`${API_URL}/api/v2/churn/competitive?limit=50`)
      .then(r => r.json())
      .then((data) => {
        if (!data?.customers || data.customers.length === 0) return;

        const mapped: ChurnRecord[] = data.customers.map((c: any, i: number) => ({
          id:               c.customer_id,
          customer:         c.customer_name || c.customer_id,
          industry:         "Unknown",
          tier:             (i % 3 === 0 ? "Enterprise" : i % 3 === 1 ? "Growth" : "Startup") as "Enterprise" | "Growth" | "Startup",
          arr:              c.arr ?? 0,
          churnProbability: Math.round((c.churn_probability ?? 0) * 100),
          trend: (
            c.alert_level === "CRITICAL" ? "worsening"
            : c.alert_level === "WARNING" ? "stable"
            : "improving"
          ) as ChurnRecord["trend"],
          lastActivity:   new Date().toISOString().split("T")[0],
          csmOwner:       "CSM Team",
          riskSignals:    [c.top_risk_signal].filter(Boolean),
          daysToRenewal:  Math.floor(30 + Math.random() * 180),
        }));

        mapped.sort((a, b) => b.churnProbability - a.churnProbability);
        setLiveChurnData(mapped);
        setChurnMeta({
          criticalCount:  data.critical_count ?? 0,
          warningCount:   data.warning_count  ?? 0,
          totalArrAtRisk: data.total_arr_at_risk ?? 0,
          totalCustomers: data.total_customers ?? 0,
        });
      })
      .catch(() => {})
      .finally(() => setIsLoadingChurn(false));
  }, []);

  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const toggleRow = useCallback((id: string) => {
    setExpandedRow(prev => (prev === id ? null : id));
  }, []);

  const displayData = liveChurnData ?? [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

      {/* Summary bar */}
      <div
        style={{
          display:      "flex",
          gap:          12,
          flexWrap:     "wrap",
        }}
      >
        {[
          { label: t("risk.criticalLabel"),   value: churnMeta?.criticalCount ?? 0, color: "var(--p-danger)"  },
          { label: t("risk.highRiskLabel"), value: churnMeta?.warningCount ?? 0, color: "var(--p-warning)" },
          { label: t("risk.moderateLabel"),   value: Math.max(0, (churnMeta?.totalCustomers ?? displayData.length) - (churnMeta?.criticalCount ?? 0) - (churnMeta?.warningCount ?? 0)), color: "#4ade80"           },
          { label: t("risk.arrAtRiskLabel"),       value: formatArr(churnMeta?.totalArrAtRisk ?? 0), color: "var(--p-ink)"       },
        ].map(s => (
          <div
            key={s.label}
            style={{
              background:   "var(--p-surface-1)",
              border:       "1px solid var(--p-hairline)",
              borderRadius: "var(--radius-lg)",
              padding:      "12px 18px",
              display:      "flex",
              alignItems:   "center",
              gap:          10,
              boxShadow:    "inset 0 1px 0 0 rgba(255,255,255,0.04)",
              flex:         "1 1 auto",
              minWidth:     150,
            }}
          >
            <span
              style={{
                width:        8,
                height:       8,
                borderRadius: "50%",
                background:   s.color,
                flexShrink:   0,
                boxShadow:    `0 0 8px ${s.color}`,
              }}
            />
            <div>
              <div style={{ fontSize: 10, color: "var(--p-ink-tertiary)", fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 2 }}>{s.label}</div>
              <div style={{ fontSize: 20, fontWeight: 600, fontFamily: "var(--font-display)", color: "var(--p-ink)", letterSpacing: "-0.5px" }}>{s.value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Tremor Table */}
      <Card
        style={{
          background:   "var(--p-surface-1)",
          border:       "1px solid var(--p-hairline)",
          borderRadius: "var(--radius-xl)",
          padding:      0,
          overflow:     "hidden",
        }}
      >
        <Table>
          <TableHead>
            <TableRow style={{ borderBottom: "1px solid var(--p-hairline)" }}>
              {[
                t("risk.table.customer"),
                t("risk.table.industryTier"),
                t("risk.table.arr"),
                t("risk.table.churnRisk"),
                t("risk.table.trend"),
                t("risk.table.renewal"),
                t("risk.table.csmOwner"),
                ""
              ].map(h => (
                <TableHeaderCell
                  key={h}
                  style={{
                    color:         "var(--p-ink-tertiary)",
                    fontSize:      11,
                    fontWeight:    500,
                    letterSpacing: "0.5px",
                    textTransform: "uppercase",
                    fontFamily:    "var(--font-body)",
                    background:    "var(--p-surface-1)",
                    padding:       "10px 16px",
                    borderBottom:  "1px solid var(--p-hairline)",
                  }}
                >
                  {h}
                </TableHeaderCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {displayData.map((record) => {
              const isExpanded = expandedRow === record.id;
              const prob = record.churnProbability;
              const churnColor = getChurnColor(prob);
              const tremorColor = getTremorChurnColor(prob);

              return (
                <React.Fragment key={record.id}>
                  <TableRow
                    style={{
                      borderBottom:    "1px solid var(--p-hairline)",
                      background:      isExpanded ? "var(--p-surface-2)" : "transparent",
                      transition:      "background 120ms ease",
                      cursor:          "pointer",
                    }}
                    onClick={() => toggleRow(record.id)}
                  >
                    {/* Customer */}
                    <TableCell style={{ padding: "13px 16px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div
                          style={{
                            width:        32,
                            height:       32,
                            borderRadius: "var(--radius-md)",
                            background:   `linear-gradient(135deg, rgba(94,106,210,0.25) 0%, rgba(94,106,210,0.08) 100%)`,
                            border:       "1px solid rgba(94,106,210,0.2)",
                            display:      "flex",
                            alignItems:   "center",
                            justifyContent: "center",
                            flexShrink:   0,
                          }}
                        >
                          <Building2 size={14} color="var(--p-primary)" />
                        </div>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 500, color: "var(--p-ink)", letterSpacing: "-0.1px" }}>
                            {record.customer}
                          </div>
                          <div style={{ fontSize: 11, color: "var(--p-ink-tertiary)", fontFamily: "var(--font-mono)", marginTop: 1 }}>
                            ID: {record.id}
                          </div>
                        </div>
                      </div>
                    </TableCell>

                    {/* Industry · Tier */}
                    <TableCell style={{ padding: "13px 16px" }}>
                      <div style={{ fontSize: 12, color: "var(--p-ink-muted)" }}>{record.industry}</div>
                      <span
                        style={{
                          display:       "inline-block",
                          marginTop:     3,
                          padding:       "1px 7px",
                          borderRadius:  "var(--radius-pill)",
                          background:    record.tier === "Enterprise" ? "rgba(94,106,210,0.12)" : "rgba(255,255,255,0.05)",
                          border:        record.tier === "Enterprise" ? "1px solid rgba(94,106,210,0.22)" : "1px solid var(--p-hairline)",
                          color:         record.tier === "Enterprise" ? "var(--p-primary-hover)" : "var(--p-ink-subtle)",
                          fontSize:      10,
                          fontWeight:    500,
                          fontFamily:    "var(--font-mono)",
                          letterSpacing: "0.2px",
                        }}
                      >
                        {record.tier === "Enterprise" ? t("common.enterprise") : record.tier === "Growth" ? t("common.midMarket", "Growth") : t("common.starter", "Startup")}
                      </span>
                    </TableCell>

                    {/* ARR */}
                    <TableCell style={{ padding: "13px 16px" }}>
                      <span
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize:   13,
                          fontWeight: 500,
                          color:      "var(--p-ink)",
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {formatArr(record.arr)}
                      </span>
                    </TableCell>

                    {/* Churn Risk — ProgressBar + % */}
                    <TableCell style={{ padding: "13px 16px", minWidth: 160 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ flex: 1 }}>
                          <ProgressBar
                            value={prob}
                            color={tremorColor}
                            className="h-1.5"
                          />
                        </div>
                        <span
                          style={{
                            fontFamily:  "var(--font-mono)",
                            fontSize:    12,
                            fontWeight:  600,
                            color:       churnColor,
                            minWidth:    32,
                            textAlign:   "right",
                          }}
                        >
                          {prob}%
                        </span>
                      </div>
                      {prob >= 75 && (
                        <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 4 }}>
                          <AlertTriangle size={10} color="var(--p-danger)" />
                          <span style={{ fontSize: 10, color: "var(--p-danger)", fontFamily: "var(--font-mono)" }}>{t("risk.table.criticalThreshold")}</span>
                        </div>
                      )}
                    </TableCell>

                    {/* Trend */}
                    <TableCell style={{ padding: "13px 16px" }}>
                      <TrendIndicator trend={record.trend} />
                    </TableCell>

                    {/* Renewal */}
                    <TableCell style={{ padding: "13px 16px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                        <Calendar size={11} color={record.daysToRenewal <= 60 ? "var(--p-danger)" : "var(--p-ink-tertiary)"} />
                        <span
                          style={{
                            fontFamily: "var(--font-mono)",
                            fontSize:   12,
                            color:      record.daysToRenewal <= 60 ? "var(--p-danger)" : "var(--p-ink-muted)",
                          }}
                        >
                          {record.daysToRenewal}d
                        </span>
                      </div>
                    </TableCell>

                    {/* CSM Owner */}
                    <TableCell style={{ padding: "13px 16px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                        <div
                          style={{
                            width:         24,
                            height:        24,
                            borderRadius:  "var(--radius-full)",
                            background:    "var(--p-surface-3)",
                            border:        "1px solid var(--p-hairline-strong)",
                            display:       "flex",
                            alignItems:    "center",
                            justifyContent:"center",
                            fontSize:      9,
                            fontWeight:    600,
                            color:         "var(--p-ink-muted)",
                            fontFamily:    "var(--font-display)",
                            flexShrink:    0,
                          }}
                        >
                          {record.csmOwner.split(" ").map(n => n[0]).join("")}
                        </div>
                        <span style={{ fontSize: 12, color: "var(--p-ink-muted)" }}>{record.csmOwner}</span>
                      </div>
                    </TableCell>

                    {/* Action button */}
                    <TableCell style={{ padding: "13px 16px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onIntervene(
                              t("risk.playbookQuery", {
                                customer: record.customer,
                                probability: record.churnProbability,
                                signals: record.riskSignals.join(", "),
                                renewal: record.daysToRenewal,
                                arr: formatArr(record.arr),
                              })
                            );
                          }}
                          className="btn btn-primary"
                          style={{
                            padding:      "5px 12px",
                            fontSize:     12,
                            minHeight:    30,
                            height:       30,
                            borderRadius: "var(--radius-md)",
                            fontFamily:   "var(--font-body)",
                          }}
                        >
                          {t("risk.intervene")}
                        </button>
                        <button
                          className="btn-icon"
                          onClick={(e) => { e.stopPropagation(); toggleRow(record.id); }}
                          style={{
                            width:  28,
                            height: 28,
                            minHeight: 28,
                            transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
                            transition: "transform 180ms ease",
                          }}
                        >
                          <ChevronRight size={14} />
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>

                  {/* Expanded signal detail row */}
                  {isExpanded && (
                    <TableRow
                      style={{
                        background:   "var(--p-surface-2)",
                        borderBottom: "1px solid var(--p-hairline)",
                      }}
                    >
                      <TableCell
                        colSpan={8}
                        style={{ padding: "0 16px 14px 58px" }}
                      >
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, paddingTop: 6 }}>
                          <span style={{ fontSize: 11, color: "var(--p-ink-tertiary)", fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.4px", marginRight: 4, alignSelf: "center" }}>
                            {t("risk.table.riskSignalsLabel")}
                          </span>
                          {record.riskSignals.map((sig) => (
                            <span
                              key={sig}
                              style={{
                                display:      "inline-flex",
                                alignItems:   "center",
                                gap:          5,
                                padding:      "3px 10px",
                                borderRadius: "var(--radius-pill)",
                                background:   "rgba(229,72,77,0.08)",
                                border:       "1px solid rgba(229,72,77,0.18)",
                                color:        "#f87171",
                                fontSize:     11,
                                fontFamily:   "var(--font-mono)",
                              }}
                            >
                              <AlertTriangle size={9} />
                              {sig}
                            </span>
                          ))}
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </React.Fragment>
              );
            })}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
};

/* ==========================================================================
   Tab 2: Expansion Candidates
   ========================================================================== */

const ExpansionCandidatesTab: React.FC<{
  onUpsellPlay: (query: string) => void;
}> = ({ onUpsellPlay }) => {
  const { t } = useTranslation();
  const [liveExpansionData, setLiveExpansionData] = useState<ExpansionCandidate[] | null>(null);
  const [totalOpportunityLive, setTotalOpportunityLive] = useState<number | null>(null);

  useEffect(() => {
    fetch(`${API_URL}/api/v2/expansion/candidates`)
      .then(r => r.json())
      .then((data) => {
        if (!data?.candidates || data.candidates.length === 0) return;

        const clusterToConfidence = (c: string): "HIGH" | "MEDIUM" | "LOW" => {
          if (c === "Champion") return "HIGH";
          if (c === "Growth")   return "HIGH";
          if (c === "Stable")   return "MEDIUM";
          return "LOW";
        };

        const mapped: ExpansionCandidate[] = data.candidates.map((c: any) => {
          const clusterSignals: Record<string, string[]> = {
            Champion: [
              "Power user cohort grew 38% this quarter",
              "Feature adoption rate at 92% — highest in portfolio",
              "NPS score 9+ — active promoter",
            ],
            Growth: [
              "Added 2 new departments using the platform",
              "API usage approaching plan limit",
              "Requested advanced analytics demo",
            ],
            Stable: [
              "Usage consistent — expansion window open",
              "New budget cycle starting",
              "Integration request submitted",
            ],
            "At-Risk": [
              c.recommended_campaign_action || "Reactivation opportunity identified",
            ],
          };

          return {
            id:                  c.customer_id,
            customer:            c.customer_name || c.customer_id,
            industry:            "Unknown",
            currentArr:          c.arr ?? 0,
            expansionPotential:  c.predicted_expansion_arr ?? 0,
            confidence:          clusterToConfidence(c.cluster),
            signals:             clusterSignals[c.cluster] ?? [c.recommended_campaign_action || "Expansion signal detected"],
            recommendedProduct:  c.cluster === "Champion" ? "Analytics+ Suite"
                                 : c.cluster === "Growth"  ? "Seat Expansion"
                                 : "Standard Add-on",
            recommendedAction:   c.recommended_campaign_action || "Schedule QBR",
            score: Math.min(99, Math.round(
              (c.expansion_multiplier ?? 0.3) * 180        // base from multiplier
              + (c.feature_adoption_score ?? 0.5) * 15     // boost for feature adoption
              + ((c.months_as_customer ?? 12) > 18 ? 5 : 0)  // boost for tenure
            )),
            csmOwner:            "CSM Team",
            lastEngagement:      new Date().toISOString().split("T")[0],
          };
        });

        setLiveExpansionData(mapped);
        setTotalOpportunityLive(data.total_expansion_opportunity ?? null);
      })
      .catch(() => {});
  }, []);

  const totalOpportunity = totalOpportunityLive ?? 0;
  const displayExpansion = liveExpansionData ?? [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

      {/* Header metrics */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {[
          { label: t("risk.totalUpsellOpportunity"), value: formatArr(totalOpportunity), icon: <DollarSign size={14} />, color: "#4ade80"            },
          { label: t("risk.highConfidenceLabel"),          value: displayExpansion.filter(r => r.confidence === "HIGH").length,   icon: <Shield size={14} />, color: "var(--p-primary-hover)" },
          { label: t("risk.accountsIdentified"),      value: displayExpansion.length,                                        icon: <Target size={14} />, color: "var(--p-ink-muted)"     },
        ].map(m => (
          <div
            key={m.label}
            style={{
              flex:         "1 1 180px",
              background:   "var(--p-surface-1)",
              border:       "1px solid var(--p-hairline)",
              borderRadius: "var(--radius-lg)",
              padding:      "14px 18px",
              display:      "flex",
              alignItems:   "center",
              gap:          12,
              boxShadow:    "inset 0 1px 0 0 rgba(255,255,255,0.04)",
            }}
          >
            <div
              style={{
                width:         36,
                height:        36,
                borderRadius:  "var(--radius-md)",
                background:    `rgba(94,106,210,0.10)`,
                border:        "1px solid rgba(94,106,210,0.18)",
                display:       "flex",
                alignItems:    "center",
                justifyContent:"center",
                color:         m.color,
                flexShrink:    0,
              }}
            >
              {m.icon}
            </div>
            <div>
              <div style={{ fontSize: 10, color: "var(--p-ink-tertiary)", fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 2 }}>{m.label}</div>
              <div style={{ fontSize: 22, fontWeight: 600, fontFamily: "var(--font-display)", color: "var(--p-ink)", letterSpacing: "-0.5px" }}>{m.value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Cards grid */}
      <div
        style={{
          display:             "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))",
          gap:                 16,
        }}
      >
        {displayExpansion.map((cand) => {
          const confStyle = getConfidenceStyle(cand.confidence);
          const scoreBar  = cand.score;

          return (
            <div
              key={cand.id}
              style={{
                background:   "var(--p-surface-1)",
                border:       "1px solid var(--p-hairline)",
                borderRadius: "var(--radius-xl)",
                padding:      24,
                boxShadow:    "inset 0 1px 0 0 rgba(255,255,255,0.04)",
                display:      "flex",
                flexDirection:"column",
                gap:          16,
                transition:   "border-color 160ms ease, background 160ms ease",
                cursor:       "default",
                position:     "relative",
                overflow:     "hidden",
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLDivElement).style.borderColor = "var(--p-hairline-strong)";
                (e.currentTarget as HTMLDivElement).style.background  = "var(--p-surface-2)";
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLDivElement).style.borderColor = "var(--p-hairline)";
                (e.currentTarget as HTMLDivElement).style.background  = "var(--p-surface-1)";
              }}
            >
              {/* Subtle top-right corner glow for high confidence */}
              {cand.confidence === "HIGH" && (
                <div
                  style={{
                    position:     "absolute",
                    top:          -30,
                    right:        -30,
                    width:        80,
                    height:       80,
                    borderRadius: "50%",
                    background:   "radial-gradient(circle, rgba(39,166,68,0.14) 0%, transparent 70%)",
                    pointerEvents:"none",
                  }}
                />
              )}

              {/* Header: customer + confidence + score */}
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      width:         38,
                      height:        38,
                      borderRadius:  "var(--radius-md)",
                      background:    "linear-gradient(135deg, rgba(94,106,210,0.2) 0%, rgba(94,106,210,0.06) 100%)",
                      border:        "1px solid rgba(94,106,210,0.18)",
                      display:       "flex",
                      alignItems:    "center",
                      justifyContent:"center",
                      flexShrink:    0,
                    }}
                  >
                    <Building2 size={16} color="var(--p-primary)" />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontSize:     13,
                        fontWeight:   600,
                        color:        "var(--p-ink)",
                        letterSpacing:"-0.2px",
                        overflow:     "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace:   "nowrap",
                      }}
                    >
                      {cand.customer}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--p-ink-tertiary)", marginTop: 1 }}>
                      {cand.industry}
                    </div>
                  </div>
                </div>
                <span
                  style={{
                    padding:      "3px 9px",
                    borderRadius: "var(--radius-pill)",
                    background:   confStyle.bg,
                    border:       `1px solid ${confStyle.border}`,
                    color:        confStyle.text,
                    fontSize:     10,
                    fontWeight:   600,
                    fontFamily:   "var(--font-mono)",
                    letterSpacing:"0.3px",
                    textTransform:"uppercase",
                    flexShrink:   0,
                  }}
                >
                  {t(`risk.${cand.confidence.toLowerCase()}`)}
                </span>
              </div>

              {/* ARR + Potential */}
              <div
                style={{
                  display:      "flex",
                  alignItems:   "stretch",
                  gap:          1,
                  background:   "var(--p-surface-3)",
                  border:       "1px solid var(--p-hairline)",
                  borderRadius: "var(--radius-md)",
                  overflow:     "hidden",
                }}
              >
                {[
                  { label: t("risk.currentArrLabel"),       value: formatArr(cand.currentArr),         icon: <DollarSign size={10} /> },
                  { label: t("risk.expansionPotentialLabel"), value: `+${formatArr(cand.expansionPotential)}`, icon: <ArrowUpRight size={10} />, highlight: true },
                ].map((m, i) => (
                  <div
                    key={m.label}
                    style={{
                      flex:       1,
                      padding:    "10px 12px",
                      background: i === 1 ? "rgba(39,166,68,0.06)" : "transparent",
                      borderRight: i === 0 ? "1px solid var(--p-hairline)" : "none",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 3, color: i === 1 ? "#4ade80" : "var(--p-ink-tertiary)" }}>
                      {m.icon}
                      <span style={{ fontSize: 10, fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.4px" }}>{m.label}</span>
                    </div>
                    <div
                      style={{
                        fontFamily:  "var(--font-mono)",
                        fontSize:    15,
                        fontWeight:  600,
                        color:       i === 1 ? "#4ade80" : "var(--p-ink)",
                        letterSpacing: "-0.3px",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {m.value}
                    </div>
                  </div>
                ))}
              </div>

              {/* Expansion Readiness Score */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <span style={{ fontSize: 11, color: "var(--p-ink-tertiary)", fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.4px" }}>
                    {t("risk.expansionReadiness")}
                  </span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600, color: "var(--p-ink)" }}>
                    {scoreBar}/100
                  </span>
                </div>
                <ProgressBar
                  value={scoreBar}
                  color={scoreBar >= 80 ? "emerald" : scoreBar >= 60 ? "indigo" : "amber"}
                  className="h-1.5"
                />
              </div>

              {/* Signals */}
              <div>
                <div style={{ fontSize: 10, color: "var(--p-ink-tertiary)", fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 7 }}>
                  {t("risk.buyingSignals")}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  {cand.signals.map((sig) => (
                    <div key={sig} style={{ display: "flex", alignItems: "flex-start", gap: 7 }}>
                      <Zap size={10} color="var(--p-primary-hover)" style={{ marginTop: 3, flexShrink: 0 }} />
                      <span style={{ fontSize: 12, color: "var(--p-ink-muted)", lineHeight: 1.5 }}>{sig}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Recommended product */}
              <div
                style={{
                  background:   "rgba(94,106,210,0.07)",
                  border:       "1px solid rgba(94,106,210,0.16)",
                  borderRadius: "var(--radius-md)",
                  padding:      "10px 12px",
                  display:      "flex",
                  alignItems:   "flex-start",
                  gap:          8,
                }}
              >
                <Cpu size={13} color="var(--p-primary)" style={{ marginTop: 2, flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "var(--p-primary-hover)", marginBottom: 2, fontFamily: "var(--font-mono)" }}>
                    {cand.recommendedProduct}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--p-ink-subtle)" }}>
                    {cand.recommendedAction}
                  </div>
                </div>
              </div>

              {/* Footer: CSM + CTA */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 2 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  <div
                    style={{
                      width:         24,
                      height:        24,
                      borderRadius:  "var(--radius-full)",
                      background:    "var(--p-surface-3)",
                      border:        "1px solid var(--p-hairline-strong)",
                      display:       "flex",
                      alignItems:    "center",
                      justifyContent:"center",
                      fontSize:      9,
                      fontWeight:    600,
                      color:         "var(--p-ink-muted)",
                    }}
                  >
                    {cand.csmOwner.split(" ").map(n => n[0]).join("")}
                  </div>
                  <span style={{ fontSize: 12, color: "var(--p-ink-subtle)" }}>{cand.csmOwner}</span>
                </div>
                <button
                  onClick={() => onUpsellPlay(
                    t("risk.upsellPlaybookQuery", {
                      customer: cand.customer,
                      arr: formatArr(cand.currentArr),
                      potential: formatArr(cand.expansionPotential),
                      confidence: t(`risk.${cand.confidence.toLowerCase()}`),
                      score: cand.score,
                      product: cand.recommendedProduct,
                      signal: cand.signals[0] ?? t("risk.genericSignal", "expansion interest detected"),
                    })
                  )}
                  className="btn btn-primary"
                  style={{
                    padding:      "5px 12px",
                    fontSize:     12,
                    minHeight:    30,
                    height:       30,
                    borderRadius: "var(--radius-md)",
                    display:      "flex",
                    alignItems:   "center",
                    gap:          5,
                  }}
                >
                  <ArrowUpRight size={12} />
                  {t("risk.upsellPlay")}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

/* ==========================================================================
   Sub-component: Glassmorphic Slider
   ========================================================================== */

interface GlassSliderProps {
  label:       string;
  description: string;
  icon:        React.ReactNode;
  value:       number;
  min:         number;
  max:         number;
  step:        number;
  unit:        string;
  onChange:    (v: number) => void;
  accentColor: string;
}

const GlassSlider: React.FC<GlassSliderProps> = ({
  label, description, icon, value, min, max, step, unit, onChange, accentColor
}) => {
  const pct = ((value - min) / (max - min)) * 100;

  return (
    <div
      style={{
        background:     "rgba(20, 21, 22, 0.72)",
        backdropFilter: "blur(16px) saturate(160%)",
        WebkitBackdropFilter: "blur(16px) saturate(160%)",
        border:         "1px solid rgba(255, 255, 255, 0.07)",
        borderRadius:   "var(--radius-xl)",
        padding:        20,
        boxShadow:      `inset 0 1px 0 rgba(255,255,255,0.05), 0 4px 24px rgba(0,0,0,0.4)`,
      }}
    >
      {/* Label row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div
            style={{
              width:         30,
              height:        30,
              borderRadius:  "var(--radius-md)",
              background:    `${accentColor}18`,
              border:        `1px solid ${accentColor}30`,
              display:       "flex",
              alignItems:    "center",
              justifyContent:"center",
              color:         accentColor,
            }}
          >
            {icon}
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 500, color: "var(--p-ink)" }}>{label}</div>
            <div style={{ fontSize: 11, color: "var(--p-ink-tertiary)", marginTop: 1 }}>{description}</div>
          </div>
        </div>
        <div
          style={{
            fontFamily:  "var(--font-mono)",
            fontSize:    18,
            fontWeight:  600,
            color:       accentColor,
            letterSpacing: "-0.4px",
            background:  `${accentColor}10`,
            border:      `1px solid ${accentColor}25`,
            borderRadius:"var(--radius-md)",
            padding:     "4px 10px",
            minWidth:    64,
            textAlign:   "center",
          }}
        >
          {value}{unit}
        </div>
      </div>

      {/* Custom range slider */}
      <div style={{ position: "relative", paddingTop: 8 }}>
        <div
          style={{
            position:     "absolute",
            top:          "50%",
            left:         0,
            right:        0,
            height:       4,
            borderRadius: "var(--radius-pill)",
            background:   "var(--p-hairline-strong)",
            transform:    "translateY(-50%)",
            pointerEvents:"none",
            overflow:     "hidden",
          }}
        >
          <div
            style={{
              width:        `${pct}%`,
              height:       "100%",
              background:   `linear-gradient(90deg, ${accentColor}aa, ${accentColor})`,
              borderRadius: "var(--radius-pill)",
              transition:   "width 60ms linear",
            }}
          />
        </div>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          style={{
            WebkitAppearance: "none",
            appearance:       "none",
            width:            "100%",
            height:           20,
            background:       "transparent",
            cursor:           "pointer",
            position:         "relative",
            zIndex:           1,
          }}
        />
      </div>

      {/* Min / Max labels */}
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 2 }}>
        <span style={{ fontSize: 10, color: "var(--p-ink-tertiary)", fontFamily: "var(--font-mono)" }}>{min}{unit}</span>
        <span style={{ fontSize: 10, color: "var(--p-ink-tertiary)", fontFamily: "var(--font-mono)" }}>{max}{unit}</span>
      </div>
    </div>
  );
};

/* ==========================================================================
   Tab 3: Scenario Simulator
   ========================================================================== */

const ScenarioSimulatorTab: React.FC = () => {
  const { t } = useTranslation();
  const [discountRate,  setDiscountRate]  = useState(15);
  const [csmIntensity,  setCsmIntensity]  = useState(60);

  const trajectoryData = buildTrajectory(discountRate, csmIntensity);
  const finalBase      = trajectoryData[trajectoryData.length - 1].Base;
  const finalOpt       = trajectoryData[trajectoryData.length - 1].Optimistic;
  const finalPess      = trajectoryData[trajectoryData.length - 1].Pessimistic;

  const vsBasePess = (((finalPess - finalBase) / finalBase) * 100).toFixed(1);
  const vsBaseOpt  = (((finalOpt  - finalBase) / finalBase) * 100).toFixed(1);

  const insightText = 
    discountRate > 25 && csmIntensity < 40
      ? t("risk.insightHighDiscount", "⚠️ High discount with low CSM coverage — margin erosion risk is elevated.")
    : csmIntensity > 75
      ? t("risk.insightHighCsm", "✓ High CSM intensity drives strong retention. Consider reducing discount to protect margin.")
    : discountRate < 10 && csmIntensity > 60
      ? t("risk.insightOptimal", "✓ Optimal balance. Low discount + high CSM = highest NRR scenario.")
    : t("risk.insightBalanced", "Balanced levers. Base trajectory reflects steady organic expansion.");

  // Delta from starting base
  const BASE_START  = 28.4;
  const baseDelta   = (((finalBase - BASE_START) / BASE_START) * 100).toFixed(1);
  const optDelta    = (((finalOpt  - BASE_START) / BASE_START) * 100).toFixed(1);
  const pessDelta   = (((finalPess - BASE_START) / BASE_START) * 100).toFixed(1);

  return (
    <div style={{ display: "flex", gap: 20, alignItems: "flex-start", flexWrap: "wrap" }}>

      {/* ── LEFT: Lever Controls ──────────────────────────────────────────── */}
      <div
        style={{
          flex:         "0 0 320px",
          minWidth:     280,
          display:      "flex",
          flexDirection:"column",
          gap:          16,
        }}
      >
        {/* Panel header */}
        <div
          style={{
            background:     "rgba(20, 21, 22, 0.72)",
            backdropFilter: "blur(16px) saturate(160%)",
            WebkitBackdropFilter: "blur(16px) saturate(160%)",
            border:         "1px solid rgba(255, 255, 255, 0.07)",
            borderRadius:   "var(--radius-xl)",
            padding:        "16px 20px",
            display:        "flex",
            alignItems:     "center",
            gap:            10,
          }}
        >
          <SlidersHorizontal size={16} color="var(--p-primary)" />
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--p-ink)", letterSpacing: "-0.1px" }}>{t("risk.leverControls")}</div>
            <div style={{ fontSize: 11, color: "var(--p-ink-tertiary)", marginTop: 1 }}>{t("risk.leverControlsSubtitle")}</div>
          </div>
        </div>

        {/* Sliders */}
        <GlassSlider
          label={t("risk.discountRate")}
          description={t("risk.discountRateDesc")}
          icon={<DollarSign size={13} />}
          value={discountRate}
          min={0}
          max={40}
          step={1}
          unit="%"
          onChange={setDiscountRate}
          accentColor="#e8a30a"
        />

        <GlassSlider
          label={t("risk.csmIntensity")}
          description={t("risk.csmIntensityDesc")}
          icon={<Users size={13} />}
          value={csmIntensity}
          min={0}
          max={100}
          step={5}
          unit="%"
          onChange={setCsmIntensity}
          accentColor="var(--p-primary)"
        />

        {/* Insight box */}
        <div
          style={{
            background:     "rgba(20, 21, 22, 0.72)",
            backdropFilter: "blur(16px) saturate(160%)",
            WebkitBackdropFilter: "blur(16px) saturate(160%)",
            border:         "1px solid rgba(94,106,210,0.16)",
            borderRadius:   "var(--radius-xl)",
            padding:        16,
            boxShadow:      "inset 0 1px 0 rgba(255,255,255,0.04)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
            <Info size={12} color="var(--p-primary)" />
            <span style={{ fontSize: 11, fontWeight: 500, color: "var(--p-primary-hover)", fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.4px" }}>
              {t("risk.modelInsight")}
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[
              { label: t("risk.baseCase"),    value: `$${finalBase}M`, delta: `+${baseDelta}%`, color: "#828fff" },
              { label: t("risk.optimistic"),   value: `$${finalOpt}M`,  delta: `+${optDelta}%`,  color: "#4ade80" },
              { label: t("risk.pessimistic"),  value: `$${finalPess}M`, delta: `+${pessDelta}%`, color: "#f87171" },
            ].map(row => (
              <div key={row.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: row.color, boxShadow: `0 0 6px ${row.color}` }} />
                  <span style={{ fontSize: 12, color: "var(--p-ink-subtle)" }}>{row.label}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600, color: "var(--p-ink)" }}>{row.value}</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: row.color }}>{row.delta}</span>
                </div>
              </div>
            ))}
          </div>
          <div
            style={{
              marginTop:    12,
              paddingTop:   12,
              borderTop:    "1px solid var(--p-hairline)",
              fontSize:     11,
              color:        "var(--p-ink-tertiary)",
              lineHeight:   1.6,
            }}
          >
            {insightText}
          </div>
        </div>

        {/* Reset button */}
        <button
          onClick={() => { setDiscountRate(15); setCsmIntensity(60); }}
          className="btn btn-secondary"
          style={{ width: "100%", justifyContent: "center" }}
        >
          {t("risk.resetToDefaults")}
        </button>
      </div>

      {/* ── RIGHT: ARR Trajectory Chart ──────────────────────────────────── */}
      <div style={{ flex: "1 1 400px", display: "flex", flexDirection: "column", gap: 16 }}>

        {/* Chart card header */}
        <div
          style={{
            background:   "var(--p-surface-1)",
            border:       "1px solid var(--p-hairline)",
            borderRadius: "var(--radius-xl)",
            padding:      "16px 20px",
            display:      "flex",
            alignItems:   "center",
            justifyContent:"space-between",
            boxShadow:    "inset 0 1px 0 0 rgba(255,255,255,0.04)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <BarChart3 size={16} color="var(--p-primary)" />
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--p-ink)", letterSpacing: "-0.1px" }}>{t("risk.arrTrajectory")}</div>
              <div style={{ fontSize: 11, color: "var(--p-ink-tertiary)", marginTop: 1 }}>{t("risk.arrTrajectorySubtitle")}</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 14 }}>
            {[
              { label: t("risk.baseCase"),       color: "#828fff" },
              { label: t("risk.optimistic"), color: "#4ade80" },
              { label: t("risk.pessimistic"),color: "#f87171" },
            ].map(l => (
              <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <div style={{ width: 8, height: 2, background: l.color, borderRadius: 2 }} />
                <span style={{ fontSize: 11, color: "var(--p-ink-tertiary)", fontFamily: "var(--font-mono)" }}>{l.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Tremor AreaChart wrapped in LTR to prevent layout breakage */}
        <Card
          className="scenario-chart"
          style={{
            background:   "var(--p-surface-1)",
            border:       "1px solid var(--p-hairline)",
            borderRadius: "var(--radius-xl)",
            padding:      "20px 16px 12px",
            boxShadow:    "inset 0 1px 0 0 rgba(255,255,255,0.04)",
          }}
        >
          <div dir="ltr">
            {(() => {
              const baseKey = t("risk.baseCase", "Base Case");
              const optKey = t("risk.optimistic", "Optimistic");
              const pessKey = t("risk.pessimistic", "Pessimistic");

              const translatedTrajectory = trajectoryData.map((item: any) => ({
                month: t(`months.${item.month}`, item.month),
                [baseKey]: item.Base,
                [optKey]: item.Optimistic,
                [pessKey]: item.Pessimistic,
              }));

              return (
                <AreaChart
                  data={translatedTrajectory}
                  index="month"
                  categories={[baseKey, optKey, pessKey]}
                  colors={["indigo", "emerald", "red"]}
                  valueFormatter={(v) => `$${v.toFixed(1)}M`}
                  showLegend={false}
                  showAnimation={true}
                  showGridLines={true}
                  curveType="monotone"
                  className="h-72"
                  connectNulls={true}
                  autoMinValue={true}
                />
              );
            })()}
          </div>
        </Card>

        {/* Scenario outcome cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
          {[
            {
              key:         "pessimistic",
              label:       t("risk.pessimistic"),
              description: t("risk.pessimisticDesc"),
              finalArr:    finalPess,
              delta:       pessDelta,
              color:       "#f87171",
              bg:          "rgba(229,72,77,0.07)",
              border:      "rgba(229,72,77,0.18)",
              Icon:        TrendingDown,
            },
            {
              key:         "baseCase",
              label:       t("risk.baseCase"),
              description: t("risk.baseCaseDesc"),
              finalArr:    finalBase,
              delta:       baseDelta,
              color:       "#828fff",
              bg:          "rgba(94,106,210,0.07)",
              border:      "rgba(94,106,210,0.18)",
              Icon:        Activity,
            },
            {
              key:         "optimistic",
              label:       t("risk.optimistic"),
              description: t("risk.optimisticDesc"),
              finalArr:    finalOpt,
              delta:       optDelta,
              color:       "#4ade80",
              bg:          "rgba(39,166,68,0.07)",
              border:      "rgba(39,166,68,0.18)",
              Icon:        TrendingUp,
            },
          ].map(s => (
            <div
              key={s.key}
              style={{
                background:   s.bg,
                border:       `1px solid ${s.border}`,
                borderRadius: "var(--radius-lg)",
                padding:      "12px 14px",
                textAlign:    "center",
              }}
            >
              <div style={{ display: "flex", justifyContent: "center", marginBottom: 6 }}>
                <s.Icon size={14} color={s.color} />
              </div>
              <div style={{ fontSize: 10, color: "var(--p-ink-tertiary)", fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 4 }}>{s.label}</div>
              <div
                style={{
                  fontFamily:  "var(--font-mono)",
                  fontSize:    18,
                  fontWeight:  700,
                  color:       s.color,
                  letterSpacing: "-0.5px",
                  lineHeight:  1,
                  marginBottom: 4,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                ${s.finalArr.toFixed(1)}M
              </div>
              {s.key === "pessimistic" 
                ? <div style={{ fontSize: 11, color: s.color, opacity: 0.7, fontFamily: "var(--font-mono)" }}>
                    {t("risk.vsBase")} {Number(vsBasePess) > 0 ? "+" : ""}{vsBasePess}%
                  </div>
                : s.key === "optimistic"
                ? <div style={{ fontSize: 11, color: s.color, opacity: 0.7, fontFamily: "var(--font-mono)" }}>
                    {t("risk.vsBase")} +{vsBaseOpt}%
                  </div>
                : <div style={{ fontSize: 11, color: s.color, opacity: 0.7, fontFamily: "var(--font-mono)" }}>
                    +{s.delta}% {t("risk.vsStart")}
                  </div>
              }
              <div style={{ fontSize: 10, color: "var(--p-ink-tertiary)", marginTop: 4 }}>{s.description}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

/* ==========================================================================
   Root View: RiskRetentionView
   ========================================================================== */

const RiskRetentionView: React.FC = () => {
  const navigate = useNavigate();
  const { openAiPanel } = useShell();
  const { t, i18n } = useTranslation();
  const [activeTab, setActiveTab] = useState<TabId>("churn");
  const [liveChurnCount,     setLiveChurnCount]     = useState<number>(0);
  const [liveExpansionCount, setLiveExpansionCount] = useState<number>(0);
  const [criticalCount, setCriticalCount] = useState<number>(0);
  const [playbookModal, setPlaybookModal] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [hasRealData, setHasRealData] = useState<boolean | null>(null);

  useEffect(() => {
    setIsLoading(true);

    Promise.all([
      fetch(`${API_URL}/api/v2/churn/competitive?limit=1`).then(r => r.json()).catch(() => null),
      fetch(`${API_URL}/api/v2/expansion/candidates`).then(r => r.json()).catch(() => null)
    ])
      .then(([churnRes, expansionRes]) => {
        const hasData = (churnRes && churnRes.data_availability !== "OFFLINE") ||
                        (expansionRes && expansionRes.data_availability !== "OFFLINE");
        
        setHasRealData(hasData);
        if (hasData) {
          if (churnRes?.total_customers > 0) setLiveChurnCount(churnRes.total_customers);
          if (churnRes?.critical_count !== undefined) setCriticalCount(churnRes.critical_count);
          if (expansionRes?.total_candidates > 0) setLiveExpansionCount(expansionRes.total_candidates);
        } else {
          setLiveChurnCount(0);
          setCriticalCount(0);
          setLiveExpansionCount(0);
        }
      })
      .catch((err) => {
        console.error("Risk retention fetch failed:", err);
        setHasRealData(false);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

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
            background: "linear-gradient(135deg, rgba(229,72,77,0.15) 0%, rgba(229,72,77,0.02) 100%)",
            border: "1px solid rgba(229,72,77,0.25)",
            boxShadow: "0 0 40px rgba(229, 72, 77, 0.15)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 24,
          }}
        >
          <Shield size={32} color="var(--p-danger)" />
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
        display:        "flex",
        flexDirection:  "column",
        gap:            0,
        minHeight:      "100%",
        background:     "var(--p-canvas)",
      }}
    >
      {/* ── Page header ────────────────────────────────────────────────────── */}
      <div
        style={{
          padding:         "24px 28px 0",
          borderBottom:    "1px solid var(--p-hairline)",
          background:      "var(--p-canvas)",
          position:        "sticky",
          top:             0,
          zIndex:          10,
        }}
      >
        {/* Title row */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 18 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 4 }}>
              <div
                style={{
                  width:         36,
                  height:        36,
                  borderRadius:  "var(--radius-md)",
                  background:    "linear-gradient(135deg, rgba(229,72,77,0.22) 0%, rgba(229,72,77,0.08) 100%)",
                  border:        "1px solid rgba(229,72,77,0.2)",
                  display:       "flex",
                  alignItems:    "center",
                  justifyContent:"center",
                }}
              >
                <Shield size={17} color="var(--p-danger)" />
              </div>
              <h1
                style={{
                  fontFamily:    "var(--font-display)",
                  fontSize:      22,
                  fontWeight:    600,
                  letterSpacing: "-0.5px",
                  color:         "var(--p-ink)",
                  margin:        0,
                }}
              >
                {t("risk.title")}
              </h1>
              <span
                style={{
                  padding:       "2px 8px",
                  borderRadius:  "var(--radius-pill)",
                  background:    "rgba(229,72,77,0.10)",
                  border:        "1px solid rgba(229,72,77,0.22)",
                  color:         "#f87171",
                  fontSize:      11,
                  fontFamily:    "var(--font-mono)",
                  fontWeight:    500,
                  letterSpacing: "0.2px",
                }}
              >
                {t("risk.criticalCount", { count: criticalCount })}
              </span>
            </div>
            <p
              style={{
                margin:   0,
                fontSize: 13,
                color:    "var(--p-ink-tertiary)",
              }}
            >
              {t("risk.subtitleDynamic", { count: liveChurnCount + liveExpansionCount })}
            </p>
          </div>

          {/* Actions */}
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
            <button
              className="btn btn-secondary"
              style={{ fontSize: 13 }}
              onClick={async () => {
                try {
                  const res = await fetch(`${API_URL}/api/v1/report`);
                  if (res.ok) {
                    window.open(`${API_URL}/api/v1/report`, "_blank");
                  } else {
                    setPlaybookModal(
                      t("risk.exportReportUnavailable")
                    );
                  }
                } catch {
                  setPlaybookModal(t("risk.exportReportUnreachable"));
                }
              }}
            >
              <BarChart3 size={13} />
              {t("risk.exportReport")}
            </button>
            <button
              className="btn btn-primary"
              style={{ fontSize: 13 }}
              onClick={() => setPlaybookModal(
                t("risk.runPlaybookTemplate")
              )}
            >
              <Zap size={13} />
              {t("risk.runPlaybook")}
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, paddingBottom: 1 }}>
          <TabButton
            id="churn"
            label={t("risk.churnWarnings")}
            icon={<AlertTriangle size={13} />}
            count={liveChurnCount}
            activeTab={activeTab}
            onSelect={setActiveTab}
          />
          <TabButton
            id="expansion"
            label={t("risk.expansionCandidates")}
            icon={<TrendingUp size={13} />}
            count={liveExpansionCount}
            activeTab={activeTab}
            onSelect={setActiveTab}
          />
          <TabButton
            id="simulator"
            label={t("risk.scenarioSimulator")}
            icon={<SlidersHorizontal size={13} />}
            activeTab={activeTab}
            onSelect={setActiveTab}
          />
        </div>
      </div>

      {/* ── Tab Content ────────────────────────────────────────────────────── */}
      <div
        key={activeTab}
        className="animate-fade-in"
        style={{
          flex:    1,
          padding: "24px 28px",
        }}
      >
        {activeTab === "churn"     && <ChurnWarningsTab onIntervene={setPlaybookModal} />}
        {activeTab === "expansion" && <ExpansionCandidatesTab onUpsellPlay={setPlaybookModal} />}
        {activeTab === "simulator" && <ScenarioSimulatorTab   />}
      </div>

      {/* Range input thumb styles injected via style tag */}
      <style>{`
        input[type="range"]::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: var(--p-ink);
          border: 2px solid var(--p-surface-1);
          cursor: pointer;
          box-shadow: 0 0 0 1px var(--p-hairline-strong), 0 2px 6px rgba(0,0,0,0.5);
          transition: transform 100ms ease;
        }
        input[type="range"]::-webkit-slider-thumb:hover {
          transform: scale(1.15);
        }
        input[type="range"]::-moz-range-thumb {
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: var(--p-ink);
          border: 2px solid var(--p-surface-1);
          cursor: pointer;
          box-shadow: 0 0 0 1px var(--p-hairline-strong);
        }
        .scenario-chart .tremor-AreaChart-area {
          fill-opacity: 0.08 !important;
        }
        .scenario-chart .tremor-AreaChart-line {
          stroke-width: 2px !important;
        }
      `}</style>

      {playbookModal && createPortal(
        <div style={{
          position: "fixed", inset: 0, zIndex: 999,
          background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)",
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: 24,
        }}
          onClick={() => setPlaybookModal(null)}
        >
          <div style={{
            background: "var(--p-surface-2)", border: "1px solid var(--p-hairline-strong)",
            borderRadius: "var(--radius-xl)", padding: 28, maxWidth: 560, width: "100%",
            boxShadow: "0 24px 64px rgba(0,0,0,0.8)",
          }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--p-ink)", marginBottom: 12 }}>
              {t("risk.playbookQueryHeader")}
            </div>
            <div style={{
              background: "var(--p-surface-1)", border: "1px solid var(--p-hairline)",
              borderRadius: "var(--radius-md)", padding: 14,
              fontSize: 13, color: "var(--p-ink-muted)", lineHeight: 1.6,
              fontFamily: "var(--font-body)", marginBottom: 16,
            }}>
              {playbookModal}
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="btn btn-secondary" style={{ fontSize: 12 }}
                onClick={() => setPlaybookModal(null)}>
                {t("common.close")}
              </button>
              <button className="btn btn-primary" style={{ fontSize: 12 }}
                onClick={() => {
                  navigator.clipboard.writeText(playbookModal ?? "");
                  openAiPanel?.();
                  setPlaybookModal(null);
                }}>
                {t("risk.copyToAIAnalyst")}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default RiskRetentionView;

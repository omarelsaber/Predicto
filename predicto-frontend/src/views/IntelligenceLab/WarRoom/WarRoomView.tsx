/**
 * src/views/IntelligenceLab/WarRoom/WarRoomView.tsx
 *
 * Predicto V3 — Competitive War Room
 * Linear dark aesthetic · Tremor v3 · Tailwind v4
 *
 * ─── Layout ──────────────────────────────────────────────────────────────────
 *   Header       Dropdowns: Deal ID + Competitor selector
 *   Main Row
 *     Left (55%) Pareto Frontier ScatterChart — Discount% vs Win Probability
 *                "You are here" annotation marker + Pareto frontier overlay
 *     Right (45%) Move Advisor — glassmorphic action cards ranked by EV
 *                Nash Equilibrium Score prominent metric
 *   Bottom       Trade-Off Slider — Margin vs Win Rate live simulation
 *
 * Game-theory data model:
 *   - Historical deal scatter uses real win/lose outcomes for credibility
 *   - Pareto frontier points form the efficiency boundary
 *   - Nash equilibrium computed as: NE_score = (win_prob × margin) / 100
 *   - Move advisor EV = probability_of_success × incremental_arr
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useState, useMemo, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useWarRoomQuery } from "@/hooks/useGodTierQueries";
import { ScatterChart, Card } from "@tremor/react";
import {
  ChevronDown,
  Crosshair,
  Swords,
  Zap,
  TrendingUp,
  TrendingDown,
  Users,
  Star,
  Shield,
  Phone,
  ArrowUpRight,
  Info,
  CheckCircle2,
  AlertTriangle,
  BarChart3,
  Target,
  DollarSign,
  Percent,
  Activity,
  Sparkles,
  ChevronRight,
  Lock,
  Unlock,
  ArrowRight,
} from "lucide-react";

/* =============================================================================
   TYPES
============================================================================= */

interface Deal {
  id: string;
  customer: string;
  arr: number;
  discountPct: number;      // X axis: 0–40
  winProbability: number;   // Y axis: 0–100
  outcome: "won" | "lost" | "active";
  competitor: string;
  stage: string;
  margin: number;           // gross margin %
}

interface ParetoPoint {
  discountPct: number;
  winProbability: number;
  label?: string;
}

interface MoveAdvisorCard {
  id: string;
  title: string;
  description: string;
  rationale: string;
  expectedValue: number;    // incremental ARR $K
  successProbability: number; // 0–100
  effort: "Low" | "Medium" | "High";
  urgency: "Immediate" | "This Week" | "Next 30 Days";
  icon: React.ComponentType<{ size?: number; color?: string }>;
  gameTheoryMove: string;   // e.g. "Dominant Strategy", "Mixed Strategy"
  risk: "Low" | "Medium" | "High";
}

interface CompetitorProfile {
  id: string;
  name: string;
  avgDiscountPct: number;
  avgWinRate: number;
  primaryStrategy: string;
  weaknesses: string[];
  strengths: string[];
  nashPoint: { discount: number; winProb: number };
}

/* =============================================================================
   MOCK DATA — Deals
============================================================================= */

const ALL_DEALS: Deal[] = [
  // Salesforce competitive deals
  { id: "D-1041", customer: "Meridian Financial",    arr: 420_000, discountPct: 8,  winProbability: 82, outcome: "won",    competitor: "salesforce", stage: "Closed Won",      margin: 74 },
  { id: "D-1008", customer: "Blackrock Ops",          arr: 890_000, discountPct: 12, winProbability: 71, outcome: "won",    competitor: "salesforce", stage: "Closed Won",      margin: 68 },
  { id: "D-0974", customer: "Orion Capital",          arr: 310_000, discountPct: 22, winProbability: 61, outcome: "won",    competitor: "salesforce", stage: "Closed Won",      margin: 60 },
  { id: "D-0931", customer: "Crestwood Retail",       arr: 240_000, discountPct: 30, winProbability: 55, outcome: "won",    competitor: "salesforce", stage: "Closed Won",      margin: 53 },
  { id: "D-0912", customer: "NovaTech Systems",       arr: 165_000, discountPct: 38, winProbability: 48, outcome: "lost",   competitor: "salesforce", stage: "Closed Lost",     margin: 44 },
  { id: "D-0889", customer: "Solaris Partners",       arr: 520_000, discountPct: 5,  winProbability: 88, outcome: "won",    competitor: "salesforce", stage: "Closed Won",      margin: 79 },
  { id: "D-0867", customer: "Axiom Insurance",        arr: 780_000, discountPct: 18, winProbability: 65, outcome: "won",    competitor: "salesforce", stage: "Closed Won",      margin: 63 },
  { id: "D-0844", customer: "BlueSky EdTech",         arr: 95_000,  discountPct: 35, winProbability: 42, outcome: "lost",   competitor: "salesforce", stage: "Closed Lost",     margin: 40 },
  { id: "D-0821", customer: "Clearview Analytics",    arr: 190_000, discountPct: 26, winProbability: 58, outcome: "lost",   competitor: "salesforce", stage: "Closed Lost",     margin: 55 },
  { id: "D-0798", customer: "Titan Manufacturing",    arr: 640_000, discountPct: 10, winProbability: 77, outcome: "won",    competitor: "salesforce", stage: "Closed Won",      margin: 71 },
  // Active deal being modelled
  { id: "D-1187", customer: "Pinnacle Capital",       arr: 680_000, discountPct: 16, winProbability: 67, outcome: "active", competitor: "salesforce", stage: "Negotiation",     margin: 65 },

  // HubSpot competitive deals
  { id: "D-1055", customer: "Starfield Pharma",       arr: 290_000, discountPct: 10, winProbability: 79, outcome: "won",    competitor: "hubspot",    stage: "Closed Won",      margin: 72 },
  { id: "D-1022", customer: "Vantage Logistics",      arr: 180_000, discountPct: 14, winProbability: 73, outcome: "won",    competitor: "hubspot",    stage: "Closed Won",      margin: 68 },
  { id: "D-0991", customer: "Horizon Security",       arr: 410_000, discountPct: 20, winProbability: 66, outcome: "won",    competitor: "hubspot",    stage: "Closed Won",      margin: 61 },
  { id: "D-0962", customer: "Quantum Dynamics",       arr: 155_000, discountPct: 28, winProbability: 57, outcome: "lost",   competitor: "hubspot",    stage: "Closed Lost",     margin: 52 },
  { id: "D-0938", customer: "Arclight Media",         arr: 330_000, discountPct: 6,  winProbability: 85, outcome: "won",    competitor: "hubspot",    stage: "Closed Won",      margin: 78 },
  { id: "D-0915", customer: "Luminary Group",         arr: 220_000, discountPct: 33, winProbability: 44, outcome: "lost",   competitor: "hubspot",    stage: "Closed Lost",     margin: 40 },
  { id: "D-0892", customer: "Nexus Health",           arr: 490_000, discountPct: 7,  winProbability: 83, outcome: "won",    competitor: "hubspot",    stage: "Closed Won",      margin: 76 },
  // Active HubSpot deal
  { id: "D-1201", customer: "Tectonic Labs",          arr: 420_000, discountPct: 19, winProbability: 63, outcome: "active", competitor: "hubspot",    stage: "Proposal",        margin: 62 },

  // Microsoft competitive deals
  { id: "D-1071", customer: "Northbridge Healthcare", arr: 960_000, discountPct: 15, winProbability: 70, outcome: "won",    competitor: "microsoft",  stage: "Closed Won",      margin: 65 },
  { id: "D-1048", customer: "Fortress Capital",       arr: 1_200_000, discountPct: 11, winProbability: 75, outcome: "won",  competitor: "microsoft",  stage: "Closed Won",      margin: 69 },
  { id: "D-1019", customer: "Alpine Biotech",         arr: 390_000, discountPct: 24, winProbability: 59, outcome: "lost",   competitor: "microsoft",  stage: "Closed Lost",     margin: 54 },
  { id: "D-0985", customer: "Dominion Energy",        arr: 850_000, discountPct: 8,  winProbability: 80, outcome: "won",    competitor: "microsoft",  stage: "Closed Won",      margin: 74 },
  { id: "D-0954", customer: "Conduit Analytics",      arr: 470_000, discountPct: 29, winProbability: 52, outcome: "lost",   competitor: "microsoft",  stage: "Closed Lost",     margin: 47 },
  { id: "D-0929", customer: "Caspian Group",          arr: 710_000, discountPct: 17, winProbability: 68, outcome: "won",    competitor: "microsoft",  stage: "Closed Won",      margin: 63 },
  // Active Microsoft deal
  { id: "D-1219", customer: "Solace Therapeutics",    arr: 580_000, discountPct: 21, winProbability: 62, outcome: "active", competitor: "microsoft",  stage: "Discovery",       margin: 60 },
];

/* =============================================================================
   MOCK DATA — Competitor Profiles
============================================================================= */

const COMPETITOR_PROFILES: Record<string, CompetitorProfile> = {
  salesforce: {
    id: "salesforce",
    name: "Salesforce",
    avgDiscountPct: 18,
    avgWinRate: 44,
    primaryStrategy: "Platform lock-in + ecosystem breadth",
    weaknesses: ["High implementation cost", "Complexity overhead", "Poor mid-market UX"],
    strengths: ["Brand recognition", "Partner ecosystem", "AppExchange integration"],
    nashPoint: { discount: 16, winProb: 68 },
  },
  hubspot: {
    id: "hubspot",
    name: "HubSpot",
    avgDiscountPct: 14,
    avgWinRate: 51,
    primaryStrategy: "Ease of use + inbound methodology",
    weaknesses: ["Enterprise scalability gaps", "Limited forecasting depth", "Weak RevOps tooling"],
    strengths: ["Fast time-to-value", "Marketing integration", "SMB pricing"],
    nashPoint: { discount: 13, winProb: 71 },
  },
  microsoft: {
    id: "microsoft",
    name: "Microsoft Dynamics",
    avgDiscountPct: 20,
    avgWinRate: 41,
    primaryStrategy: "Azure / M365 bundling + enterprise agreements",
    weaknesses: ["Standalone value prop weak", "Implementation heavy", "CRM UX dated"],
    strengths: ["ERP integration", "Office 365 bundling", "Compliance certifications"],
    nashPoint: { discount: 18, winProb: 65 },
  },
};

/* =============================================================================
   MOCK DATA — Pareto Frontier Points
   Efficient boundary: maximum win prob for each discount level.
   These are hand-calibrated to form a diminishing-returns curve.
============================================================================= */

const PARETO_FRONTIER_POINTS: ParetoPoint[] = [
  { discountPct:  0, winProbability: 62 },
  { discountPct:  3, winProbability: 70 },
  { discountPct:  6, winProbability: 76 },
  { discountPct:  9, winProbability: 81 },
  { discountPct: 12, winProbability: 85 },
  { discountPct: 15, winProbability: 88 },
  { discountPct: 18, winProbability: 90 },
  { discountPct: 21, winProbability: 91 },
  { discountPct: 24, winProbability: 91.5 },
  { discountPct: 27, winProbability: 92 },
  { discountPct: 30, winProbability: 92 },
  { discountPct: 33, winProbability: 92 },
  { discountPct: 36, winProbability: 92 },
  { discountPct: 40, winProbability: 92 },
];

/* =============================================================================
   MOCK DATA — Move Advisor Cards
============================================================================= */

const MOVE_ADVISOR_DATA: Record<string, MoveAdvisorCard[]> = {
  salesforce: [
    {
      id: "ma-sf-1",
      title: "Escalate to Executive Sponsor",
      description: "Bring your VP Sales or CRO into the next meeting to signal commitment and unlock procurement authority.",
      rationale: "Deals with exec-to-exec engagement close 2.3× faster vs Salesforce in this ARR band. Competitor rep is junior — exploit asymmetry.",
      expectedValue: 680,
      successProbability: 78,
      effort: "Medium",
      urgency: "Immediate",
      icon: Users,
      gameTheoryMove: "Dominant Strategy",
      risk: "Low",
    },
    {
      id: "ma-sf-2",
      title: "Invoke Implementation Speed",
      description: "Offer a 6-week go-live guarantee with dedicated onboarding. Contrast Salesforce's avg 22-week implementation.",
      rationale: "Time-to-value is the #1 differentiator in 67% of SF displacement wins. Prospect has a Q3 board deadline creating urgency.",
      expectedValue: 520,
      successProbability: 71,
      effort: "Low",
      urgency: "This Week",
      icon: Zap,
      gameTheoryMove: "Mixed Strategy",
      risk: "Low",
    },
    {
      id: "ma-sf-3",
      title: "Deploy ROI Calculator with CFO Data",
      description: "Send the custom ROI model pre-loaded with their industry benchmarks and current stack cost analysis.",
      rationale: "CFO is the economic buyer. SF's TCO is 40% higher over 3 years. Surface this now before SF submits their commercial proposal.",
      expectedValue: 390,
      successProbability: 64,
      effort: "Medium",
      urgency: "This Week",
      icon: BarChart3,
      gameTheoryMove: "Sequential Strategy",
      risk: "Medium",
    },
    {
      id: "ma-sf-4",
      title: "Reduce Discount to 12% — Hold Margin",
      description: "Trim current discount offer from 16% to 12%. Use saved margin as negotiation reserve for professional services.",
      rationale: "You are above the Nash equilibrium discount (16%). Incremental win probability gain per point above 12% is near-zero. Protect margin now.",
      expectedValue: 190,
      successProbability: 58,
      effort: "Low",
      urgency: "Next 30 Days",
      icon: Shield,
      gameTheoryMove: "Nash Equilibrium",
      risk: "Medium",
    },
  ],
  hubspot: [
    {
      id: "ma-hs-1",
      title: "Champion the RevOps Depth Narrative",
      description: "Run a 45-min live walkthrough of pipeline analytics, forecasting CI, and scenario modelling vs HubSpot's native reporting.",
      rationale: "HubSpot loses on forecasting sophistication in 72% of RevOps-led evaluations. Your prospect's RevOps Director has been active in Slack.",
      expectedValue: 420,
      successProbability: 81,
      effort: "Low",
      urgency: "Immediate",
      icon: Target,
      gameTheoryMove: "Dominant Strategy",
      risk: "Low",
    },
    {
      id: "ma-hs-2",
      title: "Offer Data Migration White Glove",
      description: "Provide free, zero-risk HubSpot CRM data migration as part of onboarding. Use this as a switching-cost neutraliser.",
      rationale: "Migration anxiety is HubSpot's strongest retention lever. Removing it collapses a key defection barrier and signals confidence.",
      expectedValue: 350,
      successProbability: 74,
      effort: "High",
      urgency: "This Week",
      icon: ArrowUpRight,
      gameTheoryMove: "Strategic Commitment",
      risk: "Low",
    },
    {
      id: "ma-hs-3",
      title: "Lock In Multi-Year with Price Protection",
      description: "Propose a 2-year deal with CPI-cap on Year 2 pricing. HubSpot just raised prices 18% — use this as an anchor.",
      rationale: "Price stability is a top 3 concern for 61% of HubSpot replacements. A pricing lock converts a short-term win into long-term retention.",
      expectedValue: 280,
      successProbability: 67,
      effort: "Medium",
      urgency: "This Week",
      icon: Lock,
      gameTheoryMove: "Commitment Device",
      risk: "Medium",
    },
    {
      id: "ma-hs-4",
      title: "Introduce Reference Customer (Same Vertical)",
      description: "Arrange a 30-min reference call with Nexus Health — same healthcare vertical, comparable ARR, direct HubSpot switcher.",
      rationale: "Social proof from same-vertical peers reduces perceived risk by 44% and increases urgency. Nexus Health NPS: 9.",
      expectedValue: 180,
      successProbability: 59,
      effort: "Low",
      urgency: "Next 30 Days",
      icon: Phone,
      gameTheoryMove: "Signalling Game",
      risk: "Low",
    },
  ],
  microsoft: [
    {
      id: "ma-ms-1",
      title: "Unbundle from Azure — Standalone TCO Attack",
      description: "Present an independent TCO analysis showing Microsoft's true cost when Dynamics is decoupled from their Azure commitment.",
      rationale: "MS reps bundle to obscure per-unit cost. Isolating Dynamics pricing exposes a 35% premium vs Predicto. CFO is the ally here.",
      expectedValue: 580,
      successProbability: 73,
      effort: "Medium",
      urgency: "Immediate",
      icon: DollarSign,
      gameTheoryMove: "Information Asymmetry",
      risk: "Low",
    },
    {
      id: "ma-ms-2",
      title: "Exploit Implementation Timeline Weakness",
      description: "Request that Microsoft commits to a go-live timeline in writing. Their avg is 9+ months — your guarantee is 45 days.",
      rationale: "Prospect has announced a Q4 revenue operations overhaul. MS cannot match your deployment velocity. Create a hard deadline commitment.",
      expectedValue: 460,
      successProbability: 76,
      effort: "Low",
      urgency: "Immediate",
      icon: Zap,
      gameTheoryMove: "Dominant Strategy",
      risk: "Low",
    },
    {
      id: "ma-ms-3",
      title: "Propose Parallel Pilot — Lower Risk Barrier",
      description: "Offer a 60-day paid pilot on a single business unit while existing M365 stack remains in place. Zero displacement risk.",
      rationale: "Microsoft's procurement requires multi-quarter approvals. A pilot bypasses this gate and creates internal proof points within their own org.",
      expectedValue: 320,
      successProbability: 68,
      effort: "High",
      urgency: "This Week",
      icon: Activity,
      gameTheoryMove: "Camel's Nose",
      risk: "Medium",
    },
    {
      id: "ma-ms-4",
      title: "Engage IT Stakeholder with Security Narrative",
      description: "Schedule dedicated CISO/IT Director call focused on SOC 2 Type II, GDPR coverage, and data residency controls.",
      rationale: "Microsoft wins on perceived security credibility. Pre-emptively close this objection before IT is pulled into the eval process.",
      expectedValue: 200,
      successProbability: 55,
      effort: "Medium",
      urgency: "Next 30 Days",
      icon: Shield,
      gameTheoryMove: "Pre-emption Strategy",
      risk: "Medium",
    },
  ],
};

/* =============================================================================
   DEAL DROPDOWN OPTIONS
============================================================================= */

const DEAL_OPTIONS = [
  { id: "D-1187", label: "D-1187 · Pinnacle Capital · $680K",  competitor: "salesforce" },
  { id: "D-1201", label: "D-1201 · Tectonic Labs · $420K",     competitor: "hubspot"    },
  { id: "D-1219", label: "D-1219 · Solace Therapeutics · $580K", competitor: "microsoft" },
];

const COMPETITOR_OPTIONS = [
  { id: "salesforce", label: "Salesforce" },
  { id: "hubspot",    label: "HubSpot"    },
  { id: "microsoft",  label: "Microsoft Dynamics" },
];

/* =============================================================================
   SCATTER CHART DATA BUILDER
   Tremor ScatterChart requires: data as array of series objects,
   each series = { name: string, data: Array<{x,y,size,...}> }
============================================================================= */

interface ScatterPoint {
  x: number;    // discountPct
  y: number;    // winProbability
  z: number;    // arr / 1000 → bubble size
  label: string;
}

type ScatterSeries = {
  category: string;
  x:        number;
  y:        number;
  z:        number;
  label:    string;
};

const buildScatterSeries = (deals: Deal[], activeDealId: string): ScatterSeries[] => {
  const result: ScatterSeries[] = [];

  // Won deals
  deals.filter(d => d.outcome === "won" && d.id !== activeDealId).forEach(d => {
    result.push({
      category: "Won",
      x:        d.discountPct,
      y:        d.winProbability,
      z:        Math.max(6, Math.round(d.arr / 60_000)),
      label:    d.customer,
    });
  });

  // Lost deals
  deals.filter(d => d.outcome === "lost").forEach(d => {
    result.push({
      category: "Lost",
      x:        d.discountPct,
      y:        d.winProbability,
      z:        Math.max(5, Math.round(d.arr / 70_000)),
      label:    d.customer,
    });
  });

  // Pareto Frontier points
  PARETO_FRONTIER_POINTS.forEach(p => {
    result.push({
      category: "Pareto Frontier",
      x:        p.discountPct,
      y:        p.winProbability,
      z:        4,
      label:    p.label ?? "Frontier",
    });
  });

  // Active "You Are Here" deal
  const activeDeal = deals.find(d => d.id === activeDealId);
  if (activeDeal) {
    result.push({
      category: "You Are Here",
      x:        activeDeal.discountPct,
      y:        activeDeal.winProbability,
      z:        12,
      label:    activeDeal.customer,
    });
  }

  return result;
};

/* =============================================================================
   UTILITY HELPERS
============================================================================= */

const formatArrK = (k: number): string => {
  if (k >= 1000) return `$${(k / 1000).toFixed(1)}M`;
  return `$${k}K`;
};

const computeNashScore = (discountPct: number, winProb: number, margin: number): number =>
  Math.round((winProb * margin) / 100);

const getEffortColor = (e: MoveAdvisorCard["effort"]): string => ({
  Low:    "#4ade80",
  Medium: "#fbbf24",
  High:   "#f87171",
}[e]);

const getUrgencyColor = (u: MoveAdvisorCard["urgency"]): string => ({
  Immediate:      "#f87171",
  "This Week":    "#fbbf24",
  "Next 30 Days": "var(--p-ink-subtle)",
}[u]);

const getRiskBg = (r: MoveAdvisorCard["risk"]): string => ({
  Low:    "rgba(39,166,68,0.08)",
  Medium: "rgba(232,163,10,0.08)",
  High:   "rgba(229,72,77,0.08)",
}[r]);

/* =============================================================================
   SUB-COMPONENT: Custom Dropdown
============================================================================= */

interface DropdownOption { id: string; label: string; competitor?: string; }
interface DropdownProps {
  label:    string;
  value:    string;
  options:  DropdownOption[];
  onChange: (id: string) => void;
  width?:   number;
}

const WarRoomDropdown: React.FC<DropdownProps> = ({ label, value, options, onChange, width = 260 }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const selected = options.find(o => o.id === value);

  return (
    <div style={{ position: "relative", width }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          width:          "100%",
          display:        "flex",
          alignItems:     "center",
          justifyContent: "space-between",
          gap:            8,
          padding:        "7px 12px",
          background:     "var(--p-surface-2)",
          border:         open ? "1px solid var(--p-primary)" : "1px solid var(--p-hairline-strong)",
          borderRadius:   "var(--radius-md)",
          cursor:         "pointer",
          transition:     "border-color 120ms ease",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 1, minWidth: 0 }}>
          <span style={{ fontSize: 10, color: "var(--p-ink-tertiary)", fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.4px" }}>
            {t(label as any, { defaultValue: label })}
          </span>
          <span style={{ fontSize: 13, fontWeight: 500, color: "var(--p-ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" }}>
            {t(`warroom.options.${selected?.id}` as any, { defaultValue: selected?.label ?? "—" })}
          </span>
        </div>
        <ChevronDown
          size={14}
          color="var(--p-ink-subtle)"
          style={{ flexShrink: 0, transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 160ms ease" }}
        />
      </button>

      {open && (
        <div
          style={{
            position:   "absolute",
            top:        "calc(100% + 5px)",
            left:       0,
            width:      "100%",
            background: "var(--p-surface-3)",
            border:     "1px solid var(--p-hairline-strong)",
            borderRadius: "var(--radius-lg)",
            boxShadow:  "0 8px 32px rgba(0,0,0,0.6)",
            zIndex:     100,
            overflow:   "hidden",
          }}
        >
          {options.map((opt) => (
            <button
              key={opt.id}
              onClick={() => { onChange(opt.id); setOpen(false); }}
              style={{
                width:        "100%",
                display:      "flex",
                alignItems:   "center",
                gap:          8,
                padding:      "9px 12px",
                background:   opt.id === value ? "rgba(94,106,210,0.10)" : "transparent",
                border:       "none",
                cursor:       "pointer",
                textAlign:    "start",
                transition:   "background 100ms ease",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = opt.id === value ? "rgba(94,106,210,0.14)" : "rgba(255,255,255,0.04)")}
              onMouseLeave={e => (e.currentTarget.style.background = opt.id === value ? "rgba(94,106,210,0.10)" : "transparent")}
            >
              {opt.id === value && <CheckCircle2 size={11} color="var(--p-primary-hover)" />}
              <span style={{ fontSize: 13, color: opt.id === value ? "var(--p-ink)" : "var(--p-ink-muted)" }}>
                {t(`warroom.options.${opt.id}` as any, { defaultValue: opt.label })}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

/* =============================================================================
   SUB-COMPONENT: Nash Equilibrium Score Ring
============================================================================= */

const NashScoreRing: React.FC<{ score: number; nashPoint: { discount: number; winProb: number } }> = ({ score, nashPoint }) => {
  const { t } = useTranslation();
  const radius   = 38;
  const stroke   = 5;
  const circ     = 2 * Math.PI * radius;
  const progress = (score / 100) * circ;
  const color    = score >= 65 ? "#4ade80" : score >= 45 ? "#fbbf24" : "#f87171";

  return (
    <div
      style={{
        background:     "rgba(20,21,22,0.72)",
        backdropFilter: "blur(16px) saturate(160%)",
        WebkitBackdropFilter: "blur(16px) saturate(160%)",
        border:         "1px solid rgba(255,255,255,0.07)",
        borderRadius:   "var(--radius-xl)",
        padding:        20,
        display:        "flex",
        alignItems:     "center",
        gap:            18,
        boxShadow:      "inset 0 1px 0 rgba(255,255,255,0.05), 0 4px 24px rgba(0,0,0,0.4)",
      }}
    >
      {/* SVG Ring */}
      <div style={{ position: "relative", flexShrink: 0 }}>
        <svg width={90} height={90} style={{ transform: "rotate(-90deg)" }}>
          {/* Track */}
          <circle cx={45} cy={45} r={radius} fill="none" stroke="var(--p-hairline-strong)" strokeWidth={stroke} />
          {/* Progress */}
          <circle
            cx={45} cy={45} r={radius} fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeDasharray={`${progress} ${circ}`}
            strokeLinecap="round"
            style={{ filter: `drop-shadow(0 0 6px ${color}80)`, transition: "stroke-dasharray 600ms ease" }}
          />
        </svg>
        {/* Centre label */}
        <div
          style={{
            position:       "absolute",
            inset:          0,
            display:        "flex",
            flexDirection:  "column",
            alignItems:     "center",
            justifyContent: "center",
          }}
        >
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 20, fontWeight: 700, color, letterSpacing: "-0.5px", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
            {score}
          </span>
          <span style={{ fontSize: 9, color: "var(--p-ink-tertiary)", fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.3px", marginTop: 2 }}>
            /100
          </span>
        </div>
      </div>

      {/* Label block */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 500, color: "var(--p-primary-hover)", fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 4, display: "flex", alignItems: "center", gap: 5 }}>
          <Sparkles size={10} />
          {t("warroom.nashEquilibriumScore")}
        </div>
        <div style={{ fontSize: 22, fontWeight: 600, fontFamily: "var(--font-display)", color: "var(--p-ink)", letterSpacing: "-0.5px", marginBottom: 5 }}>
          {score >= 65 ? t("warroom.optimalPosition") : score >= 45 ? t("warroom.subOptimal") : t("warroom.unfavourable")}
        </div>
        <div style={{ fontSize: 11, color: "var(--p-ink-tertiary)", lineHeight: 1.6, maxWidth: 210 }}>
          {t("warroom.equilibriumAt", { discount: nashPoint.discount, winProb: nashPoint.winProb })}
          {score >= 65
            ? t("warroom.equilibriumAbove")
            : score >= 45
            ? t("warroom.equilibriumDetect")
            : t("warroom.equilibriumErosion")}
        </div>
      </div>
    </div>
  );
};

/* =============================================================================
   SUB-COMPONENT: Move Advisor Card
============================================================================= */

interface MoveCardProps {
  card:    MoveAdvisorCard;
  rank:    number;
  active:  boolean;
  onToggle: (id: string) => void;
  onExecute?: (card: MoveAdvisorCard) => void;
}

const MoveCard: React.FC<MoveCardProps> = ({ card, rank, active, onToggle, onExecute }) => {
  const { t } = useTranslation();
  const ev         = formatArrK(card.expectedValue);
  const effortColor  = getEffortColor(card.effort);
  const urgencyColor = getUrgencyColor(card.urgency);
  const Icon       = card.icon;

  return (
    <div
      onClick={() => onToggle(card.id)}
      style={{
        background:     "rgba(20,21,22,0.72)",
        backdropFilter: "blur(16px) saturate(160%)",
        WebkitBackdropFilter: "blur(16px) saturate(160%)",
        border:         active
          ? "1px solid rgba(94,106,210,0.40)"
          : "1px solid rgba(255,255,255,0.06)",
        borderRadius:   "var(--radius-xl)",
        padding:        16,
        cursor:         "pointer",
        transition:     "border-color 160ms ease, background 160ms ease",
        boxShadow:      active
          ? "inset 0 1px 0 rgba(255,255,255,0.05), 0 0 0 1px rgba(94,106,210,0.12)"
          : "inset 0 1px 0 rgba(255,255,255,0.04), 0 4px 20px rgba(0,0,0,0.3)",
        position:       "relative",
        overflow:       "hidden",
      }}
    >
      {/* Active glow accent */}
      {active && (
        <div
          style={{
            position:     "absolute",
            top:          -20,
            right:        -20,
            width:        80,
            height:       80,
            borderRadius: "50%",
            background:   "radial-gradient(circle, rgba(94,106,210,0.18) 0%, transparent 70%)",
            pointerEvents:"none",
          }}
        />
      )}

      {/* Top row */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10, flex: 1, minWidth: 0 }}>
          {/* Rank badge */}
          <div
            style={{
              flexShrink:    0,
              width:         22,
              height:        22,
              borderRadius:  "var(--radius-sm)",
              background:    rank === 1 ? "rgba(94,106,210,0.18)" : "rgba(255,255,255,0.05)",
              border:        rank === 1 ? "1px solid rgba(94,106,210,0.30)" : "1px solid var(--p-hairline)",
              display:       "flex",
              alignItems:    "center",
              justifyContent:"center",
              fontFamily:    "var(--font-mono)",
              fontSize:      10,
              fontWeight:    700,
              color:         rank === 1 ? "var(--p-primary-hover)" : "var(--p-ink-tertiary)",
            }}
          >
            {rank}
          </div>

          {/* Icon */}
          <div
            style={{
              flexShrink:    0,
              width:         30,
              height:        30,
              borderRadius:  "var(--radius-md)",
              background:    "rgba(94,106,210,0.10)",
              border:        "1px solid rgba(94,106,210,0.18)",
              display:       "flex",
              alignItems:    "center",
              justifyContent:"center",
            }}
          >
            <Icon size={14} color="var(--p-primary)" />
          </div>

          {/* Title */}
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--p-ink)", letterSpacing: "-0.2px", lineHeight: 1.3 }}>
              {t(`warroom.moves.${card.id}.title` as any, { defaultValue: card.title })}
            </div>
            <div
              style={{
                display:    "inline-flex",
                alignItems: "center",
                gap:        4,
                marginTop:  3,
                padding:    "1px 7px",
                borderRadius:"var(--radius-pill)",
                background: "rgba(94,106,210,0.08)",
                border:     "1px solid rgba(94,106,210,0.16)",
                fontSize:   9,
                fontWeight: 500,
                fontFamily: "var(--font-mono)",
                color:      "var(--p-primary-hover)",
                letterSpacing: "0.2px",
                textTransform: "uppercase",
              }}
            >
              {t(`warroom.moves.strategyTypes.${card.gameTheoryMove}` as any, { defaultValue: card.gameTheoryMove })}
            </div>
          </div>
        </div>

        {/* EV + toggle */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 14, fontWeight: 700, fontFamily: "var(--font-mono)", color: "#4ade80", letterSpacing: "-0.3px", fontVariantNumeric: "tabular-nums" }}>
              {ev}
            </div>
            <div style={{ fontSize: 9, color: "var(--p-ink-tertiary)", fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.3px", marginTop: 1 }}>
              {t("warroom.expectedValue")}
            </div>
          </div>
          <ChevronRight
            size={14}
            color="var(--p-ink-tertiary)"
            style={{ transform: active ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 160ms ease", flexShrink: 0 }}
          />
        </div>
      </div>

      {/* Meta pills row */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: active ? 10 : 0 }}>
        {/* Success probability */}
        <span
          style={{
            display:    "inline-flex",
            alignItems: "center",
            gap:        4,
            padding:    "2px 7px",
            borderRadius:"var(--radius-pill)",
            background: "rgba(255,255,255,0.05)",
            border:     "1px solid var(--p-hairline)",
            fontSize:   10,
            fontFamily: "var(--font-mono)",
            color:      "var(--p-ink-muted)",
          }}
        >
          <Target size={9} color="var(--p-ink-tertiary)" />
          {t("warroom.success", { pct: card.successProbability })}
        </span>
        {/* Effort */}
        <span
          style={{
            display:    "inline-flex",
            alignItems: "center",
            gap:        4,
            padding:    "2px 7px",
            borderRadius:"var(--radius-pill)",
            background: `${effortColor}10`,
            border:     `1px solid ${effortColor}28`,
            fontSize:   10,
            fontFamily: "var(--font-mono)",
            color:      effortColor,
          }}
        >
          <Activity size={9} />
          {t("warroom.effort", { level: t(`warroom.riskLevels.${card.effort}` as any, { defaultValue: card.effort }) })}
        </span>
        {/* Urgency */}
        <span
          style={{
            display:    "inline-flex",
            alignItems: "center",
            gap:        4,
            padding:    "2px 7px",
            borderRadius:"var(--radius-pill)",
            background: `${urgencyColor}10`,
            border:     `1px solid ${urgencyColor}28`,
            fontSize:   10,
            fontFamily: "var(--font-mono)",
            color:      urgencyColor,
          }}
        >
          <Zap size={9} />
          {t(`warroom.urgency.${card.urgency}` as any, { defaultValue: card.urgency })}
        </span>
      </div>

      {/* Expanded detail */}
      {active && (
        <div
          className="animate-fade-in"
          style={{
            borderTop:   "1px solid rgba(255,255,255,0.06)",
            paddingTop:  10,
            display:     "flex",
            flexDirection:"column",
            gap:         8,
          }}
        >
          <p style={{ margin: 0, fontSize: 12, color: "var(--p-ink-muted)", lineHeight: 1.6 }}>
            {t(`warroom.moves.${card.id}.description` as any, { defaultValue: card.description })}
          </p>

          {/* Rationale block */}
          <div
            style={{
              background:   getRiskBg(card.risk),
              border:       "1px solid rgba(255,255,255,0.06)",
              borderRadius: "var(--radius-md)",
              padding:      "8px 10px",
              display:      "flex",
              alignItems:   "flex-start",
              gap:          7,
            }}
          >
            <Info size={11} color="var(--p-ink-tertiary)" style={{ marginTop: 2, flexShrink: 0 }} />
            <p style={{ margin: 0, fontSize: 11, color: "var(--p-ink-subtle)", lineHeight: 1.6 }}>
              {t(`warroom.moves.${card.id}.rationale` as any, { defaultValue: card.rationale })}
            </p>
          </div>

          {/* CTA */}
          <button
            onClick={e => {
              e.stopPropagation();
              onExecute?.(card);
            }}
            className="btn btn-primary"
            style={{ fontSize: 12, minHeight: 32, height: 32, padding: "5px 14px", alignSelf: "flex-start", display: "flex", alignItems: "center", gap: 5 }}
          >
            <ArrowUpRight size={12} />
            {t("warroom.executeMove")}
          </button>
        </div>
      )}
    </div>
  );
};



/* =============================================================================
   SUB-COMPONENT: Trade-Off Slider
============================================================================= */

interface TradeOffSliderProps {
  value:       number;   // 0 = pure margin, 100 = pure win rate
  onChange:    (v: number) => void;
  currentDeal: Deal | undefined;
}

const TradeOffSlider: React.FC<TradeOffSliderProps> = ({ value, onChange, currentDeal }) => {
  if (!currentDeal) return null;

  // Simulate how margin and win rate shift as the slider moves
  const baseDiscount   = currentDeal.discountPct;
  const baseMargin     = currentDeal.margin;
  const baseWinProb    = currentDeal.winProbability;

  // As value goes from 0→100, discount increases 0→+14pp (max), margin falls, winProb rises (diminishing returns)
  const additionalDiscount = (value / 100) * 14;
  const simDiscount   = Math.min(40, baseDiscount + additionalDiscount);
  const simMargin     = Math.max(30, baseMargin - additionalDiscount * 0.85);
  const winDelta      = additionalDiscount * 0.6 * (1 - additionalDiscount / 50); // diminishing returns
  const simWinProb    = Math.min(94, baseWinProb + winDelta);
  const paretoWinProb = PARETO_FRONTIER_POINTS.reduce((best, p) =>
    Math.abs(p.discountPct - simDiscount) < Math.abs(best.discountPct - simDiscount) ? p : best
  ).winProbability;
  const gapToParetoFrontier = Math.max(0, paretoWinProb - simWinProb).toFixed(1);

  return (
    <div
      style={{
        background:   "var(--p-surface-1)",
        border:       "1px solid var(--p-hairline)",
        borderRadius: "var(--radius-xl)",
        padding:      "20px 24px",
        boxShadow:    "inset 0 1px 0 0 rgba(255,255,255,0.04)",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <BarChart3 size={15} color="var(--p-primary)" />
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--p-ink)", letterSpacing: "-0.1px" }}>
              Margin vs Win Rate Trade-Off Simulator
            </div>
            <div style={{ fontSize: 11, color: "var(--p-ink-tertiary)", marginTop: 1 }}>
              Adjust to simulate impact of additional discount. Pareto frontier gap shown live.
            </div>
          </div>
        </div>

        {/* Gap to frontier */}
        <div
          style={{
            display:       "flex",
            alignItems:    "center",
            gap:           6,
            padding:       "6px 12px",
            background:    parseFloat(gapToParetoFrontier) > 3 ? "rgba(229,72,77,0.08)" : "rgba(39,166,68,0.08)",
            border:        parseFloat(gapToParetoFrontier) > 3 ? "1px solid rgba(229,72,77,0.20)" : "1px solid rgba(39,166,68,0.20)",
            borderRadius:  "var(--radius-pill)",
          }}
        >
          {parseFloat(gapToParetoFrontier) > 3
            ? <TrendingDown size={12} color="#f87171" />
            : <TrendingUp   size={12} color="#4ade80" />
          }
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: parseFloat(gapToParetoFrontier) > 3 ? "#f87171" : "#4ade80" }}>
            {gapToParetoFrontier}pp below frontier
          </span>
        </div>
      </div>

      {/* Slider + labels */}
      <div style={{ position: "relative", marginBottom: 14 }}>
        {/* Axis labels */}
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
          <span style={{ fontSize: 10, color: "var(--p-ink-tertiary)", fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.4px", display: "flex", alignItems: "center", gap: 4 }}>
            <Lock size={9} /> Protect Margin
          </span>
          <span style={{ fontSize: 10, color: "var(--p-ink-tertiary)", fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.4px", display: "flex", alignItems: "center", gap: 4 }}>
            Maximise Win Rate <Unlock size={9} />
          </span>
        </div>

        {/* Custom track */}
        <div style={{ position: "relative", paddingTop: 4 }}>
          <div
            style={{
              position:     "absolute",
              top:          "50%",
              left:         0,
              right:        0,
              height:       6,
              transform:    "translateY(-50%)",
              borderRadius: "var(--radius-pill)",
              overflow:     "hidden",
              background:   "var(--p-hairline-strong)",
              pointerEvents:"none",
            }}
          >
            {/* Gradient fill */}
            <div
              style={{
                width:        `${value}%`,
                height:       "100%",
                background:   "linear-gradient(90deg, #4ade80 0%, #fbbf24 50%, #f87171 100%)",
                borderRadius: "var(--radius-pill)",
                transition:   "width 60ms linear",
              }}
            />
          </div>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={value}
            onChange={e => onChange(Number(e.target.value))}
            style={{
              WebkitAppearance: "none",
              appearance:       "none",
              width:            "100%",
              height:           24,
              background:       "transparent",
              cursor:           "pointer",
              position:         "relative",
              zIndex:           1,
            }}
          />
        </div>
      </div>

      {/* Simulated metrics row */}
      <div
        style={{
          display:             "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap:                 12,
        }}
      >
        {[
          {
            label:  "Sim. Discount",
            value:  `${simDiscount.toFixed(1)}%`,
            base:   `${baseDiscount}%`,
            color:  simDiscount > baseDiscount + 5 ? "#f87171" : "var(--p-ink)",
            icon:   <Percent size={11} />,
          },
          {
            label:  "Sim. Margin",
            value:  `${simMargin.toFixed(1)}%`,
            base:   `${baseMargin}%`,
            color:  simMargin < baseMargin - 5 ? "#f87171" : "#4ade80",
            icon:   <DollarSign size={11} />,
          },
          {
            label:  "Sim. Win Prob",
            value:  `${simWinProb.toFixed(1)}%`,
            base:   `${baseWinProb}%`,
            color:  simWinProb > baseWinProb + 3 ? "#4ade80" : "var(--p-ink)",
            icon:   <Target size={11} />,
          },
          {
            label:  "Gap to Frontier",
            value:  `−${gapToParetoFrontier}pp`,
            base:   "Ideal: 0pp",
            color:  parseFloat(gapToParetoFrontier) > 5 ? "#f87171" : parseFloat(gapToParetoFrontier) > 2 ? "#fbbf24" : "#4ade80",
            icon:   <Activity size={11} />,
          },
        ].map(m => (
          <div
            key={m.label}
            style={{
              background:   "var(--p-surface-2)",
              border:       "1px solid var(--p-hairline)",
              borderRadius: "var(--radius-md)",
              padding:      "10px 12px",
              textAlign:    "center",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4, marginBottom: 4, color: "var(--p-ink-tertiary)" }}>
              {m.icon}
              <span style={{ fontSize: 10, fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.4px" }}>{m.label}</span>
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 16, fontWeight: 700, color: m.color, letterSpacing: "-0.3px", fontVariantNumeric: "tabular-nums" }}>
              {m.value}
            </div>
            <div style={{ fontSize: 10, color: "var(--p-ink-tertiary)", marginTop: 2, fontFamily: "var(--font-mono)" }}>
              base: {m.base}
            </div>
          </div>
        ))}
      </div>

      {/* Insight message */}
      <div
        style={{
          marginTop:   14,
          padding:     "9px 12px",
          background:  "rgba(94,106,210,0.07)",
          border:      "1px solid rgba(94,106,210,0.15)",
          borderRadius:"var(--radius-md)",
          display:     "flex",
          alignItems:  "flex-start",
          gap:         7,
        }}
      >
        <Sparkles size={11} color="var(--p-primary)" style={{ marginTop: 2, flexShrink: 0 }} />
        <p style={{ margin: 0, fontSize: 11, color: "var(--p-ink-subtle)", lineHeight: 1.6 }}>
          {value < 20
            ? `Margin-protection mode. At ${simDiscount.toFixed(0)}% discount, you're ${gapToParetoFrontier}pp below the Pareto frontier. Win probability gain is minimal — this is the Nash-optimal zone.`
            : value < 55
            ? `Balanced trade-off. Adding ${additionalDiscount.toFixed(1)}pp discount yields +${winDelta.toFixed(1)}pp win probability — a sub-linear return. Consider non-monetary concessions first.`
            : `Margin sacrifice territory. Further discounting beyond ${simDiscount.toFixed(0)}% shows strong diminishing returns on win probability. Game-theory analysis suggests a switch to strategic concessions (POC, implementation credits) instead.`
          }
        </p>
      </div>
    </div>
  );
};

/* =============================================================================
   SUB-COMPONENT: Competitor Intel Panel
============================================================================= */

const CompetitorIntelPanel: React.FC<{ profile: CompetitorProfile }> = ({ profile }) => (
  <div
    style={{
      background:     "rgba(20,21,22,0.72)",
      backdropFilter: "blur(16px) saturate(160%)",
      WebkitBackdropFilter: "blur(16px) saturate(160%)",
      border:         "1px solid rgba(255,255,255,0.07)",
      borderRadius:   "var(--radius-xl)",
      padding:        16,
      boxShadow:      "inset 0 1px 0 rgba(255,255,255,0.05), 0 4px 20px rgba(0,0,0,0.35)",
    }}
  >
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
      <Swords size={13} color="var(--p-danger)" />
      <span style={{ fontSize: 11, fontWeight: 500, color: "var(--p-danger)", fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.4px" }}>
        Competitor Intel
      </span>
    </div>

    {/* Stats */}
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
      {[
        { label: "Avg Discount", value: `${profile.avgDiscountPct}%` },
        { label: "Avg Win Rate", value: `${profile.avgWinRate}%`     },
      ].map(s => (
        <div key={s.label} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "var(--radius-md)", padding: "8px 10px" }}>
          <div style={{ fontSize: 9, color: "var(--p-ink-tertiary)", fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 3 }}>{s.label}</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 16, fontWeight: 700, color: "var(--p-ink)", fontVariantNumeric: "tabular-nums" }}>{s.value}</div>
        </div>
      ))}
    </div>

    {/* Primary strategy */}
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 9, color: "var(--p-ink-tertiary)", fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 4 }}>
        Primary Strategy
      </div>
      <div style={{ fontSize: 12, color: "var(--p-ink-muted)", lineHeight: 1.5 }}>{profile.primaryStrategy}</div>
    </div>

    {/* Weaknesses */}
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 9, color: "#f87171", fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 5 }}>
        Exploitable Weaknesses
      </div>
      {profile.weaknesses.map(w => (
        <div key={w} style={{ display: "flex", alignItems: "flex-start", gap: 6, marginBottom: 4 }}>
          <AlertTriangle size={10} color="#f87171" style={{ marginTop: 2, flexShrink: 0 }} />
          <span style={{ fontSize: 11, color: "var(--p-ink-subtle)", lineHeight: 1.5 }}>{w}</span>
        </div>
      ))}
    </div>

    {/* Strengths */}
    <div>
      <div style={{ fontSize: 9, color: "#fbbf24", fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 5 }}>
        Watch-Out Strengths
      </div>
      {profile.strengths.map(s => (
        <div key={s} style={{ display: "flex", alignItems: "flex-start", gap: 6, marginBottom: 4 }}>
          <Star size={10} color="#fbbf24" style={{ marginTop: 2, flexShrink: 0 }} />
          <span style={{ fontSize: 11, color: "var(--p-ink-subtle)", lineHeight: 1.5 }}>{s}</span>
        </div>
      ))}
    </div>
  </div>
);

/* =============================================================================
   ROOT VIEW: WarRoomView
============================================================================= */

const WarRoomView: React.FC = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { data, isLoading } = useWarRoomQuery();
  const isOffline = !data || data.data_availability === "OFFLINE";

  // ── State ──────────────────────────────────────────────────────────────────
  const [selectedDealId,       setSelectedDealId]       = useState("D-1187");
  const [selectedCompetitorId, setSelectedCompetitorId] = useState("salesforce");
  const [expandedMoveId,       setExpandedMoveId]       = useState<string | null>("ma-sf-1");
  const [tradeOffValue,        setTradeOffValue]         = useState(30);
  const [toast, setToast] = useState<{ message: string; type: "success" | "info" } | null>(null);
  const toastTimerRef = useRef<any>(null);

  const showToast = useCallback((message: string, type: "success" | "info" = "success") => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
    setToast({ message, type });
    toastTimerRef.current = setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, 4000);
  }, []);

  // ── Derived ────────────────────────────────────────────────────────────────
  const currentDeal = useMemo(
    () => ALL_DEALS.find(d => d.id === selectedDealId),
    [selectedDealId]
  );

  const competitorDeals = useMemo(
    () => ALL_DEALS.filter(d => d.competitor === selectedCompetitorId),
    [selectedCompetitorId]
  );

  const scatterSeries = useMemo(
    () => buildScatterSeries(competitorDeals, selectedDealId),
    [competitorDeals, selectedDealId]
  );

  const moveCards = useMemo(
    () => MOVE_ADVISOR_DATA[selectedCompetitorId] ?? [],
    [selectedCompetitorId]
  );

  const competitorProfile = COMPETITOR_PROFILES[selectedCompetitorId];

  const nashScore = useMemo(() => {
    if (!currentDeal) return 0;
    return computeNashScore(
      currentDeal.discountPct,
      currentDeal.winProbability,
      currentDeal.margin
    );
  }, [currentDeal]);

  const handleDealChange = useCallback((id: string) => {
    setSelectedDealId(id);
    const deal = DEAL_OPTIONS.find(d => d.id === id);
    if (deal) setSelectedCompetitorId(deal.competitor);
  }, []);

  const handleMoveToggle = useCallback((id: string) => {
    setExpandedMoveId(prev => prev === id ? null : id);
  }, []);

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
          <Swords size={32} color="var(--p-primary-hover)" />
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

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div
      className="animate-fade-in"
      style={{
        display:       "flex",
        flexDirection: "column",
        gap:           0,
        minHeight:     "100%",
        background:    "var(--p-canvas)",
      }}
    >
      {/* ════════════════════════════════════════════════════════════════════
          HEADER
      ════════════════════════════════════════════════════════════════════ */}
      <div
        style={{
          padding:      "22px 28px 0",
          borderBottom: "1px solid var(--p-hairline)",
          background:   "var(--p-canvas)",
          position:     "sticky",
          top:          0,
          zIndex:       20,
        }}
      >
        {/* Title row */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 18, flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 4 }}>
              <div
                style={{
                  width:         36,
                  height:        36,
                  borderRadius:  "var(--radius-md)",
                  background:    "linear-gradient(135deg, rgba(229,72,77,0.22) 0%, rgba(94,106,210,0.18) 100%)",
                  border:        "1px solid rgba(229,72,77,0.20)",
                  display:       "flex",
                  alignItems:    "center",
                  justifyContent:"center",
                }}
              >
                <Crosshair size={17} color="var(--p-danger)" />
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
                {t("warroom.title")}
              </h1>
              <span
                style={{
                  padding:       "2px 8px",
                  borderRadius:  "var(--radius-pill)",
                  background:    "rgba(94,106,210,0.10)",
                  border:        "1px solid rgba(94,106,210,0.22)",
                  color:         "var(--p-primary-hover)",
                  fontSize:      11,
                  fontFamily:    "var(--font-mono)",
                  fontWeight:    500,
                  letterSpacing: "0.2px",
                }}
              >
                {t("warroom.engineVersion")}
              </span>
            </div>
            <p style={{ margin: 0, fontSize: 13, color: "var(--p-ink-tertiary)" }}>
              {t("warroom.subtitle", { customer: currentDeal?.customer ?? "—" })}
            </p>
          </div>

          {/* Dropdowns */}
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <WarRoomDropdown
              label={t("warroom.activeDeal")}
              value={selectedDealId}
              options={DEAL_OPTIONS}
              onChange={handleDealChange}
              width={280}
            />
            <WarRoomDropdown
              label={t("warroom.competitor")}
              value={selectedCompetitorId}
              options={COMPETITOR_OPTIONS}
              onChange={setSelectedCompetitorId}
              width={220}
            />
             <button
              onClick={() => {
                const customerName = currentDeal?.customer ?? "—";
                showToast(t("warroom.playbookSuccess", { customer: customerName }));
              }}
              className="btn btn-primary"
              style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}
            >
              <Zap size={13} />
              {t("warroom.runPlaybook")}
            </button>
          </div>
        </div>

        {/* Context breadcrumb strip */}
        {currentDeal && (
          <div
            style={{
              display:     "flex",
              alignItems:  "center",
              gap:         16,
              paddingBottom: 14,
              flexWrap:    "wrap",
            }}
          >
            {[
              { label: t("pipeline.deal"), value: currentDeal.id, icon: <Crosshair size={10} /> },
              { label: t("pipeline.arr"),  value: `$${(currentDeal.arr / 1000).toFixed(0)}K`, icon: <DollarSign size={10} /> },
              { label: t("pipeline.stage"), value: t(`warroom.stages.${currentDeal.stage}` as any, { defaultValue: currentDeal.stage }), icon: <Activity size={10} /> },
              { label: t("warroom.currentDiscount", { defaultValue: "Current Discount" }), value: `${currentDeal.discountPct}%`, icon: <Percent size={10} /> },
              { label: t("pipeline.winProb"),  value: `${currentDeal.winProbability}%`, icon: <Target size={10} /> },
              { label: t("pipeline.margin", { defaultValue: "Gross Margin" }),     value: `${currentDeal.margin}%`, icon: <TrendingUp size={10} /> },
            ].map((item, i) => (
              <React.Fragment key={item.label}>
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <span style={{ color: "var(--p-ink-tertiary)" }}>{item.icon}</span>
                  <span style={{ fontSize: 11, color: "var(--p-ink-tertiary)", fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.3px" }}>
                    {item.label}:
                  </span>
                  <span style={{ fontSize: 11, color: "var(--p-ink-muted)", fontFamily: "var(--font-mono)", fontWeight: 500 }}>
                    {item.value}
                  </span>
                </div>
                {i < 5 && <span style={{ width: 1, height: 12, background: "var(--p-hairline-strong)", flexShrink: 0 }} />}
              </React.Fragment>
            ))}
          </div>
        )}
      </div>

      {/* ════════════════════════════════════════════════════════════════════
          MAIN ROW  — Left: Scatter Chart | Right: Move Advisor
      ════════════════════════════════════════════════════════════════════ */}
      <div
        style={{
          display:   "flex",
          gap:       16,
          padding:   "20px 28px",
          flexWrap:  "wrap",
          alignItems:"flex-start",
        }}
      >
        {/* ── LEFT PANEL: Pareto Frontier Chart (55%) ─────────────────────── */}
        <div
          style={{
            flex:      "0 0 calc(55% - 8px)",
            minWidth:  340,
            display:   "flex",
            flexDirection: "column",
            gap:       14,
          }}
        >
          {/* Chart card */}
          <div
            style={{
              background:   "var(--p-surface-1)",
              border:       "1px solid var(--p-hairline)",
              borderRadius: "var(--radius-xl)",
              overflow:     "hidden",
              boxShadow:    "inset 0 1px 0 0 rgba(255,255,255,0.04)",
            }}
          >
            {/* Chart header */}
            <div
              style={{
                display:        "flex",
                alignItems:     "center",
                justifyContent: "space-between",
                padding:        "16px 20px 12px",
                borderBottom:   "1px solid var(--p-hairline)",
                flexWrap:       "wrap",
                gap:            8,
              }}
            >
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  <BarChart3 size={14} color="var(--p-primary)" />
                  <span style={{ fontSize: 13, fontWeight: 600, color: "var(--p-ink)", letterSpacing: "-0.2px" }}>
                    {t("warroom.chart.title")}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: "var(--p-ink-tertiary)", marginTop: 3 }}>
                  {t("warroom.chart.subtitle", {
                    won: competitorDeals.filter(d => d.outcome === "won").length,
                    lost: competitorDeals.filter(d => d.outcome === "lost").length,
                    competitor: competitorProfile.name
                  })}
                </div>
              </div>

              {/* Legend */}
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                {[
                  { label: t("warroom.chart.won"),             color: "#4ade80" },
                  { label: t("warroom.chart.lost"),            color: "#f87171" },
                  { label: t("warroom.chart.paretoFrontier"), color: "var(--p-primary-hover)" },
                  { label: t("warroom.chart.youAreHere"),    color: "#fbbf24" },
                ].map(l => (
                  <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <div style={{ width: 7, height: 7, borderRadius: "50%", background: l.color, boxShadow: `0 0 5px ${l.color}` }} />
                    <span style={{ fontSize: 10, color: "var(--p-ink-tertiary)", fontFamily: "var(--font-mono)" }}>{l.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Tremor ScatterChart */}
            <div dir="ltr" style={{ padding: "4px 16px 12px" }}>
              <ScatterChart
                className="h-80"
                data={scatterSeries}
                category="category"
                x="x"
                y="y"
                size="z"
                colors={["emerald", "red", "indigo", "amber"]}
                showLegend={false}
                showAnimation={true}
                valueFormatter={{
                  x:    (v: number) => t("warroom.chart.discountFormatter", { pct: v }),
                  y:    (v: number) => t("warroom.chart.winProbFormatter", { pct: v.toFixed(1) }),
                  size: (v: number) => t("warroom.chart.arrFormatter", { value: (v * 60).toFixed(0) }),
                }}
                xAxisLabel={t("warroom.chart.discountLabel")}
                yAxisLabel={t("warroom.chart.winProbabilityLabel")}
                autoMinXValue={true}
                autoMinYValue={true}
              />
            </div>

            {/* Chart annotations footer */}
            <div
              style={{
                display:      "flex",
                alignItems:   "center",
                gap:          12,
                padding:      "10px 20px",
                borderTop:    "1px solid var(--p-hairline)",
                background:   "var(--p-surface-2)",
                flexWrap:     "wrap",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div
                  style={{
                    width:        10,
                    height:       10,
                    borderRadius: "50%",
                    background:   "#fbbf24",
                    boxShadow:    "0 0 8px #fbbf2480",
                  }}
                />
                <span style={{ fontSize: 11, color: "var(--p-ink-muted)" }}>
                  {t("warroom.chart.youAreHereAnnotation", {
                    customer: currentDeal?.customer ?? "—",
                    discount: currentDeal?.discountPct ?? "—",
                    winProb: currentDeal?.winProbability ?? "—"
                  })}
                </span>
              </div>
              <span style={{ width: 1, height: 12, background: "var(--p-hairline-strong)", flexShrink: 0 }} />
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 16, height: 2, background: "var(--p-primary-hover)", borderRadius: 2 }} />
                <span style={{ fontSize: 11, color: "var(--p-ink-muted)" }}>
                  {t("warroom.chart.paretoAnnotation")}
                </span>
              </div>
              <span style={{ width: 1, height: 12, background: "var(--p-hairline-strong)", flexShrink: 0 }} />
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Star size={10} color="#fbbf24" />
                <span style={{ fontSize: 11, color: "var(--p-ink-muted)" }}>
                  {t("warroom.chart.nashAnnotation", {
                    discount: competitorProfile.nashPoint.discount,
                    winProb: competitorProfile.nashPoint.winProb
                  })}
                </span>
              </div>
            </div>
          </div>

          {/* Competitor Intel Panel */}
          <CompetitorIntelPanel profile={competitorProfile} />
        </div>

        {/* ── RIGHT PANEL: Move Advisor + Nash Score (45%) ────────────────── */}
        <div
          style={{
            flex:      "0 0 calc(45% - 8px)",
            minWidth:  300,
            display:   "flex",
            flexDirection: "column",
            gap:       14,
          }}
        >
          {/* Nash Equilibrium Score */}
          <NashScoreRing score={nashScore} nashPoint={competitorProfile.nashPoint} />

          {/* Move Advisor header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <Sparkles size={13} color="var(--p-primary)" />
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--p-ink)", letterSpacing: "-0.1px" }}>Move Advisor</span>
              <span
                style={{
                  padding:       "2px 7px",
                  borderRadius:  "var(--radius-pill)",
                  background:    "rgba(94,106,210,0.10)",
                  border:        "1px solid rgba(94,106,210,0.20)",
                  fontSize:      10,
                  fontFamily:    "var(--font-mono)",
                  color:         "var(--p-primary-hover)",
                  letterSpacing: "0.2px",
                }}
              >
                {moveCards.length} moves ranked by EV
              </span>
            </div>
            <span style={{ fontSize: 11, color: "var(--p-ink-tertiary)" }}>
              vs {competitorProfile.name}
            </span>
          </div>

          {/* Move cards */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {moveCards.map((card, idx) => (
              <MoveCard
                key={card.id}
                card={card}
                rank={idx + 1}
                active={expandedMoveId === card.id}
                onToggle={handleMoveToggle}
                onExecute={(card) => {
                  const moveTitle = t(`warroom.moves.${card.id}.title` as any, { defaultValue: card.title });
                  showToast(t("warroom.moveSuccess", { move: moveTitle }));
                }}
              />
            ))}
          </div>

          {/* EV summary bar */}
          <div
            style={{
              background:   "var(--p-surface-1)",
              border:       "1px solid var(--p-hairline)",
              borderRadius: "var(--radius-lg)",
              padding:      "12px 16px",
              display:      "flex",
              alignItems:   "center",
              justifyContent:"space-between",
              boxShadow:    "inset 0 1px 0 rgba(255,255,255,0.04)",
              flexWrap:     "wrap",
              gap:          8,
            }}
          >
            <div>
              <div style={{ fontSize: 10, color: "var(--p-ink-tertiary)", fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 2 }}>
                Combined Expected Value
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 22, fontWeight: 700, color: "#4ade80", letterSpacing: "-0.6px", fontVariantNumeric: "tabular-nums" }}>
                {formatArrK(moveCards.reduce((a, c) => a + c.expectedValue, 0))}
              </div>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              {(["Immediate", "This Week", "Next 30 Days"] as const).map(u => {
                const count = moveCards.filter(c => c.urgency === u).length;
                const color = getUrgencyColor(u);
                return (
                  <div key={u} style={{ textAlign: "center" }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 16, fontWeight: 700, color, fontVariantNumeric: "tabular-nums" }}>{count}</div>
                    <div style={{ fontSize: 9, color: "var(--p-ink-tertiary)", fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.3px", marginTop: 1 }}>
                      {u === "Immediate" ? "Now" : u === "This Week" ? "Week" : "30d"}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════════════
          BOTTOM — Trade-Off Slider
      ════════════════════════════════════════════════════════════════════ */}
      <div style={{ padding: "0 28px 28px" }}>
        <TradeOffSlider
          value={tradeOffValue}
          onChange={setTradeOffValue}
          currentDeal={currentDeal}
        />
      </div>

      {/* Range input thumb styles */}
      <style>{`
        input[type="range"]::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: var(--p-ink);
          border: 2px solid var(--p-surface-1);
          cursor: pointer;
          box-shadow: 0 0 0 1px var(--p-hairline-strong), 0 2px 8px rgba(0,0,0,0.6);
          transition: transform 100ms ease, box-shadow 100ms ease;
        }
        input[type="range"]::-webkit-slider-thumb:hover {
          transform: scale(1.2);
          box-shadow: 0 0 0 2px var(--p-primary), 0 2px 8px rgba(0,0,0,0.6);
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

        @media (max-width: 1100px) {
          .war-room-main-row {
            flex-direction: column !important;
          }
          .war-room-left,
          .war-room-right {
            flex: none !important;
            width: 100% !important;
          }
        }

        @keyframes slideUp {
          from {
            transform: translateY(20px);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }
      `}</style>

      {/* Toast Notification */}
      {toast && createPortal(
        <div
          style={{
            position: "fixed",
            bottom: "24px",
            left: i18n.language === "ar" ? "24px" : "auto",
            right: i18n.language === "ar" ? "auto" : "24px",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            gap: 10,
            background: "rgba(20,21,22,0.92)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            border: "1px solid rgba(74,222,128,0.4)",
            borderRadius: "var(--radius-lg)",
            padding: "12px 18px",
            boxShadow: "0 10px 30px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05)",
            animation: "slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards",
          }}
        >
          <CheckCircle2 size={16} color="#4ade80" />
          <span style={{ fontSize: 13, color: "var(--p-ink)", fontWeight: 500 }}>
            {toast.message}
          </span>
        </div>,
        document.body
      )}
    </div>
  );
};

export default WarRoomView;

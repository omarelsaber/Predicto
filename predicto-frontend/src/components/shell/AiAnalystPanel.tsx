/**
 * src/components/shell/AiAnalystPanel.tsx
 *
 * Predicto V3 — AI Analyst Copilot Panel
 * Linear dark aesthetic · Glassmorphic drawer · Full chat UX
 *
 * Architecture:
 *  ┌──────────────────────────────────────┐
 *  │  HEADER   — model badge, context     │  fixed
 *  ├──────────────────────────────────────┤
 *  │  CONTEXT STRIP — live KPI pills      │  fixed
 *  ├──────────────────────────────────────┤
 *  │                                      │
 *  │  MESSAGE HISTORY  (scrollable)       │  flex-1
 *  │   • User bubbles  (right-aligned)    │
 *  │   • AI bubbles    (left-aligned)     │
 *  │     ↳ rich content: bold metrics,   │
 *  │       lists, citation pills          │
 *  │   • Thinking state (animated)       │
 *  │                                      │
 *  ├──────────────────────────────────────┤
 *  │  QUICK-ACTION CHIPS                  │  fixed
 *  ├──────────────────────────────────────┤
 *  │  INPUT AREA  — textarea + send btn   │  fixed
 *  └──────────────────────────────────────┘
 */

import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  KeyboardEvent,
} from "react";
import {
  Sparkles,
  X,
  Send,
  BrainCircuit,
  TrendingUp,
  ShieldAlert,
  Zap,
  ChevronRight,
  Copy,
  ThumbsUp,
  ThumbsDown,
  RefreshCw,
  BarChart3,
  Users,
  DollarSign,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  ChevronDown,
  Loader2,
  Paperclip,
  Mic,
} from "lucide-react";

/* ─────────────────────────────────────────────────────────────────────────────
   TYPES
   ───────────────────────────────────────────────────────────────────────────── */

type MessageRole = "user" | "ai";

/** A single segment of rich AI content */
type ContentSegment =
  | { type: "text";     text: string }
  | { type: "bold";     text: string }
  | { type: "metric";   label: string; value: string; trend?: "up" | "down" | "flat"; color?: string }
  | { type: "citation"; ref: string; label: string }
  | { type: "list";     items: string[] }
  | { type: "divider" }
  | { type: "insight-card"; title: string; body: string; variant: "success" | "warning" | "danger" | "info" }
  | { type: "table";    headers: string[]; rows: string[][] };

interface ChatMessage {
  id:        string;
  role:      MessageRole;
  /** Plain text for user messages */
  text?:     string;
  /** Rich segments for AI messages */
  segments?: ContentSegment[];
  ts:        Date;
  /** Thinking state — renders animated indicator */
  thinking?: boolean;
}

interface QuickChip {
  icon:  React.ComponentType<{ size?: number }>;
  label: string;
  query: string;
}

/* ─────────────────────────────────────────────────────────────────────────────
   MOCK CHAT HISTORY  (injected on mount)
   ───────────────────────────────────────────────────────────────────────────── */

const INITIAL_MESSAGES: ChatMessage[] = [
  /* ── Turn 1: User ── */
  {
    id:   "u1",
    role: "user",
    text: "Give me a quick summary of where we stand for Q2 pipeline.",
    ts:   new Date("2025-05-12T09:14:00"),
  },

  /* ── Turn 1: AI ── */
  {
    id:   "a1",
    role: "ai",
    ts:   new Date("2025-05-12T09:14:08"),
    segments: [
      { type: "text", text: "Here's a snapshot of your Q2 pipeline as of this morning:" },
      { type: "divider" },
      {
        type:  "metric",
        label: "Total Pipeline",
        value: "$18.4 M",
        trend: "up",
        color: "#4ade80",
      },
      {
        type:  "metric",
        label: "Weighted Pipeline",
        value: "$9.1 M",
        trend: "up",
        color: "#818cf8",
      },
      {
        type:  "metric",
        label: "Avg Deal Size",
        value: "$142 K",
        trend: "flat",
        color: "var(--p-ink-muted)",
      },
      { type: "divider" },
      {
        type:  "list",
        items: [
          "**23 deals** are in Negotiation or Legal Review — highest ever for Q2.",
          "**7 deals** ($3.2M) have slipped past their original close dates.",
          "**Enterprise tier** makes up 61% of weighted pipeline, up from 54% in Q1.",
          "Top rep: Sophia Chen at $2.1M, closely followed by Raj Patel at $1.8M.",
        ],
      },
      { type: "divider" },
      { type: "text", text: "Overall health looks strong, but the 7 slipped deals need attention before quarter-end." },
      { type: "citation", ref: "1", label: "Salesforce CRM" },
      { type: "citation", ref: "2", label: "Pipeline Report · May 12" },
    ],
  },

  /* ── Turn 2: User ── */
  {
    id:   "u2",
    role: "user",
    text: "Which accounts are at highest churn risk right now?",
    ts:   new Date("2025-05-12T09:15:30"),
  },

  /* ── Turn 2: AI ── */
  {
    id:   "a2",
    role: "ai",
    ts:   new Date("2025-05-12T09:15:42"),
    segments: [
      { type: "text", text: "The causal model has flagged " },
      { type: "bold", text: "3 accounts with HIGH churn probability" },
      { type: "text", text: " in the next 60 days:" },
      {
        type:    "table",
        headers: ["Account", "ARR", "Churn Score", "Primary Signal"],
        rows: [
          ["Orion Cloud Labs",   "$240 K", "87 / 100", "NPS drop −42pts + 3 support escalations"],
          ["Pacific Rim Logistics", "$94 K",  "74 / 100", "Usage ↓ 61% MoM, champion departure"],
          ["TrueNorth Capital",  "$56 K",  "68 / 100", "Contract renewal overdue 22 days"],
        ],
      },
      {
        type:    "insight-card",
        title:   "Recommended Action",
        body:    "Orion Cloud Labs has an open renewal discussion — schedule an EBR within 5 business days. The champion departure at Pacific Rim is the most acute risk: loop in a new executive contact before May 20.",
        variant: "warning",
      },
      { type: "citation", ref: "1", label: "Salesforce CRM" },
      { type: "citation", ref: "3", label: "Causal Risk Engine v3.4" },
      { type: "citation", ref: "4", label: "NPS Survey · Apr 2025" },
    ],
  },

  /* ── Turn 3: User ── */
  {
    id:   "u3",
    role: "user",
    text: "What's driving the ARR expansion in the EMEA region this quarter?",
    ts:   new Date("2025-05-12T09:17:10"),
  },

  /* ── Turn 3: AI ── */
  {
    id:   "a3",
    role: "ai",
    ts:   new Date("2025-05-12T09:17:24"),
    segments: [
      { type: "text", text: "EMEA expansion ARR is up " },
      { type: "bold", text: "+38% QoQ" },
      { type: "text", text: ". The causal decomposition attributes this to three primary drivers:" },
      {
        type:  "list",
        items: [
          "**Product-led expansion (41% of uplift):** The Growth→Enterprise upgrade motion in EMEA accelerated after the London roadshow in March. Vantage Payments and Kestrel Biotech both upgraded mid-quarter.",
          "**New logo velocity (34% of uplift):** Liam O'Brien closed 4 net-new logos in EMEA — compared to 2 in Q1 — driven by the new outbound sequence targeting FinServ verticals.",
          "**Multi-year contract conversions (25% of uplift):** 3 accounts converted from annual to 3-year agreements, recognising a partial uplift in ARR this quarter.",
        ],
      },
      {
        type:    "insight-card",
        title:   "Causal Insight",
        body:    "The London roadshow had a statistically significant causal effect (p < 0.02). Replicating the format in Frankfurt or Amsterdam could produce a similar expansion signal in H2.",
        variant: "info",
      },
      { type: "citation", ref: "2", label: "Pipeline Report · May 12" },
      { type: "citation", ref: "3", label: "Causal Risk Engine v3.4" },
      { type: "citation", ref: "5", label: "Marketing Attribution · Q2" },
    ],
  },

  /* ── Turn 4: User ── */
  {
    id:   "u4",
    role: "user",
    text: "Forecast close probability for Stratosphere AI — they're in Legal Review at $198K.",
    ts:   new Date("2025-05-12T09:19:05"),
  },

  /* ── Turn 4: AI ── */
  {
    id:   "a4",
    role: "ai",
    ts:   new Date("2025-05-12T09:19:18"),
    segments: [
      { type: "text", text: "Here's the model's assessment for " },
      { type: "bold", text: "Stratosphere AI (OPP-009822):" },
      { type: "divider" },
      { type: "metric", label: "Close Probability",  value: "88%",     trend: "up",   color: "#4ade80" },
      { type: "metric", label: "Expected Value",     value: "$174.2 K", trend: "up",   color: "#818cf8" },
      { type: "metric", label: "Days in Legal",      value: "8 days",  trend: "flat", color: "var(--p-ink-muted)" },
      { type: "metric", label: "Predicted Close",    value: "May 29",  trend: "flat", color: "var(--p-ink-muted)" },
      { type: "divider" },
      {
        type:  "list",
        items: [
          "**Positive signals:** Single-thread risk resolved (2 champions now engaged). Legal turnaround for this segment historically averages 9 days — you're on track.",
          "**Watch item:** Discount at 14% is above the 10% median for Enterprise deals. Finance approval may add 2–3 days.",
          "**Rep action:** Naomi Winters should confirm the final commercial terms by May 23 to protect the May 29 close.",
        ],
      },
      {
        type:    "insight-card",
        title:   "Model Confidence: HIGH",
        body:    "Trained on 1 240 closed Enterprise deals. Similar deals in Legal Review at day 8 closed in ≤ 14 days in 91% of cases.",
        variant: "success",
      },
      { type: "citation", ref: "1", label: "Salesforce CRM" },
      { type: "citation", ref: "3", label: "Causal Risk Engine v3.4" },
      { type: "citation", ref: "6", label: "Historical Deal Corpus · 2022–2025" },
    ],
  },
];

/* ─────────────────────────────────────────────────────────────────────────────
   QUICK-ACTION CHIPS
   ───────────────────────────────────────────────────────────────────────────── */

const QUICK_CHIPS: QuickChip[] = [
  { icon: BarChart3,    label: "Summarize pipeline",    query: "Give me a full pipeline summary for this week." },
  { icon: ShieldAlert,  label: "Find churn risks",      query: "Which accounts are at highest churn risk right now?" },
  { icon: TrendingUp,   label: "Top expansion opps",    query: "What are the top 3 expansion opportunities this quarter?" },
  { icon: Users,        label: "Rep leaderboard",       query: "Show me rep performance vs quota for Q2." },
  { icon: DollarSign,   label: "Forecast Q2 close",     query: "What's our predicted Q2 close vs target?" },
  { icon: AlertTriangle,label: "Slipped deals",         query: "List all deals that have slipped past their close date." },
];

/* ─────────────────────────────────────────────────────────────────────────────
   SIMULATED AI RESPONSES  (keyed to query keywords)
   ───────────────────────────────────────────────────────────────────────────── */

function buildAiResponse(query: string): ContentSegment[] {
  const q = query.toLowerCase();

  if (q.includes("pipeline") || q.includes("summary")) {
    return [
      { type: "text", text: "Current pipeline as of today:" },
      { type: "divider" },
      { type: "metric", label: "Total Pipeline",    value: "$18.4 M", trend: "up",   color: "#4ade80"  },
      { type: "metric", label: "Weighted Pipeline", value: "$9.1 M",  trend: "up",   color: "#818cf8"  },
      { type: "metric", label: "Deals in Stage",    value: "84 opps", trend: "flat", color: "var(--p-ink-muted)" },
      { type: "divider" },
      { type: "list", items: [
        "**Negotiation / Legal** stage holds $6.2M — the largest single-stage concentration.",
        "Win rate for this cohort is tracking at **51%**, in line with LY.",
        "3 deals > $500K that need executive sponsor engagement before May 25.",
      ]},
      { type: "citation", ref: "1", label: "Salesforce CRM" },
      { type: "citation", ref: "2", label: "Pipeline Report · May 12" },
    ];
  }

  if (q.includes("churn") || q.includes("risk") || q.includes("retention")) {
    return [
      { type: "text", text: "The causal model currently flags " },
      { type: "bold", text: "5 accounts as Medium-High risk" },
      { type: "text", text: " for churn in the next 90 days:" },
      { type: "list", items: [
        "**Orion Cloud Labs** — Churn score 87. Champion departure + support escalations.",
        "**Pacific Rim Logistics** — Churn score 74. Usage down 61% MoM.",
        "**TrueNorth Capital** — Churn score 68. Renewal overdue 22 days.",
        "**Quanta Networks** — Churn score 61. No product login in 30 days.",
        "**Brightfield Lending** — Churn score 55. Budget freeze signal from ZoomInfo.",
      ]},
      { type: "insight-card", title: "Recommended Action", body: "Prioritise Orion Cloud Labs and Pacific Rim for immediate CSM outreach. Combined at-risk ARR is $334K.", variant: "warning" },
      { type: "citation", ref: "3", label: "Causal Risk Engine v3.4" },
    ];
  }

  if (q.includes("expansion") || q.includes("upsell") || q.includes("growth")) {
    return [
      { type: "text", text: "Top 3 expansion opportunities identified by the model:" },
      { type: "list", items: [
        "**Meridian Analytics** — On Enterprise plan, using 94% of seat allocation. Expansion signal: +$48K ARR potential. CSM should trigger a seat expansion conversation by June 1.",
        "**Helios Robotics** — Enterprise+ customer. New business unit added. Estimated cross-sell of the DataOps module: +$72K ARR.",
        "**Luminary Health** — 3-year contract renews in 8 months. Usage at 110% of contracted volume — an overuse trigger for an expansion conversation.",
      ]},
      { type: "metric", label: "Total Expansion Signal", value: "$340 K", trend: "up", color: "#4ade80" },
      { type: "citation", ref: "1", label: "Salesforce CRM" },
      { type: "citation", ref: "3", label: "Causal Risk Engine v3.4" },
    ];
  }

  if (q.includes("rep") || q.includes("quota") || q.includes("leaderboard")) {
    return [
      { type: "text", text: "Q2 rep performance vs quota (as of May 12):" },
      {
        type:    "table",
        headers: ["Rep", "Closed ARR", "Quota", "Attainment"],
        rows: [
          ["Sophia Chen",     "$2.1 M", "$2.4 M", "88%"],
          ["Raj Patel",       "$1.8 M", "$2.0 M", "90%"],
          ["Marcus Webb",     "$1.4 M", "$1.8 M", "78%"],
          ["Liam O'Brien",    "$1.2 M", "$2.0 M", "60%"],
          ["Naomi Winters",   "$0.9 M", "$1.6 M", "56%"],
          ["Aisha Okonkwo",   "$0.7 M", "$1.4 M", "50%"],
        ],
      },
      { type: "insight-card", title: "Coaching Flag", body: "Liam O'Brien and Naomi Winters are tracking below 65% quota attainment at the mid-point. Consider pipeline reviews and deal coaching sessions this week.", variant: "warning" },
      { type: "citation", ref: "1", label: "Salesforce CRM" },
    ];
  }

  if (q.includes("forecast") || q.includes("q2 close") || q.includes("target")) {
    return [
      { type: "text", text: "Q2 forecast vs target:" },
      { type: "divider" },
      { type: "metric", label: "Q2 Target",           value: "$12.0 M", trend: "flat", color: "var(--p-ink-muted)" },
      { type: "metric", label: "Predicted Close",     value: "$10.8 M", trend: "down", color: "#fbbf24"           },
      { type: "metric", label: "Coverage Gap",        value: "−$1.2 M", trend: "down", color: "#f87171"           },
      { type: "metric", label: "Confidence Interval", value: "±$0.6 M", trend: "flat", color: "var(--p-ink-muted)" },
      { type: "divider" },
      { type: "list", items: [
        "The model is 74% confident you'll land between **$10.2M and $11.4M**.",
        "Closing all 7 slipped deals would close 60% of the gap ($720K).",
        "Pulling in 2 early-stage June deals would cover the remainder.",
      ]},
      { type: "insight-card", title: "Risk to Forecast", body: "Orion Cloud Labs ($240K) is both a churn risk AND a pipeline contribution. A churned renewal would widen the gap to −$1.44M.", variant: "danger" },
      { type: "citation", ref: "2", label: "Pipeline Report · May 12" },
      { type: "citation", ref: "3", label: "Causal Risk Engine v3.4" },
    ];
  }

  if (q.includes("slipp") || q.includes("past") || q.includes("overdue")) {
    return [
      { type: "text", text: "7 deals have slipped past their original close date:" },
      {
        type:    "table",
        headers: ["Opportunity", "Rep", "Amount", "Days Slipped"],
        rows: [
          ["Cascade Data Corp.",    "Priya Nair",      "$92 K",   "12 days"],
          ["TrueNorth Capital",     "Aisha Okonkwo",   "$38 K",   "22 days"],
          ["Quanta Networks",       "Sophia Chen",     "$29 K",   "8 days" ],
          ["Brightfield Lending",   "Chloe Fontaine",  "$58.5 K", "5 days" ],
          ["Pacific Rim Logistics", "Hiro Tanaka",     "$47 K",   "14 days"],
          ["Redwood Analytics",     "Jake Stanton",    "$162 K",  "3 days" ],
          ["Sable Financial",       "Destiny Monroe",  "$324 K",  "7 days" ],
        ],
      },
      { type: "metric", label: "Total Slipped ARR", value: "$750.5 K", trend: "down", color: "#f87171" },
      { type: "citation", ref: "1", label: "Salesforce CRM" },
      { type: "citation", ref: "2", label: "Pipeline Report · May 12" },
    ];
  }

  /* Generic fallback */
  return [
    { type: "text", text: "I've analysed your query across the connected data sources. Here's what I found:" },
    { type: "list", items: [
      "The signal you're asking about appears in 3 connected datasets.",
      "No anomalies detected in the last 24 hours for this metric.",
      "For deeper causal analysis, try running this in the Intelligence Lab with a custom date range.",
    ]},
    { type: "citation", ref: "1", label: "Salesforce CRM" },
    { type: "citation", ref: "3", label: "Causal Risk Engine v3.4" },
  ];
}

/* ─────────────────────────────────────────────────────────────────────────────
   RICH CONTENT RENDERERS
   ───────────────────────────────────────────────────────────────────────────── */

/** Renders a single bold-markdown item like "**text** rest of line" */
const RichListItem: React.FC<{ text: string }> = ({ text }) => {
  const parts = text.split(/\*\*(.*?)\*\*/g);
  return (
    <li style={{ color: "var(--p-ink-muted)", fontSize: 13, lineHeight: 1.65, marginBottom: 3 }}>
      {parts.map((p, i) =>
        i % 2 === 1
          ? <strong key={i} style={{ color: "var(--p-ink)", fontWeight: 600 }}>{p}</strong>
          : <span key={i}>{p}</span>
      )}
    </li>
  );
};

/** Inline metric chip */
const MetricChip: React.FC<{ label: string; value: string; trend?: "up" | "down" | "flat"; color?: string }> = ({
  label, value, trend, color = "var(--p-ink)",
}) => (
  <div
    style={{
      display:        "flex",
      alignItems:     "center",
      justifyContent: "space-between",
      background:     "var(--p-surface-3)",
      border:         "1px solid var(--p-hairline)",
      borderRadius:   8,
      padding:        "7px 12px",
      gap:            8,
    }}
  >
    <span style={{ fontSize: 11, color: "var(--p-ink-tertiary)", fontFamily: "var(--font-body)", letterSpacing: "0.1px" }}>
      {label}
    </span>
    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
      {trend === "up"   && <TrendingUp   size={11} color="#4ade80" />}
      {trend === "down" && <TrendingUp   size={11} color="#f87171" style={{ transform: "rotate(180deg)" }} />}
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 600, color, letterSpacing: "-0.2px", fontVariantNumeric: "tabular-nums" }}>
        {value}
      </span>
    </div>
  </div>
);

/** Citation pill like [1] */
const CitationPill: React.FC<{ ref: string; label: string }> = ({ ref: r, label }) => (
  <a
    href="#"
    title={label}
    onClick={(e) => e.preventDefault()}
    style={{
      display:        "inline-flex",
      alignItems:     "center",
      gap:            4,
      padding:        "2px 7px",
      borderRadius:   9999,
      background:     "rgba(94, 106, 210, 0.10)",
      border:         "1px solid rgba(94, 106, 210, 0.22)",
      color:          "var(--p-primary-hover)",
      fontSize:       11,
      fontFamily:     "var(--font-mono)",
      fontWeight:     500,
      textDecoration: "none",
      whiteSpace:     "nowrap",
      transition:     "background 140ms ease, border-color 140ms ease",
      cursor:         "pointer",
    }}
    onMouseEnter={(e) => {
      (e.currentTarget as HTMLAnchorElement).style.background     = "rgba(94,106,210,0.18)";
      (e.currentTarget as HTMLAnchorElement).style.borderColor    = "rgba(94,106,210,0.40)";
    }}
    onMouseLeave={(e) => {
      (e.currentTarget as HTMLAnchorElement).style.background     = "rgba(94,106,210,0.10)";
      (e.currentTarget as HTMLAnchorElement).style.borderColor    = "rgba(94,106,210,0.22)";
    }}
  >
    <ExternalLink size={9} />
    [{r}] {label}
  </a>
);

/** Insight card variants */
const INSIGHT_CARD_STYLES: Record<
  "success" | "warning" | "danger" | "info",
  { bg: string; border: string; iconColor: string; Icon: React.ComponentType<{ size?: number }> }
> = {
  success: { bg: "rgba(39,166,68,0.07)",    border: "rgba(39,166,68,0.18)",    iconColor: "#4ade80",             Icon: CheckCircle2  },
  warning: { bg: "rgba(232,163,10,0.08)",   border: "rgba(232,163,10,0.20)",   iconColor: "#fbbf24",             Icon: AlertTriangle },
  danger:  { bg: "rgba(229,72,77,0.08)",    border: "rgba(229,72,77,0.20)",    iconColor: "#f87171",             Icon: ShieldAlert   },
  info:    { bg: "rgba(94,106,210,0.08)",   border: "rgba(94,106,210,0.20)",   iconColor: "var(--p-primary-hover)", Icon: Sparkles    },
};

const InsightCard: React.FC<{ title: string; body: string; variant: "success" | "warning" | "danger" | "info" }> = ({
  title, body, variant,
}) => {
  const { bg, border, iconColor, Icon } = INSIGHT_CARD_STYLES[variant];
  return (
    <div
      style={{
        background:   bg,
        border:       `1px solid ${border}`,
        borderRadius: 10,
        padding:      "10px 12px",
        display:      "flex",
        gap:          10,
      }}
    >
      <div style={{ flexShrink: 0, marginTop: 1 }}>
        <Icon size={13} color={iconColor} />
      </div>
      <div>
        <p style={{ fontSize: 11, fontWeight: 600, color: iconColor, marginBottom: 3, letterSpacing: "0.1px", textTransform: "uppercase" }}>
          {title}
        </p>
        <p style={{ fontSize: 12, color: "var(--p-ink-muted)", lineHeight: 1.6 }}>
          {body}
        </p>
      </div>
    </div>
  );
};

/** Mini table inside AI bubble */
const InlineTable: React.FC<{ headers: string[]; rows: string[][] }> = ({ headers, rows }) => (
  <div style={{ overflowX: "auto", borderRadius: 8, border: "1px solid var(--p-hairline)" }}>
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, fontFamily: "var(--font-body)" }}>
      <thead>
        <tr style={{ background: "var(--p-surface-3)", borderBottom: "1px solid var(--p-hairline)" }}>
          {headers.map((h) => (
            <th
              key={h}
              style={{
                padding:       "6px 10px",
                textAlign:     "left",
                color:         "var(--p-ink-tertiary)",
                fontWeight:    500,
                fontSize:      10,
                letterSpacing: "0.4px",
                textTransform: "uppercase",
                whiteSpace:    "nowrap",
              }}
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, ri) => (
          <tr
            key={ri}
            style={{ borderBottom: ri < rows.length - 1 ? "1px solid var(--p-hairline)" : "none" }}
          >
            {row.map((cell, ci) => (
              <td
                key={ci}
                style={{
                  padding:    "6px 10px",
                  color:      ci === 0 ? "var(--p-ink-muted)" : "var(--p-ink-subtle)",
                  fontFamily: ci >= row.length - 1 ? "var(--font-mono)" : "var(--font-body)",
                  whiteSpace: "nowrap",
                  fontSize:   12,
                }}
              >
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

/** Renders an array of ContentSegment into rich React nodes */
const RichContent: React.FC<{ segments: ContentSegment[] }> = ({ segments }) => {
  const citationBuffer: ContentSegment[] = [];
  const inlineParts: ContentSegment[]    = [];

  /* Separate citations (rendered as a footer row) */
  segments.forEach((s) => {
    if (s.type === "citation") citationBuffer.push(s);
    else inlineParts.push(s);
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {inlineParts.map((seg, i) => {
        switch (seg.type) {
          case "text":
            return (
              <span key={i} style={{ fontSize: 13, color: "var(--p-ink-muted)", lineHeight: 1.65 }}>
                {seg.text}
              </span>
            );

          case "bold":
            return (
              <strong key={i} style={{ fontSize: 13, color: "var(--p-ink)", fontWeight: 600 }}>
                {seg.text}
              </strong>
            );

          case "metric":
            return (
              <MetricChip
                key={i}
                label={seg.label}
                value={seg.value}
                trend={seg.trend}
                color={seg.color}
              />
            );

          case "list":
            return (
              <ul
                key={i}
                style={{
                  paddingLeft: 16,
                  margin:      0,
                  display:     "flex",
                  flexDirection: "column",
                  gap: 2,
                }}
              >
                {seg.items.map((item, ii) => (
                  <RichListItem key={ii} text={item} />
                ))}
              </ul>
            );

          case "divider":
            return (
              <hr
                key={i}
                style={{
                  border:     "none",
                  borderTop:  "1px solid var(--p-hairline)",
                  margin:     "2px 0",
                }}
              />
            );

          case "insight-card":
            return (
              <InsightCard
                key={i}
                title={seg.title}
                body={seg.body}
                variant={seg.variant}
              />
            );

          case "table":
            return <InlineTable key={i} headers={seg.headers} rows={seg.rows} />;

          default:
            return null;
        }
      })}

      {/* Citation footer */}
      {citationBuffer.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5, paddingTop: 4 }}>
          {citationBuffer.map((seg, i) =>
            seg.type === "citation" ? (
              <CitationPill key={i} ref={seg.ref} label={seg.label} />
            ) : null
          )}
        </div>
      )}
    </div>
  );
};

/* ─────────────────────────────────────────────────────────────────────────────
   THINKING INDICATOR
   ───────────────────────────────────────────────────────────────────────────── */

const ThinkingIndicator: React.FC = () => (
  <div
    style={{
      display:     "flex",
      alignItems:  "center",
      gap:         10,
      padding:     "10px 14px",
      background:  "var(--p-surface-2)",
      border:      "1px solid var(--p-hairline)",
      borderRadius: 12,
      borderTopLeftRadius: 4,
      alignSelf:   "flex-start",
      maxWidth:    "85%",
    }}
  >
    {/* Glowing AI icon */}
    <div
      style={{
        width:        28,
        height:       28,
        borderRadius: 7,
        background:   "linear-gradient(135deg, rgba(94,106,210,0.25), rgba(130,143,255,0.15))",
        border:       "1px solid rgba(94,106,210,0.30)",
        display:      "flex",
        alignItems:   "center",
        justifyContent: "center",
        flexShrink:   0,
        boxShadow:    "0 0 12px rgba(94,106,210,0.25)",
        animation:    "aiGlowPulse 2s ease-in-out infinite",
      }}
    >
      <BrainCircuit size={14} color="#828fff" />
    </div>

    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <span
        style={{
          fontSize:      11,
          fontWeight:    500,
          color:         "var(--p-primary-hover)",
          letterSpacing: "0.1px",
          fontFamily:    "var(--font-body)",
        }}
      >
        Analysing data sources…
      </span>

      {/* Typing dots */}
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            style={{
              width:        6,
              height:       6,
              borderRadius: "50%",
              background:   "#5e6ad2",
              display:      "inline-block",
              animation:    `typingDot 1.4s ease-in-out ${i * 0.18}s infinite`,
            }}
          />
        ))}
        <span
          style={{
            fontSize:   11,
            color:      "var(--p-ink-tertiary)",
            fontFamily: "var(--font-mono)",
            marginLeft: 4,
          }}
        >
          causal_engine · crm · forecast
        </span>
      </div>
    </div>

    <style>{`
      @keyframes typingDot {
        0%, 60%, 100% { transform: translateY(0);   opacity: 0.4; }
        30%            { transform: translateY(-4px); opacity: 1;   }
      }
      @keyframes aiGlowPulse {
        0%, 100% { box-shadow: 0 0 12px rgba(94,106,210,0.25); }
        50%       { box-shadow: 0 0 22px rgba(130,143,255,0.45); }
      }
    `}</style>
  </div>
);

/* ─────────────────────────────────────────────────────────────────────────────
   AI BUBBLE
   ───────────────────────────────────────────────────────────────────────────── */

const AiBubble: React.FC<{ message: ChatMessage }> = ({ message }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    const text = message.segments
      ?.map((s) => {
        if (s.type === "text" || s.type === "bold") return s.text;
        if (s.type === "list") return s.items.join("\n");
        return "";
      })
      .filter(Boolean)
      .join("\n") ?? "";
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  };

  return (
    <div
      style={{
        display:     "flex",
        flexDirection: "column",
        gap:         0,
        alignSelf:   "flex-start",
        maxWidth:    "92%",
        animation:   "fade-in 200ms ease both",
      }}
    >
      {/* AI header row */}
      <div
        style={{
          display:     "flex",
          alignItems:  "center",
          gap:         6,
          marginBottom: 5,
        }}
      >
        {/* Avatar */}
        <div
          style={{
            width:        22,
            height:       22,
            borderRadius: 6,
            background:   "linear-gradient(135deg, #5e6ad2, #828fff)",
            display:      "flex",
            alignItems:   "center",
            justifyContent: "center",
            flexShrink:   0,
            boxShadow:    "0 0 8px rgba(94,106,210,0.30)",
          }}
        >
          <Sparkles size={11} color="#fff" />
        </div>
        <span
          style={{
            fontSize:      11,
            fontWeight:    600,
            color:         "var(--p-primary-hover)",
            letterSpacing: "0.2px",
            fontFamily:    "var(--font-body)",
          }}
        >
          Predicto AI
        </span>
        <span
          style={{
            fontSize:   10,
            color:      "var(--p-ink-tertiary)",
            fontFamily: "var(--font-mono)",
            marginLeft: 2,
          }}
        >
          {message.ts.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </span>
      </div>

      {/* Bubble body */}
      <div
        style={{
          background:          "transparent",
          border:              "1px solid var(--p-hairline)",
          borderRadius:        12,
          borderTopLeftRadius: 4,
          padding:             "12px 14px",
          position:            "relative",
          boxShadow:           "inset 0 1px 0 rgba(255,255,255,0.03)",
        }}
      >
        {message.thinking ? (
          <ThinkingIndicator />
        ) : (
          message.segments && <RichContent segments={message.segments} />
        )}
      </div>

      {/* Action row */}
      {!message.thinking && (
        <div
          style={{
            display:    "flex",
            alignItems: "center",
            gap:        2,
            marginTop:  5,
            paddingLeft: 2,
          }}
        >
          <button
            onClick={handleCopy}
            style={{
              background:  "transparent",
              border:      "none",
              cursor:      "pointer",
              color:       copied ? "#4ade80" : "var(--p-ink-tertiary)",
              display:     "flex",
              alignItems:  "center",
              gap:         3,
              padding:     "3px 6px",
              borderRadius: 5,
              fontSize:    10,
              fontFamily:  "var(--font-body)",
              transition:  "color 140ms, background 140ms",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.05)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            title="Copy response"
          >
            <Copy size={10} />
            {copied ? "Copied" : "Copy"}
          </button>
          <button
            style={{
              background: "transparent", border: "none", cursor: "pointer",
              color: "var(--p-ink-tertiary)", display: "flex", alignItems: "center",
              padding: "3px 6px", borderRadius: 5, transition: "color 140ms, background 140ms",
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#4ade80"; (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.05)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--p-ink-tertiary)"; (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
            title="Helpful"
          >
            <ThumbsUp size={10} />
          </button>
          <button
            style={{
              background: "transparent", border: "none", cursor: "pointer",
              color: "var(--p-ink-tertiary)", display: "flex", alignItems: "center",
              padding: "3px 6px", borderRadius: 5, transition: "color 140ms, background 140ms",
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#f87171"; (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.05)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--p-ink-tertiary)"; (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
            title="Not helpful"
          >
            <ThumbsDown size={10} />
          </button>
          <button
            style={{
              background: "transparent", border: "none", cursor: "pointer",
              color: "var(--p-ink-tertiary)", display: "flex", alignItems: "center",
              gap: 3, padding: "3px 6px", borderRadius: 5, fontSize: 10,
              fontFamily: "var(--font-body)", transition: "color 140ms, background 140ms",
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--p-ink-muted)"; (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.05)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--p-ink-tertiary)"; (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
            title="Regenerate"
          >
            <RefreshCw size={10} />
            Retry
          </button>
        </div>
      )}
    </div>
  );
};

/* ─────────────────────────────────────────────────────────────────────────────
   USER BUBBLE
   ───────────────────────────────────────────────────────────────────────────── */

const UserBubble: React.FC<{ message: ChatMessage }> = ({ message }) => (
  <div
    style={{
      display:   "flex",
      flexDirection: "column",
      alignItems: "flex-end",
      alignSelf: "flex-end",
      maxWidth:  "88%",
      animation: "fade-in 200ms ease both",
      gap:       4,
    }}
  >
    <div
      style={{
        background:           "rgba(94, 106, 210, 0.14)",
        border:               "1px solid rgba(94, 106, 210, 0.22)",
        borderRadius:         12,
        borderBottomRightRadius: 4,
        padding:              "9px 13px",
        boxShadow:            "inset 0 1px 0 rgba(255,255,255,0.04)",
      }}
    >
      <p style={{ margin: 0, fontSize: 13, color: "var(--p-ink-muted)", lineHeight: 1.55 }}>
        {message.text}
      </p>
    </div>
    <span style={{ fontSize: 10, color: "var(--p-ink-tertiary)", fontFamily: "var(--font-mono)" }}>
      {message.ts.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
    </span>
  </div>
);

/* ─────────────────────────────────────────────────────────────────────────────
   CONTEXT STRIP  (live KPI pills near the header)
   ───────────────────────────────────────────────────────────────────────────── */

const ContextStrip: React.FC = () => (
  <div
    style={{
      padding:      "8px 14px",
      borderBottom: "1px solid var(--p-hairline)",
      display:      "flex",
      gap:          6,
      flexWrap:     "wrap",
      background:   "var(--p-surface-1)",
    }}
  >
    {[
      { label: "ARR",        value: "$38.4M",  color: "#4ade80"             },
      { label: "Pipeline",   value: "$18.4M",  color: "#818cf8"             },
      { label: "Churn Risk", value: "3 accts", color: "#fbbf24"             },
      { label: "Q2 Fcst",    value: "90%",     color: "var(--p-ink-muted)"  },
    ].map(({ label, value, color }) => (
      <div
        key={label}
        style={{
          display:      "flex",
          alignItems:   "center",
          gap:          5,
          padding:      "3px 9px",
          borderRadius: 9999,
          background:   "var(--p-surface-3)",
          border:       "1px solid var(--p-hairline)",
          cursor:       "default",
        }}
      >
        <span style={{ fontSize: 10, color: "var(--p-ink-tertiary)", fontFamily: "var(--font-body)", letterSpacing: "0.1px" }}>
          {label}
        </span>
        <span style={{ fontSize: 11, fontFamily: "var(--font-mono)", fontWeight: 600, color, fontVariantNumeric: "tabular-nums" }}>
          {value}
        </span>
      </div>
    ))}
  </div>
);

/* ─────────────────────────────────────────────────────────────────────────────
   QUICK-ACTION CHIP ROW
   ───────────────────────────────────────────────────────────────────────────── */

const QuickChipRow: React.FC<{ onSelect: (query: string) => void }> = ({ onSelect }) => {
  const [startIdx, setStartIdx] = useState(0);
  const visible = QUICK_CHIPS.slice(startIdx, startIdx + 3);
  const hasMore = startIdx + 3 < QUICK_CHIPS.length;

  return (
    <div
      style={{
        padding:      "8px 12px",
        borderTop:    "1px solid var(--p-hairline)",
        display:      "flex",
        alignItems:   "center",
        gap:          6,
        flexWrap:     "nowrap",
        overflowX:    "auto",
        background:   "var(--p-surface-1)",
        flexShrink:   0,
      }}
    >
      {visible.map(({ icon: Icon, label, query }) => (
        <button
          key={label}
          onClick={() => onSelect(query)}
          style={{
            display:      "inline-flex",
            alignItems:   "center",
            gap:          5,
            padding:      "5px 10px",
            borderRadius: 9999,
            background:   "var(--p-surface-2)",
            border:       "1px solid var(--p-hairline-strong)",
            color:        "var(--p-ink-subtle)",
            fontSize:     11,
            fontFamily:   "var(--font-body)",
            fontWeight:   500,
            cursor:       "pointer",
            whiteSpace:   "nowrap",
            flexShrink:   0,
            transition:   "all 140ms ease",
          }}
          onMouseEnter={(e) => {
            const btn = e.currentTarget as HTMLButtonElement;
            btn.style.borderColor = "var(--p-primary)";
            btn.style.color       = "var(--p-primary-hover)";
            btn.style.background  = "rgba(94,106,210,0.08)";
          }}
          onMouseLeave={(e) => {
            const btn = e.currentTarget as HTMLButtonElement;
            btn.style.borderColor = "var(--p-hairline-strong)";
            btn.style.color       = "var(--p-ink-subtle)";
            btn.style.background  = "var(--p-surface-2)";
          }}
        >
          <Icon size={10} />
          {label}
        </button>
      ))}
      {hasMore && (
        <button
          onClick={() => setStartIdx((i) => (i + 3 >= QUICK_CHIPS.length ? 0 : i + 3))}
          style={{
            display:      "inline-flex",
            alignItems:   "center",
            gap:          3,
            padding:      "5px 8px",
            borderRadius: 9999,
            background:   "transparent",
            border:       "1px solid var(--p-hairline)",
            color:        "var(--p-ink-tertiary)",
            fontSize:     10,
            fontFamily:   "var(--font-body)",
            cursor:       "pointer",
            flexShrink:   0,
            transition:   "all 140ms",
          }}
          title="More suggestions"
        >
          <ChevronRight size={10} />
          More
        </button>
      )}
    </div>
  );
};

/* ─────────────────────────────────────────────────────────────────────────────
   INPUT AREA
   ───────────────────────────────────────────────────────────────────────────── */

interface InputAreaProps {
  onSend:    (text: string) => void;
  disabled?: boolean;
}

const InputArea: React.FC<InputAreaProps> = ({ onSend, disabled }) => {
  const [value, setValue]       = useState("");
  const [focused, setFocused]   = useState(false);
  const textareaRef             = useRef<HTMLTextAreaElement>(null);

  /* Auto-resize textarea */
  useEffect(() => {
    if (!textareaRef.current) return;
    textareaRef.current.style.height = "auto";
    textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 140)}px`;
  }, [value]);

  const handleSend = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [value, disabled, onSend]);

  const handleKey = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const canSend = value.trim().length > 0 && !disabled;

  return (
    <div
      style={{
        padding:      "10px 12px 12px",
        borderTop:    "1px solid var(--p-hairline)",
        background:   "var(--p-surface-1)",
        flexShrink:   0,
      }}
    >
      {/* Premium textarea wrapper */}
      <div
        style={{
          position:     "relative",
          background:   focused ? "var(--p-surface-3)" : "var(--p-surface-2)",
          border:       focused
                          ? "1px solid rgba(94,106,210,0.55)"
                          : "1px solid var(--p-hairline-strong)",
          borderRadius: 12,
          overflow:     "hidden",
          boxShadow:    focused
                          ? "0 0 0 3px rgba(94,106,210,0.12), inset 0 1px 0 rgba(255,255,255,0.04)"
                          : "inset 0 1px 0 rgba(255,255,255,0.03)",
          transition:   "border-color 160ms ease, box-shadow 160ms ease, background 160ms ease",
        }}
      >
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKey}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="Ask about revenue, pipeline, churn…"
          rows={1}
          style={{
            display:    "block",
            width:      "100%",
            padding:    "10px 44px 10px 13px",
            background: "transparent",
            border:     "none",
            outline:    "none",
            color:      "var(--p-ink)",
            fontSize:   13,
            fontFamily: "var(--font-body)",
            lineHeight: 1.55,
            resize:     "none",
            minHeight:  40,
            maxHeight:  140,
            letterSpacing: "-0.05px",
          }}
          aria-label="Message the AI analyst"
        />

        {/* Send button — lives inside the textarea box */}
        <button
          onClick={handleSend}
          disabled={!canSend}
          style={{
            position:       "absolute",
            right:          9,
            bottom:         9,
            width:          28,
            height:         28,
            borderRadius:   8,
            background:     canSend
                              ? "linear-gradient(135deg, #5e6ad2, #828fff)"
                              : "var(--p-surface-3)",
            border:         canSend
                              ? "1px solid rgba(130,143,255,0.30)"
                              : "1px solid var(--p-hairline)",
            display:        "flex",
            alignItems:     "center",
            justifyContent: "center",
            cursor:         canSend ? "pointer" : "default",
            transition:     "all 160ms ease",
            boxShadow:      canSend ? "0 0 10px rgba(94,106,210,0.35)" : "none",
          }}
          aria-label="Send message"
        >
          <Send size={12} color={canSend ? "#fff" : "var(--p-ink-tertiary)"} />
        </button>
      </div>

      {/* Footer row: helpers + shortcut hint */}
      <div
        style={{
          display:        "flex",
          alignItems:     "center",
          justifyContent: "space-between",
          marginTop:      6,
          paddingLeft:    2,
          paddingRight:   2,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
          {/* Attachment stub */}
          <button
            style={{
              background: "transparent", border: "none",
              color: "var(--p-ink-tertiary)", cursor: "pointer",
              padding: "3px 5px", borderRadius: 5,
              display: "flex", alignItems: "center",
              transition: "color 140ms, background 140ms",
            }}
            title="Attach file (coming soon)"
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--p-ink-subtle)"; (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.05)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--p-ink-tertiary)"; (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
          >
            <Paperclip size={11} />
          </button>
          {/* Voice stub */}
          <button
            style={{
              background: "transparent", border: "none",
              color: "var(--p-ink-tertiary)", cursor: "pointer",
              padding: "3px 5px", borderRadius: 5,
              display: "flex", alignItems: "center",
              transition: "color 140ms, background 140ms",
            }}
            title="Voice input (coming soon)"
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--p-ink-subtle)"; (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.05)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--p-ink-tertiary)"; (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
          >
            <Mic size={11} />
          </button>
        </div>

        <span
          style={{
            fontSize:   10,
            color:      "var(--p-ink-tertiary)",
            fontFamily: "var(--font-mono)",
            letterSpacing: "0.1px",
          }}
        >
          ⏎ send · ⇧⏎ newline
        </span>
      </div>
    </div>
  );
};

/* ─────────────────────────────────────────────────────────────────────────────
   PANEL HEADER
   ───────────────────────────────────────────────────────────────────────────── */

interface PanelHeaderProps {
  onClose:       () => void;
  onClearChat:   () => void;
  sessionCount:  number;
}

const PanelHeader: React.FC<PanelHeaderProps> = ({ onClose, onClearChat, sessionCount }) => {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div
      style={{
        display:        "flex",
        alignItems:     "center",
        justifyContent: "space-between",
        padding:        "12px 14px 10px",
        borderBottom:   "1px solid var(--p-hairline)",
        background:     "var(--p-surface-1)",
        flexShrink:     0,
        position:       "relative",
        zIndex:         1,
      }}
    >
      {/* Left: brand + model tag */}
      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
        {/* Glowing avatar */}
        <div
          style={{
            width:        30,
            height:       30,
            borderRadius: 9,
            background:   "linear-gradient(135deg, #5e6ad2 0%, #828fff 100%)",
            display:      "flex",
            alignItems:   "center",
            justifyContent: "center",
            flexShrink:   0,
            boxShadow:    "0 0 14px rgba(94,106,210,0.40)",
          }}
        >
          <BrainCircuit size={16} color="#fff" />
        </div>

        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span
              style={{
                fontFamily:    "var(--font-display)",
                fontSize:      14,
                fontWeight:    600,
                letterSpacing: "-0.3px",
                color:         "var(--p-ink)",
              }}
            >
              AI Analyst
            </span>
            {/* Online indicator */}
            <span
              style={{
                width:        6,
                height:       6,
                borderRadius: "50%",
                background:   "#4ade80",
                boxShadow:    "0 0 6px rgba(74,222,128,0.7)",
                display:      "inline-block",
              }}
            />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 1 }}>
            <span
              style={{
                fontSize:      10,
                fontFamily:    "var(--font-mono)",
                color:         "var(--p-ink-tertiary)",
                letterSpacing: "0.2px",
              }}
            >
              Predicto Causal · v3.4.1
            </span>
            <span
              style={{
                display:      "inline-flex",
                alignItems:   "center",
                padding:      "0px 5px",
                borderRadius: 9999,
                background:   "rgba(94,106,210,0.12)",
                border:       "1px solid rgba(94,106,210,0.22)",
                fontSize:     9,
                fontFamily:   "var(--font-mono)",
                color:        "var(--p-primary-hover)",
                letterSpacing: "0.3px",
                fontWeight:   500,
              }}
            >
              GPT-4o
            </span>
          </div>
        </div>
      </div>

      {/* Right: actions */}
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        {/* Session count badge */}
        <span
          style={{
            fontSize:      10,
            fontFamily:    "var(--font-mono)",
            color:         "var(--p-ink-tertiary)",
            padding:       "2px 6px",
            borderRadius:  9999,
            background:    "var(--p-surface-3)",
            border:        "1px solid var(--p-hairline)",
            letterSpacing: "0.2px",
          }}
        >
          {sessionCount} msgs
        </span>

        {/* Menu toggle */}
        <div style={{ position: "relative" }}>
          <button
            className="btn-icon"
            onClick={() => setMenuOpen((v) => !v)}
            title="Panel options"
          >
            <ChevronDown size={13} style={{ transition: "transform 160ms", transform: menuOpen ? "rotate(180deg)" : "none" }} />
          </button>

          {menuOpen && (
            <div
              style={{
                position:     "absolute",
                right:        0,
                top:          "calc(100% + 6px)",
                width:        160,
                background:   "var(--p-surface-3)",
                border:       "1px solid var(--p-hairline-strong)",
                borderRadius: 10,
                boxShadow:    "0 8px 24px rgba(0,0,0,0.5)",
                zIndex:       100,
                overflow:     "hidden",
              }}
            >
              {[
                { label: "Clear conversation", action: () => { onClearChat(); setMenuOpen(false); }, color: "var(--p-ink-muted)" },
                { label: "Export transcript",  action: () => setMenuOpen(false), color: "var(--p-ink-muted)" },
                { label: "Settings",           action: () => setMenuOpen(false), color: "var(--p-ink-muted)" },
              ].map(({ label, action, color }) => (
                <button
                  key={label}
                  onClick={action}
                  style={{
                    display:    "block",
                    width:      "100%",
                    textAlign:  "left",
                    padding:    "9px 12px",
                    background: "transparent",
                    border:     "none",
                    color,
                    fontSize:   13,
                    fontFamily: "var(--font-body)",
                    cursor:     "pointer",
                    transition: "background 120ms",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.05)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Close */}
        <button
          className="btn-icon"
          onClick={onClose}
          title="Close AI panel"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
};

/* ─────────────────────────────────────────────────────────────────────────────
   DATE SEPARATOR
   ───────────────────────────────────────────────────────────────────────────── */

const DateSeparator: React.FC<{ label: string }> = ({ label }) => (
  <div
    style={{
      display:        "flex",
      alignItems:     "center",
      gap:            10,
      padding:        "4px 0",
      alignSelf:      "stretch",
    }}
  >
    <div style={{ flex: 1, height: 1, background: "var(--p-hairline)" }} />
    <span
      style={{
        fontSize:      10,
        fontFamily:    "var(--font-mono)",
        color:         "var(--p-ink-tertiary)",
        letterSpacing: "0.3px",
        whiteSpace:    "nowrap",
      }}
    >
      {label}
    </span>
    <div style={{ flex: 1, height: 1, background: "var(--p-hairline)" }} />
  </div>
);

/* ─────────────────────────────────────────────────────────────────────────────
   ROOT COMPONENT
   ───────────────────────────────────────────────────────────────────────────── */

export interface AiAnalystPanelProps {
  /** Whether the drawer is visible */
  open: boolean;
  /** Callback to close/toggle the panel */
  onClose: () => void;
}

const AI_THINKING_DELAY_MS = 1600;

export const AiAnalystPanel: React.FC<AiAnalystPanelProps> = ({ open, onClose }) => {
  const [messages, setMessages]   = useState<ChatMessage[]>(INITIAL_MESSAGES);
  const [thinking, setThinking]   = useState(false);
  const scrollRef                 = useRef<HTMLDivElement>(null);

  /* Auto-scroll to bottom when new messages arrive */
  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }, 50);
  }, []);

  useEffect(() => {
    if (open) scrollToBottom();
  }, [open, messages.length, scrollToBottom]);

  /* Send a user message, then simulate AI response */
  const handleSend = useCallback(
    (text: string) => {
      const userMsg: ChatMessage = {
        id:   `u${Date.now()}`,
        role: "user",
        text,
        ts:   new Date(),
      };

      /* Add thinking placeholder */
      const thinkId = `think${Date.now()}`;
      const thinkMsg: ChatMessage = {
        id:       thinkId,
        role:     "ai",
        thinking: true,
        ts:       new Date(),
      };

      setMessages((prev) => [...prev, userMsg, thinkMsg]);
      setThinking(true);
      scrollToBottom();

      setTimeout(() => {
        const aiResponse: ChatMessage = {
          id:       `a${Date.now()}`,
          role:     "ai",
          segments: buildAiResponse(text),
          ts:       new Date(),
        };
        setMessages((prev) => prev.map((m) => (m.id === thinkId ? aiResponse : m)));
        setThinking(false);
        scrollToBottom();
      }, AI_THINKING_DELAY_MS);
    },
    [scrollToBottom],
  );

  /* Clear chat */
  const handleClearChat = useCallback(() => {
    setMessages([]);
  }, []);

  /* Chip selection pre-fills and auto-sends */
  const handleChipSelect = useCallback(
    (query: string) => {
      handleSend(query);
    },
    [handleSend],
  );

  return (
    <>
      {/* ── Backdrop (mobile) ── */}
      {open && (
        <div
          style={{
            position:   "fixed",
            inset:      0,
            background: "rgba(1,1,2,0.55)",
            zIndex:     39,
            display:    "none",
          }}
          className="ai-panel-backdrop"
          onClick={onClose}
          aria-hidden
        />
      )}

      {/* ── Drawer ── */}
      <aside
        className={`ai-panel${open ? "" : " closed"}`}
        aria-label="AI Analyst Copilot"
        style={{
          /* Glassmorphic surface */
          background:          "rgba(15, 16, 17, 0.88)",
          backdropFilter:      "blur(24px) saturate(180%)",
          WebkitBackdropFilter:"blur(24px) saturate(180%)",
          borderLeft:          "1px solid var(--p-hairline)",
          boxShadow:           "-1px 0 0 0 rgba(255,255,255,0.03), -8px 0 32px rgba(0,0,0,0.45)",
          display:             "flex",
          flexDirection:       "column",
          overflow:            "hidden",
        }}
      >
        {/* ── 1. Header ── */}
        <PanelHeader
          onClose={onClose}
          onClearChat={handleClearChat}
          sessionCount={messages.length}
        />

        {/* ── 2. Context Strip ── */}
        <ContextStrip />

        {/* ── 3. Scrollable message history ── */}
        <div
          ref={scrollRef}
          style={{
            flex:          1,
            overflowY:     "auto",
            overflowX:     "hidden",
            display:       "flex",
            flexDirection: "column",
            gap:           14,
            padding:       "16px 14px",
          }}
          role="log"
          aria-live="polite"
          aria-label="Conversation history"
        >
          {/* Date separator for initial history */}
          {messages.length > 0 && (
            <DateSeparator label="Today · May 12, 2025" />
          )}

          {/* Welcome state */}
          {messages.length === 0 && (
            <div
              style={{
                display:        "flex",
                flexDirection:  "column",
                alignItems:     "center",
                justifyContent: "center",
                flex:           1,
                gap:            12,
                textAlign:      "center",
                padding:        "32px 16px",
              }}
            >
              <div
                style={{
                  width:        48,
                  height:       48,
                  borderRadius: 14,
                  background:   "linear-gradient(135deg, rgba(94,106,210,0.20), rgba(130,143,255,0.10))",
                  border:       "1px solid rgba(94,106,210,0.25)",
                  display:      "flex",
                  alignItems:   "center",
                  justifyContent: "center",
                  boxShadow:    "0 0 20px rgba(94,106,210,0.20)",
                }}
              >
                <Sparkles size={22} color="#828fff" />
              </div>
              <div>
                <p style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 600, color: "var(--p-ink)", letterSpacing: "-0.2px", marginBottom: 5 }}>
                  Ask me anything
                </p>
                <p style={{ fontSize: 12, color: "var(--p-ink-tertiary)", lineHeight: 1.6, maxWidth: 220 }}>
                  I have access to your CRM, pipeline, forecast, and causal model. Try a chip below to get started.
                </p>
              </div>
            </div>
          )}

          {/* Message list */}
          {messages.map((msg) =>
            msg.role === "user" ? (
              <UserBubble key={msg.id} message={msg} />
            ) : (
              <AiBubble key={msg.id} message={msg} />
            )
          )}
        </div>

        {/* ── 4. Quick-action chip row ── */}
        <QuickChipRow onSelect={handleChipSelect} />

        {/* ── 5. Input area ── */}
        <InputArea onSend={handleSend} disabled={thinking} />

        {/* ── Disclaimer ── */}
        <div
          style={{
            padding:    "4px 14px 10px",
            background: "var(--p-surface-1)",
            flexShrink: 0,
          }}
        >
          <p
            style={{
              margin:        0,
              fontSize:      10,
              color:         "var(--p-ink-tertiary)",
              textAlign:     "center",
              fontFamily:    "var(--font-body)",
              letterSpacing: "0.05px",
              lineHeight:    1.5,
            }}
          >
            AI responses are informational. Verify critical data in source systems.
          </p>
        </div>
      </aside>
    </>
  );
};

export default AiAnalystPanel;

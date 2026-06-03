/**
 * src/views/Reports/ReportsView.tsx
 *
 * Predicto V3 — Reports Centre
 * Browse, generate, and download executive reports.
 * Matches Linear dark aesthetic used across all V3 views.
 */

import React, { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useUserName, getUserName } from "@/store/useUserStore";
import {
  FileBarChart,
  Download,
  FileText,
  TrendingUp,
  Users,
  Shield,
  Calendar,
  Clock,
  ChevronRight,
  ExternalLink,
  Printer,
  RefreshCw,
  BarChart3,
  PieChart,
  Activity,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  Filter,
  Search,
  Star,
  Eye,
} from "lucide-react";

/* =============================================================================
   TYPES
============================================================================= */

interface ReportTemplate {
  id: string;
  title: string;
  description: string;
  category: ReportCategory;
  icon: React.ComponentType<{ size?: number; color?: string }>;
  tags: string[];
  lastGenerated?: string;
  estimatedTime: string;
  status: "ready" | "generating" | "scheduled";
  starred?: boolean;
}

type ReportCategory = "executive" | "operational" | "financial" | "risk";

interface RecentReport {
  id: string;
  title: string;
  generatedAt: string;
  generatedBy: string;
  fileSize: string;
  status: "completed" | "failed" | "generating";
  downloadUrl?: string;
}

/* =============================================================================
   CONSTANTS
============================================================================= */

const CATEGORY_CONFIG: Record<ReportCategory, { label: string; color: string; bg: string; border: string }> = {
  executive:   { label: "Executive",   color: "#828fff", bg: "rgba(94,106,210,0.10)",  border: "rgba(94,106,210,0.22)" },
  operational: { label: "Operational", color: "#4ade80", bg: "rgba(39,166,68,0.08)",   border: "rgba(39,166,68,0.20)" },
  financial:   { label: "Financial",   color: "#fbbf24", bg: "rgba(232,163,10,0.08)",  border: "rgba(232,163,10,0.20)" },
  risk:        { label: "Risk",        color: "#f87171", bg: "rgba(229,72,77,0.08)",   border: "rgba(229,72,77,0.20)" },
};

const REPORT_TEMPLATES: ReportTemplate[] = [
  {
    id: "exec-intelligence",
    title: "Executive Intelligence Report",
    description: "Comprehensive revenue forecast, persona clustering, and risk analysis for board-level stakeholders.",
    category: "executive",
    icon: Sparkles,
    tags: ["Forecast", "Personas", "Churn Risk"],
    lastGenerated: "2 hours ago",
    estimatedTime: "~5s",
    status: "ready",
    starred: true,
  },
  {
    id: "revenue-forecast",
    title: "Revenue Forecast Summary",
    description: "Per-segment Fourier+Ridge revenue projections with confidence intervals and trend analysis.",
    category: "financial",
    icon: TrendingUp,
    tags: ["Forecast", "Segments", "CI Bands"],
    lastGenerated: "1 day ago",
    estimatedTime: "~3s",
    status: "ready",
  },
  {
    id: "churn-risk-audit",
    title: "Churn Risk Audit",
    description: "Customer-level churn probability rankings with causal drivers and recommended interventions.",
    category: "risk",
    icon: Shield,
    tags: ["Churn", "CATE", "Interventions"],
    lastGenerated: "3 days ago",
    estimatedTime: "~8s",
    status: "ready",
  },
  {
    id: "persona-clustering",
    title: "Customer Persona Analysis",
    description: "K-Means behavioural segmentation with deal-value, discount, margin, and regional breakdowns.",
    category: "operational",
    icon: Users,
    tags: ["K-Means", "Segments", "Regions"],
    lastGenerated: "5 hours ago",
    estimatedTime: "~4s",
    status: "ready",
  },
  {
    id: "margin-health",
    title: "Portfolio Margin Health",
    description: "Cross-segment margin analysis, discount ceiling compliance, and margin erosion tracking.",
    category: "financial",
    icon: BarChart3,
    tags: ["Margin", "Discount", "Compliance"],
    estimatedTime: "~6s",
    status: "ready",
  },
  {
    id: "pipeline-velocity",
    title: "Pipeline Velocity Report",
    description: "Stage conversion rates, velocity metrics, and bottleneck identification across all active deals.",
    category: "operational",
    icon: Activity,
    tags: ["Pipeline", "Velocity", "Conversion"],
    estimatedTime: "~4s",
    status: "ready",
  },
  {
    id: "competitive-intel",
    title: "Competitive Intelligence Briefing",
    description: "Win/loss analysis by competitor, Nash equilibrium positioning, and strategic move recommendations.",
    category: "executive",
    icon: PieChart,
    tags: ["War Room", "Nash", "Pareto"],
    estimatedTime: "~7s",
    status: "ready",
  },
  {
    id: "causal-impact",
    title: "Causal Impact Assessment",
    description: "Double ML treatment effect estimates with heterogeneity maps and counterfactual scenarios.",
    category: "risk",
    icon: FileBarChart,
    tags: ["CATE", "DML", "Counterfactual"],
    estimatedTime: "~10s",
    status: "ready",
  },
];

const RECENT_REPORTS: RecentReport[] = [
  {
    id: "rr-1",
    title: "Executive Intelligence Report",
    generatedAt: "Today, 11:22 AM",
    generatedBy: "Alex Rivera",
    fileSize: "2.4 MB",
    status: "completed",
    downloadUrl: "/api/v1/report",
  },
  {
    id: "rr-2",
    title: "Revenue Forecast Summary",
    generatedAt: "Yesterday, 3:45 PM",
    generatedBy: "Alex Rivera",
    fileSize: "1.1 MB",
    status: "completed",
  },
  {
    id: "rr-3",
    title: "Churn Risk Audit",
    generatedAt: "May 22, 2026",
    generatedBy: "System (Scheduled)",
    fileSize: "3.8 MB",
    status: "completed",
  },
  {
    id: "rr-4",
    title: "Customer Persona Analysis",
    generatedAt: "May 21, 2026",
    generatedBy: "Alex Rivera",
    fileSize: "1.6 MB",
    status: "completed",
  },
  {
    id: "rr-5",
    title: "Competitive Intelligence Briefing",
    generatedAt: "May 20, 2026",
    generatedBy: "System (Scheduled)",
    fileSize: "890 KB",
    status: "failed",
  },
];

/* =============================================================================
   HELPER: Generate report via backend
============================================================================= */

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8001";

const TITLE_TO_ID_MAP: Record<string, string> = {
  "Executive Intelligence Report": "exec-intelligence",
  "Revenue Forecast Summary": "revenue-forecast",
  "Churn Risk Audit": "churn-risk-audit",
  "Customer Persona Analysis": "persona-clustering",
  "Portfolio Margin Health": "margin-health",
  "Pipeline Velocity Report": "pipeline-velocity",
  "Competitive Intelligence Briefing": "competitive-intel",
  "Causal Impact Assessment": "causal-impact"
};

const getReportTitleTranslation = (title: string, t: any) => {
  const id = TITLE_TO_ID_MAP[title];
  return id ? t(`reports.templates.${id}.title`) : title;
};

const getGeneratedAtTranslation = (val: string, t: any) => {
  if (val.startsWith("Today,")) {
    const time = val.replace("Today, ", "");
    return t("reports.table.values.today", { time });
  }
  if (val.startsWith("Yesterday,")) {
    const time = val.replace("Yesterday, ", "");
    return t("reports.table.values.yesterday", { time });
  }
  return t(`reports.dates.${val}`, { defaultValue: val });
};

const getGeneratedByTranslation = (val: string, t: any, userName?: string) => {
  if (val === "System (Scheduled)") {
    return t("reports.table.values.systemScheduled");
  }
  if (val === "Alex Rivera") {
    return userName || getUserName() || "Alex Rivera";
  }
  return val;
};

const getLastGeneratedTranslation = (val: string | undefined, t: any) => {
  if (!val) return "";
  const key = val.replace(/\s+/g, "_");
  return t(`reports.lastGenerated.${key}`, { defaultValue: val });
};

const getEstimatedTimeTranslation = (val: string, t: any) => {
  const num = val.replace(/[^0-9]/g, "");
  return t("reports.estimatedTime", { time: num });
};

/* =============================================================================
   SUB-COMPONENTS
============================================================================= */

const CategoryPill: React.FC<{ category: ReportCategory }> = ({ category }) => {
  const { t } = useTranslation();
  const cfg = CATEGORY_CONFIG[category];
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "2px 8px", borderRadius: "var(--radius-pill)",
      background: cfg.bg, border: `1px solid ${cfg.border}`,
      fontSize: 10, fontWeight: 600, color: cfg.color,
      fontFamily: "var(--font-mono)", textTransform: "uppercase",
      letterSpacing: "0.3px",
    }}>
      {t("reports.categories." + category)}
    </span>
  );
};

const TagPill: React.FC<{ label: string }> = ({ label }) => {
  const { t } = useTranslation();
  return (
    <span style={{
      display: "inline-flex", alignItems: "center",
      padding: "1px 6px", borderRadius: "var(--radius-pill)",
      background: "rgba(255,255,255,0.04)",
      border: "1px solid var(--p-hairline)",
      fontSize: 9, color: "var(--p-ink-tertiary)",
      fontFamily: "var(--font-mono)",
    }}>
      {t("reports.tags." + label, { defaultValue: label })}
    </span>
  );
};

/* =============================================================================
   MAIN COMPONENT
============================================================================= */

const ReportsView: React.FC = () => {
  const { t } = useTranslation();
  const userName = useUserName();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<ReportCategory | "all">("all");
  const [generating, setGenerating] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: "error" | "success" | "info" } | null>(null);
  const [starredIds, setStarredIds] = useState<Set<string>>(
    new Set(REPORT_TEMPLATES.filter(t => t.starred).map(t => t.id))
  );

  const showToast = useCallback((msg: string, type: "error" | "success" | "info" = "error") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 5000);
  }, []);

  const toggleStar = useCallback((id: string) => {
    setStarredIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const openExecReport = useCallback(async () => {
    setGenerating("exec-intelligence");
    try {
      const res = await fetch(`${API_BASE}/api/v1/report`);
      if (res.ok) {
        // Open in a new tab
        window.open(`${API_BASE}/api/v1/report`, "_blank");
        showToast(t("reports.toast.opened"), "success");
      } else if (res.status === 503) {
        showToast(t("reports.toast.notReady"), "error");
      } else {
        showToast(t("reports.toast.failed", { status: res.status }), "error");
      }
    } catch {
      showToast(t("reports.toast.unreachable"), "error");
    } finally {
      setGenerating(null);
    }
  }, [showToast, t]);

  const handleGenerate = useCallback((template: ReportTemplate) => {
    if (template.id === "exec-intelligence") {
      openExecReport();
      return;
    }
    setGenerating(template.id);
    const translatedTitle = t(`reports.templates.${template.id}.title`, { defaultValue: template.title });
    showToast(t("reports.toast.comingSoon", { title: translatedTitle }), "info");
    setTimeout(() => setGenerating(null), 2000);
  }, [openExecReport, showToast, t]);

  const filteredTemplates = REPORT_TEMPLATES.filter(t => {
    if (selectedCategory !== "all" && t.category !== selectedCategory) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        t.title.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.tags.some(tag => tag.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const statusColor = (s: RecentReport["status"]) =>
    s === "completed" ? "#4ade80" : s === "generating" ? "#fbbf24" : "#f87171";

  const statusIcon = (s: RecentReport["status"]) =>
    s === "completed" ? CheckCircle2 : s === "generating" ? RefreshCw : AlertTriangle;

  return (
    <div
      className="animate-fade-in"
      style={{
        padding: "var(--spacing-lg)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--spacing-lg)",
        maxWidth: 1640,
        margin: "0 auto",
        width: "100%",
      }}
    >
      {/* ── Toast notification ── */}
      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: 24, left: "50%", transform: "translateX(-50%)",
            zIndex: 9999,
            display: "flex", alignItems: "center", gap: 8,
            padding: "10px 20px",
            borderRadius: "var(--radius-lg)",
            background: toast.type === "error"
              ? "rgba(229,72,77,0.15)"
              : toast.type === "success"
              ? "rgba(39,166,68,0.15)"
              : "rgba(94,106,210,0.15)",
            border: `1px solid ${toast.type === "error" ? "rgba(229,72,77,0.30)" : toast.type === "success" ? "rgba(39,166,68,0.30)" : "rgba(94,106,210,0.30)"}`,
            backdropFilter: "blur(12px)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
            animation: "fade-in 200ms ease",
          }}
        >
          {toast.type === "error" ? (
            <AlertTriangle size={14} color="#f87171" />
          ) : toast.type === "success" ? (
            <CheckCircle2 size={14} color="#4ade80" />
          ) : (
            <Sparkles size={14} color="#828fff" />
          )}
          <span style={{
            fontSize: 13, fontWeight: 500,
            color: toast.type === "error" ? "#f87171" : toast.type === "success" ? "#4ade80" : "#828fff",
            fontFamily: "var(--font-body)",
            maxWidth: 500,
          }}>
            {toast.msg}
          </span>
          <button
            onClick={() => setToast(null)}
            style={{
              background: "none", border: "none", cursor: "pointer",
              color: "var(--p-ink-tertiary)", fontSize: 16,
              lineHeight: 1, padding: "0 2px",
            }}
          >
            ×
          </button>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          PAGE HEADER
      ════════════════════════════════════════════════════════════════════════ */}
      <div style={{
        display: "flex", alignItems: "flex-start",
        justifyContent: "space-between", gap: 20, flexWrap: "wrap",
      }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 5 }}>
            <div style={{
              width: 30, height: 30, borderRadius: "var(--radius-sm)",
              background: "rgba(94,106,210,0.12)", border: "1px solid rgba(94,106,210,0.22)",
              display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
            }}>
              <FileBarChart size={15} color="var(--p-primary-hover)" strokeWidth={1.6} />
            </div>
            <h1 className="t-headline" style={{ color: "var(--p-ink)", margin: 0 }}>
              {t("reports.title")}
            </h1>
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 4,
              padding: "3px 9px", borderRadius: "var(--radius-pill)",
              background: "rgba(39,166,68,0.08)", border: "1px solid rgba(39,166,68,0.20)",
              fontSize: 10, fontWeight: 600, letterSpacing: "0.4px",
              textTransform: "uppercase", color: "#4ade80",
              fontFamily: "var(--font-mono)",
            }}>
              {t("reports.templatesCount", { count: REPORT_TEMPLATES.length })}
            </span>
          </div>
          <p style={{
            fontSize: 13, color: "var(--p-ink-tertiary)", margin: 0,
            fontFamily: "var(--font-body)", lineHeight: 1.5,
          }}>
            {t("reports.subtitle")}
          </p>
        </div>

        {/* Quick generate button */}
        <button
          onClick={openExecReport}
          disabled={generating === "exec-intelligence"}
          style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "9px 18px",
            background: generating === "exec-intelligence"
              ? "rgba(94,106,210,0.4)" : "linear-gradient(135deg, #5e6ad2 0%, #828fff 100%)",
            border: "none", borderRadius: "var(--radius-lg)",
            color: "#fff", fontSize: 13, fontWeight: 600,
            cursor: generating === "exec-intelligence" ? "wait" : "pointer",
            fontFamily: "var(--font-body)",
            boxShadow: "0 2px 12px rgba(94,106,210,0.35)",
            transition: "transform 120ms ease, box-shadow 120ms ease",
          }}
          onMouseEnter={e => { if (generating !== "exec-intelligence") { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 4px 20px rgba(94,106,210,0.45)"; } }}
          onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 2px 12px rgba(94,106,210,0.35)"; }}
        >
          {generating === "exec-intelligence" ? (
            <><RefreshCw size={14} style={{ animation: "spin 0.9s linear infinite" }} /> {t("reports.checking")}</>
          ) : (
            <><Printer size={14} /> {t("reports.generateExecutiveReport")}</>
          )}
        </button>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          SEARCH + FILTER BAR
      ════════════════════════════════════════════════════════════════════════ */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
      }}>
        {/* Search */}
        <div style={{
          flex: "1 1 260px", minWidth: 200,
          display: "flex", alignItems: "center", gap: 8,
          padding: "8px 12px",
          background: "var(--p-surface-1)",
          border: "1px solid var(--p-hairline)",
          borderRadius: "var(--radius-lg)",
        }}>
          <Search size={14} color="var(--p-ink-tertiary)" />
          <input
            type="text"
            placeholder={t("reports.searchPlaceholder")}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{
              flex: 1, background: "none", border: "none", outline: "none",
              color: "var(--p-ink)", fontSize: 13,
              fontFamily: "var(--font-body)",
            }}
          />
        </div>

        {/* Category filters */}
        <div style={{ display: "flex", gap: 5 }}>
          {(["all", "executive", "operational", "financial", "risk"] as const).map(cat => {
            const active = selectedCategory === cat;
            const label = cat === "all" ? t("reports.categories.all") : t("reports.categories." + cat);
            const color = cat === "all" ? "var(--p-ink-muted)" : CATEGORY_CONFIG[cat].color;
            return (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 4,
                  padding: "5px 12px", borderRadius: "var(--radius-pill)",
                  background: active ? `${color}18` : "transparent",
                  border: active ? `1px solid ${color}40` : "1px solid var(--p-hairline)",
                  color: active ? color : "var(--p-ink-tertiary)",
                  fontSize: 11, fontWeight: 500, cursor: "pointer",
                  fontFamily: "var(--font-body)",
                  transition: "all 120ms ease",
                }}
              >
                {cat === "all" && <Filter size={10} />}
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          REPORT TEMPLATES GRID
      ════════════════════════════════════════════════════════════════════════ */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))",
        gap: 14,
      }}>
        {filteredTemplates.map(template => {
          const Icon = template.icon;
          const isGenerating = generating === template.id;
          const isStarred = starredIds.has(template.id);

          return (
            <div
              key={template.id}
              style={{
                background: "var(--p-surface-1)",
                border: "1px solid var(--p-hairline)",
                borderRadius: "var(--radius-xl)",
                padding: 18,
                display: "flex",
                flexDirection: "column",
                gap: 12,
                transition: "border-color 160ms ease, box-shadow 160ms ease",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04), 0 2px 12px rgba(0,0,0,0.15)",
                position: "relative",
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = "rgba(94,106,210,0.30)";
                e.currentTarget.style.boxShadow = "inset 0 1px 0 rgba(255,255,255,0.04), 0 4px 20px rgba(0,0,0,0.25)";
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = "var(--p-hairline)";
                e.currentTarget.style.boxShadow = "inset 0 1px 0 rgba(255,255,255,0.04), 0 2px 12px rgba(0,0,0,0.15)";
              }}
            >
              {/* Star button */}
              <button
                onClick={() => toggleStar(template.id)}
                style={{
                  position: "absolute", top: 12, insetInlineEnd: 12,
                  background: "none", border: "none", cursor: "pointer",
                  padding: 4, borderRadius: "var(--radius-sm)",
                }}
              >
                <Star
                  size={13}
                  color={isStarred ? "#fbbf24" : "var(--p-ink-tertiary)"}
                  fill={isStarred ? "#fbbf24" : "none"}
                  style={{ transition: "color 120ms ease" }}
                />
              </button>

              {/* Top row: icon + title */}
              <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                <div style={{
                  width: 34, height: 34, borderRadius: "var(--radius-md)",
                  background: CATEGORY_CONFIG[template.category].bg,
                  border: `1px solid ${CATEGORY_CONFIG[template.category].border}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  flexShrink: 0,
                }}>
                  <Icon size={16} color={CATEGORY_CONFIG[template.category].color} />
                </div>
                <div style={{ flex: 1, minWidth: 0, paddingInlineEnd: 20 }}>
                  <div style={{
                    fontSize: 14, fontWeight: 600, color: "var(--p-ink)",
                    letterSpacing: "-0.2px", lineHeight: 1.3, marginBottom: 3,
                  }}>
                    {t(`reports.templates.${template.id}.title`)}
                  </div>
                  <CategoryPill category={template.category} />
                </div>
              </div>

              {/* Description */}
              <p style={{
                fontSize: 12, color: "var(--p-ink-tertiary)",
                fontFamily: "var(--font-body)", lineHeight: 1.55,
                margin: 0,
              }}>
                {t(`reports.templates.${template.id}.description`)}
              </p>

              {/* Tags */}
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {template.tags.map(tag => <TagPill key={tag} label={tag} />)}
              </div>

              {/* Footer: meta + generate button */}
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                marginTop: "auto", paddingTop: 10,
                borderTop: "1px solid var(--p-hairline)",
              }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  {template.lastGenerated && (
                    <span style={{
                      fontSize: 10, color: "var(--p-ink-tertiary)",
                      fontFamily: "var(--font-mono)", display: "flex",
                      alignItems: "center", gap: 4,
                    }}>
                      <Clock size={9} /> {t("reports.lastGeneratedLabel", { time: getLastGeneratedTranslation(template.lastGenerated, t) })}
                    </span>
                  )}
                  <span style={{
                    fontSize: 10, color: "var(--p-ink-tertiary)",
                    fontFamily: "var(--font-mono)", display: "flex",
                    alignItems: "center", gap: 4,
                  }}>
                    <Calendar size={9} /> {getEstimatedTimeTranslation(template.estimatedTime, t)}
                  </span>
                </div>

                <button
                  onClick={() => handleGenerate(template)}
                  disabled={isGenerating}
                  style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "6px 14px",
                    background: isGenerating ? "rgba(255,255,255,0.04)" : "rgba(94,106,210,0.12)",
                    border: isGenerating ? "1px solid var(--p-hairline)" : "1px solid rgba(94,106,210,0.25)",
                    borderRadius: "var(--radius-md)",
                    color: isGenerating ? "var(--p-ink-tertiary)" : "var(--p-primary-hover)",
                    fontSize: 12, fontWeight: 600, cursor: isGenerating ? "wait" : "pointer",
                    fontFamily: "var(--font-body)",
                    transition: "all 120ms ease",
                  }}
                >
                  {isGenerating ? (
                    <>
                      <RefreshCw size={12} style={{ animation: "spin 0.9s linear infinite" }} />
                      {t("reports.generating")}
                    </>
                  ) : (
                    <>
                      <FileText size={12} />
                      {t("reports.table.values.generate")}
                    </>
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Empty state */}
      {filteredTemplates.length === 0 && (
        <div style={{
          textAlign: "center", padding: "60px 20px",
          color: "var(--p-ink-tertiary)", fontFamily: "var(--font-body)",
        }}>
          <Search size={32} color="var(--p-ink-tertiary)" style={{ marginBottom: 12, opacity: 0.5 }} />
          <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>{t("reports.emptyState.title")}</div>
          <div style={{ fontSize: 12 }}>{t("reports.emptyState.subtitle")}</div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          RECENT REPORTS
      ════════════════════════════════════════════════════════════════════════ */}
      <div style={{
        background: "var(--p-surface-1)",
        border: "1px solid var(--p-hairline)",
        borderRadius: "var(--radius-xl)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
        overflow: "hidden",
      }}>
        {/* Section header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "16px 20px",
          borderBottom: "1px solid var(--p-hairline)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Clock size={14} color="var(--p-ink-muted)" />
            <span style={{
              fontSize: 13, fontWeight: 600, color: "var(--p-ink)",
              fontFamily: "var(--font-display)", letterSpacing: "-0.2px",
            }}>
              {t("reports.recentReports")}
            </span>
            <span style={{
              fontSize: 10, color: "var(--p-ink-tertiary)",
              fontFamily: "var(--font-mono)",
              padding: "1px 6px", borderRadius: "var(--radius-pill)",
              background: "rgba(255,255,255,0.04)",
              border: "1px solid var(--p-hairline)",
            }}>
              {RECENT_REPORTS.length}
            </span>
          </div>
        </div>

        {/* Table */}
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {[
                  t("reports.table.headers.report"),
                  t("reports.table.headers.generated"),
                  t("reports.table.headers.by"),
                  t("reports.table.headers.size"),
                  t("reports.table.headers.status"),
                  ""
                ].map((h, i) => (
                  <th
                    key={i}
                    style={{
                      padding: "10px 16px",
                      fontSize: 10, fontWeight: 600, color: "var(--p-ink-tertiary)",
                      fontFamily: "var(--font-mono)", textTransform: "uppercase",
                      letterSpacing: "0.5px", textAlign: i >= 3 ? "center" : "start",
                      borderBottom: "1px solid var(--p-hairline)",
                      background: "var(--p-surface-1)",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {RECENT_REPORTS.map((report, idx) => {
                const isLast = idx === RECENT_REPORTS.length - 1;
                const StatusIcon = statusIcon(report.status);
                const sColor = statusColor(report.status);

                return (
                  <tr
                    key={report.id}
                    style={{ transition: "background 120ms ease" }}
                    onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.02)")}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                  >
                    {/* Report name */}
                    <td style={{
                      padding: "12px 16px",
                      borderBottom: isLast ? "none" : "1px solid var(--p-hairline)",
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <FileText size={14} color="var(--p-ink-muted)" />
                        <span style={{
                          fontSize: 13, fontWeight: 500, color: "var(--p-ink)",
                          fontFamily: "var(--font-body)",
                        }}>
                          {getReportTitleTranslation(report.title, t)}
                        </span>
                      </div>
                    </td>

                    {/* Date */}
                    <td style={{
                      padding: "12px 16px",
                      borderBottom: isLast ? "none" : "1px solid var(--p-hairline)",
                      fontSize: 12, color: "var(--p-ink-muted)",
                      fontFamily: "var(--font-body)", whiteSpace: "nowrap",
                    }}>
                      {getGeneratedAtTranslation(report.generatedAt, t)}
                    </td>

                    {/* By */}
                    <td style={{
                      padding: "12px 16px",
                      borderBottom: isLast ? "none" : "1px solid var(--p-hairline)",
                      fontSize: 12, color: "var(--p-ink-tertiary)",
                      fontFamily: "var(--font-body)", whiteSpace: "nowrap",
                    }}>
                      {getGeneratedByTranslation(report.generatedBy, t, userName)}
                    </td>

                    {/* Size */}
                    <td style={{
                      padding: "12px 16px",
                      borderBottom: isLast ? "none" : "1px solid var(--p-hairline)",
                      textAlign: "center",
                      fontSize: 11, color: "var(--p-ink-tertiary)",
                      fontFamily: "var(--font-mono)",
                    }}>
                      {report.fileSize}
                    </td>

                    {/* Status */}
                    <td style={{
                      padding: "12px 16px",
                      borderBottom: isLast ? "none" : "1px solid var(--p-hairline)",
                      textAlign: "center",
                    }}>
                      <span style={{
                        display: "inline-flex", alignItems: "center", gap: 4,
                        padding: "2px 8px", borderRadius: "var(--radius-pill)",
                        background: `${sColor}12`, border: `1px solid ${sColor}28`,
                        fontSize: 10, fontWeight: 600, color: sColor,
                        fontFamily: "var(--font-mono)", textTransform: "uppercase",
                      }}>
                        <StatusIcon size={9} />
                        {t(`reports.table.values.${report.status}`)}
                      </span>
                    </td>

                    {/* Actions */}
                    <td style={{
                      padding: "12px 16px",
                      borderBottom: isLast ? "none" : "1px solid var(--p-hairline)",
                      textAlign: "center",
                    }}>
                      {report.status === "completed" && (
                        <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "center" }}>
                          {report.downloadUrl ? (
                            <button
                              onClick={() => window.open(`${API_BASE}${report.downloadUrl}`, "_blank")}
                              style={{
                                display: "flex", alignItems: "center", gap: 4,
                                padding: "4px 10px", borderRadius: "var(--radius-sm)",
                                background: "rgba(94,106,210,0.10)",
                                border: "1px solid rgba(94,106,210,0.20)",
                                color: "var(--p-primary-hover)",
                                fontSize: 11, fontWeight: 500, cursor: "pointer",
                                fontFamily: "var(--font-body)",
                              }}
                            >
                              <ExternalLink size={10} /> {t("reports.table.values.open")}
                            </button>
                          ) : (
                            <button
                              style={{
                                display: "flex", alignItems: "center", gap: 4,
                                padding: "4px 10px", borderRadius: "var(--radius-sm)",
                                background: "rgba(255,255,255,0.04)",
                                border: "1px solid var(--p-hairline)",
                                color: "var(--p-ink-tertiary)",
                                fontSize: 11, fontWeight: 500, cursor: "pointer",
                                fontFamily: "var(--font-body)",
                              }}
                            >
                              <Eye size={10} /> {t("reports.table.values.view")}
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ReportsView;

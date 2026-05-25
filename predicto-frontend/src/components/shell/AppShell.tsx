/**
 * AppShell.tsx
 * Predicto — Global Layout Wrapper
 *
 * Renders the three-column shell:
 *   [Sidebar] | [Topbar + Content] | [AI Analyst Panel]
 *
 * Surface hierarchy follows DESIGN.md:
 *   canvas (#010102) → surface-1 (#0f1011) sidebar/topbar → content on canvas
 */

import React, { createContext, useContext, useState, useCallback } from "react";
import { getUserName } from "@/store/useUserStore";
import {
  LayoutDashboard,
  TrendingUp,
  ShieldAlert,
  FlaskConical,
  Database,
  FileBarChart,
  ChevronLeft,
  ChevronRight,
  Bot,
  Bell,
  Settings,
  Upload,
  User,
  X,
  Send,
  Sparkles,
} from "lucide-react";

/* --------------------------------------------------------------------------
   Shell Context
   -------------------------------------------------------------------------- */

interface ShellContextValue {
  sidebarCollapsed: boolean;
  aiPanelOpen: boolean;
  toggleSidebar: () => void;
  toggleAiPanel: () => void;
  openAiPanel: () => void;
}

const ShellContext = createContext<ShellContextValue>({
  sidebarCollapsed: false,
  aiPanelOpen: true,
  toggleSidebar: () => {},
  toggleAiPanel: () => {},
  openAiPanel: () => {},
});

export const useShell = () => useContext(ShellContext);

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */


interface NavItem {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  path: string;
  badge?: number;
}

interface NavGroup {
  groupLabel?: string;
  items: NavItem[];
}

/* --------------------------------------------------------------------------
   Nav Config
   -------------------------------------------------------------------------- */

const NAV_GROUPS: NavGroup[] = [
  {
    items: [
      { icon: LayoutDashboard, label: "Intelligence Hub",  path: "/intelligence-hub" },
      { icon: TrendingUp,      label: "Pipeline",         path: "/pipeline" },
    ],
  },
  {
    groupLabel: "Risk & Growth",
    items: [
      { icon: ShieldAlert,  label: "Risk & Retention", path: "/risk-retention", badge: 3 },
      { icon: FlaskConical, label: "Intelligence Lab",  path: "/intelligence-lab" },
    ],
  },
  {
    groupLabel: "Data & Reports",
    items: [
      { icon: Database,      label: "Data Workspace", path: "/data-workspace" },
      { icon: FileBarChart,  label: "Reports",        path: "/reports" },
    ],
  },
];

/* --------------------------------------------------------------------------
   Sub-components
   -------------------------------------------------------------------------- */

/** Sidebar brand logo mark */
const BrandMark: React.FC<{ collapsed: boolean }> = ({ collapsed }) => (
  <div className="sidebar-logo" style={{ gap: "10px", justifyContent: "center" }}>
    {/* Predicto logo image */}
    <img
      src="/predicto-logo.png"
      alt="Predicto"
      style={{
        height: collapsed ? 30 : 40,
        flexShrink: 0,
        filter: "drop-shadow(0 0 8px rgba(94,106,210,0.2))",
        transition: "height 200ms",
      }}
    />
  </div>
);

/** Single nav item */
const SidebarNavItem: React.FC<{
  item: NavItem;
  collapsed: boolean;
  active: boolean;
  onClick: () => void;
}> = ({ item, collapsed, active, onClick }) => {
  const Icon = item.icon;
  return (
    <button
      className={`sidebar-nav-item${active ? " active" : ""}`}
      onClick={onClick}
      title={collapsed ? item.label : undefined}
      style={{ width: "100%", border: "none", background: "none" }}
    >
      <Icon size={16} className="nav-icon" style={{ flexShrink: 0 }} />
      {!collapsed && (
        <span style={{ flex: 1, textAlign: "left" }}>{item.label}</span>
      )}
      {!collapsed && item.badge != null && item.badge > 0 && (
        <span
          style={{
            background: "rgba(229,72,77,0.15)",
            color: "#f87171",
            border: "1px solid rgba(229,72,77,0.2)",
            borderRadius: "9999px",
            fontSize: 10,
            fontWeight: 600,
            padding: "0 5px",
            minWidth: 16,
            textAlign: "center",
            lineHeight: "16px",
          }}
        >
          {item.badge}
        </span>
      )}
    </button>
  );
};

/** Collapsible Sidebar */
const Sidebar: React.FC<{
  collapsed: boolean;
  onToggle: () => void;
  activePath: string;
  onNavigate: (path: string) => void;
}> = ({ collapsed, onToggle, activePath, onNavigate }) => (
  <aside className={`sidebar${collapsed ? " collapsed" : ""}`}>
    <BrandMark collapsed={collapsed} />

    <nav className="sidebar-nav" style={{ paddingTop: 8 }}>
      {NAV_GROUPS.map((group, gi) => (
        <div key={gi} style={{ marginBottom: 4 }}>
          {!collapsed && group.groupLabel && (
            <div className="sidebar-nav-group-label">{group.groupLabel}</div>
          )}
          {group.items.map((item) => (
            <SidebarNavItem
              key={item.path}
              item={item}
              collapsed={collapsed}
              active={activePath === item.path}
              onClick={() => onNavigate(item.path)}
            />
          ))}
        </div>
      ))}
    </nav>

    {/* Footer: user avatar + collapse toggle */}
    <div className="sidebar-footer">
      {/* User row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "6px 6px",
          borderRadius: 8,
          marginBottom: 4,
          cursor: "pointer",
          transition: "background 120ms",
        }}
        onMouseEnter={(e) =>
          ((e.currentTarget as HTMLDivElement).style.background =
            "rgba(255,255,255,0.04)")
        }
        onMouseLeave={(e) =>
          ((e.currentTarget as HTMLDivElement).style.background = "transparent")
        }
      >
        <div
          style={{
            width: 26,
            height: 26,
            borderRadius: "50%",
            background: "linear-gradient(135deg, #5e6ad2, #828fff)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <User size={13} color="#fff" />
        </div>
        {!collapsed && (
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: 13,
                fontWeight: 500,
                color: "var(--p-ink-muted)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {getUserName() || "User"}
            </div>
            <div
              style={{
                fontSize: 11,
                color: "var(--p-ink-tertiary)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              Workspace
            </div>
          </div>
        )}
      </div>

      {/* Collapse toggle — icon only */}
      <button
        className="sidebar-nav-item"
        onClick={onToggle}
        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        style={{
          width: "100%",
          border: "none",
          background: "none",
          justifyContent: collapsed ? "center" : "flex-end",
        }}
      >
        {collapsed ? (
          <ChevronRight size={15} style={{ flexShrink: 0 }} />
        ) : (
          <ChevronLeft size={15} style={{ flexShrink: 0 }} />
        )}
      </button>
    </div>
  </aside>
);


/** Topbar */
const Topbar: React.FC<{
  pageTitle: string;
  onAiToggle: () => void;
  aiPanelOpen: boolean;
  onNavigate?: (path: string) => void;
}> = ({ pageTitle, onAiToggle, aiPanelOpen, onNavigate }) => (
  <header className="topbar">
    {/* Page title */}
    <div style={{ flex: 1, minWidth: 0 }}>
      <h1
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 16,
          fontWeight: 600,
          letterSpacing: "-0.3px",
          color: "var(--p-ink)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {pageTitle}
      </h1>
    </div>

    {/* Right actions */}
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>

      {/* Upload — go to Data Workspace */}
      <button
        className="btn-icon"
        title="Upload Data"
        onClick={() => onNavigate?.("/data-workspace")}
      >
        <Upload size={15} />
      </button>

      {/* Notifications */}
      <button
        className="btn-icon"
        title="Notifications"
        style={{ position: "relative" }}
      >
        <Bell size={15} />
        {/* Notification dot */}
        <span
          style={{
            position: "absolute",
            top: 6,
            right: 6,
            width: 5,
            height: 5,
            borderRadius: "50%",
            background: "var(--p-danger)",
            border: "1.5px solid var(--p-surface-1)",
          }}
        />
      </button>

      {/* Settings — go to Settings page */}
      <button
        className="btn-icon"
        title="Settings"
        onClick={() => onNavigate?.("/settings")}
      >
        <Settings size={15} />
      </button>

      <div
        style={{
          width: 1,
          height: 18,
          background: "var(--p-hairline)",
          margin: "0 4px",
        }}
      />

      {/* AI Analyst toggle */}
      <button
        className="btn"
        onClick={onAiToggle}
        style={{
          background: aiPanelOpen
            ? "rgba(94,106,210,0.15)"
            : "var(--p-surface-2)",
          color: aiPanelOpen ? "var(--p-primary-hover)" : "var(--p-ink-muted)",
          border: `1px solid ${
            aiPanelOpen
              ? "rgba(94,106,210,0.3)"
              : "var(--p-hairline-strong)"
          }`,
          gap: 6,
          padding: "6px 12px",
          fontSize: 13,
          fontWeight: 500,
          minHeight: 32,
        }}
      >
        <Sparkles size={13} />
        AI Analyst
      </button>
    </div>
  </header>
);

/* --------------------------------------------------------------------------
   AI Analyst Chat Panel
   -------------------------------------------------------------------------- */

interface ChatMessage {
  id: string;
  role: "user" | "ai";
  content: string;
  timestamp: Date;
}

function getInitialMessages(): ChatMessage[] {
  const name = getUserName() || "there";
  return [
    {
      id: "1",
      role: "ai",
      content:
        `Hello ${name}. I'm your AI Analyst. I can help you analyze revenue trends, identify growth opportunities, and answer questions about your data. What would you like to explore?`,
      timestamp: new Date(),
    },
  ];
}

const AiAnalystPanel: React.FC<{ open: boolean; onClose: () => void }> = ({
  open,
  onClose,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>(getInitialMessages());
  const [input, setInput] = useState("");

  const handleSend = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: "user",
      content: trimmed,
      timestamp: new Date(),
    };

    const aiMsg: ChatMessage = {
      id: (Date.now() + 1).toString(),
      role: "ai",
      content:
        "Analyzing your query against current pipeline data and revenue signals…",
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg, aiMsg]);
    setInput("");
  }, [input]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const SUGGESTED = [
    "What's driving churn this quarter?",
    "Top 5 expansion candidates",
    "Forecast accuracy breakdown",
  ];

  return (
    <aside className={`ai-panel${open ? "" : " closed"}`}>
      {/* Header */}
      <div className="ai-panel-header">
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {/* AI icon with glow */}
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              background: "linear-gradient(135deg, rgba(94,106,210,0.2), rgba(130,143,255,0.1))",
              border: "1px solid rgba(94,106,210,0.25)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Bot size={14} color="var(--p-primary-hover)" />
          </div>
          <div>
            <div
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: "var(--p-ink)",
                letterSpacing: "-0.2px",
              }}
            >
              AI Analyst
            </div>
            <div style={{ fontSize: 11, color: "var(--p-ink-tertiary)" }}>
              Powered by Predicto
            </div>
          </div>
        </div>
        <button className="btn-icon" onClick={onClose} title="Close AI panel">
          <X size={14} />
        </button>
      </div>

      {/* Suggested prompts */}
      <div
        style={{
          padding: "8px 12px",
          borderBottom: "1px solid var(--p-hairline)",
          display: "flex",
          flexWrap: "wrap",
          gap: 5,
        }}
      >
        {SUGGESTED.map((s) => (
          <button
            key={s}
            onClick={() => setInput(s)}
            style={{
              background: "var(--p-surface-2)",
              border: "1px solid var(--p-hairline)",
              borderRadius: "9999px",
              color: "var(--p-ink-subtle)",
              fontSize: 11,
              padding: "3px 9px",
              cursor: "pointer",
              transition: "all 120ms",
              lineHeight: 1.4,
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.borderColor =
                "var(--p-primary)";
              (e.currentTarget as HTMLButtonElement).style.color =
                "var(--p-primary-hover)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.borderColor =
                "var(--p-hairline)";
              (e.currentTarget as HTMLButtonElement).style.color =
                "var(--p-ink-subtle)";
            }}
          >
            {s}
          </button>
        ))}
      </div>

      {/* Messages */}
      <div
        className="ai-panel-body"
        style={{ padding: "12px", gap: "10px" }}
      >
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={msg.role === "user" ? "msg-user" : "msg-ai"}
          >
            {msg.role === "ai" && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                  marginBottom: 5,
                  color: "var(--p-primary-hover)",
                  fontSize: 11,
                  fontWeight: 500,
                }}
              >
                <Sparkles size={10} />
                Predicto AI
              </div>
            )}
            <p style={{ margin: 0, lineHeight: 1.5, fontSize: 13 }}>
              {msg.content}
            </p>
            <div
              style={{
                marginTop: 5,
                fontSize: 10,
                color: "var(--p-ink-tertiary)",
                textAlign: msg.role === "user" ? "right" : "left",
              }}
            >
              {msg.timestamp.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </div>
          </div>
        ))}
      </div>

      {/* (Insight cards removed for cleaner UI) */}

      {/* Input footer */}
      <div className="ai-panel-footer">
        <div
          className="ai-glow"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            background: "var(--p-surface-2)",
            border: "1px solid var(--p-hairline-strong)",
            borderRadius: 10,
            padding: "7px 10px",
          }}
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your revenue…"
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              outline: "none",
              color: "var(--p-ink)",
              fontSize: 13,
              fontFamily: "var(--font-body)",
              minWidth: 0,
            }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim()}
            style={{
              background: input.trim()
                ? "var(--p-primary)"
                : "var(--p-surface-3)",
              border: "none",
              borderRadius: 6,
              width: 26,
              height: 26,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: input.trim() ? "pointer" : "default",
              transition: "background 120ms",
              flexShrink: 0,
            }}
          >
            <Send size={12} color="#fff" />
          </button>
        </div>
        <p
          style={{
            margin: "5px 0 0",
            fontSize: 10,
            color: "var(--p-ink-tertiary)",
            textAlign: "center",
          }}
        >
          AI responses are for informational purposes only.
        </p>
      </div>
    </aside>
  );
};

/* --------------------------------------------------------------------------
   AppShell — Public Component
   -------------------------------------------------------------------------- */

interface AppShellProps {
  children: React.ReactNode;
  /** Currently active route path — used to highlight sidebar item */
  activePath?: string;
  /** Page title shown in topbar */
  pageTitle?: string;
  /** Callback when user clicks a nav item — integrate with your router */
  onNavigate?: (path: string) => void;
}

export const AppShell: React.FC<AppShellProps> = ({
  children,
  activePath = "/intelligence-hub",
  pageTitle = "Intelligence Hub",
  onNavigate,
}) => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [aiPanelOpen, setAiPanelOpen] = useState(true);

  const toggleSidebar  = useCallback(() => setSidebarCollapsed((v) => !v), []);
  const toggleAiPanel  = useCallback(() => setAiPanelOpen((v) => !v), []);
  const openAiPanel    = useCallback(() => setAiPanelOpen(true), []);

  const handleNavigate = useCallback(
    (path: string) => {
      onNavigate?.(path);
    },
    [onNavigate]
  );

  return (
    <ShellContext.Provider
      value={{
        sidebarCollapsed,
        aiPanelOpen,
        toggleSidebar,
        toggleAiPanel,
        openAiPanel,
      }}
    >
      <div className="app-shell">
        {/* ── Left: Collapsible Sidebar ──────────────────────────────── */}
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggle={toggleSidebar}
          activePath={activePath}
          onNavigate={handleNavigate}
        />

        {/* ── Centre: Topbar + scrollable content ───────────────────── */}
        <div className="main-area">
          <Topbar
            pageTitle={pageTitle}
            onAiToggle={toggleAiPanel}
            aiPanelOpen={aiPanelOpen}
            onNavigate={handleNavigate}
          />
          <main className="content-scroll animate-fade-in">
            {children}
          </main>
        </div>

        {/* ── Right: AI Analyst Panel ────────────────────────────────── */}
        <AiAnalystPanel open={aiPanelOpen} onClose={toggleAiPanel} />
      </div>
    </ShellContext.Provider>
  );
};

export default AppShell;

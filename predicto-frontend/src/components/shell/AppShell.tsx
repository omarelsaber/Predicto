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

import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useUserName, getUserName } from "@/store/useUserStore";
import LanguageSwitcher from "@/components/shell/LanguageSwitcher";
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
  labelKey: string;
  path: string;
  badge?: number;
}

interface NavGroup {
  groupLabelKey?: string;
  items: NavItem[];
}

/* --------------------------------------------------------------------------
   Nav Config
   -------------------------------------------------------------------------- */

const NAV_GROUPS: NavGroup[] = [
  {
    items: [
      { icon: LayoutDashboard, labelKey: "nav.intelligenceHub", path: "/intelligence-hub" },
      { icon: TrendingUp,      labelKey: "nav.pipeline",        path: "/pipeline" },
    ],
  },
  {
    groupLabelKey: "navGroup.riskGrowth",
    items: [
      { icon: ShieldAlert,  labelKey: "nav.riskRetention",   path: "/risk-retention", badge: 3 },
      { icon: FlaskConical, labelKey: "nav.intelligenceLab",  path: "/intelligence-lab" },
    ],
  },
  {
    groupLabelKey: "navGroup.dataReports",
    items: [
      { icon: Database,      labelKey: "nav.dataWorkspace", path: "/data-workspace" },
      { icon: FileBarChart,  labelKey: "nav.reports",       path: "/reports" },
    ],
  },
];

/* --------------------------------------------------------------------------
   Sub-components
   -------------------------------------------------------------------------- */

/** Sidebar brand logo mark */
const BrandMark: React.FC<{ collapsed: boolean }> = ({ collapsed }) => (
  <div
    className="sidebar-logo"
    style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      width: "100%",
      padding: collapsed ? "0 4px" : "0 16px",
      boxSizing: "border-box",
      transition: "padding 200ms",
    }}
  >
    {/* Predicto logo image */}
    <img
      src="/predicto-logo.png"
      alt="Predicto"
      style={{
        height: collapsed ? 32 : 48,
        maxWidth: "100%",
        objectFit: "contain",
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
  const { t } = useTranslation();
  const Icon = item.icon;
  const label = t(item.labelKey);
  return (
    <button
      className={`sidebar-nav-item${active ? " active" : ""}`}
      onClick={onClick}
      title={collapsed ? label : undefined}
      style={{ width: "100%", border: "none", background: "none" }}
    >
      <Icon size={16} className="nav-icon" style={{ flexShrink: 0 }} />
      {!collapsed && (
        <span style={{ flex: 1, textAlign: "start" }}>{label}</span>
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
}> = ({ collapsed, onToggle, activePath, onNavigate }) => {
  const { t } = useTranslation();
  const userName = useUserName();
  return (
  <aside className={`sidebar${collapsed ? " collapsed" : ""}`}>
    <BrandMark collapsed={collapsed} />

    <nav className="sidebar-nav" style={{ paddingTop: 8 }}>
      {NAV_GROUPS.map((group, gi) => (
        <div key={gi} style={{ marginBottom: 4 }}>
          {!collapsed && group.groupLabelKey && (
            <div className="sidebar-nav-group-label">{t(group.groupLabelKey)}</div>
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
              {userName}
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
              {t("sidebar.workspace")}
            </div>
          </div>
        )}
      </div>

      {/* Collapse toggle — icon only */}
      <button
        className="sidebar-nav-item"
        onClick={onToggle}
        title={collapsed ? t("sidebar.expandSidebar") : t("sidebar.collapseSidebar")}
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
};


/** Topbar */
const Topbar: React.FC<{
  pageTitle: string;
  onAiToggle: () => void;
  aiPanelOpen: boolean;
  onNavigate?: (path: string) => void;
}> = ({ pageTitle, onAiToggle, aiPanelOpen, onNavigate }) => {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.dir() === "rtl";

  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationsList, setNotificationsList] = useState([
    {
      id: "churn",
      key: "notifications.churnAlert",
      time: "5m ago",
      timeAr: "منذ 5 د",
      type: "critical",
      read: false,
    },
    {
      id: "upload",
      key: "notifications.uploadSuccess",
      time: "2h ago",
      timeAr: "منذ ساعتين",
      type: "success",
      read: false,
    },
    {
      id: "playbook",
      key: "notifications.playbookAlert",
      time: "1d ago",
      timeAr: "منذ يوم",
      type: "info",
      read: false,
    },
  ]);

  const unreadCount = notificationsList.filter(n => !n.read).length;
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setNotificationsOpen(false);
      }
    }
    if (notificationsOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [notificationsOpen]);

  const handleMarkAsRead = (id: string) => {
    setNotificationsList(prev =>
      prev.map(n => (n.id === id ? { ...n, read: true } : n))
    );
  };

  const handleClearAll = () => {
    setNotificationsList([]);
  };

  return (
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
        {t(pageTitle, pageTitle)}
      </h1>
    </div>

    {/* Right actions */}
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>

      {/* Upload — go to Data Workspace */}
      <button
        className="btn-icon"
        title={t("topbar.uploadData")}
        onClick={() => onNavigate?.("/data-workspace")}
      >
        <Upload size={15} />
      </button>

      {/* Notifications */}
      <div style={{ position: "relative" }} ref={dropdownRef}>
        <button
          className="btn-icon"
          title={t("topbar.notifications")}
          onClick={() => setNotificationsOpen(!notificationsOpen)}
          style={{
            position: "relative",
            background: notificationsOpen ? "rgba(255,255,255,0.06)" : undefined,
          }}
        >
          <Bell size={15} />
          {/* Notification dot */}
          {unreadCount > 0 && (
            <span
              style={{
                position: "absolute",
                top: 6,
                insetInlineEnd: 6,
                width: 5,
                height: 5,
                borderRadius: "50%",
                background: "var(--p-danger)",
                border: "1.5px solid var(--p-surface-1)",
              }}
            />
          )}
        </button>

        {/* Dropdown panel */}
        {notificationsOpen && (
          <div
            className="surface-1"
            style={{
              position: "absolute",
              top: 36,
              insetInlineEnd: 0,
              width: 320,
              borderRadius: 12,
              border: "1px solid var(--p-hairline)",
              boxShadow: "0 10px 30px rgba(0,0,0,0.5), inset 0 1px 0 0 rgba(255,255,255,0.04)",
              zIndex: 100,
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
            }}
          >
            {/* Header */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "10px 14px",
                borderBottom: "1px solid var(--p-hairline)",
                background: "rgba(255,255,255,0.01)",
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--p-ink)" }}>
                {t("notifications.title", "Notifications")}
              </span>
              {notificationsList.length > 0 && (
                <button
                  onClick={handleClearAll}
                  style={{
                    background: "none",
                    border: "none",
                    fontSize: 11,
                    color: "var(--p-ink-tertiary)",
                    cursor: "pointer",
                    padding: "2px 6px",
                    borderRadius: 4,
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = "var(--p-danger)")}
                  onMouseLeave={(e) => (e.currentTarget.style.color = "var(--p-ink-tertiary)")}
                >
                  {t("notifications.clearAll", "Clear all")}
                </button>
              )}
            </div>

            {/* List */}
            <div style={{ maxHeight: 280, overflowY: "auto" }}>
              {notificationsList.length === 0 ? (
                <div style={{ padding: "30px 16px", textAlign: "center", color: "var(--p-ink-tertiary)", fontSize: 12 }}>
                  {t("notifications.empty", "No new notifications")}
                </div>
              ) : (
                notificationsList.map((n) => {
                  const itemColor = n.type === "critical"
                    ? "var(--p-danger)"
                    : n.type === "success"
                    ? "#4ade80"
                    : "var(--p-primary-hover)";
                  return (
                    <div
                      key={n.id}
                      onClick={() => handleMarkAsRead(n.id)}
                      style={{
                        padding: "12px 14px",
                        borderBottom: "1px solid var(--p-hairline)",
                        cursor: "pointer",
                        background: n.read ? "transparent" : "rgba(94,106,210,0.03)",
                        display: "flex",
                        gap: 10,
                        transition: "background 150ms",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.02)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = n.read ? "transparent" : "rgba(94,106,210,0.03)")}
                    >
                      {/* Left color bar/dot indicator */}
                      <span
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: "50%",
                          background: itemColor,
                          marginTop: 6,
                          flexShrink: 0,
                        }}
                      />
                      <div style={{ flex: 1, minWidth: 0, textAlign: isRtl ? "right" : "left" }}>
                        <p
                          style={{
                            margin: 0,
                            fontSize: 12,
                            lineHeight: 1.4,
                            color: n.read ? "var(--p-ink-subtle)" : "var(--p-ink)",
                            fontWeight: n.read ? 400 : 500,
                          }}
                        >
                          {t(n.key)}
                        </p>
                        <span style={{ fontSize: 10, color: "var(--p-ink-tertiary)", marginTop: 4, display: "inline-block" }}>
                          {isRtl ? n.timeAr : n.time}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>

      {/* Settings — go to Settings page */}
      <button
        className="btn-icon"
        title={t("topbar.settings")}
        onClick={() => onNavigate?.("/settings")}
      >
        <Settings size={15} />
      </button>

      {/* Language Switcher */}
      <LanguageSwitcher />

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
        {t("topbar.aiAnalyst")}
      </button>
    </div>
  </header>
  );
};

/* --------------------------------------------------------------------------
   AI Analyst Chat Panel
   -------------------------------------------------------------------------- */

interface ChatMessage {
  id: string;
  role: "user" | "ai";
  content: string;
  timestamp: Date;
}

const AI_API_URL = import.meta.env.VITE_API_URL || "http://localhost:8001";

const AiAnalystPanel: React.FC<{ open: boolean; onClose: () => void }> = ({
  open,
  onClose,
}) => {
  const { t } = useTranslation();
  const userName = useUserName();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSend = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: "user",
      content: trimmed,
      timestamp: new Date(),
    };

    const aiPlaceholderId = (Date.now() + 1).toString();
    const aiMsg: ChatMessage = {
      id: aiPlaceholderId,
      role: "ai",
      content: t("aiPanel.analyzingQuery", "Analyzing your query against current pipeline data and revenue signals…"),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg, aiMsg]);
    setInput("");
    setIsLoading(true);

    // Build history for backend (map "ai" -> "assistant")
    const backendHistory = messages.map((m) => ({
      role: m.role === "ai" ? "assistant" as const : "user" as const,
      content: m.content,
    }));

    fetch(`${AI_API_URL}/analyst/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: trimmed,
        history: backendHistory,
        max_tokens: 600,
      }),
    })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: { reply: string }) => {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === aiPlaceholderId
              ? { ...m, content: data.reply, timestamp: new Date() }
              : m
          )
        );
      })
      .catch(() => {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === aiPlaceholderId
              ? {
                  ...m,
                  content: t(
                    "aiPanel.error",
                    "Sorry, I couldn't process your request. Please try again."
                  ),
                  timestamp: new Date(),
                }
              : m
          )
        );
      })
      .finally(() => setIsLoading(false));
  }, [input, isLoading, messages, t]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  /** Send a specific text directly (used by suggested prompt chips) */
  const handleSendDirect = useCallback(
    (text: string) => {
      if (isLoading) return;
      setInput(text);
      // Use setTimeout to let React flush the setInput, then trigger send
      setTimeout(() => {
        const userMsg: ChatMessage = {
          id: Date.now().toString(),
          role: "user",
          content: text,
          timestamp: new Date(),
        };
        const aiPlaceholderId = (Date.now() + 1).toString();
        const aiMsg: ChatMessage = {
          id: aiPlaceholderId,
          role: "ai",
          content: t("aiPanel.analyzingQuery", "Analyzing your query against current pipeline data and revenue signals…"),
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, userMsg, aiMsg]);
        setInput("");
        setIsLoading(true);

        const backendHistory = messages.map((m) => ({
          role: m.role === "ai" ? "assistant" as const : "user" as const,
          content: m.content,
        }));

        fetch(`${AI_API_URL}/analyst/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: text, history: backendHistory, max_tokens: 600 }),
        })
          .then((res) => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res.json();
          })
          .then((data: { reply: string }) => {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === aiPlaceholderId
                  ? { ...m, content: data.reply, timestamp: new Date() }
                  : m
              )
            );
          })
          .catch(() => {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === aiPlaceholderId
                  ? {
                      ...m,
                      content: t("aiPanel.error", "Sorry, I couldn't process your request. Please try again."),
                      timestamp: new Date(),
                    }
                  : m
              )
            );
          })
          .finally(() => setIsLoading(false));
      }, 0);
    },
    [isLoading, messages, t]
  );

  const SUGGESTED = [
    t("aiPanel.suggestChurn", "What's driving churn this quarter?"),
    t("aiPanel.suggestExpansion", "Top 5 expansion candidates"),
    t("aiPanel.suggestForecast", "Forecast accuracy breakdown"),
  ];

  const initialMsg: ChatMessage = {
    id: "initial",
    role: "ai",
    content: t("aiPanel.greeting", { name: userName }),
    timestamp: new Date(),
  };

  const allMessages = [initialMsg, ...messages];

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
              {t("aiPanel.title", "AI Analyst")}
            </div>
            <div style={{ fontSize: 11, color: "var(--p-ink-tertiary)" }}>
              {t("aiPanel.subtitle", "Powered by Predicto")}
            </div>
          </div>
        </div>
        <button className="btn-icon" onClick={onClose} title={t("common.close", "Close")}>
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
            onClick={() => handleSendDirect(s)}
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
        {allMessages.map((msg) => (
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
            placeholder={t("aiPanel.placeholder", "Ask about your revenue…")}
            disabled={isLoading}
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              outline: "none",
              color: "var(--p-ink)",
              fontSize: 13,
              fontFamily: "var(--font-body)",
              minWidth: 0,
              opacity: isLoading ? 0.6 : 1,
            }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            style={{
              background: input.trim() && !isLoading
                ? "var(--p-primary)"
                : "var(--p-surface-3)",
              border: "none",
              borderRadius: 6,
              width: 26,
              height: 26,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: input.trim() && !isLoading ? "pointer" : "default",
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
          {t("aiPanel.disclaimer", "AI responses are for informational purposes only.")}
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
  pageTitle = "nav.intelligenceHub",
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

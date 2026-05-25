import { Menu, Upload, MessageSquare, Bell, Settings } from 'lucide-react';

interface AppTopBarProps {
  sidebarOpen: boolean;
  onSidebarToggle: () => void;
  onRightPanelToggle: () => void;
  rightPanelOpen: boolean;
}

export default function AppTopBar({
  sidebarOpen,
  onSidebarToggle,
  onRightPanelToggle,
  rightPanelOpen,
}: AppTopBarProps) {
  return (
    <header className="glass-topbar h-16 flex items-center justify-between px-6 flex-shrink-0">

      {/* ── Left: Hamburger + Breadcrumb ── */}
      <div className="flex items-center gap-3">
        {!sidebarOpen && (
          <button
            onClick={onSidebarToggle}
            id="topbar-sidebar-toggle"
            className="p-2 glass-light rounded-lg hover:border-white/10 transition-all duration-200"
            aria-label="Open sidebar"
          >
            <Menu className="w-5 h-5 text-slate-400" />
          </button>
        )}
        <div className="flex flex-col leading-tight">
          <h1 className="text-sm font-semibold text-slate-100 tracking-tight">
            Predicto
          </h1>
          <span className="text-[10px] text-indigo-400 font-medium tracking-widest uppercase">
            Revenue Intelligence
          </span>
        </div>
      </div>

      {/* ── Center: System Health Badge ── */}
      <div
        id="topbar-health-badge"
        className="flex items-center gap-2 px-4 py-1.5 rounded-full glass border border-emerald-500/20"
      >
        <span className="w-2 h-2 bg-emerald-400 rounded-full animate-neon-pulse shadow-neon-emerald" />
        <span className="text-xs font-semibold text-emerald-300 tracking-widest uppercase">
          Healthy
        </span>
        <span className="text-xs text-emerald-500 font-medium">96/100</span>
      </div>

      {/* ── Right: Action Buttons ── */}
      <div className="flex items-center gap-1.5">

        {/* Ingest Data CTA */}
        <button
          id="topbar-ingest-btn"
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white
                     bg-gradient-to-r from-indigo-600 to-violet-600
                     hover:from-indigo-500 hover:to-violet-500
                     shadow-neon-indigo hover:shadow-neon-violet
                     transition-all duration-200 active:scale-95"
        >
          <Upload className="w-4 h-4" />
          Ingest Data
        </button>

        {/* AI Analyst Toggle */}
        <button
          id="topbar-ai-analyst-toggle"
          onClick={onRightPanelToggle}
          className={`p-2 rounded-xl transition-all duration-200 border ${
            rightPanelOpen
              ? 'nav-active text-indigo-300 shadow-neon-indigo'
              : 'border-transparent text-slate-400 hover:text-slate-100 glass-light hover:border-white/10'
          }`}
          title="Toggle AI Analyst panel"
        >
          <MessageSquare
            className={`w-5 h-5 ${
              rightPanelOpen
                ? 'drop-shadow-[0_0_6px_rgba(99,102,241,0.9)]'
                : ''
            }`}
          />
        </button>

        {/* Notifications */}
        <button
          id="topbar-notifications"
          className="relative p-2 glass-light border border-transparent hover:border-white/10 text-slate-400 hover:text-slate-100 rounded-xl transition-all duration-200"
          aria-label="Notifications"
        >
          <Bell className="w-5 h-5" />
          {/* Red dot indicator */}
          <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-red-400 rounded-full shadow-[0_0_6px_rgba(248,113,113,0.8)]" />
        </button>

        {/* Settings */}
        <button
          id="topbar-settings"
          className="p-2 glass-light border border-transparent hover:border-white/10 text-slate-400 hover:text-slate-100 rounded-xl transition-all duration-200"
          aria-label="Settings"
        >
          <Settings className="w-5 h-5" />
        </button>
      </div>
    </header>
  );
}

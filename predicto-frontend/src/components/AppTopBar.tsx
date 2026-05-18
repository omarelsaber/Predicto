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
    <header className="h-16 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-6 flex-shrink-0">
      {/* Left side - Hamburger + Title */}
      <div className="flex items-center gap-4">
        {!sidebarOpen && (
          <button
            onClick={onSidebarToggle}
            className="p-2 hover:bg-slate-800 rounded transition-colors"
            aria-label="Open sidebar"
          >
            <Menu className="w-5 h-5 text-slate-400" />
          </button>
        )}
        <h1 className="text-sm font-semibold text-slate-200">Predicto V3</h1>
      </div>

      {/* Center - Health Badge */}
      <div className="flex items-center gap-2 bg-emerald-500/10 px-3 py-1.5 rounded-full border border-emerald-500/20">
        <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
        <span className="text-sm font-medium text-emerald-400">HEALTHY</span>
        <span className="text-xs text-emerald-300">96/100</span>
      </div>

      {/* Right side - Actions */}
      <div className="flex items-center gap-2">
        {/* Ingest Data CTA */}
        <button className="flex items-center gap-2 px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg transition-colors font-medium text-sm">
          <Upload className="w-4 h-4" />
          Ingest Data
        </button>

        {/* AI Analyst Toggle */}
        <button
          onClick={onRightPanelToggle}
          className={`p-2 rounded transition-all duration-200 ${
            rightPanelOpen
              ? 'bg-indigo-500/20 text-indigo-400'
              : 'hover:bg-slate-800 text-slate-400 hover:text-slate-200'
          }`}
          title="Toggle AI Analyst panel"
        >
          <MessageSquare className="w-5 h-5" />
        </button>

        {/* Notifications */}
        <button className="p-2 hover:bg-slate-800 text-slate-400 hover:text-slate-200 rounded transition-colors relative">
          <Bell className="w-5 h-5" />
          <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
        </button>

        {/* Settings */}
        <button className="p-2 hover:bg-slate-800 text-slate-400 hover:text-slate-200 rounded transition-colors">
          <Settings className="w-5 h-5" />
        </button>
      </div>
    </header>
  );
}

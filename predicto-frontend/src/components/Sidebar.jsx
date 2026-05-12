import { LayoutDashboard, Users, ShieldCheck, Database, Upload, Sparkles, MessageSquare, BarChart3 } from 'lucide-react';

export default function Sidebar({ activeTab, setActiveTab }) {
  const tabs = [
    { id: 'upload', label: 'Upload Data', icon: Upload },
    { id: 'overview', label: 'Command Center', icon: LayoutDashboard },
    { id: 'personas', label: 'Persona Gallery', icon: Users },
    { id: 'deal-intelligence', label: 'Deal Scorer', icon: ShieldCheck },
    { id: 'data-explorer', label: 'Data Explorer', icon: Database },
    { id: 'onboarding', label: 'Cinematic Tour', icon: Sparkles },
    { id: 'copilot', label: 'AI Copilot', icon: MessageSquare },
    { id: 'analytics', label: 'Analytics Hub', icon: BarChart3 }
  ];

  return (
    <div className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col min-h-screen shrink-0 relative z-20 shadow-[10px_0_30px_rgba(0,0,0,0.3)]">
      <div className="p-6 border-b border-slate-800 bg-slate-900">
        <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-3">
          <div className="w-9 h-9 bg-indigo-500/20 rounded-xl flex items-center justify-center border border-indigo-500/30 shadow-[0_0_15px_rgba(99,102,241,0.2)]">
             <ShieldCheck className="text-indigo-400 w-5 h-5" />
          </div>
          <div>
            Predicto<span className="text-indigo-400 font-normal">Hub</span>
          </div>
        </h1>
      </div>
      <nav className="flex-1 p-4 space-y-2 mt-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl transition-all duration-200 font-medium ${
              activeTab === tab.id
                ? 'bg-indigo-500/15 text-indigo-400 shadow-[0_0_15px_rgba(99,102,241,0.2)] border border-indigo-500/30'
                : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200 border border-transparent'
            }`}
          >
            <tab.icon size={20} className={activeTab === tab.id ? 'text-indigo-400' : 'text-slate-500'} />
            {tab.label}
          </button>
        ))}
      </nav>
      <div className="p-6 border-t border-slate-800 text-xs text-slate-500 flex flex-col items-center gap-2 bg-slate-800/20">
        <span className="font-semibold text-slate-400">Predicto Enterprise v1.0</span>
        <span className="flex items-center gap-1.5 font-medium text-emerald-500/80">
          <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
          Systems Operational
        </span>
      </div>
    </div>
  );
}

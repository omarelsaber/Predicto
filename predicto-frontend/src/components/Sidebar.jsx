import { LayoutDashboard, Users, ShieldCheck, Database, Upload } from 'lucide-react';

export default function Sidebar({ activeTab, setActiveTab }) {
  const tabs = [
    { id: 'upload', label: 'Upload Data', icon: Upload },
    { id: 'overview', label: 'Command Center', icon: LayoutDashboard },
    { id: 'personas', label: 'Persona Gallery', icon: Users },
    { id: 'deal-intelligence', label: 'Deal Scorer', icon: ShieldCheck },
    { id: 'data-explorer', label: 'Data Explorer', icon: Database }
  ];

  return (
    <div className="w-64 bg-[#0f172a] border-r border-gray-800 flex flex-col min-h-screen shrink-0 relative z-20 shadow-[10px_0_30px_rgba(0,0,0,0.3)]">
      <div className="p-6 border-b border-gray-800 bg-[#0f172a]">
        <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-3">
          <div className="w-9 h-9 bg-brand-primary/20 rounded-xl flex items-center justify-center border border-brand-primary/30 shadow-[0_0_15px_rgba(59,130,246,0.2)]">
             <ShieldCheck className="text-brand-primary w-5 h-5" />
          </div>
          <div>
            Predicto<span className="text-brand-primary font-normal">Hub</span>
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
                ? 'bg-brand-primary/10 text-brand-primary shadow-[0_0_15px_rgba(59,130,246,0.15)] border border-brand-primary/20'
                : 'text-gray-400 hover:bg-gray-800/60 hover:text-gray-200 border border-transparent'
            }`}
          >
            <tab.icon size={20} className={activeTab === tab.id ? 'text-brand-primary' : 'text-gray-500'} />
            {tab.label}
          </button>
        ))}
      </nav>
      <div className="p-6 border-t border-gray-800 text-xs text-gray-500 flex flex-col items-center gap-2 bg-[#1e293b]/30">
        <span className="font-semibold text-gray-400">Predicto Enterprise v1.0</span>
        <span className="flex items-center gap-1.5 font-medium text-emerald-500/80">
          <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
          Systems Operational
        </span>
      </div>
    </div>
  );
}

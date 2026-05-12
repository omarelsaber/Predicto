import { BarChart3, TrendingUp, Users, Database, Upload } from 'lucide-react';

export default function PredictoSidebar({ activeTab, setActiveTab }) {
  const navItems = [
    { id: 'revenue-overview', label: 'Revenue Overview', icon: BarChart3 },
    { id: 'deal-scorer', label: 'Deal Scorer', icon: TrendingUp },
    { id: 'personas', label: 'Persona Gallery', icon: Users },
    { id: 'data-explorer', label: 'Data Explorer', icon: Database },
    { id: 'upload', label: 'Upload Data', icon: Upload }
  ];

  return (
    <div className="w-56 bg-slate-900/80 backdrop-blur-xl border-r border-slate-800 flex flex-col h-screen fixed left-0 top-0 z-50">
      {/* Logo */}
      <div className="p-6 border-b border-slate-800/50">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 bg-indigo-500/20 rounded-lg flex items-center justify-center">
            <span className="text-indigo-400 font-black text-lg">⬡</span>
          </div>
          <div>
            <h1 className="text-lg font-black text-white">PredictoHub</h1>
            <p className="text-xs text-slate-400 font-medium">Revenue Intelligence</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${
                isActive
                  ? 'bg-indigo-500/15 text-indigo-400 border border-indigo-500/30'
                  : 'text-slate-400 hover:text-slate-300 border border-transparent'
              }`}
            >
              <Icon size={18} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Status Pill */}
      <div className="p-6 border-t border-slate-800/50">
        <div className="bg-slate-800/40 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
            <span className="text-xs text-slate-300 font-medium">Models Active · 9,994 rows</span>
          </div>
          <p className="text-xs text-slate-500 font-medium">Predicto Enterprise v1.0</p>
        </div>
      </div>
    </div>
  );
}

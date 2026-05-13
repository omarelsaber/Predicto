import { Link } from 'react-router-dom';
import { BarChart3, TrendingUp, Users, Database, Upload, Globe, User, LogOut, Settings, Bot, PieChart } from 'lucide-react';

export default function PredictoSidebar({ activeTab, setActiveTab, userName }) {
  const navItems = [
    { id: 'landing', label: 'Marketing Site', icon: Globe },
    { id: 'revenue-overview', label: 'Revenue Overview', icon: BarChart3 },
    { id: 'analytics-hub', label: 'Analytics Hub', icon: PieChart },
    { id: 'deal-scorer', label: 'Deal Scorer', icon: TrendingUp },
    { id: 'ai-copilot', label: 'AI Copilot', icon: Bot },
    { id: 'personas', label: 'Persona Gallery', icon: Users },
    { id: 'data-explorer', label: 'Data Explorer', icon: Database },
    { id: 'upload', label: 'Upload Data', icon: Upload }
  ];

  return (
    <div className="w-56 bg-slate-900/80 backdrop-blur-xl border-r border-slate-800 flex flex-col h-screen fixed left-0 top-0 z-50">
      {/* Logo */}
      <div className="p-6 border-b border-slate-800/50">
        <Link to="/" onClick={() => setActiveTab('landing')} className="block hover:opacity-80 transition-opacity">
          <img src="/predicto-logo.png" alt="Predicto" className="h-10 w-auto object-contain" />
        </Link>
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

      {/* User Profile */}
      <div className="p-4 border-t border-slate-800/50 mt-auto">
        <div className="flex items-center justify-between p-3 rounded-xl hover:bg-slate-800/50 transition-all duration-200 cursor-pointer group">
          <div className="flex items-center gap-3">
            <div className="bg-slate-800 p-1.5 rounded-full ring-1 ring-slate-700/50 group-hover:ring-indigo-500/30 transition-all">
              <User size={18} className="text-slate-400 group-hover:text-indigo-400" />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-white">{userName || 'Guest User'}</span>
              <span className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Enterprise Admin</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Settings size={16} className="text-slate-500 hover:text-indigo-400 transition-colors cursor-pointer" />
            <LogOut size={16} className="text-slate-500 hover:text-rose-400 transition-colors cursor-pointer" />
          </div>
        </div>
      </div>
    </div>
  );
}

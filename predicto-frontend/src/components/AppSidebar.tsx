import { NavLink } from 'react-router-dom';
import {
  BarChart3,
  Brain,
  TrendingUp,
  Users,
  Settings,
  HelpCircle,
  ChevronLeft,
  Zap,
  Target,
  Network,
} from 'lucide-react';

interface AppSidebarProps {
  open: boolean;
  onToggle: () => void;
}

const PRIMARY_ROUTES = [
  { path: '/dashboard', label: 'Dashboard', icon: BarChart3 },
  { path: '/simulator', label: 'Simulator', icon: Zap },
  { path: '/intelligence-hub', label: 'Intelligence Hub', icon: Brain },
  { path: '/war-room', label: 'War Room', icon: Target },
  { path: '/personas', label: 'Personas', icon: Users },
  { path: '/playbooks', label: 'Playbooks', icon: TrendingUp },
];

const SECONDARY_ROUTES = [
  { path: '/topology-optimizer', label: 'Topology Optimizer', icon: Network },
  { path: '/settings', label: 'Settings', icon: Settings },
];

function NavLinkItem({
  to,
  icon: Icon,
  label,
  open,
}: {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  open: boolean;
}) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 group ${
          isActive
            ? 'bg-indigo-500/20 text-indigo-400'
            : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
        }`
      }
      title={!open ? label : undefined}
    >
      <Icon className="w-5 h-5 flex-shrink-0" />
      {open && <span className="text-sm font-medium">{label}</span>}
    </NavLink>
  );
}

export default function AppSidebar({ open, onToggle }: AppSidebarProps) {
  return (
    <aside
      className={`bg-slate-900 border-r border-slate-800 flex flex-col transition-all duration-300 ease-in-out ${
        open ? 'w-60' : 'w-16'
      }`}
    >
      {/* Logo section */}
      <div
        className={`flex items-center justify-between h-16 border-b border-slate-800 px-4 ${
          open ? 'gap-3' : ''
        }`}
      >
        <div className={`flex items-center gap-2 ${!open ? 'hidden' : ''}`}>
          <div className="w-8 h-8 bg-indigo-500 rounded-lg flex items-center justify-center">
            <Zap className="w-5 h-5 text-white" />
          </div>
          <span className="font-bold text-white text-lg">Predicto</span>
        </div>
        {!open && (
          <div className="w-8 h-8 bg-indigo-500 rounded-lg flex items-center justify-center">
            <Zap className="w-5 h-5 text-white" />
          </div>
        )}
        <button
          onClick={onToggle}
          className="p-1 hover:bg-slate-800 rounded transition-colors"
          aria-label={open ? 'Collapse sidebar' : 'Expand sidebar'}
        >
          <ChevronLeft
            className={`w-5 h-5 text-slate-400 transition-transform ${
              !open ? 'rotate-180' : ''
            }`}
          />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4">
        {/* Primary routes */}
        <div className="space-y-1 px-2 mb-6">
          {PRIMARY_ROUTES.map((route) => (
            <NavLinkItem
              key={route.path}
              to={route.path}
              icon={route.icon}
              label={route.label}
              open={open}
            />
          ))}
        </div>

        {/* Divider */}
        {open && <div className="h-px bg-slate-800 mx-4 my-4" />}

        {/* Secondary routes */}
        <div className="space-y-1 px-2">
          {SECONDARY_ROUTES.map((route) => (
            <NavLinkItem
              key={route.path}
              to={route.path}
              icon={route.icon}
              label={route.label}
              open={open}
            />
          ))}
        </div>
      </nav>

      {/* Help button */}
      <div className="border-t border-slate-800 p-2 mb-4">
        <button
          className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-all duration-200"
          title={!open ? 'Help' : undefined}
        >
          <HelpCircle className="w-5 h-5 flex-shrink-0" />
          {open && <span className="text-sm font-medium">Help</span>}
        </button>
      </div>
    </aside>
  );
}

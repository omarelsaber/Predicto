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
  AlertTriangle,
  PieChart,
  Microscope,
  Database,
} from 'lucide-react';

interface AppSidebarProps {
  open: boolean;
  onToggle: () => void;
}

const PRIMARY_ROUTES = [
  { path: '/dashboard',        label: 'Dashboard',        icon: BarChart3 },
  { path: '/simulator',        label: 'Simulator',        icon: Zap },
  { path: '/intelligence-hub', label: 'Intelligence Hub', icon: Brain },
  { path: '/pipeline',         label: 'Pipeline',         icon: PieChart },
  { path: '/risk-retention',   label: 'Risk & Retention', icon: AlertTriangle },
  { path: '/intelligence-lab', label: 'Intelligence Lab', icon: Microscope },
  { path: '/data-workspace',   label: 'Data Workspace',   icon: Database },
  { path: '/war-room',         label: 'War Room',         icon: Target },
  { path: '/personas',         label: 'Personas',         icon: Users },
  { path: '/playbooks',        label: 'Playbooks',        icon: TrendingUp },
];

const SECONDARY_ROUTES = [
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
      title={!open ? label : undefined}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group border ${
          isActive
            ? 'nav-active text-indigo-300'
            : 'border-transparent text-slate-400 hover:text-slate-100 nav-hover'
        }`
      }
    >
      {({ isActive }) => (
        <>
          <Icon
            className={`w-5 h-5 flex-shrink-0 transition-all duration-200 ${
              isActive
                ? 'text-indigo-400 drop-shadow-[0_0_6px_rgba(99,102,241,0.8)]'
                : 'group-hover:text-slate-200'
            }`}
          />
          {open && (
            <span
              className={`text-sm font-medium truncate transition-all duration-200 ${
                isActive ? 'text-indigo-200' : ''
              }`}
            >
              {label}
            </span>
          )}
          {/* Active indicator bar */}
          {isActive && (
            <span className="ml-auto w-1 h-4 rounded-full bg-indigo-400 shadow-neon-indigo flex-shrink-0" />
          )}
        </>
      )}
    </NavLink>
  );
}

export default function AppSidebar({ open, onToggle }: AppSidebarProps) {
  return (
    <aside
      className={`glass shadow-glass-sidebar flex flex-col h-full transition-all duration-300 ease-in-out ${
        open ? 'w-60' : 'w-16'
      }`}
    >
      {/* ── Logo Section ── */}
      <div
        className={`flex items-center justify-between h-16 border-b border-white/[0.06] px-4 flex-shrink-0 ${
          open ? 'gap-3' : 'justify-center'
        }`}
      >
        {open ? (
          <>
            <div className="flex items-center gap-2.5">
              {/* Logo glow icon */}
              <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-xl flex items-center justify-center shadow-neon-indigo">
                <Zap className="w-4 h-4 text-white" />
              </div>
              <div className="flex flex-col leading-tight">
                <span className="font-bold text-white text-base tracking-tight font-display">
                  Predicto
                </span>
                <span className="text-[10px] text-indigo-400 font-medium tracking-widest uppercase">
                  V3
                </span>
              </div>
            </div>
            <button
              onClick={onToggle}
              className="p-1.5 glass-light rounded-lg hover:border-white/10 transition-all duration-200"
              aria-label="Collapse sidebar"
            >
              <ChevronLeft className="w-4 h-4 text-slate-400" />
            </button>
          </>
        ) : (
          <button
            onClick={onToggle}
            className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-xl flex items-center justify-center shadow-neon-indigo hover:scale-105 transition-transform"
            aria-label="Expand sidebar"
          >
            <Zap className="w-4 h-4 text-white" />
          </button>
        )}
      </div>

      {/* ── Navigation ── */}
      <nav className="flex-1 overflow-y-auto py-4 scrollbar-thin">
        {/* Primary routes */}
        <div className="space-y-0.5 px-2 mb-6">
          {open && (
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest px-3 mb-2">
              Navigation
            </p>
          )}
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
        <div className="h-px bg-white/[0.05] mx-3 mb-4" />

        {/* Secondary routes */}
        <div className="space-y-0.5 px-2">
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

      {/* ── Help Footer ── */}
      <div className="border-t border-white/[0.05] p-2 flex-shrink-0">
        <button
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-slate-500 hover:text-slate-200 nav-hover border border-transparent transition-all duration-200"
          title={!open ? 'Help' : undefined}
        >
          <HelpCircle className="w-5 h-5 flex-shrink-0" />
          {open && <span className="text-sm font-medium">Help & Support</span>}
        </button>
      </div>
    </aside>
  );
}

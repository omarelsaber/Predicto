import { useState } from 'react';
import { BrowserRouter, Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import AppShell from '@/components/shell/AppShell';
import IntelligenceHubView from '@/views/IntelligenceHub/IntelligenceHubView';
import PipelineView from '@/views/Pipeline/PipelineView';
import RiskRetentionView from '@/views/RiskRetention/RiskRetentionView';
import IntelligenceLabView from '@/views/IntelligenceLab/IntelligenceLabView';
import DataWorkspaceView from '@/views/DataWorkspace/DataWorkspaceView';
import ReportsView from '@/views/Reports/ReportsView';
import CausalEngineView from '@/views/IntelligenceLab/CausalEngine/CausalEngineView';
import TopologyOptimizerView from '@/views/IntelligenceLab/TopologyOptimizer/TopologyOptimizerView';
import WarRoomView from '@/views/IntelligenceLab/WarRoom/WarRoomView';
import OnboardingView from '@/views/Onboarding/OnboardingView';
import { getUserName, setUserName } from '@/store/useUserStore';

const Dashboard = () => (
  <div className="space-y-6">
    <h2 className="text-2xl font-bold text-slate-100">Dashboard</h2>
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      <div className="bg-slate-800 p-6 rounded-lg border border-slate-700">
        <p className="text-slate-300">Placeholder content for Dashboard</p>
      </div>
    </div>
  </div>
);

const Simulator = () => (
  <div className="space-y-6">
    <h2 className="text-2xl font-bold text-slate-100">Simulator</h2>
    <div className="bg-slate-800 p-6 rounded-lg border border-slate-700">
      <p className="text-slate-300">Interactive simulator will go here</p>
    </div>
  </div>
);

const Personas = () => (
  <div className="space-y-6">
    <h2 className="text-2xl font-bold text-slate-100">Personas</h2>
    <div className="bg-slate-800 p-6 rounded-lg border border-slate-700">
      <p className="text-slate-300">Customer personas and segments</p>
    </div>
  </div>
);

const Playbooks = () => (
  <div className="space-y-6">
    <h2 className="text-2xl font-bold text-slate-100">Playbooks</h2>
    <div className="bg-slate-800 p-6 rounded-lg border border-slate-700">
      <p className="text-slate-300">Sales and revenue playbooks</p>
    </div>
  </div>
);

const Settings = () => (
  <div className="space-y-6">
    <h2 className="text-2xl font-bold text-slate-100">Settings</h2>
    <div className="bg-slate-800 p-6 rounded-lg border border-slate-700">
      <p className="text-slate-300">Application settings and configuration</p>
    </div>
  </div>
);

const TITLE_MAP: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/simulator': 'Simulator',
  '/intelligence-hub': 'Intelligence Hub',
  '/pipeline': 'Pipeline',
  '/risk-retention': 'Risk & Retention',
  '/war-room': 'War Room',
  '/personas': 'Personas',
  '/playbooks': 'Playbooks',
  '/intelligence-lab': 'Intelligence Lab',
  '/intelligence-lab/causal-engine': 'Causal Engine',
  '/intelligence-lab/topology-optimizer': 'Topology Optimizer',
  '/data-workspace': 'Data Workspace',
  '/reports': 'Reports',
  '/settings': 'Settings',
};

function ShellWrapper() {
  const location = useLocation();
  const navigate = useNavigate();
  const title = TITLE_MAP[location.pathname] || 'Intelligence Hub';

  return (
    <AppShell
      activePath={location.pathname}
      pageTitle={title}
      onNavigate={navigate}
    >
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/simulator" element={<Simulator />} />
        <Route path="/intelligence-hub" element={<IntelligenceHubView />} />
        <Route path="/pipeline" element={<PipelineView />} />
        <Route path="/risk-retention" element={<RiskRetentionView />} />
        <Route path="/war-room" element={<WarRoomView />} />
        <Route path="/personas" element={<Personas />} />
        <Route path="/playbooks" element={<Playbooks />} />
        <Route path="/intelligence-lab" element={<IntelligenceLabView />} />
        <Route path="/intelligence-lab/causal-engine" element={<CausalEngineView />} />
        <Route path="/intelligence-lab/topology-optimizer" element={<TopologyOptimizerView />} />
        <Route path="/data-workspace" element={<DataWorkspaceView />} />
        <Route path="/reports" element={<ReportsView />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </AppShell>
  );
}

export default function Router() {
  const [hasUser, setHasUser] = useState(!!getUserName());

  const handleOnboardingComplete = (name: string) => {
    setUserName(name);
    setHasUser(true);
  };

  return (
    <BrowserRouter>
      {hasUser ? (
        <ShellWrapper />
      ) : (
        <OnboardingView onComplete={handleOnboardingComplete} />
      )}
    </BrowserRouter>
  );
}

import { BrowserRouter, Routes, Route } from 'react-router-dom';
import AppShell from './components/AppShell';
import IntelligenceHubView from './components/IntelligenceHubView';
import PipelineView from './views/Pipeline/PipelineView';
import RiskRetentionView from './views/RiskRetention/RiskRetentionView';
import IntelligenceLabView from './views/IntelligenceLab/IntelligenceLabView';

// Placeholder components for routes
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

const Pipeline = () => <PipelineView />;



const RiskRetention = () => <RiskRetentionView />;

const WarRoom = () => (
  <div className="space-y-6">
    <h2 className="text-2xl font-bold text-slate-100">War Room</h2>
    <div className="bg-slate-800 p-6 rounded-lg border border-slate-700">
      <p className="text-slate-300">War Room collaboration interface</p>
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

const IntelligenceLab = () => <IntelligenceLabView />;

const Settings = () => (
  <div className="space-y-6">
    <h2 className="text-2xl font-bold text-slate-100">Settings</h2>
    <div className="bg-slate-800 p-6 rounded-lg border border-slate-700">
      <p className="text-slate-300">Application settings and configuration</p>
    </div>
  </div>
);

export default function Router() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/simulator" element={<Simulator />} />
          <Route path="/intelligence-hub" element={<IntelligenceHubView />} />
          <Route path="/pipeline" element={<Pipeline />} />
          <Route path="/risk-retention" element={<RiskRetention />} />
          <Route path="/war-room" element={<WarRoom />} />
          <Route path="/personas" element={<Personas />} />
          <Route path="/playbooks" element={<Playbooks />} />
          <Route path="/intelligence-lab" element={<IntelligenceLab />} />
          <Route path="/settings" element={<Settings />} />
          <Route index element={<Dashboard />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

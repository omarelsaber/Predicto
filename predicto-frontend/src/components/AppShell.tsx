import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import AppSidebar from './AppSidebar';
import AppTopBar from './AppTopBar';
import AppRightPanel from './AppRightPanel';

export default function AppShell() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [rightPanelOpen, setRightPanelOpen] = useState(false);

  return (
    <div className="flex h-screen bg-slate-950">
      {/* Sidebar */}
      <AppSidebar open={sidebarOpen} onToggle={() => setSidebarOpen(!sidebarOpen)} />

      {/* Main content area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <AppTopBar
          sidebarOpen={sidebarOpen}
          onSidebarToggle={() => setSidebarOpen(!sidebarOpen)}
          onRightPanelToggle={() => setRightPanelOpen(!rightPanelOpen)}
          rightPanelOpen={rightPanelOpen}
        />

        {/* Main workspace */}
        <main className="flex-1 overflow-auto bg-slate-900">
          <div className="p-6">
            <Outlet />
          </div>
        </main>
      </div>

      {/* Right panel - AI Analyst */}
      <AppRightPanel open={rightPanelOpen} onClose={() => setRightPanelOpen(false)} />
    </div>
  );
}

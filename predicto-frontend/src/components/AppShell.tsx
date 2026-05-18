import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import AppSidebar from './AppSidebar';
import AppTopBar from './AppTopBar';
import AppRightPanel from './AppRightPanel';

export default function AppShell() {
  const [sidebarOpen, setSidebarOpen]     = useState(true);
  const [rightPanelOpen, setRightPanelOpen] = useState(false);

  return (
    /**
     * Z-Index layering (video removed — static gradient background):
     *  base  — root div carries the deep gradient background
     *  z-20  — sidebar + main column (glass, relative flow)
     *  z-40  — right panel (fixed, slide-in)
     *  z-50  — mobile overlay backdrop
     */
    <div
      className="relative flex h-screen w-screen overflow-hidden"
      style={{
        background: `
          radial-gradient(ellipse 80% 60% at 50% -10%,
            rgba(99,102,241,0.18) 0%,
            transparent 60%
          ),
          radial-gradient(ellipse 60% 40% at 80% 90%,
            rgba(139,92,246,0.10) 0%,
            transparent 55%
          ),
          linear-gradient(165deg, #0b0d1a 0%, #060810 45%, #020409 100%)
        `,
      }}
    >
      {/* ── Sidebar ── */}
      <div className="relative z-20 flex-shrink-0">
        <AppSidebar
          open={sidebarOpen}
          onToggle={() => setSidebarOpen(!sidebarOpen)}
        />
      </div>

      {/* ── Main column: TopBar + Outlet ── */}
      <div className="relative z-20 flex-1 flex flex-col overflow-hidden min-w-0">

        {/* Top bar */}
        <AppTopBar
          sidebarOpen={sidebarOpen}
          onSidebarToggle={() => setSidebarOpen(!sidebarOpen)}
          onRightPanelToggle={() => setRightPanelOpen(!rightPanelOpen)}
          rightPanelOpen={rightPanelOpen}
        />

        {/* Main workspace */}
        <main className="flex-1 overflow-auto">
          <div className="p-6 min-h-full">
            <Outlet />
          </div>
        </main>
      </div>

      {/* ── Right Panel (z-40 fixed) ── */}
      <AppRightPanel
        open={rightPanelOpen}
        onClose={() => setRightPanelOpen(false)}
      />
    </div>
  );
}

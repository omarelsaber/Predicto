import { useEffect, useState } from 'react';
import api, { API_ORIGIN } from './api';
import { useSynthesis } from './hooks/useSynthesis';
import PredictoSidebar from './components/PredictoSidebar';
import RevenueOverview from './pages/RevenueOverview';
import DealScorer from './pages/DealScorer';
import PersonaGallery from './pages/PersonaGallery';
import DataExplorer from './pages/DataExplorer';
import UploadData from './pages/UploadData';
import CinematicLanding from './pages/CinematicLanding';
import AICopilot from './pages/AICopilot';
import AnalyticsHub from './pages/AnalyticsHub';
import { Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

function App() {
  const [activeTab, setActiveTab] = useState('revenue-overview');
  const [isBooting, setIsBooting] = useState(true);

  useEffect(() => {
    // Simulate boot sequence
    const timer = setTimeout(() => setIsBooting(false), 1000);
    return () => clearTimeout(timer);
  }, []);

  const pageVariants = {
    initial: { opacity: 0, x: -10 },
    in: { opacity: 1, x: 0 },
    out: { opacity: 0, x: 10 }
  };

  const pageTransition = {
    type: "tween",
    ease: "anticipate",
    duration: 0.3
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'revenue-overview':
        return (
          <motion.div 
            key="revenue"
            initial="initial" animate="in" exit="out" variants={pageVariants} transition={pageTransition}
          >
            <RevenueOverview />
          </motion.div>
        );
      case 'deal-scorer':
        return (
          <motion.div key="deals" initial="initial" animate="in" exit="out" variants={pageVariants} transition={pageTransition}>
            <DealScorer />
          </motion.div>
        );
      case 'personas':
        return (
          <motion.div key="personas" initial="initial" animate="in" exit="out" variants={pageVariants} transition={pageTransition}>
            <PersonaGallery />
          </motion.div>
        );
      case 'data-explorer':
        return (
          <motion.div key="data" initial="initial" animate="in" exit="out" variants={pageVariants} transition={pageTransition}>
            <DataExplorer />
          </motion.div>
        );
      case 'upload':
        return (
          <motion.div key="upload" initial="initial" animate="in" exit="out" variants={pageVariants} transition={pageTransition}>
            <UploadData />
          </motion.div>
        );
      case 'onboarding':
        return (
          <motion.div key="onboarding" initial="initial" animate="in" exit="out" variants={pageVariants} transition={pageTransition}>
            <CinematicLanding onNavigate={setActiveTab} />
          </motion.div>
        );
      case 'copilot':
        return (
          <motion.div key="copilot" initial="initial" animate="in" exit="out" variants={pageVariants} transition={pageTransition}>
            <AICopilot />
          </motion.div>
        );
      case 'analytics':
        return (
          <motion.div key="analytics" initial="initial" animate="in" exit="out" variants={pageVariants} transition={pageTransition}>
            <AnalyticsHub />
          </motion.div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex h-screen bg-slate-950 font-sans text-slate-200 overflow-hidden">
      {isBooting && (
        <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex flex-col items-center justify-center">
          <Loader2 className="w-12 h-12 text-indigo-500 animate-spin mb-5" />
          <h2 className="text-2xl font-bold text-white mb-2 tracking-tight">Connecting…</h2>
          <p className="text-slate-400 max-w-md text-center leading-relaxed">
            Loading Predicto status…
          </p>
        </div>
      )}

      <PredictoSidebar activeTab={activeTab} setActiveTab={setActiveTab} />

      <div className="ml-56 flex-1 flex flex-col h-full overflow-hidden bg-slate-950">
        <main className="flex-1 overflow-y-auto custom-scrollbar relative z-0 min-w-0">
          <div className="p-8 max-w-[1600px] mx-auto w-full">
            <AnimatePresence mode="wait">
              {renderContent()}
            </AnimatePresence>
          </div>
        </main>
      </div>
    </div>
  );
}

export default App;

import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import api, { API_ORIGIN } from './api';
import { useSynthesis } from './hooks/useSynthesis';
import PredictoSidebar from './components/PredictoSidebar';
import AlertCenter from './components/AlertCenter';
import LandingPage from './pages/LandingPage';
import RevenueOverview from './pages/RevenueOverview';
import DealScorer from './pages/DealScorer';
import PersonaGallery from './pages/PersonaGallery';
import DataExplorer from './pages/DataExplorer';
import UploadPage from './components/UploadPage';
import { Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// Dashboard views
import CinematicLanding from './pages/CinematicLanding';
import AICopilot from './pages/AICopilot';
import AnalyticsHub from './pages/AnalyticsHub';

function App() {
  const [isAppLaunched, setIsAppLaunched] = useState(false);
  const [userName, setUserName] = useState('Guest User');
  const [tempName, setTempName] = useState('');
  const [showNameModal, setShowNameModal] = useState(false);
  const [activeTab, setActiveTab] = useState('revenue-overview');
  const [isBooting, setIsBooting] = useState(true);

  useEffect(() => {
    // Simulate boot sequence
    const timer = setTimeout(() => setIsBooting(false), 1000);
    return () => clearTimeout(timer);
  }, []);

  const handlePersonalize = (e) => {
    e?.preventDefault();
    setUserName(tempName || 'Analyst');
    setShowNameModal(false);
    setIsAppLaunched(true);
  };

  const pageVariants = {
    initial: { opacity: 0, x: -10 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: 10 }
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
          <motion.div key="revenue" initial="initial" animate="animate" exit="exit" variants={pageVariants} transition={pageTransition}>
            <RevenueOverview onNavigate={setActiveTab} />
          </motion.div>
        );
      case 'deal-scorer':
        return (
          <motion.div key="deals" initial="initial" animate="animate" exit="exit" variants={pageVariants} transition={pageTransition}>
            <DealScorer />
          </motion.div>
        );
      case 'personas':
        return (
          <motion.div key="personas" initial="initial" animate="animate" exit="exit" variants={pageVariants} transition={pageTransition}>
            <PersonaGallery />
          </motion.div>
        );
      case 'data-explorer':
        return (
          <motion.div key="data" initial="initial" animate="animate" exit="exit" variants={pageVariants} transition={pageTransition}>
            <DataExplorer />
          </motion.div>
        );
      case 'upload':
        return (
          <motion.div key="upload" initial="initial" animate="animate" exit="exit" variants={pageVariants} transition={pageTransition}>
            <UploadPage onUploadComplete={() => setActiveTab('revenue-overview')} />
          </motion.div>
        );
      case 'landing':
        return (
          <motion.div key="landing" initial="initial" animate="animate" exit="exit" variants={pageVariants} transition={pageTransition}>
            <CinematicLanding onNavigate={setActiveTab} />
          </motion.div>
        );
      case 'ai-copilot':
        return (
          <motion.div key="copilot" initial="initial" animate="animate" exit="exit" variants={pageVariants} transition={pageTransition}>
            <AICopilot />
          </motion.div>
        );
      case 'analytics-hub':
        return (
          <motion.div key="analytics" initial="initial" animate="animate" exit="exit" variants={pageVariants} transition={pageTransition}>
            <AnalyticsHub />
          </motion.div>
        );
      default:
        return <RevenueOverview />;
    }
  };

  if (!isAppLaunched) {
    if (showNameModal) {
      return (
        <div className="fixed inset-0 z-[100] bg-slate-950 flex items-center justify-center p-6 overflow-hidden">
          {/* Subtle background glow */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-indigo-500/10 blur-[120px] rounded-full"></div>
          
          <motion.div 
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className="w-full max-w-md bg-slate-900/80 backdrop-blur-3xl border border-slate-800 p-10 rounded-[2.5rem] shadow-2xl relative z-10"
          >
            <div className="flex justify-center mb-8">
              <img src="/predicto-logo.png" alt="Predicto" className="h-12 w-auto" />
            </div>
            
            <div className="text-center mb-10">
              <h2 className="text-3xl font-bold text-white tracking-tight mb-3">Welcome to Predicto</h2>
              <p className="text-slate-400 text-sm">Personalize your intelligence workspace to begin.</p>
            </div>

            <form onSubmit={handlePersonalize} className="space-y-6">
              <div>
                <label htmlFor="name" className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 ml-1">
                  What should we call you?
                </label>
                <input
                  autoFocus
                  required
                  id="name"
                  type="text"
                  value={tempName}
                  onChange={(e) => setTempName(e.target.value)}
                  placeholder="Your name or organization"
                  className="w-full bg-white/5 backdrop-blur-sm border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <button
                type="submit"
                className="w-full bg-indigo-500 hover:bg-indigo-400 text-white font-bold py-4 rounded-2xl transition-all shadow-lg shadow-indigo-500/20 flex items-center justify-center gap-2 group"
              >
                Get Started
                <span className="group-hover:translate-x-1 transition-transform">→</span>
              </button>
            </form>
          </motion.div>
        </div>
      );
    }
    return <LandingPage onLaunch={() => setShowNameModal(true)} />;
  }

  return (
    <div className="flex h-screen bg-slate-950 font-sans text-slate-200 overflow-hidden relative">
      {isBooting && (
        <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex flex-col items-center justify-center">
          <Loader2 className="w-12 h-12 text-indigo-500 animate-spin mb-5" />
          <h2 className="text-2xl font-bold text-white mb-2 tracking-tight">Connecting…</h2>
          <p className="text-slate-400 max-w-md text-center leading-relaxed">
            Loading Predicto status…
          </p>
        </div>
      )}

      <PredictoSidebar activeTab={activeTab} setActiveTab={setActiveTab} userName={userName} />

      <div className="flex-1 flex flex-col h-full overflow-hidden ml-56">
        {/* Main Dashboard Header */}
        <header className="h-20 border-b border-slate-800 bg-slate-900/40 backdrop-blur-xl flex items-center px-10 justify-between shrink-0 relative z-40">
          <Link to="/" onClick={() => setActiveTab('landing')} className="block hover:opacity-80 transition-opacity">
            <img src="/predicto-logo.png" alt="Predicto" className="h-10 w-auto object-contain" />
          </Link>
          
          <div className="flex items-center gap-6">
            <AlertCenter />
            <div className="h-8 w-px bg-slate-800 mx-2"></div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className="text-sm font-bold text-white">{userName}</p>
                <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Admin</p>
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto custom-scrollbar relative z-0 min-w-0 bg-transparent">
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

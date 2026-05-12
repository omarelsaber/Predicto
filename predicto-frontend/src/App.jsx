import { useEffect, useState } from 'react';
import api, { API_ORIGIN } from './api';
import { useSynthesis } from './hooks/useSynthesis';
import Sidebar from './components/Sidebar';
import StatCard from './components/StatCard';
import ForecastChart from './components/ForecastChart';
import ExecutiveSummary from './components/ExecutiveSummary';
import PersonaGallery from './components/PersonaGallery';
import DealScorer from './components/DealScorer';
import DataExplorer from './components/DataExplorer';
import AlertCenter, { AlertBellButton } from './components/AlertCenter';
import UploadPage from './components/UploadPage';
import EmptyDataPlaceholder from './components/EmptyDataPlaceholder';
import CinematicLanding from './pages/CinematicLanding';
import AICopilot from './pages/AICopilot';
import AnalyticsHub from './pages/AnalyticsHub';
import { LayoutDashboard, Users, Loader2, Download, User, Volume2, ShieldCheck } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

function App() {
  const [activeTab, setActiveTab] = useState('overview');
  const [health, setHealth] = useState(null);
  const [healthLoading, setHealthLoading] = useState(true);
  const [forecast, setForecast] = useState(null);
  const [personas, setPersonas] = useState(null);
  
  const [query, setQuery] = useState("");
  const [alertsOpen, setAlertsOpen] = useState(false);
  const { summary, meta, loading, error, streamSummary } = useSynthesis();

  const isDataLoaded = Boolean(health?.data_loaded);
  const modelsReady = Boolean(health?.models_ready);

  const fetchData = async () => {
    try {
      const [forecastRes, personasRes] = await Promise.all([
        api.get('/forecast'),
        api.get('/personas')
      ]);
      setForecast(forecastRes.data);
      setPersonas(personasRes.data);
    } catch (err) {
      console.error("Error fetching data:", err);
    }
  };

  useEffect(() => {
    let polling = true;

    async function fetchHealth() {
      try {
        const res = await api.get('/health', { baseURL: API_ORIGIN });
        setHealth(res.data);
        await fetchData();
      } catch (err) {
        console.error("Error fetching health:", err);
        if (polling) setTimeout(fetchHealth, 5000);
      } finally {
        setHealthLoading(false);
      }
    }
    
    fetchHealth();
    
    const handleTriggerSynthesis = (e) => {
      const { query } = e.detail;
      setActiveTab('overview');
      setTimeout(() => {
        streamSummary(query);
      }, 100);
    };

    window.addEventListener('trigger-synthesis', handleTriggerSynthesis);
    
    return () => { 
      polling = false; 
      window.removeEventListener('trigger-synthesis', handleTriggerSynthesis);
    };
  }, [streamSummary]);

  useEffect(() => {
    setAlertsOpen(false);
  }, [activeTab]);

  const handleUploadComplete = async (result) => {
    try {
      const healthRes = await api.get('/health', { baseURL: API_ORIGIN });
      setHealth(healthRes.data);
      await fetchData();
    } catch (err) {
      console.error("Error refetching after upload:", err);
    }
    setActiveTab('overview');
  };

  const handleAsk = (e) => {
    e.preventDefault();
    if (query.trim()) {
      streamSummary(query);
      setQuery("");
    }
  };

  const isBooting = healthLoading;

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

  const goUpload = () => setActiveTab('upload');

  const renderContent = () => {
    const totalNextRevenue = forecast?.segments?.reduce((acc, s) => acc + (s.next_period_revenue || 0), 0) || 0;
    const avgConfidence = forecast?.segments?.length 
      ? (forecast.segments.reduce((acc, s) => acc + (s.r2_validation || 0), 0) / forecast.segments.length * 100) 
      : 0;

    switch (activeTab) {
      case 'upload':
        return (
          <motion.div 
            key="upload"
            initial="initial" animate="in" exit="out" variants={pageVariants} transition={pageTransition}
          >
            <UploadPage onUploadComplete={handleUploadComplete} />
          </motion.div>
        );
      case 'overview':
        if (!isDataLoaded) {
          return (
            <motion.div
              key="overview-empty"
              initial="initial" animate="in" exit="out" variants={pageVariants} transition={pageTransition}
              className="w-full"
            >
              <EmptyDataPlaceholder onUploadClick={goUpload} />
            </motion.div>
          );
        }
        return (
          <motion.div 
            key="overview"
            initial="initial" animate="in" exit="out" variants={pageVariants} transition={pageTransition}
            className="flex flex-col gap-8"
          >
            {/* North Star KPI Bar */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 w-full">
              <StatCard 
                isKPI={true}
                title="Next Month Revenue" 
                value={totalNextRevenue > 0 ? `$${(totalNextRevenue / 1000).toFixed(1)}k` : '-'} 
                icon={LayoutDashboard} 
                trend={totalNextRevenue > 0 ? 12 : null} 
              />
              <StatCard 
                isKPI={true}
                title="Model Confidence" 
                value={avgConfidence > 0 ? `${avgConfidence.toFixed(1)}%` : '-'} 
                icon={ShieldCheck} 
                trend={avgConfidence > 80 ? 4 : null} 
              />
              <StatCard 
                isKPI={true}
                title="Total Personas" 
                value={personas ? personas.n_clusters : '-'} 
                icon={Users} 
                trend={personas && personas.n_clusters > 0 ? 5 : null} 
              />
            </div>

            {/* Main Content Grid */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
              {/* Left Sidebar */}
              <div className="xl:col-span-1 flex flex-col gap-8">
                <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl shadow-[0_0_15px_rgba(99,102,241,0.1)] transition-all hover:border-slate-700 hover:shadow-[0_0_20px_rgba(99,102,241,0.15)]">
                  <h2 className="text-lg font-semibold text-white mb-5 flex items-center gap-2">
                    <span className="w-1.5 h-5 bg-indigo-500 rounded-full inline-block"></span>
                    AI Analyst
                  </h2>
                  <form onSubmit={handleAsk} className="flex flex-col gap-4">
                    <textarea 
                      className="w-full bg-slate-800/40 border border-slate-700 rounded-lg p-3 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 transition-all resize-none shadow-inner custom-scrollbar"
                      rows="4"
                      placeholder="E.g., Which segment is at the highest margin risk this quarter?"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      disabled={loading || !modelsReady || isBooting}
                    />
                    <button 
                      type="submit" 
                      className="bg-indigo-500 hover:bg-indigo-600 active:bg-indigo-700 text-white font-medium py-3.5 px-4 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_15px_rgba(99,102,241,0.4)] hover:shadow-[0_0_20px_rgba(99,102,241,0.6)] flex items-center justify-center gap-2"
                      disabled={loading || !query.trim() || !modelsReady || isBooting}
                    >
                      {loading ? (
                        <><Loader2 size={18} className="animate-spin" /> Synthesizing...</>
                      ) : 'Generate Insight'}
                    </button>
                  </form>
                </div>
                <ExecutiveSummary summary={summary} meta={meta} loading={loading} error={error} />
              </div>

              {/* Right Content Area - Forecast Chart */}
              <div className="xl:col-span-2 flex flex-col gap-8">
                <div className="flex-1 min-h-[450px]">
                  <ForecastChart data={forecast} />
                </div>
              </div>
            </div>
          </motion.div>
        );
      case 'personas':
        return (
          <motion.div key="personas" initial="initial" animate="in" exit="out" variants={pageVariants} transition={pageTransition}>
            <PersonaGallery 
              personas={personas} 
              isDataLoaded={isDataLoaded}
              onRequestUpload={goUpload}
            />
          </motion.div>
        );
      case 'deal-intelligence':
        return (
          <motion.div key="deals" initial="initial" animate="in" exit="out" variants={pageVariants} transition={pageTransition}>
            {!modelsReady ? (
              <EmptyDataPlaceholder
                title="Deal Scorer needs trained models"
                subtitle="Upload a CSV first so the margin engine can learn from your transactions."
                onUploadClick={goUpload}
              />
            ) : (
              <DealScorer />
            )}
          </motion.div>
        );
      case 'data-explorer':
        return (
          <motion.div key="data" initial="initial" animate="in" exit="out" variants={pageVariants} transition={pageTransition}>
            {!isDataLoaded ? (
              <EmptyDataPlaceholder
                title="No dataset loaded"
                subtitle="Upload your CSV to browse verified transactions in the Data Explorer."
                onUploadClick={goUpload}
              />
            ) : (
              <DataExplorer />
            )}
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

      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />

      <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-950">
        
        <header className="px-4 sm:px-10 py-5 border-b border-slate-800/60 flex justify-between items-center bg-slate-900/95 backdrop-blur-md shrink-0 z-20 shadow-sm gap-4">
          <div className="flex items-center gap-4 min-w-0">
            {health && (
              <div className="flex items-center gap-3 bg-slate-800/40 border border-slate-700/50 px-4 py-2.5 rounded-full shadow-inner">
                <span className="relative flex h-2 w-2">
                  {health.models_ready && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>}
                  <span className={`relative inline-flex rounded-full h-2 w-2 ${health.models_ready ? 'bg-emerald-500' : 'bg-yellow-500'}`}></span>
                </span>
                <span className="text-[11px] text-slate-300 font-bold uppercase tracking-wider">{health.status}</span>
                <span className="text-slate-600 hidden sm:inline">|</span>
                <span className="text-[11px] text-slate-500 font-medium hidden sm:inline">Up {Math.round(health.uptime_seconds)}s</span>
                {health.data_loaded === false && (
                  <span className="text-[10px] text-amber-400/90 font-semibold uppercase tracking-wide ml-1 hidden md:inline">No data</span>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-3 sm:gap-6 shrink-0">
            <button 
              type="button"
              disabled={!isDataLoaded || !modelsReady}
              onClick={() => window.open(`${API_ORIGIN}/api/v1/report`, '_blank')}
              className="hidden md:flex items-center gap-2 bg-indigo-500 hover:bg-indigo-600 active:bg-indigo-700 disabled:opacity-40 disabled:pointer-events-none text-white text-sm font-semibold py-2 px-5 rounded-lg transition-all shadow-[0_0_15px_rgba(99,102,241,0.4)] hover:shadow-[0_0_20px_rgba(99,102,241,0.6)]"
            >
              <Download size={16} />
              Download Report
            </button>
            
            <div className="h-6 w-px bg-slate-700 hidden md:block"></div>
            
            <button 
              type="button"
              className="p-2.5 text-slate-400 hover:text-white transition-colors bg-slate-800/50 border border-slate-700/50 rounded-full shadow-sm hover:bg-slate-800"
              title="Speak Insights (TTS)"
            >
              <Volume2 size={18} />
            </button>

            <AlertBellButton
              forecastData={forecast}
              personaData={personas}
              open={alertsOpen}
              onClick={() => setAlertsOpen((v) => !v)}
            />
            
            <div className="flex items-center gap-3 cursor-pointer hover:bg-slate-800/40 p-1.5 rounded-xl transition-colors">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center border-2 border-slate-800 shadow-sm">
                <User size={20} className="text-white" />
              </div>
              <div className="hidden sm:block pr-2">
                <p className="text-sm font-bold text-white leading-tight">Antigravity</p>
                <p className="text-[11px] text-slate-400 font-medium uppercase tracking-wider mt-0.5">Enterprise Admin</p>
              </div>
            </div>
          </div>
        </header>
        
        <main className="flex-1 overflow-y-auto p-6 sm:p-10 custom-scrollbar relative z-0 min-w-0">
          <div className="max-w-[1500px] mx-auto h-full pb-10 w-full">
            <AnimatePresence mode="wait">
              {renderContent()}
            </AnimatePresence>
          </div>
        </main>
      </div>

      <AlertCenter
        open={alertsOpen}
        onClose={() => setAlertsOpen(false)}
        forecastData={forecast}
        personaData={personas}
      />
    </div>
  );
}

export default App;

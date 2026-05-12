import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Sparkles, Loader2, TrendingUp, Target, AlertTriangle, Users, User, DollarSign, MapPin, Layers } from 'lucide-react';
import EmptyDataPlaceholder from './EmptyDataPlaceholder';

export default function PersonaGallery({ personas, isDataLoaded = true, onRequestUpload }) {
  const [selectedPersona, setSelectedPersona] = useState(null);
  const [strategy, setStrategy] = useState('');
  const [strategyLoading, setStrategyLoading] = useState(false);
  const [strategyError, setStrategyError] = useState(null);

  if (!isDataLoaded) {
    return (
      <EmptyDataPlaceholder
        title="Customer personas need data"
        subtitle="Upload your CSV so K-Means can discover behavioral clusters and persona labels tailored to your business."
        onUploadClick={onRequestUpload}
      />
    );
  }

  if (!personas?.personas?.length) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[480px] bg-[#0f172a] border border-gray-800 rounded-2xl p-8 text-center">
        <div className="w-16 h-16 bg-brand-primary/10 rounded-full flex items-center justify-center mb-6">
          <Users size={32} className="text-brand-primary" />
        </div>
        <h3 className="text-xl font-bold text-white mb-2">No personas available</h3>
        <p className="text-gray-400 max-w-md">
          Segmentation did not return clusters. Try re-uploading your CSV or check that segments and customers vary enough for clustering.
        </p>
      </div>
    );
  }

  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.1 }
    }
  };

  const item = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } }
  };

  const generateStrategy = async (persona) => {
    setStrategyLoading(true);
    setStrategy('');
    setStrategyError(null);

    try {
      const response = await fetch('http://localhost:8001/api/v1/synthesise', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `Generate a concise growth strategy for the "${persona.persona_label || 'Cluster'}" persona (Segment: ${persona.segment || 'All'}, Avg Deal Value: $${Math.round(persona.avg_deal_value || 0).toLocaleString()}, Avg Margin: ${persona.avg_margin || '0%'}, Avg Discount: ${persona.avg_discount || '0%'}, Churn Risk: ${persona.churn_risk || 'low'}, Top Region: ${persona.top_region || 'Global'}). Include 3 specific action items to increase revenue and reduce churn for this customer cluster.`
        })
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.type === 'chunk') setStrategy(prev => prev + data.text);
              if (data.type === 'error') setStrategyError(data.message);
              if (data.type === 'done') setStrategyLoading(false);
            } catch {
              // Skip malformed SSE lines
            }
          }
        }
      }
    } catch (err) {
      setStrategyError("Failed to generate strategy. Check if the synthesis service is available.");
      setStrategyLoading(false);
    }
  };

  const handleCardClick = (persona) => {
    setSelectedPersona(persona);
    setStrategy('');
    setStrategyError(null);
    setStrategyLoading(false);
  };

  const handleClose = () => {
    setSelectedPersona(null);
  };

  return (
    <div className="space-y-10">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
        <div>
          <h2 className="text-3xl font-bold text-white tracking-tight mb-2">Customer Personas</h2>
          <p className="text-gray-400">K-Means clusters identifying key behavioral archetypes across your dataset.</p>
        </div>
        <div className="bg-[#0f172a] border border-gray-800 px-6 py-3 rounded-2xl flex items-center gap-4 shadow-sm">
          <div className="text-right">
            <p className="text-[10px] uppercase font-bold text-gray-500 tracking-widest">Separation</p>
            <p className="text-white font-bold text-lg">{(personas.silhouette_score * 100).toFixed(1)}% <span className="text-brand-primary text-xs ml-1">Score</span></p>
          </div>
          <div className="w-px h-8 bg-gray-800"></div>
          <div className="text-right">
            <p className="text-[10px] uppercase font-bold text-gray-500 tracking-widest">Clusters</p>
            <p className="text-white font-bold text-lg">{personas.n_clusters}</p>
          </div>
        </div>
      </header>

      <motion.div 
        variants={container}
        initial="hidden"
        animate="show"
        className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-6"
      >
        {personas.personas.map((persona, index) => (
          <motion.div 
            key={index}
            variants={item}
            onClick={() => handleCardClick(persona)}
            className={`bg-[#0f172a] border rounded-2xl p-6 shadow-lg transition-all flex flex-col h-full cursor-pointer group relative overflow-hidden ${
              selectedPersona?.persona_label === persona.persona_label
                ? 'border-brand-primary ring-1 ring-brand-primary/30'
                : 'border-gray-800 hover:border-gray-600'
            }`}
          >
            <div className="absolute -top-10 -right-10 w-32 h-32 bg-brand-primary/5 rounded-full blur-2xl group-hover:bg-brand-primary/10 transition-colors"></div>

            <div className="mb-4 relative">
              <span className="inline-block text-[10px] font-bold uppercase tracking-wider text-brand-primary bg-brand-primary/10 border border-brand-primary/20 px-2.5 py-1 rounded-full mb-3">
                {persona.segment || 'Universal'}
              </span>
              <h3 className="text-xl font-bold text-white leading-tight group-hover:text-brand-primary transition-colors">
                {persona.persona_label || `Archetype ${index + 1}`}
              </h3>
            </div>
            
            <div className="flex-1 space-y-4 my-4 relative">
              <div className="flex justify-between items-center border-b border-gray-800/50 pb-3">
                <div className="flex items-center gap-2 text-gray-500">
                  <DollarSign size={14} className="text-emerald-500" />
                  <span className="text-xs font-semibold uppercase tracking-tighter">Avg Deal</span>
                </div>
                <span className="text-sm font-bold text-white">${Math.round(persona.avg_deal_value || 0).toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center border-b border-gray-800/50 pb-3">
                <div className="flex items-center gap-2 text-gray-500">
                  <TrendingUp size={14} className="text-brand-primary" />
                  <span className="text-xs font-semibold uppercase tracking-tighter">Margin</span>
                </div>
                <span className={`text-xs font-bold px-2 py-0.5 rounded ${parseFloat(persona.avg_margin || '0') > 20 ? 'text-emerald-400 bg-emerald-400/10' : 'text-yellow-400 bg-yellow-400/10'}`}>
                  {persona.avg_margin || '0%'}
                </span>
              </div>
              <div className="flex justify-between items-center border-b border-gray-800/50 pb-3">
                <div className="flex items-center gap-2 text-gray-500">
                  <MapPin size={14} className="text-rose-500" />
                  <span className="text-xs font-semibold uppercase tracking-tighter">Region</span>
                </div>
                <span className="text-sm font-bold text-white">{persona.top_region || 'Global'}</span>
              </div>
              <div className="flex justify-between items-center pb-1">
                <div className="flex items-center gap-2 text-gray-500">
                  <AlertTriangle size={14} className={persona.churn_risk === 'high' ? 'text-rose-500' : 'text-emerald-500'} />
                  <span className="text-xs font-semibold uppercase tracking-tighter">Risk</span>
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${persona.churn_risk === 'high' ? 'text-rose-400 bg-rose-400/10 border border-rose-500/20' : 'text-emerald-400 bg-emerald-400/10 border border-emerald-500/20'}`}>
                  {persona.churn_risk || 'low'}
                </span>
              </div>
            </div>
            
            <div className="mt-auto pt-4 border-t border-gray-800/60 flex justify-between items-center relative">
              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Density</span>
              <span className="text-xs font-bold text-gray-300">{(persona.cluster_size || 0).toLocaleString()} Accounts</span>
            </div>

            <div className="mt-4 flex items-center justify-center gap-1.5 opacity-0 group-hover:opacity-100 transition-all transform translate-y-2 group-hover:translate-y-0">
              <Sparkles size={12} className="text-brand-primary" />
              <span className="text-[10px] font-bold text-brand-primary uppercase tracking-widest">Analyze Strategy</span>
            </div>
          </motion.div>
        ))}
      </motion.div>

      {/* Strategy Panel */}
      <AnimatePresence>
        {selectedPersona && (
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed inset-x-0 bottom-0 z-50 p-6 md:p-10 pointer-events-none"
          >
            <div className="max-w-5xl mx-auto bg-[#0f172a] border border-brand-primary/30 rounded-2xl shadow-[0_30px_100px_rgba(0,0,0,0.8)] overflow-hidden pointer-events-auto ring-1 ring-white/5">
              <div className="flex justify-between items-center p-6 border-b border-gray-800 bg-[#1e293b]/50 backdrop-blur-md">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-brand-primary/20 rounded-xl flex items-center justify-center border border-brand-primary/30">
                    <Target size={24} className="text-brand-primary" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-white">{selectedPersona.persona_label || 'Cluster Analysis'}</h3>
                    <p className="text-xs text-gray-400 font-medium uppercase tracking-widest">{selectedPersona.segment || 'Market'} Strategy · {selectedPersona.top_region || 'Global'}</p>
                  </div>
                </div>
                <button
                  onClick={handleClose}
                  className="p-2 hover:bg-gray-800 rounded-full transition-colors group"
                >
                  <X size={20} className="text-gray-500 group-hover:text-white" />
                </button>
              </div>

              <div className="p-8">
                {!strategy && !strategyLoading && !strategyError && (
                  <div className="text-center py-10">
                    <div className="w-16 h-16 bg-brand-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
                      <Sparkles size={32} className="text-brand-primary" />
                    </div>
                    <h4 className="text-lg font-bold text-white mb-2">Ready to grow this segment?</h4>
                    <p className="text-gray-400 mb-8 max-w-md mx-auto text-sm">Predicto AI will analyze historical behavior to generate 3 actionable growth items.</p>
                    <button
                      onClick={() => generateStrategy(selectedPersona)}
                      className="bg-brand-primary hover:bg-blue-600 text-white font-bold py-4 px-10 rounded-xl transition-all shadow-[0_0_30px_rgba(59,130,246,0.3)] hover:shadow-[0_0_40px_rgba(59,130,246,0.5)] flex items-center justify-center gap-3 mx-auto"
                    >
                      <Sparkles size={18} />
                      Generate Strategy
                    </button>
                  </div>
                )}

                {(strategy || strategyLoading) && (
                  <div className="space-y-6">
                    <div className="flex items-center gap-3">
                      <Sparkles size={18} className="text-brand-primary" />
                      <h4 className="text-sm font-bold text-white uppercase tracking-widest">Growth Roadmap</h4>
                      {strategyLoading && <Loader2 size={16} className="text-brand-primary animate-spin" />}
                    </div>
                    <div className="bg-[#020617] border border-gray-800 rounded-xl p-8 text-gray-300 text-base leading-relaxed whitespace-pre-wrap min-h-[200px] shadow-inner font-serif italic">
                      {strategy}
                      {strategyLoading && <span className="inline-block w-2 h-5 bg-brand-primary/60 ml-1 animate-pulse" />}
                    </div>
                    {!strategyLoading && (
                      <div className="flex justify-end gap-3">
                        <button onClick={handleClose} className="px-6 py-2.5 rounded-lg border border-gray-700 text-sm font-bold text-gray-400 hover:text-white hover:border-gray-500 transition-colors">Dismiss</button>
                        <button className="px-6 py-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm font-bold hover:bg-emerald-500/20 transition-colors">Apply Strategy</button>
                      </div>
                    )}
                  </div>
                )}

                {strategyError && (
                  <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-6 flex gap-4 items-center">
                    <AlertTriangle size={24} className="text-rose-400 shrink-0" />
                    <div>
                      <p className="font-bold text-rose-400">Strategy Engine Offline</p>
                      <p className="text-sm text-rose-300/80">{strategyError}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

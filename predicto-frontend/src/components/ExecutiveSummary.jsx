import { motion, AnimatePresence } from 'framer-motion';
import { Cpu } from 'lucide-react';

export default function ExecutiveSummary({ summary, meta, loading, error }) {
  return (
    <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl shadow-[0_0_15px_rgba(99,102,241,0.1)] flex flex-col min-h-[250px] relative hover:border-slate-700 hover:shadow-[0_0_20px_rgba(99,102,241,0.15)] transition-all">
      <div className="flex justify-between items-start mb-4">
        <h2 className="text-lg font-bold text-indigo-400 flex items-center gap-2">
          <Cpu size={20} className={loading ? "animate-pulse" : ""} />
          Executive Summary
        </h2>
        {meta && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-slate-800/50 border border-slate-700/50 backdrop-blur-md px-3 py-1.5 rounded-full flex gap-3 items-center text-[11px] font-medium text-slate-300 shadow-sm"
          >
            <span><span className="text-slate-500">Tokens:</span> {meta.token_estimate}</span>
            <span><span className="text-slate-500">Budget:</span> {(meta.budget_pct * 100).toFixed(1)}%</span>
            <span className="text-indigo-400 opacity-90 bg-indigo-500/15 px-1.5 rounded font-semibold">{meta.model || 'Groq'}</span>
          </motion.div>
        )}
      </div>
      
      {error && (
        <div className="bg-rose-900/20 border border-rose-900/40 text-rose-400 p-3 rounded-lg text-sm mb-3">
          {error}
        </div>
      )}
      
      <div className="flex-1 text-slate-300 text-sm leading-relaxed whitespace-pre-wrap relative overflow-y-auto pr-2 custom-scrollbar">
        <AnimatePresence mode="wait">
          {!summary && !loading && !error && (
            <motion.span 
              key="empty"
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              className="text-slate-500 italic block mt-2"
            >
              Ask a question to generate an AI-driven summary...
            </motion.span>
          )}
        </AnimatePresence>
        
        {summary && (
          <motion.span 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            className="text-slate-100"
          >
            {summary}
          </motion.span>
        )}
        
        {loading && (
          <span className="inline-block w-2 h-4 ml-1 bg-indigo-500 animate-pulse translate-y-0.5 rounded-sm"></span>
        )}
      </div>
    </div>
  );
}

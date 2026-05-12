import { motion, AnimatePresence } from 'framer-motion';
import { Cpu } from 'lucide-react';

export default function ExecutiveSummary({ summary, meta, loading, error }) {
  return (
    <div className="bg-[#0f172a] border border-gray-800 p-5 rounded-xl shadow-[0_0_15px_rgba(16,185,129,0.05)] flex flex-col min-h-[250px] relative">
      <div className="flex justify-between items-start mb-4">
        <h2 className="text-lg font-bold text-brand-accent flex items-center gap-2">
          <Cpu size={20} className={loading ? "animate-pulse" : ""} />
          Executive Summary
        </h2>
        {meta && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white/5 border border-white/10 backdrop-blur-md px-3 py-1.5 rounded-full flex gap-3 items-center text-[11px] font-medium text-gray-300 shadow-sm"
          >
            <span><span className="text-gray-500">Tokens:</span> {meta.token_estimate}</span>
            <span><span className="text-gray-500">Budget:</span> {(meta.budget_pct * 100).toFixed(1)}%</span>
            <span className="text-brand-primary opacity-80 bg-brand-primary/10 px-1.5 rounded">{meta.model || 'Groq'}</span>
          </motion.div>
        )}
      </div>
      
      {error && (
        <div className="bg-red-900/20 border border-red-900/50 text-red-400 p-3 rounded-lg text-sm mb-3">
          {error}
        </div>
      )}
      
      <div className="flex-1 text-gray-300 text-sm leading-relaxed whitespace-pre-wrap relative overflow-y-auto pr-2 custom-scrollbar">
        <AnimatePresence mode="wait">
          {!summary && !loading && !error && (
            <motion.span 
              key="empty"
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              className="text-gray-500 italic block mt-2"
            >
              Ask a question to generate an AI-driven summary...
            </motion.span>
          )}
        </AnimatePresence>
        
        {summary && (
          <motion.span 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            className="text-gray-200"
          >
            {summary}
          </motion.span>
        )}
        
        {loading && (
          <span className="inline-block w-2 h-4 ml-1 bg-brand-accent animate-pulse translate-y-0.5 rounded-sm"></span>
        )}
      </div>
    </div>
  );
}

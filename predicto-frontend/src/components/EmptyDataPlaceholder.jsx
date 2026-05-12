import { motion } from 'framer-motion';
import { UploadCloud, Sparkles, Database } from 'lucide-react';

export default function EmptyDataPlaceholder({
  title = 'Welcome to Predicto',
  subtitle = 'Upload your revenue CSV to unlock forecasts, personas, margin scoring, and the Data Explorer.',
  onUploadClick,
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="flex flex-col items-center justify-center text-center px-6 py-16 md:py-24 rounded-2xl border border-dashed border-gray-700/80 bg-gradient-to-b from-[#0f172a]/90 to-[#020617]/80 shadow-inner"
    >
      <div className="relative mb-8">
        <div className="absolute inset-0 blur-2xl bg-brand-primary/20 rounded-full scale-150" aria-hidden />
        <div className="relative w-20 h-20 rounded-2xl bg-[#1e293b] border border-gray-700 flex items-center justify-center shadow-lg">
          <Database className="w-10 h-10 text-brand-primary" strokeWidth={1.5} />
        </div>
        <Sparkles className="absolute -top-2 -right-2 w-8 h-8 text-amber-400/90" />
      </div>

      <h2 className="text-2xl md:text-3xl font-bold text-white tracking-tight mb-3 max-w-xl">
        {title}
      </h2>
      <p className="text-gray-400 max-w-lg leading-relaxed mb-10 text-sm md:text-base">
        {subtitle}
      </p>

      <button
        type="button"
        onClick={onUploadClick}
        className="inline-flex items-center gap-3 px-8 py-4 rounded-xl bg-brand-primary hover:bg-blue-600 active:bg-blue-700 text-white font-semibold text-sm md:text-base shadow-[0_0_24px_rgba(59,130,246,0.35)] hover:shadow-[0_0_32px_rgba(59,130,246,0.45)] transition-all"
      >
        <UploadCloud size={22} />
        Upload CSV to get started
      </button>

      <p className="mt-8 text-xs text-gray-500 max-w-md">
        Your data stays in memory for this session. After upload, all pillars retrain automatically.
      </p>
    </motion.div>
  );
}

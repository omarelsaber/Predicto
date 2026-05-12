import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

export default function StatCard({ title, value, icon: Icon, trend, isKPI = false }) {
  return (
    <div className={`${isKPI ? 'bg-slate-900 border-slate-800' : 'bg-slate-900 border-slate-800'} border p-6 rounded-xl shadow-[0_0_15px_rgba(99,102,241,0.1)] flex flex-col justify-center relative overflow-hidden transition-all duration-300 hover:border-slate-700 hover:shadow-[0_0_20px_rgba(99,102,241,0.2)] group`}>
      <div className="flex justify-between items-start mb-3">
        <h3 className={`${isKPI ? 'text-slate-300 text-base' : 'text-slate-400 text-sm'} font-medium tracking-wide`}>{title}</h3>
        {Icon && (
          <div className="p-2.5 bg-slate-800/60 rounded-lg group-hover:bg-indigo-500/15 transition-colors">
            <Icon size={20} className="text-indigo-500" />
          </div>
        )}
      </div>
      <div className="flex items-end gap-3 mt-2">
        <p className={`${isKPI ? 'text-4xl' : 'text-3xl'} font-black text-white tracking-tight`}>{value}</p>
        {trend !== undefined && trend !== null && (
          <div className={`flex items-center text-xs font-semibold px-2 py-1 rounded-md ${trend > 0 ? 'text-emerald-400 bg-emerald-500/15' : trend < 0 ? 'text-rose-400 bg-rose-500/15' : 'text-slate-400 bg-slate-700/30'}`}>
            {trend > 0 ? <TrendingUp size={12} className="mr-1" /> : trend < 0 ? <TrendingDown size={12} className="mr-1" /> : <Minus size={12} className="mr-1" />}
            {Math.abs(trend)}%
          </div>
        )}
      </div>
    </div>
  );
}

import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

export default function StatCard({ title, value, icon: Icon, trend }) {
  return (
    <div className="bg-[#0f172a] border border-gray-800 p-5 rounded-xl shadow-[0_0_15px_rgba(59,130,246,0.08)] flex flex-col justify-center relative overflow-hidden transition-all duration-300 hover:border-gray-700 hover:shadow-[0_0_20px_rgba(59,130,246,0.15)] group">
      <div className="flex justify-between items-start mb-2">
        <h3 className="text-gray-400 text-sm font-medium tracking-wide">{title}</h3>
        {Icon && (
          <div className="p-2 bg-gray-800/50 rounded-lg group-hover:bg-brand-primary/10 transition-colors">
            <Icon size={18} className="text-brand-primary" />
          </div>
        )}
      </div>
      <div className="flex items-end gap-3 mt-1">
        <p className="text-3xl font-bold text-white tracking-tight">{value}</p>
        {trend !== undefined && trend !== null && (
          <div className={`flex items-center text-xs font-semibold px-1.5 py-0.5 rounded-md ${trend > 0 ? 'text-emerald-400 bg-emerald-400/10' : trend < 0 ? 'text-rose-400 bg-rose-400/10' : 'text-gray-400 bg-gray-400/10'}`}>
            {trend > 0 ? <TrendingUp size={12} className="mr-1" /> : trend < 0 ? <TrendingDown size={12} className="mr-1" /> : <Minus size={12} className="mr-1" />}
            {Math.abs(trend)}%
          </div>
        )}
      </div>
    </div>
  );
}

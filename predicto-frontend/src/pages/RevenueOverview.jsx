import { useState, useEffect } from 'react';
import {
  ComposedChart, LineChart, BarChart, Line, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceArea
} from 'recharts';
import { TrendingUp, AlertTriangle, Download, Zap, FileText, Loader2, BrainCircuit } from 'lucide-react';
import api, { API_ORIGIN } from '../api';

export default function RevenueOverview({ onNavigate }) {
  const [query, setQuery] = useState('');
  const [revenueData, setRevenueData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [lastInsight, setLastInsight] = useState('Select an area or ask a question to generate a predictive insight.');

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await api.get('/revenue/overview');
        setRevenueData(res.data);
      } catch (err) {
        console.error('Failed to fetch revenue overview:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  const handleGenerateInsight = async () => {
    if (!query.trim()) return;
    setAnalyzing(true);
    try {
      const res = await api.post('/ai/analyze', { query });
      setLastInsight(res.data.insight);
      setQuery('');
    } catch (err) {
      console.error('AI Analysis failed:', err);
      setLastInsight('Error generating insight. Please ensure the backend is running.');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleExport = () => {
    window.open(`${API_ORIGIN}/api/v1/report`, '_blank');
  };

  if (loading) {
    return (
      <div className="h-[60vh] flex flex-col items-center justify-center text-slate-400">
        <Loader2 className="w-10 h-10 animate-spin text-indigo-500 mb-4" />
        <p className="text-lg font-medium">Hydrating revenue intelligence...</p>
      </div>
    );
  }

  // Use live data with fallbacks
  const forecastData = revenueData?.forecast_data || [];
  const sparklineRevenue = revenueData?.sparkline_revenue || [];
  const matrix = revenueData?.discount_matrix || [];
  const health = revenueData?.model_health || { "Margin Engine": 0, "Forecast Model": 0 };

  return (
    <div className="space-y-6 relative bg-transparent">
      <video 
        autoPlay 
        loop 
        muted 
        playsInline 
        className="fixed inset-0 w-full h-full object-cover -z-10 opacity-20 pointer-events-none"
      >
        <source src="/revenue-overview-bg.mp4" type="video/mp4" />
      </video>

      {/* Row 1: KPI Bar */}
      <div className="grid grid-cols-3 gap-5">
        {/* KPI 1: Revenue */}
        <div className="bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-xl p-4">
          <div className="flex justify-between items-start mb-2">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Next Quarter Revenue</p>
              <p className="text-2xl font-black text-white mt-1">{revenueData?.next_quarter_revenue || '$0.0k'}</p>
            </div>
            <div className="flex items-center gap-1 bg-emerald-500/15 text-emerald-400 text-[10px] font-bold px-1.5 py-0.5 rounded">
              <TrendingUp size={10} />
              {revenueData?.revenue_growth || '+0%'}
            </div>
          </div>
          <div className="w-full h-12 relative overflow-hidden">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
              <LineChart data={sparklineRevenue}>
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="#6366f1"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* KPI 2: Margin Health */}
        <div className="bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-xl p-4">
          <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Portfolio Margin Health</p>
          <p className="text-2xl font-black text-emerald-400 mt-1">{revenueData?.portfolio_margin_health || 0}%</p>
          <div className="mt-3 h-1.5 bg-slate-800 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-emerald-500 to-emerald-600 transition-all duration-1000" 
              style={{ width: `${Math.min(100, (revenueData?.portfolio_margin_health || 0) / (revenueData?.margin_target || 25) * 100)}%` }}
            ></div>
          </div>
          <p className="text-[10px] text-slate-400 mt-1.5">Target: {revenueData?.margin_target || 25}%</p>
        </div>

        {/* KPI 3: Risk Alerts */}
        <div className="bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-xl p-4">
          <div className="flex justify-between items-start mb-2">
            <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Risk Alerts</p>
            <AlertTriangle size={14} className="text-rose-500" />
          </div>
          <div className="flex items-baseline gap-2">
            <p className="text-2xl font-black text-rose-400 mt-1">{revenueData?.risk_alerts || 0}</p>
            <span className="text-[10px] text-slate-400 font-medium">Deals at margin cliff</span>
          </div>
          <p className="text-[10px] text-amber-400 font-medium mt-2">+{revenueData?.recovery_opportunity || '$0.0M'} recovery opportunity</p>
        </div>
      </div>

      {/* Row 2: Forecast Chart + AI Panel */}
      <div className="grid grid-cols-3 gap-5">
        {/* Forecast Chart */}
        <div className="col-span-2 bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-xl p-6">
          <h3 className="text-sm font-bold text-white mb-4">15-Month Revenue Forecast</h3>
          <div className="w-full h-[350px] relative overflow-hidden">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
              <ComposedChart data={forecastData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradIndigo" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                <XAxis dataKey="month" stroke="#64748b" fontSize={11} />
                <YAxis stroke="#64748b" fontSize={11} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1e293b',
                    border: '1px solid #334155',
                    borderRadius: '6px'
                  }}
                  labelStyle={{ color: '#cbd5e1' }}
                />
                <Legend />
                <ReferenceArea x1="Aug 24" x2="Dec 24" fill="#6366f1" fillOpacity={0.1} />
                <Line type="monotone" dataKey="Enterprise" stroke="#6366f1" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="SMB" stroke="#10b981" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="Strategic" stroke="#f59e0b" strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* AI Analyst Panel */}
        <div className="bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-xl p-6 flex flex-col">
          <div className="flex items-center gap-2 mb-4">
            <BrainCircuit size={16} className="text-indigo-400" />
            <h3 className="text-sm font-bold text-white">AI Analyst</h3>
          </div>
          <div className="bg-slate-800/50 rounded-lg p-4 mb-4 flex-1 text-sm text-slate-300 border border-slate-700/50 overflow-y-auto">
            {analyzing ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 opacity-60">
                <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
                <p className="text-xs font-medium italic">Thinking...</p>
              </div>
            ) : (
              <>
                <p className="text-[10px] text-slate-500 uppercase font-bold mb-2">Predictive Insight</p>
                <p className="leading-relaxed">{lastInsight}</p>
              </>
            )}
          </div>
          <textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleGenerateInsight())}
            placeholder="Ask about segment risks or recovery..."
            className="w-full bg-slate-800/50 border border-slate-700 rounded-lg p-2.5 text-sm text-slate-200 placeholder-slate-500 resize-none focus:outline-none focus:ring-1 focus:ring-indigo-500 mb-3 transition-all"
            rows="2"
            disabled={analyzing}
          />
          <button 
            onClick={handleGenerateInsight}
            disabled={analyzing || !query.trim()}
            className="w-full bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 disabled:hover:bg-indigo-500 text-white font-bold py-2 rounded-lg transition-all text-xs flex items-center justify-center gap-2"
          >
            {analyzing ? 'Processing...' : 'Generate Insight'}
          </button>
        </div>
      </div>

      {/* Row 3: Discount Matrix + Model Health + Actions */}
      <div className="grid grid-cols-3 gap-5">
        {/* Discount Ceiling Matrix */}
        <div className="bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-xl p-5">
          <p className="text-xs uppercase tracking-wider text-slate-400 font-bold mb-4">Discount Ceiling Matrix</p>
          <table className="w-full text-[10px]">
            <thead>
              <tr className="border-b border-slate-700">
                <th className="text-left py-2 text-slate-400 font-medium">Segment</th>
                <th className="text-center py-2 text-slate-400 font-medium">NA</th>
                <th className="text-center py-2 text-slate-400 font-medium">EU</th>
                <th className="text-center py-2 text-slate-400 font-medium">APAC</th>
              </tr>
            </thead>
            <tbody>
              {matrix.map((row, idx) => (
                <tr key={idx} className="border-b border-slate-700/50 last:border-0">
                  <td className="py-2 text-slate-300 font-medium">{row.segment}</td>
                  <td className="text-center py-2 text-emerald-400">{row.NA}</td>
                  <td className="text-center py-2 text-emerald-400">{row.EU}</td>
                  <td className="text-center py-2 text-amber-400">{row.APAC}</td>
                </tr>
              ))}
              {matrix.length === 0 && (
                <tr>
                  <td colSpan="4" className="py-4 text-center text-slate-500 italic">No matrix data available</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Model Health */}
        <div className="bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-xl p-5">
          <p className="text-xs uppercase tracking-wider text-slate-400 font-bold mb-4">Model Health</p>
          <div className="space-y-4">
            {Object.entries(health).map(([name, r2]) => (
              <div key={name}>
                <div className="flex justify-between items-center mb-1.5">
                  <span className="text-[10px] text-slate-400">{name}</span>
                  <span className="text-xs font-black text-emerald-400">{r2.toFixed(2)}</span>
                </div>
                <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-emerald-500 transition-all duration-1000" 
                    style={{ width: `${r2 * 100}%` }}
                  ></div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-xl p-5">
          <p className="text-xs uppercase tracking-wider text-slate-400 font-bold mb-4">Quick Actions</p>
          <div className="grid grid-cols-1 gap-2">
            <button 
              onClick={() => onNavigate('deal-scorer')}
              className="w-full bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 font-bold py-2.5 rounded-lg text-xs transition-all border border-indigo-500/20 flex items-center justify-center gap-2"
            >
              <Zap size={14} />
              Score Deal
            </button>
            <button 
              onClick={() => onNavigate('personas')}
              className="w-full bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 font-bold py-2.5 rounded-lg text-xs transition-all border border-indigo-500/20 flex items-center justify-center gap-2"
            >
              <FileText size={14} />
              View Personas
            </button>
            <button 
              onClick={handleExport}
              className="w-full bg-slate-800 hover:bg-slate-700 text-white font-bold py-2.5 rounded-lg text-xs transition-all border border-slate-700 flex items-center justify-center gap-2"
            >
              <Download size={14} />
              Export Report
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

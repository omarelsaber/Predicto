import { useState } from 'react';
import {
  ComposedChart, LineChart, BarChart, Line, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceArea
} from 'recharts';
import { TrendingUp, AlertTriangle, Download, Zap, FileText } from 'lucide-react';

export default function RevenueOverview() {
  const [query, setQuery] = useState('');

  // Forecast data - 15 months with 3 segments
  const forecastData = [
    { month: 'Oct 23', Enterprise: 24000, SMB: 8500, Strategic: 5200 },
    { month: 'Nov 23', Enterprise: 26500, SMB: 9100, Strategic: 5800 },
    { month: 'Dec 23', Enterprise: 28200, SMB: 9400, Strategic: 6200 },
    { month: 'Jan 24', Enterprise: 25800, SMB: 8900, Strategic: 5900 },
    { month: 'Feb 24', Enterprise: 27300, SMB: 9200, Strategic: 6100 },
    { month: 'Mar 24', Enterprise: 29500, SMB: 9800, Strategic: 6500 },
    { month: 'Apr 24', Enterprise: 31200, SMB: 10200, Strategic: 6800 },
    { month: 'May 24', Enterprise: 32100, SMB: 10500, Strategic: 7100 },
    { month: 'Jun 24', Enterprise: 30800, SMB: 10100, Strategic: 6900 },
    { month: 'Jul 24', Enterprise: 33400, SMB: 10900, Strategic: 7400 },
    { month: 'Aug 24', Enterprise: 35200, SMB: 11300, Strategic: 7700 },
    { month: 'Sep 24', Enterprise: 36800, SMB: 11800, Strategic: 8000 },
    // Forecast
    { month: 'Oct 24', Enterprise: 38200, SMB: 12200, Strategic: 8300, isForecast: true },
    { month: 'Nov 24', Enterprise: 39600, SMB: 12600, Strategic: 8600, isForecast: true },
    { month: 'Dec 24', Enterprise: 41200, SMB: 13100, Strategic: 8900, isForecast: true }
  ];

  // Sparkline data for KPI trends
  const sparklineRevenue = [
    { value: 52000 }, { value: 54500 }, { value: 51200 },
    { value: 56800 }, { value: 58200 }, { value: 61200 }
  ];

  return (
    <div className="space-y-6">
      {/* Row 1: KPI Bar */}
      <div className="grid grid-cols-3 gap-5">
        {/* KPI 1: Revenue */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-xs uppercase tracking-wider text-slate-400 font-bold">Next Quarter Revenue</p>
              <p className="text-4xl font-black text-white mt-2">$61.2k</p>
            </div>
            <div className="flex items-center gap-1 bg-emerald-500/15 text-emerald-400 text-xs font-bold px-2 py-1 rounded">
              <TrendingUp size={12} />
              +12%
            </div>
          </div>
          <div className="h-12">
            <ResponsiveContainer width="100%" height="100%">
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
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <p className="text-xs uppercase tracking-wider text-slate-400 font-bold">Portfolio Margin Health</p>
          <p className="text-4xl font-black text-emerald-400 mt-2">18.4%</p>
          <div className="mt-4 h-2 bg-slate-800 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-emerald-500 to-emerald-600 w-[73%]"></div>
          </div>
          <p className="text-xs text-slate-400 mt-2">Target: 25%</p>
        </div>

        {/* KPI 3: Risk Alerts */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <div className="flex justify-between items-start mb-4">
            <p className="text-xs uppercase tracking-wider text-slate-400 font-bold">Risk Alerts</p>
            <AlertTriangle size={16} className="text-rose-500" />
          </div>
          <p className="text-4xl font-black text-rose-400 mt-2">23</p>
          <p className="text-xs text-slate-400 mt-2">Deals at margin cliff</p>
          <p className="text-xs text-amber-400 font-medium mt-1">+$1.2M recovery opportunity</p>
        </div>
      </div>

      {/* Row 2: Forecast Chart + AI Panel */}
      <div className="grid grid-cols-3 gap-5">
        {/* Forecast Chart */}
        <div className="col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-6">
          <h3 className="text-sm font-bold text-white mb-4">15-Month Revenue Forecast</h3>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
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
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 flex flex-col">
          <h3 className="text-sm font-bold text-white mb-4">AI Analyst</h3>
          <div className="bg-slate-800/50 rounded-lg p-4 mb-4 flex-1 text-sm text-slate-300 border border-slate-700/50">
            <p className="text-xs text-slate-400 mb-2">Latest insight:</p>
            <p>Enterprise segment shows +15% growth momentum. Consider increasing capacity to capture market opportunity.</p>
          </div>
          <textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ask a question..."
            className="w-full bg-slate-800/50 border border-slate-700 rounded-lg p-2.5 text-sm text-slate-200 placeholder-slate-500 resize-none focus:outline-none focus:ring-1 focus:ring-indigo-500 mb-3"
            rows="3"
          />
          <button className="w-full bg-indigo-500 hover:bg-indigo-600 text-white font-medium py-2.5 rounded-lg transition-colors text-sm">
            Generate Insight
          </button>
        </div>
      </div>

      {/* Row 3: Discount Matrix + Model Health + Actions */}
      <div className="grid grid-cols-3 gap-5">
        {/* Discount Ceiling Matrix */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <p className="text-xs uppercase tracking-wider text-slate-400 font-bold mb-4">Discount Ceiling Matrix</p>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-700">
                <th className="text-left py-2 text-slate-400 font-medium">Segment</th>
                <th className="text-center py-2 text-slate-400 font-medium">NA</th>
                <th className="text-center py-2 text-slate-400 font-medium">EU</th>
                <th className="text-center py-2 text-slate-400 font-medium">APAC</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-slate-700/50">
                <td className="py-2 text-slate-300">Enterprise</td>
                <td className="text-center py-2 text-emerald-400">8%</td>
                <td className="text-center py-2 text-emerald-400">10%</td>
                <td className="text-center py-2 text-amber-400">15%</td>
              </tr>
              <tr className="border-b border-slate-700/50">
                <td className="py-2 text-slate-300">SMB</td>
                <td className="text-center py-2 text-amber-400">20%</td>
                <td className="text-center py-2 text-amber-400">18%</td>
                <td className="text-center py-2 text-rose-400">25%</td>
              </tr>
              <tr>
                <td className="py-2 text-slate-300">Strategic</td>
                <td className="text-center py-2 text-rose-400">28%</td>
                <td className="text-center py-2 text-rose-400">30%</td>
                <td className="text-center py-2 text-rose-400">35%</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Model Health */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <p className="text-xs uppercase tracking-wider text-slate-400 font-bold mb-4">Model Health</p>
          <div className="space-y-3">
            <div>
              <div className="flex justify-between items-center mb-1">
                <span className="text-xs text-slate-400">Margin Engine</span>
                <span className="text-sm font-bold text-emerald-400">0.94</span>
              </div>
              <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 w-[94%]"></div>
              </div>
            </div>
            <div>
              <div className="flex justify-between items-center mb-1">
                <span className="text-xs text-slate-400">Forecast Model</span>
                <span className="text-sm font-bold text-emerald-400">0.89</span>
              </div>
              <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 w-[89%]"></div>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <p className="text-xs uppercase tracking-wider text-slate-400 font-bold mb-4">Quick Actions</p>
          <div className="space-y-2">
            <button className="w-full bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-400 font-medium py-2 rounded-lg text-sm transition-colors border border-indigo-500/30 flex items-center justify-center gap-2">
              <Zap size={14} />
              Score Deal
            </button>
            <button className="w-full bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-400 font-medium py-2 rounded-lg text-sm transition-colors border border-indigo-500/30">
              View Personas
            </button>
            <button className="w-full bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-400 font-medium py-2 rounded-lg text-sm transition-colors border border-indigo-500/30 flex items-center justify-center gap-2">
              <Download size={14} />
              Export Report
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

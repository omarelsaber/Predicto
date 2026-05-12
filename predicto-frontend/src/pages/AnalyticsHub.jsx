import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ResponsiveContainer,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { Calendar, Download } from 'lucide-react';
import { mockForecastData, mockSegmentData, mockRadarData, mockAnalyticsMetrics } from '../data/mockAnalyticsData';

const ChartCard = ({ title, children, className = '' }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true, amount: 0.3 }}
    transition={{ duration: 0.5 }}
    className={`bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-[0_0_15px_rgba(99,102,241,0.1)] hover:border-slate-700 hover:shadow-[0_0_20px_rgba(99,102,241,0.15)] transition-all ${className}`}
  >
    <h3 className="text-lg font-bold text-white mb-6">{title}</h3>
    {children}
  </motion.div>
);

const MetricCard = ({ label, value, change, color }) => (
  <motion.div
    initial={{ opacity: 0, scale: 0.95 }}
    whileInView={{ opacity: 1, scale: 1 }}
    viewport={{ once: true }}
    transition={{ duration: 0.4 }}
    className="bg-slate-800/40 border border-slate-700/50 rounded-lg p-4"
  >
    <p className="text-sm text-slate-400 mb-1">{label}</p>
    <p className={`text-2xl font-bold ${color}`}>{value}</p>
    {change && <p className={`text-xs mt-2 ${change.includes('+') ? 'text-emerald-400' : 'text-rose-400'}`}>{change}</p>}
  </motion.div>
);

export default function AnalyticsHub() {
  const [timeRange, setTimeRange] = useState('12m');
  const [selectedSegment, setSelectedSegment] = useState('all');

  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-slate-950 to-slate-900 px-6 py-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="mb-12"
      >
        <h1 className="text-4xl font-black text-white mb-2">Analytics Hub</h1>
        <p className="text-slate-400">Real-time revenue insights and forecasts</p>
      </motion.div>

      {/* Controls */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="flex flex-col sm:flex-row gap-4 mb-12 items-start sm:items-center justify-between"
      >
        <div className="flex gap-3">
          {['3m', '6m', '12m', 'YTD'].map((range) => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              className={`px-4 py-2 rounded-lg font-medium transition-all ${
                timeRange === range
                  ? 'bg-indigo-500 text-white shadow-[0_0_15px_rgba(99,102,241,0.5)]'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {range}
            </button>
          ))}
        </div>

        <button className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-slate-300 rounded-lg hover:bg-slate-700 transition-all">
          <Download size={18} />
          Export
        </button>
      </motion.div>

      {/* Key Metrics */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.2 }}
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-12"
      >
        <MetricCard label="Total Revenue" value={mockAnalyticsMetrics.totalRevenue} change={mockAnalyticsMetrics.revenueGrowth} color="text-indigo-400" />
        <MetricCard label="Avg Deal Size" value={mockAnalyticsMetrics.avgDealSize} change="+12.5%" color="text-purple-400" />
        <MetricCard label="Conversion Rate" value={mockAnalyticsMetrics.conversionRate} color="text-pink-400" />
        <MetricCard label="Account Health" value={mockAnalyticsMetrics.accountHealth} color="text-emerald-400" />
      </motion.div>

      {/* Charts Grid */}
      <div className="space-y-8 max-w-7xl mx-auto">
        {/* Forecast Chart - Full Width */}
        <ChartCard title="12-Month Revenue Forecast by Segment" className="lg:col-span-2">
          <div className="h-96 -mx-6 -mb-6">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={mockForecastData} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
                <defs>
                  <linearGradient id="colorEnterprise" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorMidmarket" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#a855f7" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#a855f7" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                <XAxis dataKey="month" stroke="#64748b" fontSize={12} />
                <YAxis stroke="#64748b" fontSize={12} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    borderColor: '#475569',
                    borderRadius: '8px',
                    color: '#e2e8f0',
                  }}
                  formatter={(value) => [`$${value.toLocaleString()}`, '']}
                  cursor={{ stroke: '#475569' }}
                />
                <Legend wrapperStyle={{ color: '#cbd5e1' }} />
                <Line type="monotone" dataKey="enterprise" stroke="#6366f1" strokeWidth={2.5} dot={false} isAnimationActive={true} />
                <Line type="monotone" dataKey="midmarket" stroke="#a855f7" strokeWidth={2.5} dot={false} isAnimationActive={true} />
                <Line type="monotone" dataKey="smb" stroke="#ec4899" strokeWidth={2.5} dot={false} isAnimationActive={true} />
                <Line type="monotone" dataKey="growth" stroke="#f59e0b" strokeWidth={2} dot={false} isAnimationActive={true} strokeDasharray="5 5" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        {/* Two-Column Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Segment Distribution */}
          <ChartCard title="Segment Revenue Distribution">
            <div className="h-80 -mx-6 -mb-6">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={mockSegmentData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={120}
                    paddingAngle={2}
                    dataKey="value"
                    isAnimationActive={true}
                  >
                    {mockSegmentData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0f172a',
                      borderColor: '#475569',
                      borderRadius: '8px',
                      color: '#e2e8f0',
                    }}
                    formatter={(value) => `${value}%`}
                  />
                  <Legend wrapperStyle={{ paddingTop: '20px', color: '#cbd5e1' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          {/* Persona Radar */}
          <ChartCard title="Persona Comparison">
            <div className="h-80 -mx-6 -mb-6">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={mockRadarData}>
                  <PolarGrid strokeDasharray="3 3" stroke="#334155" />
                  <PolarAngleAxis dataKey="metric" stroke="#64748b" fontSize={12} />
                  <PolarRadiusAxis angle={90} domain={[0, 100]} stroke="#64748b" fontSize={12} />
                  <Radar name="Fortune 500 VP" dataKey="Fortune 500 VP" stroke="#6366f1" fill="#6366f1" fillOpacity={0.25} isAnimationActive={true} />
                  <Radar name="Unicorn CFO" dataKey="Unicorn CFO" stroke="#a855f7" fill="#a855f7" fillOpacity={0.25} isAnimationActive={true} />
                  <Radar name="Regional CEO" dataKey="Regional CEO" stroke="#ec4899" fill="#ec4899" fillOpacity={0.25} isAnimationActive={true} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0f172a',
                      borderColor: '#475569',
                      borderRadius: '8px',
                      color: '#e2e8f0',
                    }}
                  />
                  <Legend wrapperStyle={{ paddingTop: '20px', color: '#cbd5e1' }} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
        </div>

        {/* Summary Insights */}
        <ChartCard title="Key Insights">
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="space-y-4"
          >
            <div className="flex gap-4 items-start p-4 bg-indigo-500/10 border border-indigo-500/30 rounded-lg">
              <div className="w-2 h-2 rounded-full bg-indigo-400 mt-1.5 flex-shrink-0" />
              <div>
                <p className="text-white font-semibold">Enterprise Segment Performance</p>
                <p className="text-slate-300 text-sm mt-1">Growing at 18.5% MoM with strong retention. 3 new Fortune 500 logos added this month.</p>
              </div>
            </div>
            <div className="flex gap-4 items-start p-4 bg-purple-500/10 border border-purple-500/30 rounded-lg">
              <div className="w-2 h-2 rounded-full bg-purple-400 mt-1.5 flex-shrink-0" />
              <div>
                <p className="text-white font-semibold">Unicorn CFO Expansion</p>
                <p className="text-slate-300 text-sm mt-1">Experiencing explosive 52% growth driven by venture funding surge and product-market fit improvements.</p>
              </div>
            </div>
            <div className="flex gap-4 items-start p-4 bg-pink-500/10 border border-pink-500/30 rounded-lg">
              <div className="w-2 h-2 rounded-full bg-pink-400 mt-1.5 flex-shrink-0" />
              <div>
                <p className="text-white font-semibold">SMB Segment Risk</p>
                <p className="text-slate-300 text-sm mt-1">Margin compression of -12.5% YoY. Recommend tiered pricing strategy and value-add bundling.</p>
              </div>
            </div>
          </motion.div>
        </ChartCard>
      </div>
    </div>
  );
}

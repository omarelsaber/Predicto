import { useState, useEffect } from 'react';
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
import { Calendar, Download, Loader2 } from 'lucide-react';
import api from '../api';

const ChartCard = ({ title, children, className = '' }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true, amount: 0.3 }}
    transition={{ duration: 0.5 }}
    className={`bg-transparent backdrop-blur-xl border border-white/10 rounded-xl p-6 shadow-[0_0_15px_rgba(99,102,241,0.1)] hover:border-slate-700 hover:shadow-[0_0_20px_rgba(99,102,241,0.15)] transition-all ${className}`}
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
    className="bg-transparent backdrop-blur-xl border border-white/5 rounded-lg p-4"
  >
    <p className="text-sm text-slate-400 mb-1">{label}</p>
    <p className={`text-2xl font-bold ${color}`}>{value}</p>
    {change && <p className={`text-xs mt-2 ${change.includes('+') ? 'text-emerald-400' : 'text-rose-400'}`}>{change}</p>}
  </motion.div>
);

export default function AnalyticsHub() {
  const [timeRange, setTimeRange] = useState('12m');
  const [revenueData, setRevenueData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await api.get('/revenue/overview');
        setRevenueData(res.data);
      } catch (err) {
        console.error('Failed to fetch analytics data:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="h-[60vh] flex flex-col items-center justify-center text-slate-400">
        <Loader2 className="w-10 h-10 animate-spin text-indigo-500 mb-4" />
        <p className="text-lg font-medium">Processing analytical engine...</p>
      </div>
    );
  }

  // Map backend data to UI
  const rawForecastData = revenueData?.forecast_data || [];
  
  // Filtering logic for the main chart
  const getFilteredForecast = () => {
    if (!rawForecastData.length) return [];
    
    // Split into history and forecast
    const history = rawForecastData.filter(d => !d.isForecast);
    const forecast = rawForecastData.filter(d => d.isForecast);
    
    let slicedHistory = history;
    if (timeRange === '3m') slicedHistory = history.slice(-3);
    else if (timeRange === '6m') slicedHistory = history.slice(-6);
    else if (timeRange === '12m') slicedHistory = history.slice(-12);
    else if (timeRange === 'YTD') {
      const currentYear = new Date().getFullYear();
      slicedHistory = history.filter(d => d.month.includes(currentYear.toString().slice(-2)));
    }
    
    return [...slicedHistory, ...forecast];
  };

  const forecastData = getFilteredForecast();
  
  const segmentData = revenueData?.segment_distribution || [
    { name: 'Mid-Market', value: 45, color: '#6366f1' },
    { name: 'Enterprise', value: 35, color: '#a855f7' },
    { name: 'Small Business', value: 20, color: '#ec4899' }
  ];
  
  const radarData = revenueData?.persona_metrics || [];
  
  const metrics = {
    totalRevenue: revenueData?.next_quarter_revenue || "$0.0k",
    revenueGrowth: revenueData?.revenue_growth || "+0%",
    avgDealSize: revenueData?.avg_deal_size || "$0k",
    conversionRate: revenueData?.conversion_rate || "0%",
    accountHealth: `${revenueData?.portfolio_margin_health || 0}%`
  };

  return (
    <div className="min-h-screen w-full bg-transparent px-6 py-8 relative">
      <video 
        autoPlay 
        loop 
        muted 
        playsInline 
        className="fixed inset-0 w-full h-full object-cover -z-20"
        src="/analytics-bg.mp4"
      />

      <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-[3px] -z-10"></div>

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
                  : 'bg-white/5 backdrop-blur-md text-slate-300 hover:bg-white/10 border border-white/5'
              }`}
            >
              {range}
            </button>
          ))}
        </div>

        <button className="flex items-center gap-2 px-4 py-2 bg-white/5 backdrop-blur-md text-slate-300 rounded-lg hover:bg-white/10 border border-white/5 transition-all">
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
        <MetricCard label="Next Quarter Revenue" value={metrics.totalRevenue} change={metrics.revenueGrowth} color="text-indigo-400" />
        <MetricCard label="Avg Deal Size" value={metrics.avgDealSize} change="+12.5%" color="text-purple-400" />
        <MetricCard label="Conversion Rate" value={metrics.conversionRate} color="text-pink-400" />
        <MetricCard label="Portfolio Margin" value={metrics.accountHealth} color="text-emerald-400" />
      </motion.div>

      {/* Charts Grid */}
      <div className="space-y-8 max-w-7xl mx-auto">
        {/* Forecast Chart - Full Width */}
        <ChartCard title="Revenue Forecast by Segment" className="lg:col-span-2">
          <div className="w-full h-96 relative">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
              <LineChart data={forecastData} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
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
                    backgroundColor: 'rgba(15, 23, 42, 0.9)',
                    backdropFilter: 'blur(12px)',
                    borderColor: 'rgba(255, 255, 255, 0.1)',
                    borderRadius: '12px',
                    color: '#e2e8f0',
                  }}
                  formatter={(value) => [`$${value.toLocaleString()}`, '']}
                  cursor={{ stroke: '#475569' }}
                />
                <Legend wrapperStyle={{ color: '#cbd5e1' }} />
                <Line type="monotone" dataKey="Enterprise" stroke="#6366f1" strokeWidth={2.5} dot={false} isAnimationActive={true} />
                <Line type="monotone" dataKey="SMB" stroke="#a855f7" strokeWidth={2.5} dot={false} isAnimationActive={true} />
                <Line type="monotone" dataKey="Strategic" stroke="#ec4899" strokeWidth={2.5} dot={false} isAnimationActive={true} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        {/* Two-Column Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Segment Distribution */}
          <ChartCard title="Segment Revenue Distribution">
            <div className="w-full h-80 relative">
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                <PieChart>
                  <Pie
                    data={segmentData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={120}
                    paddingAngle={2}
                    dataKey="value"
                    isAnimationActive={true}
                  >
                    {segmentData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color || (index === 0 ? '#6366f1' : index === 1 ? '#a855f7' : '#ec4899')} />
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
            <div className="w-full h-80 relative">
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                <RadarChart data={radarData}>
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

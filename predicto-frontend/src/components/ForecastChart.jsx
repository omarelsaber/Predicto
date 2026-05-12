import { ResponsiveContainer, AreaChart, XAxis, YAxis, Tooltip, Area, CartesianGrid } from 'recharts';

export default function ForecastChart({ data }) {
  if (!data || !data.segments || data.segments.length === 0) {
    return (
      <div className="bg-[#0f172a] border border-gray-800 p-6 rounded-xl shadow-[0_0_15px_rgba(59,130,246,0.05)] h-full flex flex-col items-center justify-center min-h-[300px]">
        <p className="text-gray-500 font-medium">No forecast data available</p>
      </div>
    );
  }

  const chartData = data.segments.map(seg => ({
    name: seg.segment,
    revenue: Math.round(seg.next_period_revenue),
    lower: Math.round(seg.confidence_lower),
    upper: Math.round(seg.confidence_upper),
  }));

  return (
    <div className="bg-[#0f172a] border border-gray-800 p-6 rounded-xl shadow-[0_0_15px_rgba(59,130,246,0.05)] h-full min-h-[350px] flex flex-col">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-white">Segment Revenue Forecast</h3>
        <span className="text-xs bg-gray-800 text-gray-300 font-medium px-2.5 py-1 rounded shadow-inner">
          Next {data.periods_ahead} Periods
        </span>
      </div>
      <div className="flex-1 w-full min-h-[250px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4}/>
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
            <XAxis dataKey="name" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} dy={10} />
            <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(val) => `$${(val/1000).toFixed(0)}k`} dx={-10} />
            <Tooltip 
              contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', color: '#e2e8f0', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.5)' }}
              itemStyle={{ color: '#e2e8f0', fontWeight: 'bold' }}
              formatter={(value) => [`$${value.toLocaleString()}`, 'Revenue']}
              cursor={{ stroke: '#334155', strokeWidth: 1, strokeDasharray: '5 5' }}
            />
            <Area type="monotone" dataKey="revenue" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorRev)" activeDot={{ r: 6, fill: '#3b82f6', stroke: '#0f172a', strokeWidth: 2 }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

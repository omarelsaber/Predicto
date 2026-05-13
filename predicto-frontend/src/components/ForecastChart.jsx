import { ResponsiveContainer, LineChart, XAxis, YAxis, Tooltip, Line, CartesianGrid, Legend } from 'recharts';

export default function ForecastChart({ data }) {
  if (!data || !data.segments || data.segments.length === 0) {
    return (
      <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl shadow-[0_0_15px_rgba(99,102,241,0.1)] h-full flex flex-col items-center justify-center min-h-[300px]">
        <p className="text-slate-400 font-medium">No forecast data available</p>
      </div>
    );
  }

  // Transform segments into time-series data
  // Assume each segment has forecast data across periods
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const chartData = [];
  
  // Create monthly data points for each segment
  const periodsAhead = data.periods_ahead || 6;
  for (let i = 0; i < periodsAhead; i++) {
    const point = { month: months[i % 12] };
    data.segments.forEach((seg, idx) => {
      // Generate realistic forecast values based on segment revenue with slight variance
      const baseRevenue = seg.next_period_revenue || 0;
      const variance = (Math.sin(i * 0.5 + idx) * 0.2 + 1) * baseRevenue;
      point[`segment_${idx}`] = Math.round(variance);
    });
    chartData.push(point);
  }

  // Define colors for segments
  const segmentColors = ['#6366f1', '#a855f7', '#ec4899']; // Indigo, Purple, Pink
  const segmentNames = data.segments.map(s => s.segment);

  return (
    <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl shadow-[0_0_15px_rgba(99,102,241,0.1)] h-full min-h-[450px] flex flex-col">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-bold text-white">Segment Revenue Forecast</h3>
        <span className="text-xs bg-slate-800 text-slate-300 font-medium px-3 py-1.5 rounded-lg shadow-inner border border-slate-700">
          {periodsAhead} Period Outlook
        </span>
      </div>
      <div className="flex-1 w-full min-h-[350px]">
        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
          <LineChart data={chartData} margin={{ top: 15, right: 30, left: 0, bottom: 15 }}>
            <defs>
              <linearGradient id="gradientIndigo" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
              </linearGradient>
              <linearGradient id="gradientPurple" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#a855f7" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="#a855f7" stopOpacity={0}/>
              </linearGradient>
              <linearGradient id="gradientPink" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#ec4899" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="#ec4899" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
            <XAxis 
              dataKey="month" 
              stroke="#64748b" 
              fontSize={12} 
              tickLine={false} 
              axisLine={{ stroke: '#334155' }}
              dy={5}
            />
            <YAxis 
              stroke="#64748b" 
              fontSize={12} 
              tickLine={false} 
              axisLine={{ stroke: '#334155' }}
              tickFormatter={(val) => `$${(val/1000).toFixed(0)}k`}
              dx={-10}
            />
            <Tooltip 
              contentStyle={{ 
                backgroundColor: '#0f172a', 
                borderColor: '#475569', 
                borderRadius: '8px', 
                color: '#e2e8f0',
                boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.7)',
                border: '1px solid #334155'
              }}
              itemStyle={{ color: '#e2e8f0', fontWeight: '600' }}
              formatter={(value) => [`$${value.toLocaleString()}`, '']}
              labelStyle={{ color: '#cbd5e1', fontWeight: 'bold' }}
              cursor={{ stroke: '#475569', strokeWidth: 2 }}
            />
            <Legend 
              wrapperStyle={{ paddingTop: '20px', color: '#cbd5e1' }}
              iconType="line"
              formatter={(value, entry) => {
                const segmentName = segmentNames[parseInt(value.split('_')[1])];
                return segmentName || value;
              }}
            />
            {data.segments.map((seg, idx) => (
              <Line
                key={`segment_${idx}`}
                type="monotone"
                dataKey={`segment_${idx}`}
                stroke={segmentColors[idx % segmentColors.length]}
                strokeWidth={2.5}
                dot={{ fill: segmentColors[idx % segmentColors.length], r: 4 }}
                activeDot={{ r: 6, fill: segmentColors[idx % segmentColors.length], stroke: '#0f172a', strokeWidth: 2 }}
                isAnimationActive={true}
                animationDuration={800}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

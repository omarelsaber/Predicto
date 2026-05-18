import KpiCard from './KpiCard';
import { Card, CardHeader, CardTitle, CardContent } from './ui/Card';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

// Mock data for Revenue Forecast Chart
const revenueData = [
  { month: 'Jan', historical: 3800, forecasted: 3800, confidence: 3900 },
  { month: 'Feb', historical: 4100, forecasted: 4100, confidence: 4200 },
  { month: 'Mar', historical: 4300, forecasted: 4300, confidence: 4500 },
  { month: 'Apr', historical: 4200, forecasted: 4200, confidence: 4600 },
  { month: 'May', historical: 4500, forecasted: 4500, confidence: 4800 },
  { month: 'Jun', historical: 4200, forecasted: 4200, confidence: 4700 },
  { month: 'Jul', historical: null, forecasted: 4600, confidence: 5100 },
  { month: 'Aug', historical: null, forecasted: 4800, confidence: 5400 },
  { month: 'Sep', historical: null, forecasted: 5000, confidence: 5700 },
  { month: 'Oct', historical: null, forecasted: 5200, confidence: 6000 },
];

// Mock data for Persona Map (Scatter plot)
const personaData = [
  { name: 'Champions', arr: 500, churnRisk: 5, value: 45 },
  { name: 'Champions', arr: 580, churnRisk: 8, value: 52 },
  { name: 'Champions', arr: 620, churnRisk: 3, value: 58 },
  { name: 'Champions', arr: 450, churnRisk: 6, value: 42 },
  { name: 'At-Risk', arr: 280, churnRisk: 35, value: 28 },
  { name: 'At-Risk', arr: 320, churnRisk: 42, value: 35 },
  { name: 'At-Risk', arr: 250, churnRisk: 38, value: 25 },
  { name: 'Growth', arr: 350, churnRisk: 15, value: 38 },
  { name: 'Growth', arr: 400, churnRisk: 18, value: 44 },
  { name: 'Growth', arr: 380, churnRisk: 12, value: 40 },
  { name: 'Established', arr: 650, churnRisk: 10, value: 60 },
  { name: 'Established', arr: 720, churnRisk: 8, value: 68 },
];

// KPI data
const kpiData = [
  { title: 'Total ARR', value: '$4.2M', trend: 8.5, confidence: 'HIGH' as const, unit: 'USD' },
  { title: 'MRR Growth', value: '+3.2%', trend: 2.1, confidence: 'HIGH' as const },
  { title: 'Churn Rate', value: '8.4%', trend: -1.2, confidence: 'MEDIUM' as const },
  { title: 'Win Rate', value: '68%', trend: 5.3, confidence: 'HIGH' as const },
  { title: 'NPS Avg', value: '7.1', trend: 0.8, confidence: 'LOW' as const },
];

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-slate-800 border border-slate-700 rounded p-2 text-xs text-slate-200">
        <p className="font-medium">{label}</p>
        {payload.map((entry: any, index: number) => (
          <p key={index} style={{ color: entry.color }}>
            {entry.name}: {entry.value}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

export default function IntelligenceHubView() {
  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="border-b border-slate-700 pb-6">
        <h1 className="text-3xl font-bold text-slate-50">Intelligence Hub</h1>
        <p className="text-slate-400 mt-2">Real-time portfolio overview and revenue forecasting.</p>
      </div>

      {/* Zone A: KPI Strip */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {kpiData.map((kpi, index) => (
          <KpiCard
            key={index}
            title={kpi.title}
            value={kpi.value}
            trend={kpi.trend}
            confidence={kpi.confidence}
            unit={kpi.unit}
          />
        ))}
      </div>

      {/* Zone B & C: Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Revenue Forecast Chart (60%) */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Revenue Forecast</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={350}>
                <AreaChart data={revenueData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="confidenceBand" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.1} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="month" stroke="#94a3b8" style={{ fontSize: '12px' }} />
                  <YAxis stroke="#94a3b8" style={{ fontSize: '12px' }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ paddingTop: '20px' }} />
                  <Area
                    type="monotone"
                    dataKey="confidence"
                    fill="url(#confidenceBand)"
                    stroke="none"
                    name="Confidence Band"
                  />
                  <Line
                    type="monotone"
                    dataKey="historical"
                    stroke="#818cf8"
                    strokeWidth={2}
                    dot={false}
                    name="Historical MRR"
                  />
                  <Line
                    type="monotone"
                    dataKey="forecasted"
                    stroke="#10b981"
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    dot={false}
                    name="Forecasted MRR"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* Right: Persona Map (40%) */}
        <div>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Persona Map</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={350}>
                <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis
                    type="number"
                    dataKey="arr"
                    name="ARR ($K)"
                    stroke="#94a3b8"
                    style={{ fontSize: '12px' }}
                  />
                  <YAxis
                    type="number"
                    dataKey="churnRisk"
                    name="Churn Risk (%)"
                    stroke="#94a3b8"
                    style={{ fontSize: '12px' }}
                  />
                  <Tooltip
                    cursor={{ strokeDasharray: '3 3' }}
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        return (
                          <div className="bg-slate-800 border border-slate-700 rounded p-2 text-xs text-slate-200">
                            <p className="font-medium">{data.name}</p>
                            <p>ARR: ${data.arr}K</p>
                            <p>Churn Risk: {data.churnRisk}%</p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Scatter name="Champions" dataKey="value" data={personaData.filter(p => p.name === 'Champions')} fill="#10b981" opacity={0.8} />
                  <Scatter name="At-Risk" dataKey="value" data={personaData.filter(p => p.name === 'At-Risk')} fill="#ef4444" opacity={0.8} />
                  <Scatter name="Growth" dataKey="value" data={personaData.filter(p => p.name === 'Growth')} fill="#f59e0b" opacity={0.8} />
                  <Scatter name="Established" dataKey="value" data={personaData.filter(p => p.name === 'Established')} fill="#3b82f6" opacity={0.8} />
                </ScatterChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

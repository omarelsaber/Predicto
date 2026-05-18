import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../../../components/ui/Card';
import {
  ScatterChart,
  Scatter,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';

// Mock heterogeneity data (CATE by segment)
const heterogeneityData = [
  { x: 250, y: -18, r: 45, segment: 'Enterprise', quadrant: 'HIGH_RESPONDERS' },
  { x: 180, y: -14, r: 38, segment: 'Mid-Market', quadrant: 'HIGH_RESPONDERS' },
  { x: 95, y: -8, r: 28, segment: 'SMB', quadrant: 'LOW' },
  { x: 320, y: 2, r: 35, segment: 'Churn Risk', quadrant: 'NEGATIVE_RESPONDERS' },
  { x: 150, y: -11, r: 32, segment: 'Growth', quadrant: 'HIGH_RESPONDERS' },
  { x: 210, y: -3, r: 25, segment: 'Stale', quadrant: 'UNCERTAIN' },
];

// Mock CATE distribution data (histogram)
const cateDistributionData = [
  { cate: '-25%', count: 12 },
  { cate: '-20%', count: 28 },
  { cate: '-15%', count: 45 },
  { cate: '-12.7%', count: 52 },
  { cate: '-10%', count: 38 },
  { cate: '-5%', count: 18 },
  { cate: '0%', count: 8 },
  { cate: '+5%', count: 3 },
];

// Mock CATE audit table data
const cateAuditData = [
  { id: 1, customer: 'TechCorp Global', segment: 'Enterprise', cate: -21.5, ci_lower: -25.2, ci_upper: -17.8 },
  { id: 2, customer: 'CloudMesh Inc', segment: 'Mid-Market', cate: -14.2, ci_lower: -17.1, ci_upper: -11.3 },
  { id: 3, customer: 'RetailPro Solutions', segment: 'Enterprise', cate: -19.8, ci_lower: -23.4, ci_upper: -16.2 },
  { id: 4, customer: 'InnovateSoft Inc', segment: 'Mid-Market', cate: -8.5, ci_lower: -12.3, ci_upper: -4.7 },
  { id: 5, customer: 'AnalyticsPlatform Co', segment: 'SMB', cate: -5.2, ci_lower: -9.1, ci_upper: -1.3 },
  { id: 6, customer: 'SecurityVault Ltd', segment: 'Enterprise', cate: -23.1, ci_lower: -26.8, ci_upper: -19.4 },
  { id: 7, customer: 'NextGen Systems', segment: 'Mid-Market', cate: -10.9, ci_lower: -14.2, ci_upper: -7.6 },
  { id: 8, customer: 'EnterpriseScale Ltd', segment: 'Enterprise', cate: -20.3, ci_lower: -24.1, ci_upper: -16.5 },
];

const getQuadrantColor = (quadrant: string) => {
  switch (quadrant) {
    case 'HIGH_RESPONDERS':
      return '#10b981';
    case 'NEGATIVE_RESPONDERS':
      return '#ef4444';
    case 'LOW':
      return '#eab308';
    case 'UNCERTAIN':
      return '#94a3b8';
    default:
      return '#6366f1';
  }
};

export default function CausalEngineView() {
  const [treatment, setTreatment] = useState('DISCOUNT_APPLIED');
  const ate = -12.7;

  const CustomScatterTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-slate-800 border border-slate-700 rounded p-2 text-xs text-slate-200">
          <p className="font-medium">{data.segment}</p>
          <p>Mean ARR: ${data.x}K</p>
          <p>CATE: {data.y}%</p>
          <p className="text-slate-400 mt-1">Quadrant: {data.quadrant}</p>
        </div>
      );
    }
    return null;
  };

  const CustomBarTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-slate-800 border border-slate-700 rounded p-2 text-xs text-slate-200">
          <p>CATE: {payload[0].payload.cate}</p>
          <p>Count: {payload[0].value}</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="border-b border-slate-700 pb-6">
        <h1 className="text-3xl font-bold text-slate-50">Causal Inference Engine</h1>
        <p className="text-slate-400 mt-2">Counterfactual analysis with heterogeneous treatment effects (CATE).</p>
      </div>

      {/* Header Controls Strip */}
      <div className="bg-slate-800 border border-slate-700 rounded-lg p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div>
            <label className="text-xs text-slate-400 block mb-2">Treatment Variable</label>
            <select
              value={treatment}
              onChange={(e) => setTreatment(e.target.value)}
              className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-slate-200 text-sm focus:outline-none focus:border-indigo-500"
            >
              <option value="DISCOUNT_APPLIED">DISCOUNT_APPLIED</option>
              <option value="CSM_INTERVENTION">CSM_INTERVENTION</option>
              <option value="PRODUCT_UPGRADE">PRODUCT_UPGRADE</option>
            </select>
          </div>
          <div className="flex items-center gap-2 px-3 py-2 bg-emerald-500/20 border border-emerald-500/50 rounded">
            <div className="w-2 h-2 bg-emerald-400 rounded-full" />
            <span className="text-sm font-semibold text-emerald-300">Engine Mode: FULL_DML</span>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs text-slate-400">Average Treatment Effect (ATE)</p>
          <p className="text-2xl font-bold text-indigo-400">{ate}%</p>
          <p className="text-xs text-slate-400 mt-1">Discounts reduce churn by {Math.abs(ate)}pp on average</p>
        </div>
      </div>

      {/* Top Section: 2-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Left: Heterogeneity Map (40%) */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Heterogeneity Map</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={350}>
                <ScatterChart margin={{ top: 10, right: 20, left: 0, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
                  <XAxis 
                    dataKey="x" 
                    type="number"
                    label={{ value: 'Mean ARR ($K)', position: 'insideBottomRight', offset: -10 }}
                    stroke="#94a3b8"
                  />
                  <YAxis 
                    dataKey="y" 
                    type="number"
                    label={{ value: 'CATE (%)', angle: -90, position: 'insideLeft' }}
                    stroke="#94a3b8"
                  />
                  <Tooltip content={<CustomScatterTooltip />} />
                  <ReferenceLine x={150} stroke="#475569" strokeDasharray="3 3" />
                  <ReferenceLine y={ate} stroke="#6366f1" strokeDasharray="3 3" label={{ value: `ATE: ${ate}%`, position: 'right', fill: '#a5b4fc' }} />
                  
                  {/* Quadrant shading via background */}
                  <Scatter
                    name="HIGH_RESPONDERS"
                    data={heterogeneityData.filter(d => d.quadrant === 'HIGH_RESPONDERS')}
                    fill="#10b981"
                    isAnimationActive={false}
                  />
                  <Scatter
                    name="NEGATIVE_RESPONDERS"
                    data={heterogeneityData.filter(d => d.quadrant === 'NEGATIVE_RESPONDERS')}
                    fill="#ef4444"
                    isAnimationActive={false}
                  />
                  <Scatter
                    name="LOW"
                    data={heterogeneityData.filter(d => d.quadrant === 'LOW')}
                    fill="#eab308"
                    isAnimationActive={false}
                  />
                  <Scatter
                    name="UNCERTAIN"
                    data={heterogeneityData.filter(d => d.quadrant === 'UNCERTAIN')}
                    fill="#94a3b8"
                    isAnimationActive={false}
                  />
                </ScatterChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* Right: ATE vs CATE Distribution (60%) */}
        <div className="lg:col-span-3">
          <Card>
            <CardHeader>
              <CardTitle>ATE vs CATE Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={350}>
                <BarChart data={cateDistributionData} margin={{ top: 10, right: 20, left: 0, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
                  <XAxis dataKey="cate" stroke="#94a3b8" />
                  <YAxis stroke="#94a3b8" label={{ value: 'Customer Count', angle: -90, position: 'insideLeft' }} />
                  <Tooltip content={<CustomBarTooltip />} />
                  <ReferenceLine x={-12.7} stroke="#10b981" strokeWidth={2} label={{ value: `Population ATE: ${ate}%`, position: 'top', fill: '#10b981' }} />
                  <Bar dataKey="count" fill="#6366f1" name="Customer Count" isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Bottom: CATE Audit Table */}
      <Card>
        <CardHeader>
          <CardTitle>CATE Audit Table</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="text-left py-3 px-4 text-slate-400 font-semibold">Customer</th>
                  <th className="text-left py-3 px-4 text-slate-400 font-semibold">Segment</th>
                  <th className="text-right py-3 px-4 text-slate-400 font-semibold">CATE Estimate</th>
                  <th className="text-right py-3 px-4 text-slate-400 font-semibold">95% CI Lower</th>
                  <th className="text-right py-3 px-4 text-slate-400 font-semibold">95% CI Upper</th>
                </tr>
              </thead>
              <tbody>
                {cateAuditData.map((row, idx) => (
                  <tr key={idx} className="border-b border-slate-700 hover:bg-slate-700/50 transition">
                    <td className="py-3 px-4 text-slate-200">{row.customer}</td>
                    <td className="py-3 px-4 text-slate-400">{row.segment}</td>
                    <td className="py-3 px-4 text-right">
                      <span className="font-semibold text-indigo-400">{row.cate.toFixed(1)}%</span>
                    </td>
                    <td className="py-3 px-4 text-right text-slate-400">{row.ci_lower.toFixed(1)}%</td>
                    <td className="py-3 px-4 text-right text-slate-400">{row.ci_upper.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

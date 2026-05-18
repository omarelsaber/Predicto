import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { AlertCircle, TrendingUp } from 'lucide-react';
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Line,
  LineChart,
} from 'recharts';

// Mock data for Deal Priority Table
const dealData = [
  {
    id: 1,
    rank: 1,
    dealName: 'Acme Corp - Enterprise Suite',
    rep: 'Sarah Chen',
    arr: 450000,
    priorityScore: 92,
    signal: 'HIGH_PRIORITY',
  },
  {
    id: 2,
    rank: 2,
    dealName: 'TechVision Inc - Platform',
    rep: 'Marcus Johnson',
    arr: 380000,
    priorityScore: 85,
    signal: 'EXPANSION',
  },
  {
    id: 3,
    rank: 3,
    dealName: 'GlobalNet Solutions - Renewal',
    rep: 'Lisa Rodriguez',
    arr: 320000,
    priorityScore: 78,
    signal: 'AT_RISK',
  },
  {
    id: 4,
    rank: 4,
    dealName: 'InnovateTech - New Deal',
    rep: 'James Wilson',
    arr: 290000,
    priorityScore: 72,
    signal: 'DISCOUNT_CLIFF',
  },
  {
    id: 5,
    rank: 5,
    dealName: 'CloudFirst Corp - Upsell',
    rep: 'Emma Davis',
    arr: 245000,
    priorityScore: 68,
    signal: 'CHURN_RISK',
  },
];

// Mock data for Rep Playbooks Pareto Chart
const paretoData = [
  { discount: 5, winRate: 92, efficiency: true },
  { discount: 8, winRate: 88, efficiency: true },
  { discount: 12, winRate: 82, efficiency: true },
  { discount: 15, winRate: 76, efficiency: false },
  { discount: 18, winRate: 68, efficiency: false },
  { discount: 22, winRate: 58, efficiency: false },
  { discount: 25, winRate: 45, efficiency: false },
  { discount: 30, winRate: 32, efficiency: false },
];

const signalConfig: Record<string, { color: string; bgColor: string; label: string }> = {
  HIGH_PRIORITY: { color: 'text-emerald-400', bgColor: 'bg-emerald-500/20', label: 'HIGH_PRIORITY' },
  EXPANSION: { color: 'text-blue-400', bgColor: 'bg-blue-500/20', label: 'EXPANSION' },
  AT_RISK: { color: 'text-yellow-400', bgColor: 'bg-yellow-500/20', label: 'AT_RISK' },
  DISCOUNT_CLIFF: { color: 'text-red-400', bgColor: 'bg-red-500/20', label: 'DISCOUNT_CLIFF' },
  CHURN_RISK: { color: 'text-red-500', bgColor: 'bg-red-500/20', label: 'CHURN_RISK' },
};

export default function PipelineView() {
  const [dealForm, setDealForm] = useState({
    segment: 'enterprise',
    product: 'platform',
    discount: 15,
  });
  const [scoredResult, setScoredResult] = useState<{ safeCeiling: number; riskLevel: string } | null>(null);

  const totalArrAtStake = dealData.reduce((sum, d) => sum + d.arr, 0);
  const highRiskDeals = dealData.filter((d) => ['AT_RISK', 'CHURN_RISK', 'DISCOUNT_CLIFF'].includes(d.signal)).length;

  const handleScoreDeal = () => {
    // Mock scoring logic
    const baseScore = dealForm.discount <= 10 ? 18 : dealForm.discount <= 15 ? 16 : dealForm.discount <= 20 ? 12 : 8;
    const adjustedScore = baseScore - (dealForm.discount - 15) * 0.5;
    const riskLevel = adjustedScore >= 16 ? 'LOW' : adjustedScore >= 12 ? 'MEDIUM' : 'HIGH';
    setScoredResult({ safeCeiling: Math.max(8, adjustedScore), riskLevel });
  };

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-slate-800 border border-slate-700 rounded p-2 text-xs text-slate-200">
          <p className="font-medium">Discount: {payload[0].payload.discount}%</p>
          <p style={{ color: '#6366f1' }}>Win Rate: {payload[0].value}%</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="border-b border-slate-700 pb-6">
        <h1 className="text-3xl font-bold text-slate-50">Pipeline & Deal Priority</h1>
        <div className="flex gap-8 mt-4">
          <div>
            <p className="text-xs text-slate-400 uppercase tracking-wide">Total ARR at Stake</p>
            <p className="text-2xl font-bold text-emerald-400 mt-1">${(totalArrAtStake / 1000000).toFixed(1)}M</p>
          </div>
          <div>
            <p className="text-xs text-slate-400 uppercase tracking-wide">High-Risk Deals</p>
            <p className="text-2xl font-bold text-red-400 mt-1">{highRiskDeals}</p>
          </div>
        </div>
      </div>

      {/* Main Grid: Deal Priority Table + Deal Scorer */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Deal Priority Table (70%) */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Deal Priority Ranking</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700">
                      <th className="text-left py-3 px-4 font-semibold text-slate-300">Rank</th>
                      <th className="text-left py-3 px-4 font-semibold text-slate-300">Deal Name</th>
                      <th className="text-left py-3 px-4 font-semibold text-slate-300">Rep</th>
                      <th className="text-right py-3 px-4 font-semibold text-slate-300">ARR</th>
                      <th className="text-left py-3 px-4 font-semibold text-slate-300">Priority Score</th>
                      <th className="text-left py-3 px-4 font-semibold text-slate-300">Signal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dealData.map((deal) => {
                      const signalConfig_ = signalConfig[deal.signal];
                      return (
                        <tr key={deal.id} className="border-b border-slate-700/50 hover:bg-slate-700/30 transition">
                          <td className="py-3 px-4 text-slate-300">{deal.rank}</td>
                          <td className="py-3 px-4 text-slate-100 font-medium">{deal.dealName}</td>
                          <td className="py-3 px-4 text-slate-400">{deal.rep}</td>
                          <td className="py-3 px-4 text-right text-emerald-400 font-semibold">
                            ${(deal.arr / 1000).toFixed(0)}K
                          </td>
                          <td className="py-3 px-4">
                            <div className="w-24 bg-slate-700 rounded-full h-2">
                              <div
                                className="bg-indigo-500 h-2 rounded-full"
                                style={{ width: `${deal.priorityScore}%` }}
                              />
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${signalConfig_.bgColor} ${signalConfig_.color}`}>
                              {signalConfig_.label}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right: Deal Scorer Panel (30%) */}
        <div>
          <Card>
            <CardHeader>
              <CardTitle>Deal Scorer</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-2">Segment</label>
                <select
                  value={dealForm.segment}
                  onChange={(e) => setDealForm({ ...dealForm, segment: e.target.value })}
                  className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-slate-100 text-sm"
                >
                  <option value="enterprise">Enterprise</option>
                  <option value="mid-market">Mid-Market</option>
                  <option value="smb">SMB</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-2">Product</label>
                <select
                  value={dealForm.product}
                  onChange={(e) => setDealForm({ ...dealForm, product: e.target.value })}
                  className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-slate-100 text-sm"
                >
                  <option value="platform">Platform</option>
                  <option value="analytics">Analytics</option>
                  <option value="integration">Integration</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-2">
                  Discount %: <span className="text-indigo-400">{dealForm.discount}%</span>
                </label>
                <input
                  type="range"
                  min="0"
                  max="35"
                  value={dealForm.discount}
                  onChange={(e) => setDealForm({ ...dealForm, discount: parseInt(e.target.value) })}
                  className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                />
              </div>

              <button
                onClick={handleScoreDeal}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 rounded-lg transition"
              >
                Score Deal
              </button>

              {scoredResult && (
                <div className="bg-slate-700/50 border border-slate-600 rounded-lg p-4 mt-4">
                  <p className="text-xs text-slate-400 mb-2">Safe Discount Ceiling</p>
                  <p className="text-2xl font-bold text-emerald-400">{scoredResult.safeCeiling.toFixed(1)}%</p>
                  <p className={`text-xs mt-2 font-medium ${
                    scoredResult.riskLevel === 'LOW'
                      ? 'text-emerald-400'
                      : scoredResult.riskLevel === 'MEDIUM'
                      ? 'text-yellow-400'
                      : 'text-red-400'
                  }`}>
                    Risk Level: {scoredResult.riskLevel}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Rep Playbooks - Pareto Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp size={20} className="text-indigo-400" />
            Rep Playbooks - Discount vs Win Rate
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={350}>
            <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
              <XAxis type="number" dataKey="discount" name="Discount %" stroke="#94a3b8" />
              <YAxis type="number" dataKey="winRate" name="Win Rate %" stroke="#94a3b8" />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              <Scatter
                name="Efficiency Frontier"
                data={paretoData.filter((d) => d.efficiency)}
                fill="#10b981"
                fillOpacity={0.8}
                isAnimationActive={false}
              />
              <Scatter
                name="Risk Zone"
                data={paretoData.filter((d) => !d.efficiency)}
                fill="#ef4444"
                fillOpacity={0.6}
                isAnimationActive={false}
              />
            </ScatterChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}

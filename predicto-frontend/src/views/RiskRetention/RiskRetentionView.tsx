import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { AlertTriangle, Mail } from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

// Mock data for Churn Warnings
const churnWarningsData = [
  { id: 1, company: 'DataFlow Systems', arr: 285000, churnProbability: 78, status: 'CRITICAL' },
  { id: 2, company: 'CloudMesh Inc', arr: 156000, churnProbability: 65, status: 'HIGH' },
  { id: 3, company: 'RetailPro Solutions', arr: 342000, churnProbability: 52, status: 'MEDIUM' },
  { id: 4, company: 'AnalyticsPlatform Co', arr: 128000, churnProbability: 48, status: 'MEDIUM' },
  { id: 5, company: 'SecurityVault Ltd', arr: 195000, churnProbability: 35, status: 'LOW' },
];

// Mock data for Expansion Candidates
const expansionData = [
  {
    id: 1,
    company: 'TechCorp Global',
    currentArr: 450000,
    expansionOpportunity: 125000,
    growth: '+27%',
  },
  {
    id: 2,
    company: 'InnovateSoft Inc',
    currentArr: 380000,
    expansionOpportunity: 98000,
    growth: '+25%',
  },
  {
    id: 3,
    company: 'EnterpriseScale Ltd',
    currentArr: 520000,
    expansionOpportunity: 156000,
    growth: '+30%',
  },
  {
    id: 4,
    company: 'NextGen Systems',
    currentArr: 285000,
    expansionOpportunity: 72000,
    growth: '+25%',
  },
  {
    id: 5,
    company: 'CloudFirst Corp',
    currentArr: 410000,
    expansionOpportunity: 102500,
    growth: '+25%',
  },
  {
    id: 6,
    company: 'DigitalTransform LLC',
    currentArr: 365000,
    expansionOpportunity: 91250,
    growth: '+25%',
  },
];

// Mock data for 9-Month Trajectory
const trajectoryData = [
  { month: 'Jan', baseCase: 4200, optimistic: 4200, pessimistic: 4200 },
  { month: 'Feb', baseCase: 4350, optimistic: 4450, pessimistic: 4150 },
  { month: 'Mar', baseCase: 4520, optimistic: 4750, pessimistic: 4080 },
  { month: 'Apr', baseCase: 4680, optimistic: 5080, pessimistic: 4000 },
  { month: 'May', baseCase: 4820, optimistic: 5420, pessimistic: 3900 },
  { month: 'Jun', baseCase: 4950, optimistic: 5790, pessimistic: 3780 },
  { month: 'Jul', baseCase: 5080, optimistic: 6180, pessimistic: 3650 },
  { month: 'Aug', baseCase: 5200, optimistic: 6600, pessimistic: 3500 },
  { month: 'Sep', baseCase: 5320, optimistic: 7050, pessimistic: 3320 },
];

const getChurnColor = (probability: number) => {
  if (probability >= 60) return { bar: 'bg-red-500', text: 'text-red-400' };
  if (probability >= 40) return { bar: 'bg-yellow-500', text: 'text-yellow-400' };
  return { bar: 'bg-emerald-500', text: 'text-emerald-400' };
};

export default function RiskRetentionView() {
  const [activeTab, setActiveTab] = useState<'churn' | 'expansion' | 'scenario'>('churn');
  const [leverControls, setLeverControls] = useState({
    discountRate: 12,
    csmIntervention: 65,
    productUpgrades: 45,
    loyaltyProgram: 38,
  });

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-slate-800 border border-slate-700 rounded p-2 text-xs text-slate-200">
          <p className="font-medium">{label}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} style={{ color: entry.color }}>
              {entry.name}: ${entry.value}K
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  const totalExpansionArr = expansionData.reduce((sum, d) => sum + d.expansionOpportunity, 0);
  const criticalChurnCount = churnWarningsData.filter((d) => d.status === 'CRITICAL').length;

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="border-b border-slate-700 pb-6">
        <h1 className="text-3xl font-bold text-slate-50">Risk & Retention</h1>
        <p className="text-slate-400 mt-2">Monitor churn risk, identify expansion opportunities, and model scenarios.</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-4 border-b border-slate-700">
        {[
          { id: 'churn', label: 'Churn Warnings', badge: criticalChurnCount },
          { id: 'expansion', label: 'Expansion Candidates', badge: expansionData.length },
          { id: 'scenario', label: 'Scenario Simulator' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`py-3 px-1 border-b-2 font-medium text-sm transition ${
              activeTab === tab.id
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-slate-300'
            }`}
          >
            {tab.label}
            {tab.badge !== undefined && (
              <span className="ml-2 inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-500/20 text-red-400 text-xs font-semibold">
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab 1: Churn Warnings */}
      {activeTab === 'churn' && (
        <div className="space-y-4">
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 flex items-start gap-3">
            <AlertTriangle size={20} className="text-red-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-red-300 font-semibold">Critical Alert</p>
              <p className="text-sm text-red-200 mt-1">{criticalChurnCount} account(s) at critical risk. Immediate CSM intervention recommended.</p>
            </div>
          </div>

          <div className="space-y-3">
            {churnWarningsData.map((item) => {
              const colors = getChurnColor(item.churnProbability);
              return (
                <Card key={item.id}>
                  <CardContent className="py-4">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex-1">
                        <h4 className="font-semibold text-slate-100">{item.company}</h4>
                        <p className="text-sm text-slate-400 mt-1">${(item.arr / 1000).toFixed(0)}K ARR</p>
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-xs text-slate-400">Churn Probability</p>
                          <p className={`text-sm font-semibold ${colors.text}`}>{item.churnProbability}%</p>
                        </div>
                        <div className="w-full bg-slate-700 rounded-full h-2">
                          <div className={`${colors.bar} h-2 rounded-full`} style={{ width: `${item.churnProbability}%` }} />
                        </div>
                      </div>
                      <button className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium rounded transition">
                        Engage CSM
                      </button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Tab 2: Expansion Candidates */}
      {activeTab === 'expansion' && (
        <div className="space-y-4">
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-4">
            <p className="text-emerald-300 font-semibold">Expansion Opportunity</p>
            <p className="text-2xl font-bold text-emerald-400 mt-1">${(totalExpansionArr / 1000000).toFixed(2)}M ARR</p>
            <p className="text-sm text-emerald-200 mt-1">Across {expansionData.length} high-potential accounts</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {expansionData.map((item) => (
              <Card key={item.id} className="flex flex-col">
                <CardContent className="pt-6 flex-1 flex flex-col justify-between">
                  <div>
                    <h4 className="font-semibold text-slate-100">{item.company}</h4>
                    <div className="mt-4 space-y-2">
                      <div>
                        <p className="text-xs text-slate-400">Current ARR</p>
                        <p className="text-lg font-semibold text-slate-300">${(item.currentArr / 1000).toFixed(0)}K</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-400">Expansion Opportunity</p>
                        <p className="text-lg font-semibold text-emerald-400">${(item.expansionOpportunity / 1000).toFixed(0)}K</p>
                      </div>
                      <div className="inline-block mt-2 px-2 py-1 bg-emerald-500/20 rounded text-xs font-semibold text-emerald-300">
                        {item.growth}
                      </div>
                    </div>
                  </div>
                  <button className="mt-6 w-full px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded transition flex items-center justify-center gap-2">
                    <Mail size={16} />
                    Reach Out
                  </button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Tab 3: Scenario Simulator */}
      {activeTab === 'scenario' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Lever Controls */}
          <div>
            <Card>
              <CardHeader>
                <CardTitle>Lever Controls</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {[
                  { key: 'discountRate', label: 'Discount Rate Reduction', unit: '%' },
                  { key: 'csmIntervention', label: 'CSM Intervention Intensity', unit: '%' },
                  { key: 'productUpgrades', label: 'Product Upgrade Adoption', unit: '%' },
                  { key: 'loyaltyProgram', label: 'Loyalty Program Participation', unit: '%' },
                ].map((control) => (
                  <div key={control.key}>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-semibold text-slate-300">{control.label}</label>
                      <span className="text-sm font-bold text-indigo-400">
                        {leverControls[control.key as keyof typeof leverControls]}{control.unit}
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={leverControls[control.key as keyof typeof leverControls]}
                      onChange={(e) =>
                        setLeverControls({
                          ...leverControls,
                          [control.key]: parseInt(e.target.value),
                        })
                      }
                      className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                    />
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* Right: 9-Month Trajectory Chart */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle>9-Month ARR Trajectory (Monte Carlo Scenarios)</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={350}>
                  <AreaChart data={trajectoryData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="optimisticGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="baseGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="pessimisticGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#ef4444" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
                    <XAxis dataKey="month" stroke="#94a3b8" />
                    <YAxis stroke="#94a3b8" label={{ value: 'ARR ($K)', angle: -90, position: 'insideLeft' }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend />
                    <Area
                      type="monotone"
                      dataKey="pessimistic"
                      fill="url(#pessimisticGradient)"
                      stroke="#ef4444"
                      strokeWidth={2}
                      name="Pessimistic"
                      isAnimationActive={false}
                    />
                    <Area
                      type="monotone"
                      dataKey="baseCase"
                      fill="url(#baseGradient)"
                      stroke="#6366f1"
                      strokeWidth={2}
                      name="Base Case"
                      isAnimationActive={false}
                    />
                    <Area
                      type="monotone"
                      dataKey="optimistic"
                      fill="url(#optimisticGradient)"
                      stroke="#10b981"
                      strokeWidth={2}
                      name="Optimistic"
                      isAnimationActive={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

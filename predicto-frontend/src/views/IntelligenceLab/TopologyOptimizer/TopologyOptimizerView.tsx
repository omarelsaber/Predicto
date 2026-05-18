import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../../../components/ui/Card';
import { Play } from 'lucide-react';

// Mock master schedule data
const masterScheduleData = [
  { id: 1, customer: 'TechCorp Global', segment: 'Enterprise', arr: 450000, intervention: 'Executive Touch', roi_score: 92 },
  { id: 2, customer: 'CloudMesh Inc', segment: 'Mid-Market', arr: 156000, intervention: 'CSM Intensive', roi_score: 78 },
  { id: 3, customer: 'RetailPro Solutions', segment: 'Enterprise', arr: 342000, intervention: 'Executive Touch', roi_score: 88 },
  { id: 4, customer: 'AnalyticsPlatform Co', segment: 'Mid-Market', arr: 128000, intervention: 'Rep Campaign', roi_score: 65 },
  { id: 5, customer: 'SecurityVault Ltd', segment: 'Enterprise', arr: 285000, intervention: 'Executive Touch', roi_score: 91 },
  { id: 6, customer: 'InnovateSoft Inc', segment: 'Mid-Market', arr: 195000, intervention: 'CSM Intensive', roi_score: 74 },
  { id: 7, customer: 'EnterpriseScale Ltd', segment: 'Enterprise', arr: 520000, intervention: 'Executive Touch', roi_score: 95 },
  { id: 8, customer: 'NextGen Systems', segment: 'Mid-Market', arr: 210000, intervention: 'Rep Campaign', roi_score: 71 },
];

const getInterventionColor = (intervention: string) => {
  switch (intervention) {
    case 'Executive Touch':
      return { bg: 'bg-purple-500/20', text: 'text-purple-300', border: 'border-purple-500/50' };
    case 'CSM Intensive':
      return { bg: 'bg-blue-500/20', text: 'text-blue-300', border: 'border-blue-500/50' };
    case 'Rep Campaign':
      return { bg: 'bg-orange-500/20', text: 'text-orange-300', border: 'border-orange-500/50' };
    default:
      return { bg: 'bg-slate-500/20', text: 'text-slate-300', border: 'border-slate-500/50' };
  }
};

export default function TopologyOptimizerView() {
  const [budgets, setBudgets] = useState({
    repHours: 240,
    csmTouches: 156,
    campaignBudget: 48000,
    execTouches: 24,
  });

  const [isOptimizing, setIsOptimizing] = useState(false);

  const handleOptimize = async () => {
    setIsOptimizing(true);
    // Simulate optimization delay
    await new Promise(resolve => setTimeout(resolve, 2000));
    setIsOptimizing(false);
  };

  // Simulate resource utilization percentages
  const resourceUtilization = [
    { name: 'CSM Hours', used: 156, total: 180, percentage: Math.round((156 / 180) * 100) },
    { name: 'Campaign Budget', used: 48000, total: 50000, percentage: Math.round((48000 / 50000) * 100) },
    { name: 'Exec Touches', used: 24, total: 25, percentage: Math.round((24 / 25) * 100) },
  ];

  const arrAtRisk = 3200000;
  const projectedRetained = 2400000;
  const retentionRate = Math.round((projectedRetained / arrAtRisk) * 100);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 min-h-screen">
      {/* Left Sidebar: Optimizer Controls (30%) */}
      <div className="lg:col-span-1">
        <Card className="sticky top-20">
          <CardHeader>
            <CardTitle>Optimizer Controls</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Solver Status Badge */}
            <div className="flex items-center gap-2 px-3 py-2 bg-emerald-500/20 border border-emerald-500/50 rounded">
              <div className="w-2 h-2 bg-emerald-400 rounded-full" />
              <span className="text-sm font-semibold text-emerald-300">Solver Status: OPTIMAL</span>
            </div>

            {/* Budget Sliders */}
            {[
              { key: 'repHours', label: 'Rep Hours', unit: 'hrs', min: 0, max: 500 },
              { key: 'csmTouches', label: 'CSM Touches', unit: '', min: 0, max: 250 },
              { key: 'campaignBudget', label: 'Campaign Budget', unit: '$K', min: 0, max: 100, step: 1000 },
              { key: 'execTouches', label: 'Exec Touches', unit: '', min: 0, max: 50 },
            ].map((control) => (
              <div key={control.key}>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-slate-300">{control.label}</label>
                  <span className="text-sm font-bold text-indigo-400">
                    {control.key === 'campaignBudget'
                      ? `$${Math.round(budgets[control.key as keyof typeof budgets] / 1000)}${control.unit}`
                      : `${budgets[control.key as keyof typeof budgets]}${control.unit}`}
                  </span>
                </div>
                <input
                  type="range"
                  min={control.min}
                  max={control.max}
                  step={control.step || 1}
                  value={budgets[control.key as keyof typeof budgets]}
                  onChange={(e) =>
                    setBudgets({
                      ...budgets,
                      [control.key]: parseInt(e.target.value),
                    })
                  }
                  className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                />
              </div>
            ))}

            {/* Run Optimizer Button */}
            <button
              onClick={handleOptimize}
              disabled={isOptimizing}
              className="w-full px-4 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-600/50 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition flex items-center justify-center gap-2"
            >
              <Play size={16} />
              {isOptimizing ? 'Optimizing...' : 'Run Optimizer'}
            </button>
          </CardContent>
        </Card>
      </div>

      {/* Right Section: Portfolio & Schedule (70%) */}
      <div className="lg:col-span-3 space-y-6">
        {/* Portfolio ROI Header */}
        <Card>
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <p className="text-xs text-slate-400 mb-2">ARR at Risk</p>
                <p className="text-3xl font-bold text-red-400">${(arrAtRisk / 1000000).toFixed(1)}M</p>
                <p className="text-xs text-slate-500 mt-1">Total at-risk revenue</p>
              </div>
              <div>
                <p className="text-xs text-slate-400 mb-2">Projected Retained</p>
                <p className="text-3xl font-bold text-emerald-400">${(projectedRetained / 1000000).toFixed(1)}M</p>
                <p className="text-xs text-emerald-500 mt-1">{retentionRate}% retention rate</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Resource Utilization */}
        <Card>
          <CardHeader>
            <CardTitle>Resource Utilization</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-6">
              {resourceUtilization.map((resource, idx) => {
                const isHigh = resource.percentage >= 90;
                const isMedium = resource.percentage >= 70;
                const barColor = isHigh ? 'bg-amber-500' : isMedium ? 'bg-indigo-500' : 'bg-emerald-500';

                return (
                  <div key={idx}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-slate-300">{resource.name}</span>
                      <span className={`text-sm font-bold ${isHigh ? 'text-amber-400' : 'text-slate-300'}`}>
                        {resource.percentage}%
                      </span>
                    </div>
                    <div className="w-full bg-slate-700 rounded-full h-3">
                      <div
                        className={`${barColor} h-3 rounded-full transition-all duration-300`}
                        style={{ width: `${resource.percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Master Schedule Table */}
        <Card>
          <CardHeader>
            <CardTitle>Master Schedule</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700">
                    <th className="text-left py-3 px-4 text-slate-400 font-semibold">Customer</th>
                    <th className="text-left py-3 px-4 text-slate-400 font-semibold">Segment</th>
                    <th className="text-right py-3 px-4 text-slate-400 font-semibold">ARR</th>
                    <th className="text-left py-3 px-4 text-slate-400 font-semibold">Intervention</th>
                    <th className="text-right py-3 px-4 text-slate-400 font-semibold">ROI Score</th>
                  </tr>
                </thead>
                <tbody>
                  {masterScheduleData.map((row, idx) => {
                    const interventionColor = getInterventionColor(row.intervention);
                    return (
                      <tr key={idx} className="border-b border-slate-700 hover:bg-slate-700/50 transition">
                        <td className="py-3 px-4 text-slate-200 font-medium">{row.customer}</td>
                        <td className="py-3 px-4 text-slate-400">{row.segment}</td>
                        <td className="py-3 px-4 text-right text-slate-200">${(row.arr / 1000).toFixed(0)}K</td>
                        <td className="py-3 px-4">
                          <span
                            className={`inline-block px-2 py-1 rounded text-xs font-semibold ${interventionColor.bg} ${interventionColor.text} border ${interventionColor.border}`}
                          >
                            {row.intervention}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <span className="font-semibold text-indigo-400">{row.roi_score}</span>
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
    </div>
  );
}

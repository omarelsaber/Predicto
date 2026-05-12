import { useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceArea, ReferenceLine } from 'recharts';
import { AlertTriangle, TrendingUp } from 'lucide-react';

export default function DealScorer() {
  const [segment, setSegment] = useState('Enterprise');
  const [region, setRegion] = useState('North America');
  const [industry, setIndustry] = useState('Technology');
  const [product, setProduct] = useState('Platform');
  const [discount, setDiscount] = useState(28);
  const [quantity, setQuantity] = useState(50);
  const [salesValue, setSalesValue] = useState(250000);

  // Generate margin cliff curve - 81 points
  const generateMarginCurve = () => {
    const points = [];
    for (let i = 0; i <= 80; i++) {
      const discountPct = i;
      let margin;

      if (discountPct <= 10) {
        margin = 28 - discountPct * 1.2;
      } else if (discountPct <= 25) {
        margin = 16 - (discountPct - 10) * 0.8;
      } else if (discountPct <= 40) {
        margin = 4 - (discountPct - 25) * 0.4;
      } else {
        margin = Math.max(-15, -2 - (discountPct - 40) * 0.5);
      }

      points.push({
        discount: discountPct,
        margin: Math.round(margin * 10) / 10,
        zone: discountPct > 35 ? 'danger' : 'healthy'
      });
    }
    return points;
  };

  const curveData = generateMarginCurve();
  const currentMargin = curveData.find(d => d.discount === Math.round(discount))?.margin || 8.5;
  const marginColor = currentMargin >= 15 ? 'emerald' : currentMargin >= 5 ? 'amber' : 'rose';

  return (
    <div className="grid grid-cols-2 gap-6">
      {/* Left Column: Parameters */}
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-black text-white mb-1">Deal Scorer</h2>
          <p className="text-sm text-slate-400">Configure deal parameters to analyze margin impact</p>
        </div>

        {/* Deal Parameters Grid */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
          <h3 className="text-xs uppercase tracking-wider text-slate-400 font-bold mb-4">Deal Parameters</h3>
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div>
              <label className="block text-xs text-slate-400 font-medium mb-2">Segment</label>
              <select
                value={segment}
                onChange={(e) => setSegment(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                <option>Enterprise</option>
                <option>Mid-Market</option>
                <option>SMB</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 font-medium mb-2">Region</label>
              <select
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                <option>North America</option>
                <option>Europe</option>
                <option>APAC</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 font-medium mb-2">Industry</label>
              <select
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                <option>Technology</option>
                <option>Finance</option>
                <option>Healthcare</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 font-medium mb-2">Product</label>
              <select
                value={product}
                onChange={(e) => setProduct(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                <option>Platform</option>
                <option>Suite</option>
                <option>Custom</option>
              </select>
            </div>
          </div>

          {/* Discount Slider */}
          <div className="mb-6">
            <div className="flex justify-between items-center mb-2">
              <label className="text-xs text-slate-400 font-medium">Discount Ceiling</label>
              <span className="text-lg font-black text-indigo-400">{discount}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="80"
              value={discount}
              onChange={(e) => setDiscount(Number(e.target.value))}
              className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
            />
            <div className="flex justify-between text-xs text-slate-500 mt-1">
              <span>0%</span>
              <span>80%</span>
            </div>
          </div>

          {/* Quantity & Sales Value */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-slate-400 font-medium mb-2">Quantity</label>
              <input
                type="number"
                value={quantity}
                onChange={(e) => setQuantity(Number(e.target.value))}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 font-medium mb-2">Sales Value</label>
              <input
                type="number"
                value={salesValue}
                onChange={(e) => setSalesValue(Number(e.target.value))}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>
        </div>

        <button className="w-full bg-indigo-500 hover:bg-indigo-600 text-white font-bold py-3 rounded-lg transition-colors">
          Score Deal
        </button>
      </div>

      {/* Right Column: Margin Intelligence (Hero Feature) */}
      <div className="space-y-6">
        {/* Predicted Margin Gauge */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
          <p className="text-xs uppercase tracking-wider text-slate-400 font-bold mb-6">Predicted Margin</p>
          <div className="flex flex-col items-center">
            <div className={`text-6xl font-black ${marginColor === 'emerald' ? 'text-emerald-400' : marginColor === 'amber' ? 'text-amber-400' : 'text-rose-400'}`}>
              {currentMargin.toFixed(1)}%
            </div>
            <p className={`text-sm font-medium mt-2 ${marginColor === 'emerald' ? 'text-emerald-400' : marginColor === 'amber' ? 'text-amber-400' : 'text-rose-400'}`}>
              {marginColor === 'emerald' ? 'Healthy Margin' : marginColor === 'amber' ? 'At-Risk Margin' : 'Critical Margin'}
            </p>
          </div>
        </div>

        {/* Margin Cliff Chart */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
          <h3 className="text-xs uppercase tracking-wider text-slate-400 font-bold mb-4">Margin Cliff Analysis</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={curveData} margin={{ top: 10, right: 10, left: 0, bottom: 30 }}>
                <defs>
                  <linearGradient id="dangerZone" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ef4444" stopOpacity={0.15} />
                    <stop offset="100%" stopColor="#ef4444" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                <XAxis dataKey="discount" stroke="#64748b" fontSize={11} label={{ value: 'Discount %', position: 'bottom', offset: 10 }} />
                <YAxis stroke="#64748b" fontSize={11} label={{ value: 'Margin %', angle: -90, position: 'insideLeft' }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1e293b',
                    border: '1px solid #334155',
                    borderRadius: '6px'
                  }}
                  labelStyle={{ color: '#cbd5e1' }}
                  formatter={(value) => `${value}%`}
                />
                <ReferenceArea x1={35} x2={80} fill="url(#dangerZone)" />
                <ReferenceLine x={Math.round(discount)} stroke="#6366f1" strokeDasharray="5 5" />
                <ReferenceLine y={currentMargin} stroke="#6366f1" strokeDasharray="5 5" />
                <ReferenceLine y={5} stroke="#ef4444" strokeDasharray="3 3" label={{ value: 'Margin Floor', position: 'insideRight', offset: -10, fill: '#ef4444', fontSize: 11 }} />
                <Line type="monotone" dataKey="margin" stroke="#6366f1" strokeWidth={3} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 p-3 bg-slate-800/50 rounded-lg border border-slate-700/50">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-xs text-slate-400">Safe Ceiling</p>
                <p className="text-lg font-black text-emerald-400">12%</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Cliff Threshold</p>
                <p className="text-lg font-black text-rose-400">35%</p>
              </div>
            </div>
          </div>
        </div>

        {/* Warning Block */}
        <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-4 flex gap-3">
          <AlertTriangle size={18} className="text-rose-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-rose-200">
            <p className="font-medium mb-1">Margin Recovery Opportunity</p>
            <p className="text-xs text-rose-300">Reducing discount to 20% would recover $12,500 in quarterly margin.</p>
          </div>
        </div>

        <button className="w-full bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-400 font-medium py-3 rounded-lg transition-colors border border-indigo-500/30 flex items-center justify-center gap-2">
          <TrendingUp size={16} />
          Generate Deal Strategy
        </button>
      </div>
    </div>
  );
}

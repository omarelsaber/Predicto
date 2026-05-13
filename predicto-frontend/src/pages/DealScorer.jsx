import { useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceArea, ReferenceLine } from 'recharts';
import { AlertTriangle, TrendingUp, Loader2 } from 'lucide-react';

export default function DealScorer() {
  const [segment, setSegment] = useState('Enterprise');
  const [region, setRegion] = useState('North America');
  const [industry, setIndustry] = useState('Technology');
  const [product, setProduct] = useState('Platform');
  const [discount, setDiscount] = useState(28);
  const [quantity, setQuantity] = useState(50);
  const [salesValue, setSalesValue] = useState(250000);

  const [strategy, setStrategy] = useState(null);
  const [isScoring, setIsScoring] = useState(false);
  const [safeCeiling, setSafeCeiling] = useState(15);
  const [cliffThreshold, setCliffThreshold] = useState(35);
  const [recoveryAmount, setRecoveryAmount] = useState(0);

  // Currency Formatter
  const formatCurrency = (value) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0
    }).format(value);
  };

  // Clear strategy when any input changes to ensure user "re-scores"
  const handleInputChange = (setter, value) => {
    setter(value);
    setStrategy(null);
  };

  // Generate margin cliff curve - 81 points
  const generateMarginCurve = () => {
    const points = [];
    
    // Simulation logic for categorical impact
    let baseOffset = 0;
    if (segment === 'Enterprise') baseOffset -= 2.5; 
    if (segment === 'Small Business') baseOffset += 1.0; 
    if (region === 'Europe') baseOffset += 1.5; 
    if (region === 'APAC') baseOffset -= 1.0; 
    if (product === 'Enterprise API') baseOffset += 4.0; 
    if (product === 'Basic') baseOffset -= 2.0; 

    // Volume Sensitivity: Large quantities reduce unit margin due to support/infrastructure overhead
    const volumeImpact = (quantity / 1000) * -1.5; // Every 1k units reduces margin by 1.5%
    baseOffset += volumeImpact;

    for (let i = 0; i <= 80; i++) {
      const discountPct = i;
      let margin;

      if (discountPct <= 10) {
        margin = (28 + baseOffset) - discountPct * 1.2;
      } else if (discountPct <= 25) {
        margin = (16 + baseOffset) - (discountPct - 10) * 0.8;
      } else if (discountPct <= 40) {
        margin = (4 + baseOffset) - (discountPct - 25) * 0.4;
      } else {
        margin = Math.max(-15, (-2 + baseOffset) - (discountPct - 40) * 0.5);
      }

      points.push({
        discount: discountPct,
        margin: Math.round(margin * 10) / 10,
        zone: discountPct > cliffThreshold ? 'danger' : 'healthy'
      });
    }
    return points;
  };

  const curveData = generateMarginCurve();
  const currentMargin = curveData.find(d => d.discount === Math.round(discount))?.margin || 8.5;

  const handleScoreDeal = () => {
    setIsScoring(true);
    setStrategy(null);
    
    // Dynamic Threshold Calculation
    let ceiling = 15;
    if (industry === 'Tech') ceiling = 22;
    if (industry === 'Finance') ceiling = 12;
    if (industry === 'Healthcare') ceiling = 18;
    if (product === 'Enterprise API') ceiling += 5;
    if (product === 'Basic') ceiling -= 3;

    const threshold = ceiling + 15;
    
    // Recovery Opportunity Calculation: Precise formula using Sales Value
    let recovery = 0;
    if (discount > ceiling) {
      // Recovery = Sales Value * (Discount Gap)
      recovery = salesValue * ((discount - ceiling) / 100);
    }

    setTimeout(() => {
      setIsScoring(false);
      setSafeCeiling(ceiling);
      setCliffThreshold(threshold);
      setRecoveryAmount(recovery);
    }, 800);
  };

  const handleGenerateStrategy = () => {
    const isHealthy = currentMargin >= 15;
    const mockStrategy = isHealthy 
      ? `Strategy: ${segment} deal in ${region} looks solid. At ${quantity.toLocaleString()} units, the ${product} margin of ${currentMargin.toFixed(1)}% is optimal. Recommend closing at ${formatCurrency(salesValue)}.`
      : `Strategy: Warning - ${discount}% discount is aggressive for ${industry}. Volume of ${quantity.toLocaleString()} units creates significant overhead. Recommend reducing to ${safeCeiling}% to recover ${formatCurrency(recoveryAmount)}.`;
    
    setStrategy(mockStrategy);
  };
  const marginColor = currentMargin >= 15 ? 'emerald' : currentMargin >= 5 ? 'amber' : 'rose';

  return (
    <div className="relative min-h-screen bg-transparent p-6">
      <video 
        autoPlay 
        loop 
        muted 
        playsInline 
        className="fixed inset-0 w-full h-full object-cover -z-20 pointer-events-none"
      >
        <source src="/deal-scorer-bg.mp4" type="video/mp4" />
      </video>
      <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-[3px] -z-10"></div>

      <div className="grid grid-cols-2 gap-6 relative z-10">
      {/* Left Column: Parameters */}
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-black text-white mb-1">Deal Scorer</h2>
          <p className="text-sm text-slate-400">Configure deal parameters to analyze margin impact</p>
        </div>

        {/* Deal Parameters Grid */}
        <div className="bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-xl p-6">
          <h3 className="text-xs uppercase tracking-wider text-slate-400 font-bold mb-4">Deal Parameters</h3>
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div>
              <label className="block text-xs text-slate-400 font-medium mb-2">Segment</label>
              <select
                value={segment}
                onChange={(e) => handleInputChange(setSegment, e.target.value)}
                className="w-full bg-white/5 backdrop-blur-sm border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                <option>Mid-Market</option>
                <option>Enterprise</option>
                <option>Small Business</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 font-medium mb-2">Region</label>
              <select
                value={region}
                onChange={(e) => handleInputChange(setRegion, e.target.value)}
                className="w-full bg-white/5 backdrop-blur-sm border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                <option>North America</option>
                <option>Europe</option>
                <option>APAC</option>
                <option>LATAM</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 font-medium mb-2">Industry</label>
              <select
                value={industry}
                onChange={(e) => handleInputChange(setIndustry, e.target.value)}
                className="w-full bg-white/5 backdrop-blur-sm border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                <option>Tech</option>
                <option>Finance</option>
                <option>Healthcare</option>
                <option>Manufacturing</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 font-medium mb-2">Product</label>
              <select
                value={product}
                onChange={(e) => handleInputChange(setProduct, e.target.value)}
                className="w-full bg-white/5 backdrop-blur-sm border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                <option>Suite</option>
                <option>Basic</option>
                <option>Premium</option>
                <option>Enterprise API</option>
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
              onChange={(e) => handleInputChange(setDiscount, Number(e.target.value))}
              className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-indigo-500"
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
                onChange={(e) => handleInputChange(setQuantity, Number(e.target.value))}
                className="w-full bg-white/5 backdrop-blur-sm border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 font-medium mb-2">Sales Value</label>
              <input
                type="number"
                value={salesValue}
                onChange={(e) => handleInputChange(setSalesValue, Number(e.target.value))}
                className="w-full bg-white/5 backdrop-blur-sm border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>
        </div>

        <button 
          onClick={handleScoreDeal}
          disabled={isScoring}
          className="w-full bg-indigo-500 hover:bg-indigo-600 text-white font-bold py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
        >
          {isScoring ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          {isScoring ? 'Scoring...' : 'Score Deal'}
        </button>

        {strategy && (
          <div className="bg-indigo-500/10 border border-indigo-500/30 rounded-xl p-5 animate-in fade-in slide-in-from-top-2 duration-300">
            <h4 className="text-xs font-bold text-indigo-400 uppercase tracking-widest mb-2 flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-pulse" />
              AI Deal Strategy
            </h4>
            <p className="text-sm text-indigo-100 leading-relaxed italic">
              "{strategy}"
            </p>
          </div>
        )}
      </div>

      {/* Right Column: Margin Intelligence (Hero Feature) */}
      <div className="space-y-6">
        {/* Predicted Margin Gauge */}
        <div className="bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-xl p-6">
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
        <div className="bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-xl p-6">
          <h3 className="text-xs uppercase tracking-wider text-slate-400 font-bold mb-4">Margin Cliff Analysis</h3>
          <div className="w-full h-64 relative">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
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
                <ReferenceArea x1={cliffThreshold} x2={80} fill="url(#dangerZone)" />
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
                <p className="text-lg font-black text-emerald-400">{safeCeiling}%</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Cliff Threshold</p>
                <p className="text-lg font-black text-rose-400">{cliffThreshold}%</p>
              </div>
            </div>
          </div>
        </div>

        {/* Warning Block - Dynamic Recovery Opportunity */}
        {recoveryAmount > 0 && (
          <div className={`border rounded-xl p-4 flex gap-3 animate-in fade-in zoom-in duration-500 ${marginColor === 'rose' ? 'bg-rose-500/10 border-rose-500/30' : 'bg-amber-500/10 border-amber-500/30'}`}>
            <AlertTriangle size={18} className={`${marginColor === 'rose' ? 'text-rose-400' : 'text-amber-400'} flex-shrink-0 mt-0.5`} />
            <div className="text-sm">
              <p className={`font-bold mb-1 ${marginColor === 'rose' ? 'text-rose-200' : 'text-amber-200'}`}>Margin Recovery Opportunity</p>
              <p className={marginColor === 'rose' ? 'text-rose-300' : 'text-amber-300'}>
                Reducing discount to {safeCeiling}% would recover <span className="font-bold underline">{formatCurrency(recoveryAmount)}</span> in quarterly margin.
              </p>
            </div>
          </div>
        )}

        <button 
          onClick={handleGenerateStrategy}
          className="w-full bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-400 font-medium py-3 rounded-lg transition-colors border border-indigo-500/30 flex items-center justify-center gap-2"
        >
          <TrendingUp size={16} />
          Generate Deal Strategy
        </button>
      </div>
    </div>
  </div>
  );
}

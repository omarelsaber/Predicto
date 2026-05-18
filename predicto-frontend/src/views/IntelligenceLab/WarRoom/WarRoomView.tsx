import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../../../components/ui/Card';
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';
import { ChevronRight, Zap } from 'lucide-react';

// Mock historical deals for Pareto frontier
const historicalDealsData = [
  { discount: 5, winProb: 35, dealId: '#8412', status: 'Lost' },
  { discount: 8, winProb: 42, dealId: '#8401', status: 'Lost' },
  { discount: 10, winProb: 48, dealId: '#8390', status: 'Won' },
  { discount: 12, winProb: 55, dealId: '#8378', status: 'Won' },
  { discount: 15, winProb: 62, dealId: '#8367', status: 'Won' },
  { discount: 18, winProb: 68, dealId: '#8355', status: 'Won' },
  { discount: 20, winProb: 72, dealId: '#8343', status: 'Won' },
  { discount: 25, winProb: 79, dealId: '#8332', status: 'Won' },
  { discount: 30, winProb: 84, dealId: '#8321', status: 'Won' },
  { discount: 35, winProb: 88, dealId: '#8310', status: 'Won' },
];

// Pareto frontier line data
const paretoFrontierData = [
  { discount: 0, winProb: 20 },
  { discount: 5, winProb: 32 },
  { discount: 10, winProb: 45 },
  { discount: 15, winProb: 57 },
  { discount: 20, winProb: 68 },
  { discount: 25, winProb: 77 },
  { discount: 30, winProb: 84 },
  { discount: 35, winProb: 89 },
  { discount: 40, winProb: 92 },
];

const alternativeMoves = [
  { id: 1, action: 'Reduce price', delta: '-5%', description: 'Lower discount request', impact: 'Margin impact: -$45K' },
  { id: 2, action: 'Bundle add-on', delta: '+$25K', description: 'Include premium module', impact: 'Increases perceived value' },
  { id: 3, action: 'Multi-year lock', delta: '+2 yrs', description: 'Extend contract term', impact: 'Improves LTV: +$120K' },
];

export default function WarRoomView() {
  const [selectedDeal, setSelectedDeal] = useState('Deal ID: #8492 - TechCorp Global');
  const [selectedCompetitor, setSelectedCompetitor] = useState('Competitor A');
  const [currentDiscount, setCurrentDiscount] = useState(22);
  const [tradeOffSlider, setTradeOffSlider] = useState(50);

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-slate-800 border border-slate-700 rounded p-2 text-xs text-slate-200">
          <p className="font-semibold">{data.dealId || 'Frontier'}</p>
          <p>Discount: {data.discount}%</p>
          <p>Win Prob: {data.winProb}%</p>
          {data.status && <p className={data.status === 'Won' ? 'text-emerald-400' : 'text-red-400'}>{data.status}</p>}
        </div>
      );
    }
    return null;
  };

  const tradeOffLabel = tradeOffSlider > 50 ? 'Win Rate Focus' : tradeOffSlider < 50 ? 'Margin Focus' : 'Balanced';

  return (
    <div className="space-y-6">
      {/* Header Strip */}
      <div className="flex items-center gap-6 bg-slate-800 border border-slate-700 rounded-lg p-4">
        <div className="flex-1">
          <label className="text-xs text-slate-400 font-semibold">Deal</label>
          <select
            value={selectedDeal}
            onChange={(e) => setSelectedDeal(e.target.value)}
            className="mt-1 w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option>Deal ID: #8492 - TechCorp Global</option>
            <option>Deal ID: #8481 - CloudMesh Inc</option>
            <option>Deal ID: #8470 - RetailPro Solutions</option>
          </select>
        </div>

        <div className="flex-1">
          <label className="text-xs text-slate-400 font-semibold">Competitor</label>
          <select
            value={selectedCompetitor}
            onChange={(e) => setSelectedCompetitor(e.target.value)}
            className="mt-1 w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option>Competitor A</option>
            <option>Competitor B</option>
            <option>Competitor C</option>
          </select>
        </div>

        <div className="flex-1">
          <label className="text-xs text-slate-400 font-semibold">Current Discount</label>
          <div className="mt-1 text-2xl font-bold text-indigo-400">{currentDiscount}%</div>
        </div>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Pareto Frontier Chart (55%) */}
        <div className="lg:col-span-7">
          <Card>
            <CardHeader>
              <CardTitle>Pareto Frontier Chart</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
                  <XAxis type="number" dataKey="discount" name="Discount %" stroke="#94a3b8" label={{ value: 'Discount %', position: 'insideBottomRight', offset: -10 }} />
                  <YAxis type="number" dataKey="winProb" name="Win Probability %" stroke="#94a3b8" label={{ value: 'Win Prob %', angle: -90, position: 'insideLeft' }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Scatter name="Historical Deals" data={historicalDealsData} fill="#94a3b8" />
                  <LineChart data={paretoFrontierData}>
                    <Line type="monotone" dataKey="winProb" stroke="#10b981" strokeWidth={3} dot={false} name="Pareto Frontier" isAnimationActive={false} />
                  </LineChart>
                  <Scatter name="You are here" data={[{ discount: currentDiscount, winProb: 72 }]} fill="#fbbf24" shape="circle" />
                </ScatterChart>
              </ResponsiveContainer>

              <div className="mt-6 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-300">Your Position on Frontier</p>
                  <p className="text-xs text-slate-400 mt-1">Discount: {currentDiscount}% | Estimated Win Prob: 72%</p>
                </div>
                <div className="w-4 h-4 rounded-full bg-yellow-400" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right: Move Advisor (45%) */}
        <div className="lg:col-span-5 space-y-4">
          {/* Recommended Move Card */}
          <Card className="bg-gradient-to-br from-indigo-500/10 to-slate-800 border-indigo-500/30">
            <CardHeader>
              <div className="flex items-start justify-between">
                <CardTitle className="text-indigo-400">Recommended Move</CardTitle>
                <Zap size={20} className="text-indigo-400" />
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm font-semibold text-slate-200">Escalate to Executive Sponsor</p>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400">Expected Win Rate Improvement</span>
                  <span className="text-lg font-bold text-emerald-400">+14pp</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400">Nash Equilibrium Score</span>
                  <span className="text-lg font-bold text-indigo-400">0.87</span>
                </div>
              </div>

              <p className="text-xs text-slate-300 leading-relaxed">
                By elevating to the sponsor level, you unlock strategic value beyond price. The decision-maker can justify value through TCO and strategic alignment, reducing discount sensitivity.
              </p>

              <button className="w-full mt-4 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg transition flex items-center justify-center gap-2">
                <ChevronRight size={16} />
                Execute Move
              </button>
            </CardContent>
          </Card>

          {/* Alternative Moves */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-slate-400 uppercase">Alternative Moves</p>
            {alternativeMoves.map((move) => (
              <Card key={move.id} className="hover:bg-slate-700/50 transition cursor-pointer">
                <CardContent className="py-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-semibold text-slate-200">{move.action}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{move.description}</p>
                      <p className="text-xs text-indigo-400 mt-1">{move.impact}</p>
                    </div>
                    <span className="text-sm font-bold text-slate-300">{move.delta}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Trade-Off Slider */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Trade-Off: Margin vs Win Rate</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Margin Focus</span>
                <span className="font-semibold text-slate-200">{tradeOffLabel}</span>
                <span>Win Rate Focus</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={tradeOffSlider}
                onChange={(e) => setTradeOffSlider(parseInt(e.target.value))}
                className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
              />
              <p className="text-xs text-slate-400">
                {tradeOffSlider > 50
                  ? 'Optimizing for win probability. Higher discount acceptable for deal closure.'
                  : tradeOffSlider < 50
                  ? 'Optimizing for margin preservation. Risk premium required for lower discount.'
                  : 'Balanced approach. Evaluating both margin and close probability equally.'}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

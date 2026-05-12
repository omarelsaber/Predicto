import { AlertTriangle, ArrowRight } from 'lucide-react';

export default function PersonaGallery() {
  const personas = [
    {
      id: 1,
      name: 'Volume Accounts',
      icon: '📊',
      accounts: 27,
      margin: 15.1,
      risk: 'MEDIUM',
      description: 'High-frequency, moderate-value customers'
    },
    {
      id: 2,
      name: 'Champions',
      icon: '⭐',
      accounts: 11,
      margin: 22.2,
      risk: 'LOW',
      description: 'Loyal, high-margin strategic accounts'
    },
    {
      id: 3,
      name: 'At-Risk',
      icon: '⚠️',
      accounts: 38,
      margin: 15.4,
      risk: 'MEDIUM',
      description: 'Declining engagement, churn signals'
    },
    {
      id: 4,
      name: 'Discount Seekers',
      icon: '💰',
      accounts: 23,
      margin: 8.2,
      risk: 'HIGH',
      description: 'Price-sensitive, low-margin deals'
    }
  ];

  const getRiskColor = (risk) => {
    if (risk === 'LOW') return 'emerald';
    if (risk === 'MEDIUM') return 'amber';
    return 'rose';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-black text-white mb-1">Persona Gallery</h2>
        <p className="text-sm text-slate-400">Account segmentation & margin health by persona</p>
        <div className="mt-4 flex gap-6 text-sm">
          <div>
            <p className="text-xs text-slate-500 font-medium uppercase">Separation Score</p>
            <p className="text-lg font-black text-indigo-400">0.87</p>
          </div>
          <div>
            <p className="text-xs text-slate-500 font-medium uppercase">Margin Variance</p>
            <p className="text-lg font-black text-amber-400">14.0%</p>
          </div>
          <div>
            <p className="text-xs text-slate-500 font-medium uppercase">Portfolio Health</p>
            <p className="text-lg font-black text-emerald-400">Good</p>
          </div>
        </div>
      </div>

      {/* ROI Opportunity Banner */}
      <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-6 flex items-start gap-4">
        <AlertTriangle size={24} className="text-amber-400 flex-shrink-0" />
        <div className="flex-1">
          <h3 className="text-sm font-bold text-amber-100 mb-1">ROI Opportunity: Discount Seekers</h3>
          <p className="text-sm text-amber-200 mb-4">
            Implement tiered discount strategy to recover $3.2M in annual margin across 23 accounts. Historical data suggests 68% retention with structured incentives.
          </p>
          <div className="flex gap-3">
            <button className="bg-amber-500 hover:bg-amber-600 text-white font-medium py-2 px-4 rounded-lg text-sm transition-colors">
              View Strategy
            </button>
            <button className="bg-amber-500/15 hover:bg-amber-500/25 text-amber-400 font-medium py-2 px-4 rounded-lg text-sm transition-colors border border-amber-500/30">
              Dismiss
            </button>
          </div>
        </div>
      </div>

      {/* Persona Cards Grid */}
      <div className="grid grid-cols-2 gap-6">
        {personas.map((persona) => {
          const riskColor = getRiskColor(persona.risk);
          const riskTextColor = riskColor === 'emerald' ? 'text-emerald-400' : riskColor === 'amber' ? 'text-amber-400' : 'text-rose-400';
          const riskBgColor = riskColor === 'emerald' ? 'bg-emerald-500/15' : riskColor === 'amber' ? 'bg-amber-500/15' : 'bg-rose-500/15';
          const riskBorderColor = riskColor === 'emerald' ? 'border-emerald-500/30' : riskColor === 'amber' ? 'border-amber-500/30' : 'border-rose-500/30';

          return (
            <div key={persona.id} className="bg-slate-900 border border-slate-800 rounded-xl p-6 hover:border-slate-700 transition-colors">
              {/* Icon Badge + Title */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-slate-800 rounded-lg flex items-center justify-center text-xl">
                    {persona.icon}
                  </div>
                  <div>
                    <h3 className="font-bold text-white">{persona.name}</h3>
                    <p className="text-xs text-slate-400">{persona.description}</p>
                  </div>
                </div>
                <div className={`${riskBgColor} ${riskTextColor} text-xs font-bold px-2.5 py-1 rounded-lg border ${riskBorderColor}`}>
                  {persona.risk}
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-800/50 rounded-lg p-3">
                  <p className="text-xs text-slate-400 font-medium mb-1">Accounts</p>
                  <p className="text-2xl font-black text-white">{persona.accounts}</p>
                </div>
                <div className="bg-slate-800/50 rounded-lg p-3">
                  <p className="text-xs text-slate-400 font-medium mb-1">Avg Margin</p>
                  <p className={`text-2xl font-black ${persona.margin >= 15 ? 'text-emerald-400' : persona.margin >= 10 ? 'text-amber-400' : 'text-rose-400'}`}>
                    {persona.margin}%
                  </p>
                </div>
              </div>

              {/* Action */}
              <button className="w-full mt-4 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 font-medium py-2 rounded-lg text-sm transition-colors border border-indigo-500/30 flex items-center justify-center gap-2">
                View Details
                <ArrowRight size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

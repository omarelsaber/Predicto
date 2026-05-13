import { useState, useEffect } from 'react';
import { AlertTriangle, ArrowRight, Loader2, CheckCircle2, X } from 'lucide-react';
import api from '../api';

const defaultPersonasData = {
  metrics: {
    separationScore: 0.87,
    marginVariance: '14.0%',
    portfolioHealth: 'Good'
  },
  personas: [
    {
      id: 1,
      segment: 'Volume Accounts',
      description: 'High-frequency, moderate-value customers',
      accounts: 27,
      avg_margin: '15.1%',
      persona_label: 'MEDIUM',
      icon: '📊'
    },
    {
      id: 2,
      segment: 'Champions',
      description: 'Loyal, high-margin strategic accounts',
      accounts: 11,
      avg_margin: '22.2%',
      persona_label: 'LOW',
      icon: '⭐'
    },
    {
      id: 3,
      segment: 'At-Risk',
      description: 'Declining engagement, churn signals',
      accounts: 38,
      avg_margin: '15.4%',
      persona_label: 'MEDIUM',
      icon: '⚠️'
    },
    {
      id: 4,
      segment: 'Discount Seekers',
      description: 'Price-sensitive, low-margin deals',
      accounts: 23,
      avg_margin: '8.2%',
      persona_label: 'HIGH',
      icon: '💰'
    }
  ]
};

export default function PersonaGallery() {
  const [isBannerVisible, setIsBannerVisible] = useState(true);
  const [data, setData] = useState(defaultPersonasData);
  const [isLoading, setIsLoading] = useState(true);
  const [notification, setNotification] = useState(null);

  useEffect(() => {
    const fetchPersonas = async () => {
      const url = '/personas';
      try {
        setIsLoading(true);

        const response = await api.get(url);
        if (response.data && response.data.personas && response.data.personas.length > 0) {
          setData(response.data);
        } else {
          setData(defaultPersonasData);
        }
        setIsLoading(false);
      } catch (error) {
        setData(defaultPersonasData);
        setIsLoading(false);
      }
    };

    fetchPersonas();
  }, []);

  const getRiskColor = (risk) => {
    const r = (risk || '').toUpperCase();
    if (r === 'LOW') return 'emerald';
    if (r === 'MEDIUM') return 'amber';
    return 'rose';
  };

  const showNotification = (message) => {
    setNotification(message);
    setTimeout(() => setNotification(null), 3000);
  };

  const handleAction = (type) => {
    showNotification(`Generating detailed ${type} playbook... (V2 Feature)`);
  };

  if (isLoading) {
    return (
      <div className="h-[60vh] flex flex-col items-center justify-center space-y-4">
        <Loader2 className="w-10 h-10 text-indigo-500 animate-spin" />
        <p className="text-slate-400 font-medium">Analyzing segments...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 relative bg-transparent">
      <video 
        autoPlay 
        loop 
        muted 
        playsInline 
        className="fixed inset-0 w-full h-full object-cover -z-20"
        src="/background-video.mp4"
      />

      <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-[3px] -z-10"></div>

      {/* Header */}
      <div>
        <h2 className="text-2xl font-black text-white mb-1">Persona Gallery</h2>
        <p className="text-sm text-slate-400">Account segmentation & margin health by persona</p>
        <div className="mt-4 flex gap-6 text-sm">
          <div>
            <p className="text-xs text-slate-500 font-medium uppercase">Clustering Score</p>
            <p className="text-lg font-black text-indigo-400">{data.silhouette_score?.toFixed(2) || "0.87"}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500 font-medium uppercase">Segments Found</p>
            <p className="text-lg font-black text-amber-400">{data.n_clusters || "0"}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500 font-medium uppercase">Portfolio Health</p>
            <p className="text-lg font-black text-emerald-400">Stable</p>
          </div>
        </div>
      </div>

      {/* ROI Opportunity Banner */}
      {isBannerVisible && data.personas?.length > 0 && (
        <div className="bg-amber-500/10 backdrop-blur-xl border border-amber-500/30 rounded-xl p-6 flex items-start gap-4 shadow-lg shadow-amber-500/5">
          <AlertTriangle size={24} className="text-amber-400 flex-shrink-0" />
          <div className="flex-1">
            <h3 className="text-sm font-bold text-amber-100 mb-1">ROI Opportunity: {data.personas[0].persona_label}</h3>
            <p className="text-sm text-amber-200 mb-4 leading-relaxed">
              Implement tiered discount strategy to recover margin across {data.personas[0].cluster_size} accounts in the {data.personas[0].segment} segment. Historical data suggests high retention with structured incentives.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => handleAction('strategy')}
                className="bg-amber-500 hover:bg-amber-600 text-white font-medium py-2 px-4 rounded-lg text-sm transition-all active:scale-95"
              >
                View Strategy
              </button>
              <button
                onClick={() => setIsBannerVisible(false)}
                className="bg-amber-500/15 hover:bg-amber-500/25 text-amber-400 font-medium py-2 px-4 rounded-lg text-sm transition-colors border border-amber-500/30 active:scale-95"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Persona Cards Grid */}
      <div className="grid grid-cols-2 gap-6 pb-20">
        {data.personas?.map((persona, index) => {
          const riskColor = getRiskColor(persona.churn_risk);
          const riskTextColor = riskColor === 'emerald' ? 'text-emerald-400' : riskColor === 'amber' ? 'text-amber-400' : 'text-rose-400';
          const riskBgColor = riskColor === 'emerald' ? 'bg-emerald-500/15' : riskColor === 'amber' ? 'bg-amber-500/15' : 'bg-rose-500/15';
          const riskBorderColor = riskColor === 'emerald' ? 'border-emerald-500/30' : riskColor === 'amber' ? 'border-amber-500/30' : 'border-rose-500/30';

          return (
            <div key={`persona-${persona.segment}-${index}`} className="bg-transparent backdrop-blur-xl border border-white/10 rounded-xl p-6 hover:border-slate-700 hover:bg-white/5 transition-all duration-300 group min-h-[220px]">
                {/* Icon Badge + Title */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-white/5 rounded-lg flex items-center justify-center text-xl group-hover:bg-white/10 transition-colors shrink-0">
                      {persona.cluster_size > 50 ? '💎' : persona.avg_deal_value > 50000 ? '⭐' : '📊'}
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-bold text-white group-hover:text-indigo-300 transition-colors truncate">
                        {persona.segment || "Unnamed Segment"}
                      </h3>
                      <p className="text-xs text-slate-400 line-clamp-1">{persona.persona_label} economic profile</p>
                    </div>
                  </div>
                  <div className={`${riskBgColor} ${riskTextColor} text-[10px] font-bold px-2 py-0.5 rounded border ${riskBorderColor} shrink-0 uppercase`}>
                    RISK: {persona.churn_risk || "LOW"}
                  </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-transparent rounded-lg p-3 border border-white/5 group-hover:border-white/10 transition-colors">
                    <p className="text-xs text-slate-400 font-medium mb-1 uppercase tracking-tight">Accounts</p>
                    <p className="text-2xl font-black text-white">{persona.cluster_size || "0"}</p>
                  </div>
                  <div className="bg-transparent rounded-lg p-3 border border-white/5 group-hover:border-white/10 transition-colors">
                    <p className="text-xs text-slate-400 font-medium mb-1 uppercase tracking-tight">Avg Margin</p>
                    <p className={`text-2xl font-black ${(persona.avg_margin || "0%").replace('%', '') >= 15 ? 'text-emerald-400' : (persona.avg_margin || "0%").replace('%', '') >= 10 ? 'text-amber-400' : 'text-rose-400'}`}>
                      {persona.avg_margin || "0.0%"}
                    </p>
                  </div>
                </div>

                {/* Action */}
                <button
                  onClick={() => handleAction('detailed')}
                  className="w-full mt-4 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 font-medium py-2.5 rounded-lg text-sm transition-all border border-indigo-500/30 flex items-center justify-center gap-2 active:scale-[0.98]"
                >
                  View Details
                  <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
                </button>
              </div>
            );
          })}
        </div>

      {/* Custom Notification Toast */}
      {notification && (
        <div className="fixed bottom-8 right-8 z-[100] animate-in fade-in slide-in-from-bottom-5 duration-300">
          <div className="bg-slate-900/90 backdrop-blur-xl border border-indigo-500/30 rounded-2xl p-4 pr-12 shadow-2xl flex items-center gap-3 min-w-[320px]">
            <CheckCircle2 size={20} className="text-indigo-400 flex-shrink-0" />
            <p className="text-sm font-medium text-slate-200">{notification}</p>
            <button
              onClick={() => setNotification(null)}
              className="absolute top-4 right-4 text-slate-500 hover:text-white transition-colors"
            >
              <X size={14} />
            </button>
            {/* Progress bar */}
            <div className="absolute bottom-0 left-0 h-1 bg-indigo-500/50 rounded-b-2xl animate-shrink-width" style={{ width: '100%' }}></div>
          </div>
        </div>
      )}
    </div>
  );
}

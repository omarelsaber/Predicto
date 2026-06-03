import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import CausalEngineView from '@/views/IntelligenceLab/CausalEngine/CausalEngineView';
import TopologyOptimizerView from '@/views/IntelligenceLab/TopologyOptimizer/TopologyOptimizerView';
import WarRoomView from '@/views/IntelligenceLab/WarRoom/WarRoomView';

export default function IntelligenceLabView() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'causal' | 'topology' | 'warroom'>('causal');

  return (
    <div className="space-y-6">
      {/* Tab Navigation */}
      <div className="flex gap-4 border-b border-slate-700">
        {[
          { id: 'causal', label: t('nav.causalEngine', 'Causal Inference Engine') },
          { id: 'topology', label: t('nav.topologyOptimizer', 'Topology Optimizer') },
          { id: 'warroom', label: t('nav.warRoom', 'War Room (CFR)') },
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
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'causal' && <CausalEngineView />}
      {activeTab === 'topology' && <TopologyOptimizerView />}
      {activeTab === 'warroom' && <WarRoomView />}
    </div>
  );
}

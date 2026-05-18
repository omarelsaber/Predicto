import { useState } from 'react';
import CausalEngineView from './CausalEngine/CausalEngineView';
import TopologyOptimizerView from './TopologyOptimizer/TopologyOptimizerView';

export default function IntelligenceLabView() {
  const [activeTab, setActiveTab] = useState<'causal' | 'topology'>('causal');

  return (
    <div className="space-y-6">
      {/* Tab Navigation */}
      <div className="flex gap-4 border-b border-slate-700">
        {[
          { id: 'causal', label: 'Causal Inference Engine' },
          { id: 'topology', label: 'Topology Optimizer' },
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
    </div>
  );
}

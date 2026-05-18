import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { Upload, CheckCircle, AlertTriangle } from 'lucide-react';

// Mock status feed events
const statusFeedEvents = [
  { id: 1, status: 'complete', message: 'ZIP extracted (0.3s)', timestamp: '2026-05-18 09:12:45' },
  { id: 2, status: 'complete', message: 'sales_table.csv parsed (1.2s)', timestamp: '2026-05-18 09:12:46' },
  { id: 3, status: 'warning', message: 'product_table.csv: 187 degradation events', timestamp: '2026-05-18 09:12:48' },
  { id: 4, status: 'complete', message: 'customer_table.csv validated (0.8s)', timestamp: '2026-05-18 09:12:50' },
  { id: 5, status: 'complete', message: 'Schema inference complete (2.1s)', timestamp: '2026-05-18 09:12:52' },
];

// Mock degradation log data
const degradationLogData = [
  { id: 1, table: 'product_table', column: 'price', issue: 'Missing values', count: 42, resolution: 'Imputed with median' },
  { id: 2, table: 'product_table', column: 'category', issue: 'Categorical mismatch', count: 18, resolution: 'Mapped to standard taxonomy' },
  { id: 3, table: 'product_table', column: 'sku', issue: 'Duplicates', count: 127, resolution: 'Flagged for review' },
  { id: 4, table: 'sales_table', column: 'amount', issue: 'Negative values', count: 8, resolution: 'Filtered out' },
  { id: 5, table: 'customer_table', column: 'email', issue: 'Invalid format', count: 23, resolution: 'Marked invalid' },
  { id: 6, table: 'sales_table', column: 'date', issue: 'Future dates', count: 3, resolution: 'Imputed with current date' },
];

// Mock data preview
const dataPreviewData = [
  { id: 1, customer_id: 'CUST001', company: 'TechCorp Global', segment: 'Enterprise', arr: 450000, churn_risk: 'Low' },
  { id: 2, customer_id: 'CUST002', company: 'CloudMesh Inc', segment: 'Mid-Market', arr: 156000, churn_risk: 'Medium' },
  { id: 3, customer_id: 'CUST003', company: 'RetailPro Solutions', segment: 'Enterprise', arr: 342000, churn_risk: 'Low' },
  { id: 4, customer_id: 'CUST004', company: 'AnalyticsPlatform Co', segment: 'Mid-Market', arr: 128000, churn_risk: 'High' },
  { id: 5, customer_id: 'CUST005', company: 'SecurityVault Ltd', segment: 'Enterprise', arr: 285000, churn_risk: 'Low' },
];

export default function DataWorkspaceView() {
  const [activeTab, setActiveTab] = useState<'degradation' | 'preview'>('degradation');
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(true);
  };

  const handleDragLeave = () => {
    setIsDraggingOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
    // Handle file drop here
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="border-b border-slate-700 pb-6">
        <h1 className="text-3xl font-bold text-slate-50">Data Workspace</h1>
        <p className="text-slate-400 mt-2">Upload and manage your revenue data. Predicto will automatically ingest, validate, and flag quality issues.</p>
      </div>

      {/* Top Half: Ingest Dropzone */}
      <div className="space-y-4">
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-lg p-12 text-center transition cursor-pointer ${
            isDraggingOver
              ? 'border-indigo-500 bg-indigo-500/10'
              : 'border-slate-600 bg-slate-800/50 hover:bg-slate-800'
          }`}
        >
          <Upload size={40} className="mx-auto text-slate-400 mb-4" />
          <p className="text-lg font-semibold text-slate-100">Drop your ZIP file here</p>
          <p className="text-sm text-slate-400 mt-2">or click to select files</p>
          <p className="text-xs text-slate-500 mt-3">Supports: .zip (max 500MB)</p>
        </div>

        {/* Real-Time Status Feed */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Real-Time Status Feed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 font-mono text-sm max-h-64 overflow-y-auto">
              {statusFeedEvents.map((event) => (
                <div key={event.id} className="flex items-start gap-3 pb-3 border-b border-slate-700 last:border-b-0">
                  <div className="flex-shrink-0 pt-0.5">
                    {event.status === 'complete' ? (
                      <CheckCircle size={18} className="text-emerald-400" />
                    ) : (
                      <AlertTriangle size={18} className="text-yellow-400" />
                    )}
                  </div>
                  <div className="flex-1">
                    <p className={event.status === 'complete' ? 'text-emerald-300' : 'text-yellow-300'}>
                      {event.status === 'complete' ? '✓' : '⚠️'} {event.message}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">{event.timestamp}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Bottom Half: Tabs */}
      <div className="space-y-4">
        {/* Tab Navigation */}
        <div className="flex gap-4 border-b border-slate-700">
          {[
            { id: 'degradation', label: 'Degradation Log' },
            { id: 'preview', label: 'Data Preview' },
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
        {activeTab === 'degradation' && (
          <Card>
            <CardContent className="pt-6">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700">
                      <th className="text-left py-3 px-4 text-slate-400 font-semibold">Table</th>
                      <th className="text-left py-3 px-4 text-slate-400 font-semibold">Column</th>
                      <th className="text-left py-3 px-4 text-slate-400 font-semibold">Issue Type</th>
                      <th className="text-center py-3 px-4 text-slate-400 font-semibold">Count</th>
                      <th className="text-left py-3 px-4 text-slate-400 font-semibold">Resolution</th>
                    </tr>
                  </thead>
                  <tbody>
                    {degradationLogData.map((row, idx) => (
                      <tr key={idx} className="border-b border-slate-700 hover:bg-slate-700/50 transition">
                        <td className="py-3 px-4 text-slate-200 font-medium">{row.table}</td>
                        <td className="py-3 px-4 text-slate-300">{row.column}</td>
                        <td className="py-3 px-4">
                          <span className="inline-flex items-center gap-1 text-yellow-300">
                            <AlertTriangle size={14} />
                            {row.issue}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center text-slate-300">{row.count}</td>
                        <td className="py-3 px-4 text-slate-400">{row.resolution}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {activeTab === 'preview' && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">sales_table.csv Preview (5 rows)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700">
                      <th className="text-left py-3 px-4 text-slate-400 font-semibold">Customer ID</th>
                      <th className="text-left py-3 px-4 text-slate-400 font-semibold">Company</th>
                      <th className="text-left py-3 px-4 text-slate-400 font-semibold">Segment</th>
                      <th className="text-right py-3 px-4 text-slate-400 font-semibold">ARR</th>
                      <th className="text-left py-3 px-4 text-slate-400 font-semibold">Churn Risk</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dataPreviewData.map((row, idx) => (
                      <tr key={idx} className="border-b border-slate-700 hover:bg-slate-700/50 transition">
                        <td className="py-3 px-4 text-slate-300 font-mono">{row.customer_id}</td>
                        <td className="py-3 px-4 text-slate-200 font-medium">{row.company}</td>
                        <td className="py-3 px-4 text-slate-300">{row.segment}</td>
                        <td className="py-3 px-4 text-right text-slate-200">${(row.arr / 1000).toFixed(0)}K</td>
                        <td className="py-3 px-4">
                          <span
                            className={`inline-flex items-center px-2 py-1 rounded text-xs font-semibold ${
                              row.churn_risk === 'Low'
                                ? 'bg-emerald-500/20 text-emerald-300'
                                : row.churn_risk === 'Medium'
                                ? 'bg-yellow-500/20 text-yellow-300'
                                : 'bg-red-500/20 text-red-300'
                            }`}
                          >
                            {row.churn_risk}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-slate-500 mt-4">Showing 5 of 2,847 rows. Load more to see complete dataset.</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

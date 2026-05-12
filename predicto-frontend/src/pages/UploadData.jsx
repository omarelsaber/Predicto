import { Cloud, File, Trash2, Settings } from 'lucide-react';

export default function UploadData() {
  const recentFiles = [
    { name: 'Q1_2024_Sales.csv', size: '2.4 MB', date: '2024-01-22', rows: 9994 },
    { name: 'Q4_2023_Transactions.csv', size: '1.8 MB', date: '2024-01-15', rows: 7823 },
    { name: 'Customer_Master.csv', size: '840 KB', date: '2024-01-10', rows: 1247 }
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-black text-white">Upload Data</h2>
        <p className="text-sm text-slate-400 mt-1">Import transaction data for analysis</p>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-2 gap-6">
        {/* Left: Drag/Drop Zone */}
        <div>
          <div className="bg-slate-900/40 backdrop-blur-2xl border-2 border-dashed border-slate-700/50 rounded-xl p-12 flex flex-col items-center justify-center text-center hover:border-indigo-500 hover:bg-slate-900/60 transition-all cursor-pointer group shadow-2xl">
            <div className="mb-4 p-4 bg-indigo-500/10 rounded-full group-hover:bg-indigo-500/20 transition-colors">
              <Cloud size={32} className="text-indigo-400" />
            </div>
            <h3 className="text-lg font-bold text-white mb-1">Drop CSV file here</h3>
            <p className="text-sm text-slate-400 mb-6">or click to browse</p>
            <div className="text-xs text-slate-500 space-y-1">
              <p>Maximum 100 MB • CSV format</p>
              <p>Supports: Order ID, Date, Customer, Segment, Region, Product, Sales, Margin</p>
            </div>
          </div>

          {/* Upload Tips */}
          <div className="mt-6 bg-slate-900/40 backdrop-blur-xl border border-slate-800/50 rounded-xl p-5 shadow-xl">
            <h4 className="text-sm font-bold text-white mb-3">Upload Tips</h4>
            <ul className="space-y-2 text-xs text-slate-400">
              <li className="flex gap-2">
                <span className="text-indigo-400 font-bold">•</span>
                <span>Include headers in first row</span>
              </li>
              <li className="flex gap-2">
                <span className="text-indigo-400 font-bold">•</span>
                <span>Use ISO date format (YYYY-MM-DD)</span>
              </li>
              <li className="flex gap-2">
                <span className="text-indigo-400 font-bold">•</span>
                <span>Ensure numeric sales values</span>
              </li>
              <li className="flex gap-2">
                <span className="text-indigo-400 font-bold">•</span>
                <span>Remove duplicates before upload</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Right: Recently Uploaded */}
        <div>
          <div className="bg-slate-900/40 backdrop-blur-2xl border border-slate-800/50 rounded-xl p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-sm font-bold text-white">Recently Uploaded</h3>
              <button className="text-slate-400 hover:text-slate-300 transition-colors">
                <Settings size={18} />
              </button>
            </div>

            <div className="space-y-3">
              {recentFiles.map((file, idx) => (
                <div
                  key={idx}
                  className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 flex items-start justify-between hover:bg-slate-800 transition-colors"
                >
                  <div className="flex gap-3 flex-1">
                    <div className="w-10 h-10 bg-indigo-500/15 rounded-lg flex items-center justify-center flex-shrink-0">
                      <File size={20} className="text-indigo-400" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-white truncate">{file.name}</p>
                      <div className="flex gap-3 text-xs text-slate-400 mt-1">
                        <span>{file.size}</span>
                        <span>•</span>
                        <span>{file.rows.toLocaleString()} rows</span>
                        <span>•</span>
                        <span>{file.date}</span>
                      </div>
                    </div>
                  </div>
                  <button className="text-slate-400 hover:text-rose-400 transition-colors flex-shrink-0 ml-2">
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>

            <button className="w-full mt-6 bg-indigo-500 hover:bg-indigo-600 text-white font-medium py-3 rounded-lg transition-colors">
              Upload New File
            </button>
          </div>

          {/* Settings */}
          <div className="mt-6 bg-slate-900/40 backdrop-blur-xl border border-slate-800/50 rounded-xl p-6 shadow-xl">
            <h4 className="text-sm font-bold text-white mb-4">Data Settings</h4>
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-slate-400 font-medium mb-2">Auto-refresh Interval</label>
                <select className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500">
                  <option>Daily</option>
                  <option>Weekly</option>
                  <option>Monthly</option>
                  <option>Manual</option>
                </select>
              </div>
              <div>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" defaultChecked className="w-4 h-4 accent-indigo-500" />
                  <span className="text-sm text-slate-300">Notify on upload completion</span>
                </label>
              </div>
              <div>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" defaultChecked className="w-4 h-4 accent-indigo-500" />
                  <span className="text-sm text-slate-300">Auto-validate data quality</span>
                </label>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

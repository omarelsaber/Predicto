import { Search, Download, Filter } from 'lucide-react';

export default function DataExplorer() {
  const transactions = [
    {
      id: 'ORD-2024-001',
      date: '2024-01-15',
      customer: 'Acme Corp',
      segment: 'Enterprise',
      region: 'North America',
      product: 'Platform',
      sales: 85000,
      margin: 24.5
    },
    {
      id: 'ORD-2024-002',
      date: '2024-01-16',
      customer: 'TechStart Inc',
      segment: 'SMB',
      region: 'Europe',
      product: 'Suite',
      sales: 32000,
      margin: 16.2
    },
    {
      id: 'ORD-2024-003',
      date: '2024-01-17',
      customer: 'Global Finance Ltd',
      segment: 'Enterprise',
      region: 'APAC',
      product: 'Custom',
      sales: 156000,
      margin: 19.8
    },
    {
      id: 'ORD-2024-004',
      date: '2024-01-18',
      customer: 'Growth Ventures',
      segment: 'Mid-Market',
      region: 'North America',
      product: 'Platform',
      sales: 52000,
      margin: 12.1
    },
    {
      id: 'ORD-2024-005',
      date: '2024-01-19',
      customer: 'Innovation Labs',
      segment: 'SMB',
      region: 'North America',
      product: 'Suite',
      sales: 28000,
      margin: 8.7
    },
    {
      id: 'ORD-2024-006',
      date: '2024-01-20',
      customer: 'Enterprise Solutions',
      segment: 'Enterprise',
      region: 'Europe',
      product: 'Platform',
      sales: 120000,
      margin: 22.3
    },
    {
      id: 'ORD-2024-007',
      date: '2024-01-21',
      customer: 'Market Leaders Inc',
      segment: 'Mid-Market',
      region: 'APAC',
      product: 'Custom',
      sales: 75000,
      margin: 14.6
    },
    {
      id: 'ORD-2024-008',
      date: '2024-01-22',
      customer: 'Digital Transformation Co',
      segment: 'SMB',
      region: 'Europe',
      product: 'Suite',
      sales: 35000,
      margin: 5.3
    }
  ];

  const getMarginColor = (margin) => {
    if (margin >= 15) return 'text-emerald-400';
    if (margin >= 10) return 'text-amber-400';
    return 'text-rose-400';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-black text-white">Data Explorer</h2>
        <p className="text-sm text-slate-400 mt-1">Browse and analyze verified transactions</p>
      </div>

      {/* Filters */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex gap-4 items-end">
        <div className="flex-1">
          <label className="block text-xs text-slate-400 font-medium mb-2">Search</label>
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Order ID, customer name..."
              className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-10 pr-4 py-2.5 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
        </div>
        <div className="flex-shrink-0">
          <label className="block text-xs text-slate-400 font-medium mb-2">Segment</label>
          <select className="bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500">
            <option>All Segments</option>
            <option>Enterprise</option>
            <option>Mid-Market</option>
            <option>SMB</option>
          </select>
        </div>
        <button className="flex items-center gap-2 bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-400 font-medium py-2.5 px-4 rounded-lg transition-colors border border-indigo-500/30 text-sm">
          <Download size={16} />
          Export CSV
        </button>
      </div>

      {/* Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-800/50">
                <th className="px-6 py-4 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">Order ID</th>
                <th className="px-6 py-4 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">Date</th>
                <th className="px-6 py-4 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">Customer</th>
                <th className="px-6 py-4 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">Segment</th>
                <th className="px-6 py-4 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">Region</th>
                <th className="px-6 py-4 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">Product</th>
                <th className="px-6 py-4 text-right text-xs font-bold text-slate-400 uppercase tracking-wider">Sales</th>
                <th className="px-6 py-4 text-right text-xs font-bold text-slate-400 uppercase tracking-wider">Margin</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((tx, idx) => (
                <tr
                  key={tx.id}
                  className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors"
                >
                  <td className="px-6 py-4 text-sm font-mono text-indigo-400">{tx.id}</td>
                  <td className="px-6 py-4 text-sm text-slate-300">{tx.date}</td>
                  <td className="px-6 py-4 text-sm text-slate-300 font-medium">{tx.customer}</td>
                  <td className="px-6 py-4 text-sm text-slate-300">{tx.segment}</td>
                  <td className="px-6 py-4 text-sm text-slate-300">{tx.region}</td>
                  <td className="px-6 py-4 text-sm text-slate-300">{tx.product}</td>
                  <td className="px-6 py-4 text-sm text-slate-300 text-right font-mono">${tx.sales.toLocaleString()}</td>
                  <td className={`px-6 py-4 text-sm text-right font-bold ${getMarginColor(tx.margin)}`}>{tx.margin}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-400">Showing 1-8 of 342 transactions</p>
        <div className="flex gap-2">
          <button className="bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 font-medium py-2 px-4 rounded-lg text-sm transition-colors">
            Previous
          </button>
          <button className="bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 font-medium py-2 px-4 rounded-lg text-sm transition-colors">
            Next
          </button>
        </div>
      </div>
    </div>
  );
}

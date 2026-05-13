import { useState, useMemo, useEffect } from 'react';
import { Search, Download, Filter, ChevronLeft, ChevronRight } from 'lucide-react';

import api from '../api';

const ITEMS_PER_PAGE = 8;

export default function DataExplorer() {
  // 1. State Management
  const [transactions, setTransactions] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [segmentFilter, setSegmentFilter] = useState('All Segments');
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Live backend fetch
  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        // Call the new /transactions endpoint (which returns all rows)
        const response = await api.get('/transactions');
        
        if (response.data.status === 'success' || response.data.status === 'no_data') {
          // Map backend aliases ("Order ID") to frontend logic keys ("id")
          const mappedData = response.data.data.map(item => ({
            id: item["Order ID"],
            date: item["Order Date"],
            customer: item["Customer"],
            segment: item["Segment"],
            region: item["Region"],
            product: item["Product"],
            sales: item["Sales"],
            margin: item["Margin"]
          }));
          setTransactions(mappedData);
        } else {
          setError("The server returned an unexpected response format.");
        }
      } catch (err) {
        console.error("Failed to fetch transactions:", err);
        setError("Could not connect to the Predicto engine. Please ensure the backend is running.");
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, []);

  // 2. Computed Data Logic (Filtering & Searching)
  const filteredTransactions = useMemo(() => {
    return transactions.filter(tx => {
      const matchesSearch = 
        tx.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        tx.customer.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesSegment = 
        segmentFilter === 'All Segments' || tx.segment === segmentFilter;

      return matchesSearch && matchesSegment;
    });
  }, [transactions, searchQuery, segmentFilter]);

  // Reset page on filter change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, segmentFilter]);

  // 3. Pagination Logic
  const totalPages = Math.ceil(filteredTransactions.length / ITEMS_PER_PAGE);
  const paginatedTransactions = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredTransactions.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredTransactions, currentPage]);

  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE + 1;
  const endIndex = Math.min(currentPage * ITEMS_PER_PAGE, filteredTransactions.length);

  // 6. Export CSV Logic
  const handleExportCSV = () => {
    if (filteredTransactions.length === 0) return;

    const headers = ['Order ID', 'Date', 'Customer', 'Segment', 'Region', 'Product', 'Sales', 'Margin'];
    const rows = filteredTransactions.map(tx => [
      tx.id, tx.date, tx.customer, tx.segment, tx.region, tx.product, tx.sales, `${tx.margin}%`
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(r => r.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `predicto_export_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getMarginColor = (margin) => {
    const value = parseFloat(margin);
    if (value >= 15) return 'text-emerald-400';
    if (value >= 10) return 'text-amber-400';
    return 'text-rose-400';
  };

  return (
    <div className="space-y-6 relative bg-transparent">
      <video 
        autoPlay 
        loop 
        muted 
        playsInline 
        className="fixed inset-0 w-full h-full object-cover -z-10 opacity-20 pointer-events-none"
      >
        <source src="/explorer-bg.mp4" type="video/mp4" />
      </video>

      {/* Header */}
      <div>
        <h2 className="text-2xl font-black text-white">Data Explorer</h2>
        <p className="text-sm text-slate-400 mt-1">Browse and analyze verified transactions</p>
      </div>

      {/* Filters */}
      <div className="bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-xl p-5 flex gap-4 items-end shadow-2xl">
        <div className="flex-1">
          <label className="block text-xs text-slate-400 font-medium mb-2">Search</label>
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Order ID, customer name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-10 pr-4 py-2.5 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
        </div>
        <div className="flex-shrink-0">
          <label className="block text-xs text-slate-400 font-medium mb-2">Segment</label>
          <select 
            value={segmentFilter}
            onChange={(e) => setSegmentFilter(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            <option>All Segments</option>
            <option>Enterprise</option>
            <option>Mid-Market</option>
            <option>SMB</option>
          </select>
        </div>
        <button 
          onClick={handleExportCSV}
          className="flex items-center gap-2 bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-400 font-medium py-2.5 px-4 rounded-lg transition-colors border border-indigo-500/30 text-sm"
        >
          <Download size={16} />
          Export CSV
        </button>
      </div>

      {/* Table */}
      <div className="bg-slate-900/30 backdrop-blur-xl border border-white/10 rounded-xl overflow-hidden shadow-2xl">
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
              {isLoading ? (
                <tr>
                  <td colSpan="8" className="px-6 py-20 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-8 h-8 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin"></div>
                      <p className="text-sm text-slate-400">Loading records from Predicto engine...</p>
                    </div>
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan="8" className="px-6 py-12 text-center text-rose-400 text-sm bg-rose-500/5">
                    {error}
                  </td>
                </tr>
              ) : paginatedTransactions.map((tx) => (
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
                  <td className="px-6 py-4 text-sm text-slate-300 text-right font-mono">
                    ${typeof tx.sales === 'number' ? tx.sales.toLocaleString() : tx.sales}
                  </td>
                  <td className={`px-6 py-4 text-sm text-right font-bold ${getMarginColor(tx.margin)}`}>
                    {tx.margin}{typeof tx.margin === 'number' ? '%' : ''}
                  </td>
                </tr>
              ))}
              {!isLoading && !error && filteredTransactions.length === 0 && (
                <tr>
                  <td colSpan="8" className="px-6 py-12 text-center text-slate-500 text-sm italic">
                    No transactions found matching your criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-400">
          Showing {filteredTransactions.length > 0 ? `${startIndex}-${endIndex}` : '0'} of {filteredTransactions.length} transactions
        </p>
        <div className="flex gap-2">
          <button 
            onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
            disabled={currentPage === 1 || filteredTransactions.length === 0}
            className="bg-slate-900 hover:bg-slate-800 disabled:opacity-50 disabled:hover:bg-slate-900 border border-slate-800 text-slate-300 font-medium py-2 px-4 rounded-lg text-sm transition-colors flex items-center gap-1"
          >
            <ChevronLeft size={16} />
            Previous
          </button>
          <button 
            onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
            disabled={currentPage === totalPages || filteredTransactions.length === 0}
            className="bg-slate-900 hover:bg-slate-800 disabled:opacity-50 disabled:hover:bg-slate-900 border border-slate-800 text-slate-300 font-medium py-2 px-4 rounded-lg text-sm transition-colors flex items-center gap-1"
          >
            Next
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

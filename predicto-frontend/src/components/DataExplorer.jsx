import { useState, useEffect, useMemo } from 'react';
import { Search, Filter, Download, Database, Loader2 } from 'lucide-react';
import api from '../api';
import { motion } from 'framer-motion';

const PAGE_SIZE = 12;

/** API may send snake_case or CSV aliases ("Order ID", …) — normalize for one code path */
function normalizePreviewRow(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const gid = (a, b) => {
    const v = raw[a] ?? raw[b];
    return v === undefined || v === null ? '' : String(v);
  };
  const salesRaw = raw['Sales'] ?? raw.sales;
  let salesNum = Number(salesRaw);
  if (!Number.isFinite(salesNum)) salesNum = 0;

  return {
    order_id: gid('Order ID', 'order_id'),
    order_date: gid('Order Date', 'order_date'),
    customer: gid('Customer', 'customer'),
    segment: gid('Segment', 'segment'),
    region: gid('Region', 'region'),
    product: gid('Product', 'product'),
    sales: salesNum,
    margin: gid('Margin', 'margin'),
  };
}

function formatUSD(value) {
  const n = Number(value);
  const safe = Number.isFinite(n) ? n : 0;
  return `$${safe.toLocaleString()}`;
}

function escapeCsvCell(val) {
  const s = String(val ?? '');
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export default function DataExplorer() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [totalRows, setTotalRows] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterSegment, setFilterSegment] = useState('All');
  const [page, setPage] = useState(1);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        const res = await api.get('/preview');
        const body = res.data;
        if (body.status === 'error') {
          setData([]);
          setTotalRows(0);
          setError('No transaction data in cache. Upload a CSV from the Upload page.');
          return;
        }
        const rows = Array.isArray(body.data) ? body.data : [];
        setData(rows.map(normalizePreviewRow).filter(Boolean));
        setTotalRows(typeof body.count === 'number' ? body.count : 0);
        setError(null);
      } catch (err) {
        console.error("Error fetching data preview:", err);
        setError("Failed to load data preview. Ensure models are ready.");
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  const segments = useMemo(() => {
    const s = new Set(data.map(r => r.segment));
    return ['All', ...Array.from(s)];
  }, [data]);

  const filteredData = useMemo(() => {
    return data.filter(row => {
      const matchesSearch =
        String(row.order_id ?? '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        String(row.customer ?? '').toLowerCase().includes(searchTerm.toLowerCase());

      const matchesFilter = filterSegment === 'All' || row.segment === filterSegment;

      return matchesSearch && matchesFilter;
    });
  }, [data, searchTerm, filterSegment]);

  useEffect(() => {
    setPage(1);
  }, [searchTerm, filterSegment]);

  const totalPages = Math.max(1, Math.ceil(filteredData.length / PAGE_SIZE) || 1);

  useEffect(() => {
    setPage(p => Math.min(p, totalPages));
  }, [totalPages]);

  const safePage = Math.min(page, totalPages);
  const pageStart = (safePage - 1) * PAGE_SIZE;
  const visibleRows = filteredData.slice(pageStart, pageStart + PAGE_SIZE);

  const handleExportCSV = () => {
    if (visibleRows.length === 0) return;

    const headers = [
      'Order ID',
      'Order Date',
      'Customer',
      'Segment',
      'Region',
      'Product',
      'Sales',
      'Margin',
    ];
    const csvRows = visibleRows.map(row =>
      [
        row.order_id,
        row.order_date,
        row.customer,
        row.segment,
        row.region,
        row.product,
        row.sales,
        row.margin,
      ].map(escapeCsvCell).join(',')
    );

    const csvContent = [headers.join(','), ...csvRows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `predicto_export_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const columns = [
    { key: 'order_id', label: 'Order ID' },
    { key: 'order_date', label: 'Order Date' },
    { key: 'customer', label: 'Customer' },
    { key: 'segment', label: 'Segment' },
    { key: 'region', label: 'Region' },
    { key: 'product', label: 'Product' },
    { key: 'sales', label: 'Sales' },
    { key: 'margin', label: 'Margin' },
  ];

  return (
    <div className="space-y-6">
      <header className="mb-6 flex flex-col md:flex-row md:justify-between md:items-end gap-4">
        <div>
          <h2 className="text-3xl font-bold text-white tracking-tight mb-2">Data Explorer</h2>
          <p className="text-gray-400">Search, filter, and inspect the underlying verified dataset.</p>
        </div>
        <div className="flex items-center gap-3 bg-[#0f172a] border border-gray-800 px-4 py-2 rounded-xl text-sm text-gray-400 shadow-[0_0_15px_rgba(59,130,246,0.05)]">
          <Database size={18} className="text-brand-primary" />
          <span className="font-medium">Total Dataset Size: <strong className="text-white ml-1 text-base">{totalRows.toLocaleString()}</strong></span>
        </div>
      </header>

      {error ? (
        <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-8 text-center text-rose-400">
          <p>{error}</p>
        </div>
      ) : (
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-[#0f172a] border border-gray-800 rounded-xl shadow-[0_0_15px_rgba(59,130,246,0.05)] overflow-hidden flex flex-col"
        >
          {/* Toolbar */}
          <div className="p-4 border-b border-gray-800 flex flex-col sm:flex-row justify-between items-center gap-4 bg-[#1e293b]/20">
            <div className="relative w-full sm:w-96">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
              <input 
                type="text" 
                placeholder="Search by Order ID or Customer..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-[#020617] border border-gray-700 rounded-lg pl-10 pr-4 py-2.5 text-sm text-white focus:outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary transition-all shadow-inner"
              />
            </div>
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <div className="relative w-full sm:w-40">
                <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={14} />
                <select 
                  value={filterSegment}
                  onChange={(e) => setFilterSegment(e.target.value)}
                  className="w-full bg-[#020617] border border-gray-700 rounded-lg pl-9 pr-4 py-2.5 text-sm text-gray-300 focus:outline-none focus:border-brand-primary transition-all appearance-none"
                >
                  {segments.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <button 
                type="button"
                onClick={handleExportCSV}
                disabled={visibleRows.length === 0}
                className="flex items-center justify-center gap-2 px-4 py-2.5 bg-[#020617] border border-gray-700 rounded-lg text-sm font-medium text-gray-300 hover:text-white hover:border-gray-500 transition-colors w-full sm:w-auto shadow-sm disabled:opacity-40 disabled:pointer-events-none"
              >
                <Download size={16} /> Export CSV
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto custom-scrollbar min-h-[400px]">
            {loading ? (
              <div className="flex flex-col items-center justify-center h-96 text-gray-500">
                <Loader2 className="animate-spin mb-4 text-brand-primary" size={32} />
                <p>Fetching transaction records...</p>
              </div>
            ) : (
              <table className="w-full text-left text-sm text-gray-300">
                <thead className="text-[11px] text-gray-500 uppercase bg-[#1e293b]/50 border-b border-gray-800 tracking-wider">
                  <tr>
                    {columns.map(col => (
                      <th key={col.key} className="px-6 py-4 font-bold">{col.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800/60">
                  {visibleRows.map((row, i) => (
                    <tr key={`${row.order_id}-${pageStart + i}`} className="hover:bg-[#1e293b]/30 transition-colors group">
                      <td className="px-6 py-4 whitespace-nowrap font-semibold text-brand-primary cursor-pointer hover:text-blue-400 hover:underline">{row.order_id}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-gray-400">{row.order_date}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-white font-medium">{row.customer}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="bg-[#1e293b] border border-gray-700 text-gray-200 px-2.5 py-1 rounded text-xs font-semibold">{row.segment}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">{row.region}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-gray-400">{row.product}</td>
                      <td className="px-6 py-4 whitespace-nowrap font-semibold text-white">{formatUSD(row.sales)}</td>
                      <td className="px-6 py-4 whitespace-nowrap font-bold text-emerald-400">{row.margin}</td>
                    </tr>
                  ))}
                  {visibleRows.length === 0 && (
                    <tr>
                      <td colSpan={columns.length} className="px-6 py-20 text-center text-gray-500 italic">
                        No records match your current search/filter criteria.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>

          {/* Pagination Footer */}
          <div className="p-4 border-t border-gray-800 bg-[#1e293b]/30 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-gray-500">
            <span>
              Showing <strong className="text-white font-semibold">{filteredData.length === 0 ? 0 : pageStart + 1}–{Math.min(pageStart + visibleRows.length, filteredData.length)}</strong>
              {' '}of <strong className="text-white font-semibold">{filteredData.length}</strong> filtered rows
              {' '}(sample of <strong className="text-white font-semibold">{data.length}</strong> loaded ·{' '}
              <strong className="text-white font-semibold">{totalRows.toLocaleString()}</strong> total in dataset)
            </span>
            <div className="flex gap-1.5 items-center flex-wrap justify-center">
              <button
                type="button"
                disabled={safePage <= 1}
                onClick={() => setPage(p => Math.max(1, p - 1))}
                className="px-3 py-1.5 border border-gray-700 rounded-md font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:border-gray-500"
              >
                Prev
              </button>
              <span className="px-3 py-1.5 text-gray-400">
                Page <strong className="text-white">{safePage}</strong> / {totalPages}
              </span>
              <button
                type="button"
                disabled={safePage >= totalPages}
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                className="px-3 py-1.5 border border-gray-700 rounded-md font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:border-gray-500"
              >
                Next
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}

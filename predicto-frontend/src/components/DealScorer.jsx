import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, ShieldAlert, ShieldCheck, Shield } from 'lucide-react';
import api from '../api';

export default function DealScorer() {
  const [formData, setFormData] = useState({
    segment: 'Enterprise',
    region: 'EMEA',
    industry: 'Technology',
    product: 'ContactMatcher',
    sales: 5000,
    quantity: 1,
    discount: 0.15
  });
  
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const handleChange = (e) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'number' ? parseFloat(value) : value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      // Ensure all numeric fields are properly typed to avoid 422 errors
      const payload = {
        segment: String(formData.segment),
        region: String(formData.region),
        industry: String(formData.industry),
        product: String(formData.product),
        sales: parseFloat(formData.sales) || 0.01,
        quantity: parseInt(formData.quantity, 10) || 1,
        discount: parseFloat(formData.discount) || 0,
      };
      const response = await api.post('/deals/score', payload);
      setResult(response.data);
    } catch (err) {
      const detail = err.response?.data?.detail;
      const message = typeof detail === 'object' ? detail.message : (typeof detail === 'string' ? detail : null);
      setError(message || err.response?.data?.message || "Failed to score deal. Please check all fields.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <header className="mb-8">
        <h2 className="text-3xl font-bold text-white tracking-tight mb-2">Deal Scorer</h2>
        <p className="text-gray-400">Real-time XGBoost margin prediction and risk assessment for live negotiations.</p>
      </header>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        {/* Form Panel */}
        <div className="bg-[#0f172a] border border-gray-800 rounded-xl p-8 shadow-[0_0_15px_rgba(59,130,246,0.05)] h-fit">
          <h3 className="text-xl font-semibold text-white mb-6 flex items-center gap-2">
             <span className="w-1.5 h-6 bg-brand-primary rounded-full inline-block"></span>
             Deal Parameters
          </h3>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid grid-cols-2 gap-5">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Segment</label>
                <select name="segment" value={formData.segment} onChange={handleChange} className="w-full bg-[#1e293b]/50 border border-gray-700 rounded-lg p-3 text-sm text-white focus:outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary transition-all">
                  <option value="Enterprise">Enterprise</option>
                  <option value="SMB">SMB</option>
                  <option value="Strategic">Strategic</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Region</label>
                <select name="region" value={formData.region} onChange={handleChange} className="w-full bg-[#1e293b]/50 border border-gray-700 rounded-lg p-3 text-sm text-white focus:outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary transition-all">
                  <option value="EMEA">EMEA</option>
                  <option value="AMER">AMER</option>
                  <option value="APAC">APAC</option>
                </select>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-5">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Industry</label>
                <select name="industry" value={formData.industry} onChange={handleChange} className="w-full bg-[#1e293b]/50 border border-gray-700 rounded-lg p-3 text-sm text-white focus:outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary transition-all">
                  <option value="Technology">Technology</option>
                  <option value="Finance">Finance</option>
                  <option value="Healthcare">Healthcare</option>
                  <option value="Manufacturing">Manufacturing</option>
                  <option value="Retail">Retail</option>
                  <option value="Education">Education</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Product</label>
                <select name="product" value={formData.product} onChange={handleChange} className="w-full bg-[#1e293b]/50 border border-gray-700 rounded-lg p-3 text-sm text-white focus:outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary transition-all">
                  <option value="ContactMatcher">ContactMatcher</option>
                  <option value="DataSmasher">DataSmasher</option>
                  <option value="SiteAnalytics">SiteAnalytics</option>
                  <option value="MarketingSuite">MarketingSuite</option>
                  <option value="SupportBot">SupportBot</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Sales ($)</label>
                <input type="number" name="sales" value={formData.sales} onChange={handleChange} min="1" step="0.01" required className="w-full bg-[#1e293b]/50 border border-gray-700 rounded-lg p-3 text-sm text-white focus:outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary transition-all" />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Quantity</label>
                <input type="number" name="quantity" value={formData.quantity} onChange={handleChange} min="1" step="1" required className="w-full bg-[#1e293b]/50 border border-gray-700 rounded-lg p-3 text-sm text-white focus:outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary transition-all" />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Discount (0-0.9)</label>
                <input type="number" name="discount" value={formData.discount} onChange={handleChange} min="0" max="0.9" step="0.01" required className="w-full bg-[#1e293b]/50 border border-gray-700 rounded-lg p-3 text-sm text-white focus:outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary transition-all" />
              </div>
            </div>

            <div className="pt-6 border-t border-gray-800">
              <button 
                type="submit" 
                disabled={loading}
                className="w-full bg-brand-primary hover:bg-blue-600 active:bg-blue-700 text-white font-medium py-3.5 px-4 rounded-lg transition-all duration-200 disabled:opacity-50 flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(59,130,246,0.3)] hover:shadow-[0_0_20px_rgba(59,130,246,0.4)]"
              >
                {loading ? <><Loader2 size={18} className="animate-spin"/> Executing AI Scoring...</> : <><ShieldCheck size={18} /> Score Deal Risk</>}
              </button>
            </div>
          </form>
        </div>

        {/* Verdict Panel */}
        <div className="bg-[#0f172a] border border-gray-800 rounded-xl p-8 shadow-[0_0_15px_rgba(59,130,246,0.05)] flex flex-col min-h-[450px]">
          <h3 className="text-xl font-semibold text-white mb-6 flex items-center gap-2">
             <span className="w-1.5 h-6 bg-brand-accent rounded-full inline-block"></span>
             Verdict Panel
          </h3>
          
          <div className="flex-1 flex flex-col items-center justify-center bg-[#1e293b]/30 border border-gray-800/80 rounded-xl p-8 relative overflow-hidden">
            <AnimatePresence mode="wait">
              {!result && !error && !loading && (
                <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-center text-gray-500 flex flex-col items-center">
                  <div className="w-20 h-20 bg-gray-800/50 rounded-full flex items-center justify-center mb-4">
                    <Shield size={32} className="opacity-40 text-gray-400" />
                  </div>
                  <h4 className="text-lg font-medium text-gray-300 mb-2">Awaiting Parameters</h4>
                  <p className="text-sm max-w-[250px]">Submit deal configuration to view margin risk analysis.</p>
                </motion.div>
              )}

              {error && (
                <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-center text-rose-400">
                  <div className="w-20 h-20 bg-rose-500/10 rounded-full flex items-center justify-center mb-4 mx-auto border border-rose-500/20">
                     <ShieldAlert size={32} />
                  </div>
                  <h4 className="text-lg font-medium mb-1">Scoring Failed</h4>
                  <p className="text-sm max-w-[300px] mx-auto opacity-80">{error}</p>
                </motion.div>
              )}

              {result && !loading && (
                <motion.div key="result" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="w-full flex flex-col items-center">
                  <div className="text-center mb-8">
                    <span className="text-gray-400 text-xs font-bold uppercase tracking-widest block mb-3">Predicted Margin</span>
                    <div className="flex items-end justify-center gap-2">
                      <span className={`text-7xl font-black tracking-tighter ${result.predicted_margin_rate < 0 ? 'text-rose-500 drop-shadow-[0_0_15px_rgba(244,63,94,0.3)]' : result.predicted_margin_rate > 0.2 ? 'text-emerald-500 drop-shadow-[0_0_15px_rgba(16,185,129,0.3)]' : 'text-yellow-500 drop-shadow-[0_0_15px_rgba(234,179,8,0.3)]'}`}>
                        {(result.predicted_margin_rate * 100).toFixed(1)}%
                      </span>
                    </div>
                  </div>

                  <div className="w-full bg-[#0f172a]/80 border border-gray-700/60 rounded-xl p-5 mb-6 shadow-inner">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm font-medium text-gray-400">Max Safe Discount Ceiling</span>
                      <span className="text-lg font-bold text-white">{(result.max_safe_discount * 100).toFixed(1)}%</span>
                    </div>
                    <div className="w-full bg-gray-800 rounded-full h-2.5 mt-3 relative overflow-hidden">
                      <div 
                        className={`h-full rounded-full transition-all duration-1000 ${formData.discount <= result.max_safe_discount ? 'bg-emerald-500' : 'bg-rose-500'}`} 
                        style={{ width: `${Math.min((formData.discount / (result.max_safe_discount || 0.01)) * 100, 100)}%` }}
                      ></div>
                    </div>
                    <div className="mt-2 text-right">
                       <span className="text-xs text-gray-500">Proposed: {(formData.discount * 100).toFixed(1)}%</span>
                    </div>
                  </div>

                  <div className={`w-full p-5 rounded-xl border flex gap-4 ${result.predicted_margin_rate < 0 ? 'bg-rose-500/10 border-rose-500/20 text-rose-300' : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'}`}>
                    <div className="shrink-0 mt-0.5">
                       {result.predicted_margin_rate < 0 ? <ShieldAlert size={20} /> : <ShieldCheck size={20} />}
                    </div>
                    <p className="text-sm font-medium leading-relaxed">
                      {result.recommendation}
                    </p>
                  </div>

                  <button 
                    type="button"
                    onClick={() => {
                      const marginPct = (result.predicted_margin_rate * 100).toFixed(1);
                      const query = [
                        'You are the AI Analyst. Using the live Predicto forecast (global_yhat) and pillar context already attached server-side, draft a concise negotiation strategy.',
                        `Deal context: segment=${formData.segment}, region=${formData.region}, industry=${formData.industry}, product=${formData.product}.`,
                        `Economics: sales=$${Number(formData.sales).toLocaleString()}, quantity=${formData.quantity}, discount=${(formData.discount * 100).toFixed(1)}%.`,
                        `Model output: predicted_margin=${marginPct}%, rating=${result.margin_rating}, max_safe_discount=${(result.max_safe_discount * 100).toFixed(1)}%.`,
                        `Engine recommendation: ${result.recommendation}`,
                        'Explain how to improve margin while referencing segment-level outlook when relevant.',
                      ].join(' ');
                      window.dispatchEvent(new CustomEvent('trigger-synthesis', { detail: { query } }));
                    }}
                    className="mt-6 w-full py-4 px-6 bg-gradient-to-r from-brand-primary/20 to-brand-accent/20 border border-brand-primary/40 rounded-xl text-white font-bold text-sm flex items-center justify-center gap-3 hover:from-brand-primary/30 hover:to-brand-accent/30 transition-all shadow-[0_0_20px_rgba(59,130,246,0.1)] group"
                  >
                    <span className="text-xl">✨</span>
                    Gemini Strategy
                    <motion.span animate={{ x: [0, 4, 0] }} transition={{ repeat: Infinity, duration: 1.5 }}>→</motion.span>
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}

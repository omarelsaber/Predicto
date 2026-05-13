import { Link } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';
import { ArrowRight, TrendingUp, Brain, Zap } from 'lucide-react';

export default function CinematicLanding({ onNavigate }) {
  const scrollContainerRef = useRef(null);
  const { scrollY } = useScroll({ container: scrollContainerRef });
  const [scrollProgress, setScrollProgress] = useState(0);

  // Track scroll progress for SVG animation
  useEffect(() => {
    const handleScroll = () => {
      if (!scrollContainerRef.current) return;
      const scrollHeight = scrollContainerRef.current.scrollHeight - scrollContainerRef.current.clientHeight;
      const progress = Math.min(scrollContainerRef.current.scrollTop / scrollHeight, 1);
      setScrollProgress(progress);
    };

    const container = scrollContainerRef.current;
    if (container) {
      container.addEventListener('scroll', handleScroll);
      return () => container.removeEventListener('scroll', handleScroll);
    }
  }, []);

  // Parallax effects
  const heroY = useTransform(scrollY, [0, 300], [0, 100]);
  const heroScale = useTransform(scrollY, [0, 400], [1, 0.95]);

  return (
    <div
      ref={scrollContainerRef}
      className="h-screen w-full overflow-y-auto bg-transparent custom-scrollbar scroll-smooth relative"
    >
      {/* Persistent Header */}
      <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-8 py-5 bg-slate-950/40 backdrop-blur-xl border-b border-white/5">
        <Link to="/" className="block hover:opacity-80 transition-opacity">
          <img src="/predicto-logo.png" alt="Predicto" className="h-10 w-auto object-contain" />
        </Link>
        <div className="flex items-center gap-8">
          <button onClick={() => onNavigate?.('revenue-overview')} className="text-sm font-bold text-white/70 hover:text-white transition-colors cursor-pointer">
            Dashboard
          </button>
          <button onClick={() => onNavigate?.('ai-copilot')} className="bg-indigo-500 hover:bg-indigo-400 text-white text-xs font-black px-5 py-2.5 rounded-full transition-all tracking-tight">
            Try Copilot
          </button>
        </div>
      </nav>

      <video 
        autoPlay 
        loop 
        muted 
        playsInline 
        className="fixed inset-0 w-full h-full object-cover -z-10 opacity-30 pointer-events-none"
      >
        <source src="/marketing-bg.mp4" type="video/mp4" />
      </video>

      {/* Hero Section */}
      <section className="relative min-h-screen w-full flex items-center justify-center overflow-hidden px-4">
        <motion.div style={{ y: heroY, scale: heroScale }} className="text-center z-10 max-w-3xl">
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="text-6xl sm:text-7xl font-black text-white mb-6 leading-tight tracking-tight"
          >
            Predict Revenue
            <span className="block bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
              With Confidence
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.4 }}
            className="text-xl sm:text-2xl text-slate-300 mb-12 leading-relaxed max-w-2xl mx-auto"
          >
            AI-powered revenue forecasting that adapts to your business. Real-time insights for CFOs and Revenue Leaders.
          </motion.p>

          <motion.button
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.6 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onNavigate?.('revenue-overview')}
            className="px-8 py-4 bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-bold rounded-lg shadow-[0_0_30px_rgba(99,102,241,0.5)] hover:shadow-[0_0_40px_rgba(99,102,241,0.7)] transition-all flex items-center gap-3 mx-auto mb-16"
          >
            Explore Now <ArrowRight size={20} />
          </motion.button>
        </motion.div>

        {/* Animated gradient orbs */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <motion.div
            animate={{ y: [0, -40, 0], opacity: [0.3, 0.6, 0.3] }}
            transition={{ duration: 8, repeat: Infinity }}
            className="absolute top-20 left-10 w-96 h-96 bg-gradient-to-r from-indigo-500 to-transparent rounded-full filter blur-3xl"
          />
          <motion.div
            animate={{ y: [0, 40, 0], opacity: [0.3, 0.6, 0.3] }}
            transition={{ duration: 10, repeat: Infinity }}
            className="absolute bottom-20 right-10 w-96 h-96 bg-gradient-to-l from-purple-500 to-transparent rounded-full filter blur-3xl"
          />
        </div>
      </section>

      {/* Features Section */}
      <section className="relative min-h-screen w-full py-32 px-4 flex items-center">
        <div className="max-w-7xl mx-auto w-full">
          <div className="text-center mb-24">
            <h2 className="text-5xl font-black text-white mb-6">Autonomous Intelligence</h2>
            <p className="text-xl text-slate-400 max-w-2xl mx-auto">
              Our enterprise-grade engine handles the complexity of revenue modeling so you can focus on growth.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Feature 1 */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="bg-slate-900/40 backdrop-blur-xl border border-white/10 p-10 rounded-2xl flex flex-col items-center text-center group hover:border-indigo-500/50 transition-all"
            >
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-indigo-500 to-indigo-600 flex items-center justify-center mb-8 shadow-lg shadow-indigo-500/20 group-hover:scale-110 transition-transform">
                <TrendingUp size={36} className="text-white" />
              </div>
              <h3 className="text-2xl font-bold text-white mb-4">Data Ingestion</h3>
              <p className="text-slate-300 leading-relaxed">
                Connect your Salesforce, HubSpot, or custom revenue data sources. Predicto automatically normalizes and validates your data in seconds.
              </p>
            </motion.div>

            {/* Feature 2 */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="bg-slate-900/40 backdrop-blur-xl border border-white/10 p-10 rounded-2xl flex flex-col items-center text-center group hover:border-purple-500/50 transition-all"
            >
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center mb-8 shadow-lg shadow-purple-500/20 group-hover:scale-110 transition-transform">
                <Brain size={36} className="text-white" />
              </div>
              <h3 className="text-2xl font-bold text-white mb-4">Machine Learning</h3>
              <p className="text-slate-300 leading-relaxed">
                Our ensemble models analyze historical patterns and external signals to generate accurate multi-period forecasts with confidence bands.
              </p>
            </motion.div>

            {/* Feature 3 */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.4 }}
              className="bg-slate-900/40 backdrop-blur-xl border border-white/10 p-10 rounded-2xl flex flex-col items-center text-center group hover:border-pink-500/50 transition-all"
            >
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-pink-500 to-pink-600 flex items-center justify-center mb-8 shadow-lg shadow-pink-500/20 group-hover:scale-110 transition-transform">
                <Zap size={36} className="text-white" />
              </div>
              <h3 className="text-2xl font-bold text-white mb-4">AI Strategies</h3>
              <p className="text-slate-300 leading-relaxed">
                Get actionable strategic insights from our AI Analyst. Ask questions about revenue drivers, growth opportunities, and risk factors in plain English.
              </p>
            </motion.div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="relative min-h-screen w-full flex items-center justify-center py-20 px-4">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          className="text-center max-w-2xl"
        >
          <h2 className="text-5xl font-black text-white mb-6">Ready to Transform Your Revenue</h2>
          <p className="text-xl text-slate-300 mb-12">
            Join forward-thinking revenue leaders who are using AI to predict and accelerate growth.
          </p>

          <div className="flex gap-6 justify-center flex-wrap">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => onNavigate?.('ai-copilot')}
              className="px-8 py-4 bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-bold rounded-lg shadow-[0_0_30px_rgba(99,102,241,0.5)] hover:shadow-[0_0_40px_rgba(99,102,241,0.7)] transition-all flex items-center gap-2"
            >
              Try AI Copilot <ArrowRight size={18} />
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => onNavigate?.('analytics-hub')}
              className="px-8 py-4 bg-slate-800 border border-slate-700 text-white font-bold rounded-lg hover:bg-slate-700 transition-all"
            >
              View Analytics
            </motion.button>
          </div>
        </motion.div>
      </section>
    </div>
  );
}

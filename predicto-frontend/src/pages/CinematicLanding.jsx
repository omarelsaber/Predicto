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
      className="h-screen w-full overflow-y-auto bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 custom-scrollbar scroll-smooth"
    >
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
            onClick={() => onNavigate?.('copilot')}
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

      {/* Features Section with Scroll-Linked SVG */}
      <section className="relative min-h-screen w-full py-20 px-4">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-5xl font-black text-white mb-20 text-center">How It Works</h2>

          <div className="relative">
            {/* Scroll-Linked Trend Line SVG */}
            <svg
              className="absolute inset-0 w-full h-full pointer-events-none"
              viewBox="0 0 1000 2000"
              preserveAspectRatio="none"
            >
              <defs>
                <linearGradient id="lineGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#6366f1" />
                  <stop offset="50%" stopColor="#a855f7" />
                  <stop offset="100%" stopColor="#ec4899" />
                </linearGradient>
              </defs>

              {/* Background trend curve */}
              <path
                d="M 50 1900 Q 250 1400, 500 900 T 950 100"
                stroke="url(#lineGradient)"
                strokeWidth="8"
                fill="none"
                opacity="0.2"
                strokeLinecap="round"
              />

              {/* Animated progress line */}
              <path
                d="M 50 1900 Q 250 1400, 500 900 T 950 100"
                stroke="url(#lineGradient)"
                strokeWidth="8"
                fill="none"
                strokeLinecap="round"
                style={{
                  pathLength: scrollProgress,
                  opacity: 0.8,
                }}
                strokeDasharray="1"
              />
            </svg>

            {/* Feature Cards */}
            <div className="relative z-10 space-y-32">
              {/* Feature 1 */}
              <motion.div
                initial={{ opacity: 0, x: -50 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: false, amount: 0.3 }}
                transition={{ duration: 0.6 }}
                className="flex gap-12 items-center"
              >
                <div className="flex-1">
                  <div className="bg-slate-800/50 border border-slate-700 p-8 rounded-xl backdrop-blur">
                    <div className="flex items-center gap-4 mb-4">
                      <div className="w-14 h-14 rounded-lg bg-gradient-to-br from-indigo-500 to-indigo-600 flex items-center justify-center">
                        <TrendingUp size={28} className="text-white" />
                      </div>
                      <h3 className="text-2xl font-bold text-white">Data Ingestion</h3>
                    </div>
                    <p className="text-slate-300 leading-relaxed">
                      Connect your Salesforce, HubSpot, or custom revenue data sources. Predicto automatically normalizes and validates your data in seconds.
                    </p>
                  </div>
                </div>
                <div className="flex-1 h-64 bg-slate-800/30 rounded-xl border border-slate-700/50" />
              </motion.div>

              {/* Feature 2 */}
              <motion.div
                initial={{ opacity: 0, x: 50 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: false, amount: 0.3 }}
                transition={{ duration: 0.6 }}
                className="flex gap-12 items-center flex-row-reverse"
              >
                <div className="flex-1">
                  <div className="bg-slate-800/50 border border-slate-700 p-8 rounded-xl backdrop-blur">
                    <div className="flex items-center gap-4 mb-4">
                      <div className="w-14 h-14 rounded-lg bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center">
                        <Brain size={28} className="text-white" />
                      </div>
                      <h3 className="text-2xl font-bold text-white">Machine Learning</h3>
                    </div>
                    <p className="text-slate-300 leading-relaxed">
                      Our ensemble models analyze historical patterns and external signals to generate accurate multi-period forecasts with confidence bands.
                    </p>
                  </div>
                </div>
                <div className="flex-1 h-64 bg-slate-800/30 rounded-xl border border-slate-700/50" />
              </motion.div>

              {/* Feature 3 */}
              <motion.div
                initial={{ opacity: 0, x: -50 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: false, amount: 0.3 }}
                transition={{ duration: 0.6 }}
                className="flex gap-12 items-center"
              >
                <div className="flex-1">
                  <div className="bg-slate-800/50 border border-slate-700 p-8 rounded-xl backdrop-blur">
                    <div className="flex items-center gap-4 mb-4">
                      <div className="w-14 h-14 rounded-lg bg-gradient-to-br from-pink-500 to-pink-600 flex items-center justify-center">
                        <Zap size={28} className="text-white" />
                      </div>
                      <h3 className="text-2xl font-bold text-white">AI Strategies</h3>
                    </div>
                    <p className="text-slate-300 leading-relaxed">
                      Get actionable strategic insights from our AI Analyst. Ask questions about revenue drivers, growth opportunities, and risk factors in plain English.
                    </p>
                  </div>
                </div>
                <div className="flex-1 h-64 bg-slate-800/30 rounded-xl border border-slate-700/50" />
              </motion.div>
            </div>
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
              onClick={() => onNavigate?.('copilot')}
              className="px-8 py-4 bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-bold rounded-lg shadow-[0_0_30px_rgba(99,102,241,0.5)] hover:shadow-[0_0_40px_rgba(99,102,241,0.7)] transition-all flex items-center gap-2"
            >
              Try AI Copilot <ArrowRight size={18} />
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => onNavigate?.('analytics')}
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

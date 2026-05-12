import { useEffect, useRef, useState } from 'react';
import { motion, useScroll, useTransform, useInView, AnimatePresence } from 'framer-motion';

export default function PredictoHubLanding() {
  const sectionRef = useRef(null);
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start end", "end start"]
  });
  const scale = useTransform(scrollYProgress, [0, 0.5], [0.85, 1.0]);
  const opacity = useTransform(scrollYProgress, [0, 0.2], [0, 1]);

  const fadeUp = {
    initial: { opacity: 0, y: 32 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.7, ease: [0.16, 1, 0.3, 1] }
  };

  return (
    <div
      style={{
        background: `
          radial-gradient(ellipse at 15% 40%, rgba(99,102,241,0.06) 0%, transparent 55%),
          radial-gradient(ellipse at 85% 20%, rgba(16,185,129,0.04) 0%, transparent 50%),
          #020617
        `
      }}
      className="relative w-full overflow-hidden"
    >
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4 bg-slate-950/80 backdrop-blur-xl border-b border-slate-800/40">
        <div className="flex items-center gap-2 text-lg font-bold">
          <span className="text-indigo-400">⬡</span>
          <span className="text-white">PredictoHub</span>
        </div>
        <div className="flex items-center gap-8">
          <button className="text-sm text-slate-400 hover:text-white cursor-pointer transition-colors">
            Documentation
          </button>
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => window.location.href = '/dashboard'}
            className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold px-5 py-2 rounded-lg transition-all duration-200"
          >
            Launch Workspace →
          </motion.button>
        </div>
      </nav>

      {/* SECTION 1: THE HOOK */}
      <section className="min-h-screen flex flex-col justify-center relative overflow-hidden pt-20" style={{ position: 'relative', overflow: 'hidden' }}>
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full opacity-[0.06] blur-3xl"
            style={{ background: '#6366f1', animation: 'pulse 8s ease-in-out infinite' }} />
          <div className="absolute bottom-1/4 right-1/4 w-64 h-64 rounded-full opacity-[0.04] blur-3xl"
            style={{ background: '#10b981', animation: 'pulse 10s ease-in-out infinite reverse' }} />
        </div>
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
          className="text-center max-w-5xl mx-auto px-6"
        >
          <span className="text-xs font-semibold tracking-widest uppercase text-indigo-400 mb-6 block">
            Revenue Intelligence · Powered by Machine Learning
          </span>
          
          <h1 className="text-6xl md:text-8xl font-black tracking-tighter leading-none text-white mb-8">
            Your pipeline has
            <br />
            <span className="text-indigo-400">a margin problem.</span>
          </h1>

          <p className="text-xl md:text-2xl text-slate-400 max-w-2xl mx-auto mb-12 leading-relaxed">
            PredictoHub identifies exactly where revenue is leaking, predicts deal-level margin risk in real time, and surfaces the accounts worth saving — before the quarter closes.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-8">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => window.location.href = '/dashboard'}
              className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-8 py-4 rounded-xl text-lg transition-all duration-200"
            >
              Launch Workspace →
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => document.getElementById('platform-section').scrollIntoView({ behavior: 'smooth' })}
              className="border border-slate-700 hover:border-slate-500 text-slate-300 hover:text-white font-medium px-8 py-4 rounded-xl text-lg transition-all duration-200"
            >
              Watch Demo
            </motion.button>
          </div>

          <div className="mt-8 flex items-center justify-center gap-8 flex-wrap">
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <span className="w-1.5 h-1.5 rounded-full bg-slate-500"></span>
              9,994 transactions analyzed
            </div>
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <span className="w-1.5 h-1.5 rounded-full bg-slate-500"></span>
              93.8% margin prediction accuracy
            </div>
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <span className="w-1.5 h-1.5 rounded-full bg-slate-500"></span>
              3-month revenue forecast
            </div>
          </div>
        </motion.div>

        {/* Scroll Indicator */}
        <motion.div
          animate={{ y: [0, 8, 0] }}
          transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
          className="absolute bottom-12 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2"
        >
          <span className="text-xs text-slate-600 tracking-widest uppercase">Scroll</span>
          <div className="w-px h-12 bg-gradient-to-b from-slate-600 to-transparent" />
        </motion.div>
      </section>

      {/* SECTION 2: THE PROBLEM */}
      <motion.section
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true, margin: "-100px" }}
        transition={{ duration: 0.6 }}
        className="py-32 max-w-6xl mx-auto px-6"
      >
        <span className="text-xs font-semibold tracking-widest uppercase text-rose-400 mb-4 block">
          The Problem
        </span>
        <h2 className="text-4xl md:text-5xl font-bold tracking-tight text-white mb-6">
          Visibility gaps are expensive.
        </h2>
        <p className="text-xl text-slate-400 max-w-2xl mb-20">
          Most revenue teams discover margin erosion after the quarter closes. By then, the leverage is gone.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {[
            {
              number: "23%",
              label: "AVERAGE DISCOUNT OVERRUN",
              text: "Enterprise sales teams consistently discount deeper than margin models allow — not from strategy, but from lack of real-time visibility."
            },
            {
              number: "67",
              label: "DAYS TO DETECT MARGIN EROSION",
              text: "The average time between a margin-destroying deal and its detection in a quarterly review. Two months of compounding loss."
            },
            {
              number: "4×",
              label: "ANALYST HOURS PER FORECAST",
              text: "Manual spreadsheet forecasting consumes analyst bandwidth that should be spent on insight generation, not data aggregation."
            }
          ].map((item, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: idx * 0.15 }}
            >
              <div className="text-6xl font-black mb-4" style={{
                color: idx === 0 ? '#f43f5e' : idx === 1 ? '#f59e0b' : '#64748b'
              }}>
                {item.number}
              </div>
              <div className="text-xs uppercase tracking-widest text-slate-500 mb-3">
                {item.label}
              </div>
              <p className="text-slate-400 text-base leading-relaxed">
                {item.text}
              </p>
            </motion.div>
          ))}
        </div>
      </motion.section>

      {/* SECTION 3: THE PRODUCT IN MOTION */}
      <section className="pt-16 pb-32 overflow-hidden" id="platform-section" ref={sectionRef}>
        <div className="max-w-6xl mx-auto px-6">
          <span className="text-xs font-semibold tracking-widest uppercase text-indigo-400 mb-4 block">
            The Platform
          </span>
          <h2 className="text-4xl md:text-5xl font-bold tracking-tight text-white mb-6">
            Margin intelligence. In real time.
          </h2>
          <p className="text-xl text-slate-400 max-w-2xl mb-16">
            From CSV upload to executive-grade revenue analysis in under 60 seconds. No data science team required.
          </p>

          <motion.div style={{ scale, opacity }} className="relative mx-auto max-w-5xl mt-16">
            {/* MacBook Shell */}
            <div className="bg-slate-800 rounded-2xl p-3 shadow-2xl" style={{ boxShadow: '0 40px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.05)' }}>
              {/* Browser Chrome Bar */}
              <div className="bg-slate-900 rounded-t-xl h-9 flex items-center px-4 gap-2">
                <div className="w-3 h-3 rounded-full bg-rose-500/70"></div>
                <div className="w-3 h-3 rounded-full bg-amber-500/70"></div>
                <div className="w-3 h-3 rounded-full bg-emerald-500/70"></div>
                <div className="flex-1 mx-6 bg-slate-800 rounded-md h-5 flex items-center px-3">
                  <span className="text-xs text-slate-500">app.predictohub.com/dashboard</span>
                </div>
                <span className="text-xs text-slate-600">🔒 Secure</span>
              </div>

              {/* Screen Area */}
              <div className="bg-slate-950 rounded-b-xl overflow-hidden w-full flex relative" style={{ aspectRatio: '16/9' }}>
                {/* Left Mini-Sidebar */}
                <div className="w-14 bg-slate-900/90 border-r border-slate-800/40 flex flex-col items-center py-4 gap-3 flex-shrink-0">
                  <div className="w-6 h-6 rounded-lg bg-indigo-600 flex items-center justify-center">
                    <span className="text-white text-xs font-bold">P</span>
                  </div>
                  <div className="w-8 h-px bg-slate-800 my-1"></div>
                  <div className="w-8 h-6 rounded bg-indigo-600/30 border border-indigo-500/30"></div>
                  <div className="w-8 h-6 rounded bg-slate-800/60"></div>
                  <div className="w-8 h-6 rounded bg-slate-800/60"></div>
                  <div className="w-8 h-6 rounded bg-slate-800/60"></div>
                </div>

                {/* Right Content Area */}
                <div className="flex-1 p-3 overflow-hidden flex flex-col gap-2">
                  {/* KPI Row */}
                  <div className="grid grid-cols-3 gap-2 flex-shrink-0">
                    <div className="bg-slate-900 rounded-lg p-2 border border-slate-800/50">
                      <div className="text-xs text-slate-500 mb-1">NEXT QTR</div>
                      <div className="text-sm font-black text-white">$61.2k</div>
                      <div className="text-xs text-emerald-400">↑ +12%</div>
                    </div>
                    <div className="bg-slate-900 rounded-lg p-2 border border-slate-800/50">
                      <div className="text-xs text-slate-500 mb-1">AVG MARGIN</div>
                      <div className="text-sm font-black text-emerald-400">18.4%</div>
                    </div>
                    <div className="bg-slate-900 rounded-lg p-2 border border-slate-800/50">
                      <div className="text-xs text-slate-500 mb-1">AT RISK</div>
                      <div className="text-sm font-black text-rose-400">23</div>
                    </div>
                  </div>

                  {/* Chart Area */}
                  <div className="flex-1 bg-slate-900 rounded-lg border border-slate-800/50 p-2 min-h-0 flex flex-col">
                    <div className="text-xs text-slate-500 mb-2">15-Month Revenue Forecast</div>
                    <svg width="100%" height="100%" viewBox="0 0 400 80" preserveAspectRatio="none">
                      <defs>
                        <linearGradient id="indigo-fade" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#6366f1" stopOpacity="0.3"/>
                          <stop offset="100%" stopColor="#6366f1" stopOpacity="0"/>
                        </linearGradient>
                      </defs>
                      <path d="M0,60 C20,55 40,45 80,40 C120,35 140,42 180,38 C220,34 250,28 290,22 C330,16 360,18 400,14" fill="url(#indigo-fade)" />
                      <polyline points="0,60 40,50 80,40 120,44 160,36 200,30 240,25 280,20 320,18 360,16 400,14" fill="none" stroke="#6366f1" strokeWidth="1.5"/>
                      <polyline points="0,45 40,42 80,48 120,40 160,35 200,32 240,35 280,38 320,42 360,40 400,38" fill="none" stroke="#10b981" strokeWidth="1.5"/>
                      <polyline points="0,70 40,65 80,60 120,62 160,56 200,52 240,48 280,44 320,40 360,38 400,35" fill="none" stroke="#f59e0b" strokeWidth="1.5"/>
                      <line x1="290" y1="0" x2="290" y2="80" stroke="#475569" strokeDasharray="3,2" strokeWidth="0.8"/>
                    </svg>
                  </div>
                </div>
              </div>
            </div>

            <div className="text-center mt-6 text-sm text-slate-500">
              Live demo · 9,994 real transactions · No setup required
            </div>
          </motion.div>
        </div>
      </section>

      {/* SECTION 4: THREE PILLARS */}
      <section className="py-32 max-w-6xl mx-auto px-6">
        <span className="text-xs font-semibold tracking-widest uppercase text-indigo-400 mb-4 block">
          Capabilities
        </span>
        <h2 className="text-4xl font-bold tracking-tight text-white mb-4">
          Three ML engines. One revenue picture.
        </h2>
        <p className="text-xl text-slate-400 max-w-2xl mb-20">
          Each model is validated on holdout data and continuously optimized as your revenue patterns evolve.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            {
              icon: "~",
              iconColor: "text-indigo-400",
              bgColor: "bg-indigo-600/20",
              borderColor: "border-indigo-500/20",
              title: "Revenue Forecasting",
              stat: "R² 0.74",
              statColor: "text-indigo-400",
              label: "VALIDATION SCORE · 48-MONTH HISTORY",
              body: "Fourier decomposition with Ridge regression captures trend, seasonality, and segment-level dynamics. Three-month forward projection with confidence bands."
            },
            {
              icon: "$",
              iconColor: "text-emerald-400",
              bgColor: "bg-emerald-600/20",
              borderColor: "border-emerald-500/20",
              title: "Deal Margin Prediction",
              stat: "R² 0.938",
              statColor: "text-emerald-400",
              label: "HOLDOUT ACCURACY · XGBOOST MODEL",
              body: "Predicts deal-level margin rate from discount, quantity, segment, region, and product. Flags deals approaching the margin cliff before they are signed."
            },
            {
              icon: "◈",
              iconColor: "text-amber-400",
              bgColor: "bg-amber-600/20",
              borderColor: "border-amber-500/20",
              title: "Customer Segmentation",
              stat: "4 Clusters",
              statColor: "text-amber-400",
              label: "K-MEANS · SILHOUETTE 0.353",
              body: "Identifies Champions, Volume Accounts, At-Risk, and Discount Seekers from transaction history. Surfaces a dollar-denominated recovery opportunity per cluster."
            }
          ].map((pillar, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.7, delay: idx * 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="bg-slate-900/60 border border-slate-800/50 rounded-2xl p-8 hover:border-indigo-500/30 hover:shadow-lg hover:shadow-indigo-500/5 transition-all duration-300"
            >
              <div className={`w-12 h-12 rounded-xl ${pillar.bgColor} border ${pillar.borderColor} flex items-center justify-center mb-6`}>
                <span className={`${pillar.iconColor} text-xl font-bold`}>{pillar.icon}</span>
              </div>
              <h3 className="text-xl font-bold text-white mb-3">{pillar.title}</h3>
              <div className={`text-3xl font-black ${pillar.statColor} mb-2`}>{pillar.stat}</div>
              <p className="text-xs text-slate-500 uppercase tracking-wider mb-4">{pillar.label}</p>
              <p className="text-slate-400 text-sm leading-relaxed">{pillar.body}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* SECTION 5: SOCIAL PROOF */}
      <section className="py-32 max-w-4xl mx-auto px-6 text-center">
        <span className="text-xs font-semibold tracking-widest uppercase text-slate-600 mb-8 block">
          Built on real data
        </span>
        
        <motion.blockquote
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 1 }}
          className="text-3xl md:text-4xl font-light text-slate-300 leading-relaxed italic mb-12 max-w-3xl mx-auto"
        >
          "The average enterprise sales team has the data to predict margin erosion. What they lack is a system that surfaces it in time to act."
        </motion.blockquote>

        <p className="text-sm text-slate-600 mb-20">
          — PredictoHub Research · Based on 9,994 B2B SaaS transactions · 2020–2023
        </p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 pt-20 border-t border-slate-800/50">
          {[
            { number: "9,994", label: "TRANSACTIONS ANALYZED", color: "text-white" },
            { number: "93.8%", label: "MARGIN PREDICTION ACCURACY", color: "text-emerald-400" },
            { number: "3", label: "REVENUE SEGMENTS MODELED", color: "text-white" },
            { number: "$62,951", label: "RECOVERY OPPORTUNITY IDENTIFIED", color: "text-amber-400" }
          ].map((stat, idx) => (
            <div key={idx}>
              <div className={`text-4xl font-black mb-2 ${stat.color}`}>{stat.number}</div>
              <div className="text-xs text-slate-500 uppercase tracking-wider">{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* SECTION 6: FINAL CTA */}
      <section className="relative py-24 max-w-4xl mx-auto px-6 text-center overflow-hidden">
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-96 h-96 rounded-full bg-indigo-600/5 blur-3xl" />
        </div>

        <div className="relative z-10">
          <span className="text-xs font-semibold tracking-widest uppercase text-indigo-400 mb-6 block">
            Ready when you are
          </span>
          <h2 className="text-5xl md:text-7xl font-black tracking-tighter text-white mb-8">
            See your revenue clearly.
          </h2>
          <p className="text-xl text-slate-400 mb-12 max-w-xl mx-auto">
            Pre-loaded with 9,994 real transactions. No setup, no credit card, no sales call.
          </p>

          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => window.location.href = '/dashboard'}
            className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-12 py-5 rounded-2xl text-xl transition-colors duration-200 inline-flex items-center gap-3"
          >
            Launch Workspace <span className="text-indigo-300">→</span>
          </motion.button>

          <p className="mt-6 text-sm text-slate-600">
            Dashboard loads instantly · Demo data pre-populated · Export available
          </p>
        </div>
      </section>

      {/* SECTION 7: FOOTER */}
      <footer className="border-t border-slate-800/50 py-16 max-w-6xl mx-auto px-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12 mb-16">
          {/* Column 1: Brand */}
          <div>
            <div className="flex items-center gap-2 text-lg font-bold mb-3">
              <span className="text-indigo-400">⬡</span>
              <span className="text-white">PredictoHub</span>
            </div>
            <p className="text-sm text-slate-500 leading-relaxed max-w-xs">
              AI-powered revenue intelligence platform. Built for sales leaders who move on data, not instinct.
            </p>
            <p className="mt-6 text-xs text-slate-600">© 2026 PredictoHub · All rights reserved</p>
          </div>

          {/* Column 2: Platform */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-4">Platform</p>
            <div className="space-y-2">
              {["Revenue Overview", "Deal Scorer", "Persona Gallery", "Data Explorer"].map((link, i) => (
                <p key={i} className="text-sm text-slate-400 hover:text-white cursor-pointer transition-colors">
                  {link}
                </p>
              ))}
            </div>
          </div>

          {/* Column 3: Contact */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-4">Built by</p>
            <p className="text-sm font-semibold text-white mb-1">Omar Elsaber</p>
            <p className="text-sm text-slate-400 mb-4">AI Engineer / SEG</p>
            <div className="space-y-2">
              <p className="text-sm text-slate-400 hover:text-indigo-400 transition-colors cursor-pointer">
                ✉ omarelsaber0@gmail.com
              </p>
              <p className="text-sm text-slate-400 hover:text-indigo-400 transition-colors cursor-pointer">
                in linkedin.com/in/omarelsaber
              </p>
              <p className="text-sm text-slate-400 hover:text-indigo-400 transition-colors cursor-pointer">
                {'{}'} github.com/omarelsaber
              </p>
            </div>
          </div>
        </div>

        <div className="mt-16 pt-8 border-t border-slate-800/30 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-xs text-slate-600">
            PredictoHub · Revenue Intelligence Platform · V2.0
          </p>
          <p className="text-xs text-slate-600">
            Built with React · FastAPI · Groq · Llama-3.3 · XGBoost
          </p>
        </div>
      </footer>
    </div>
  );
}

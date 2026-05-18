import { useState } from 'react';
import KpiCard from './KpiCard';
import {
  AreaChart, Area,
  ScatterChart, Scatter,
  LineChart, Line,
  XAxis, YAxis,
  CartesianGrid, Tooltip, Legend,
  ResponsiveContainer,
  type TooltipProps,
} from 'recharts';
import type { ValueType, NameType } from 'recharts/types/component/DefaultTooltipContent';
import { Activity, Cpu, TrendingUp, Zap } from 'lucide-react';

// ─── Mock Data ────────────────────────────────────────────────────────────────

// Fix #5: both upper_bound AND lower_bound so the confidence band is a real interval
const revenueData = [
  { month: 'Jan', historical: 3800, forecasted: 3800, upper_bound: 4100, lower_bound: 3500 },
  { month: 'Feb', historical: 4100, forecasted: 4100, upper_bound: 4400, lower_bound: 3800 },
  { month: 'Mar', historical: 4300, forecasted: 4300, upper_bound: 4650, lower_bound: 3950 },
  { month: 'Apr', historical: 4200, forecasted: 4200, upper_bound: 4560, lower_bound: 3840 },
  { month: 'May', historical: 4500, forecasted: 4500, upper_bound: 4850, lower_bound: 4150 },
  { month: 'Jun', historical: 4200, forecasted: 4200, upper_bound: 4620, lower_bound: 3780 },
  { month: 'Jul', historical: null, forecasted: 4600, upper_bound: 5200, lower_bound: 4000 },
  { month: 'Aug', historical: null, forecasted: 4800, upper_bound: 5500, lower_bound: 4100 },
  { month: 'Sep', historical: null, forecasted: 5000, upper_bound: 5800, lower_bound: 4200 },
  { month: 'Oct', historical: null, forecasted: 5200, upper_bound: 6100, lower_bound: 4300 },
];

// Fix #4: enriched persona data with company names for tooltip context
const personaData = [
  { segment: 'Champions',  company: 'Acme Corp',     arr: 500, churnRisk: 5  },
  { segment: 'Champions',  company: 'BlueSky AI',    arr: 580, churnRisk: 8  },
  { segment: 'Champions',  company: 'NovaSoft',      arr: 620, churnRisk: 3  },
  { segment: 'Champions',  company: 'Vertex Labs',   arr: 450, churnRisk: 6  },
  { segment: 'At-Risk',    company: 'OldGuard Ltd',  arr: 280, churnRisk: 35 },
  { segment: 'At-Risk',    company: 'Retro Systems', arr: 320, churnRisk: 42 },
  { segment: 'At-Risk',    company: 'Fringe Co',     arr: 250, churnRisk: 38 },
  { segment: 'Growth',     company: 'Ascend Inc',    arr: 350, churnRisk: 15 },
  { segment: 'Growth',     company: 'Momentum Tech', arr: 400, churnRisk: 18 },
  { segment: 'Growth',     company: 'Uplift SaaS',   arr: 380, churnRisk: 12 },
  { segment: 'Established',company: 'CoreLogic',     arr: 650, churnRisk: 10 },
  { segment: 'Established',company: 'DataBridge',    arr: 720, churnRisk: 8  },
];

// Fix #6: MRR as AreaChart data for visual mass
const mrrData = [
  { month: 'Jan', new: 420, expansion: 180, contraction: -60,  churn: -140 },
  { month: 'Feb', new: 510, expansion: 220, contraction: -80,  churn: -120 },
  { month: 'Mar', new: 480, expansion: 250, contraction: -55,  churn: -100 },
  { month: 'Apr', new: 550, expansion: 200, contraction: -70,  churn: -130 },
  { month: 'May', new: 620, expansion: 280, contraction: -45,  churn: -110 },
  { month: 'Jun', new: 590, expansion: 310, contraction: -65,  churn: -95  },
];

// KPI sparkline seeds (7-day, per metric)
const kpiData = [
  { title: 'Total ARR',  value: '$4.2M', trend: 8.5,  confidence: 'HIGH'   as const, unit: 'USD', sparkData: [32,35,33,40,38,44,48] },
  { title: 'MRR Growth', value: '+3.2%', trend: 2.1,  confidence: 'HIGH'   as const,              sparkData: [10,14,12,18,16,20,22] },
  { title: 'Churn Rate', value: '8.4%',  trend: -1.2, confidence: 'MEDIUM' as const,              sparkData: [14,12,15,11,13,10,9]  },
  { title: 'Win Rate',   value: '68%',   trend: 5.3,  confidence: 'HIGH'   as const,              sparkData: [55,58,60,62,61,65,68] },
  { title: 'NPS Score',  value: '7.1',   trend: 0.8,  confidence: 'LOW'    as const,              sparkData: [6,6.5,6.2,6.8,7,6.9,7.1] },
];

// ─── Shared styles ────────────────────────────────────────────────────────────

const glassCard: React.CSSProperties = {
  background: 'rgba(255,255,255,0.04)',
  backdropFilter: 'blur(24px)',
  WebkitBackdropFilter: 'blur(24px)',
  border: '1px solid rgba(255,255,255,0.09)',
  borderRadius: '16px',
  boxShadow: '0 8px 32px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.06)',
};

const axisStyle = { fontSize: 11, fill: '#64748b', fontFamily: 'Inter, sans-serif' };
const sharedXAxis = { stroke: 'none', tick: axisStyle, axisLine: false as const, tickLine: false as const };
const sharedYAxis = { stroke: 'none', tick: axisStyle, axisLine: false as const, tickLine: false as const, width: 52 };

// ─── Glass Tooltip ────────────────────────────────────────────────────────────

function GlassTooltip({ active, payload, label }: TooltipProps<ValueType, NameType>) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl p-3 shadow-2xl min-w-[150px]"
      style={{ background:'rgba(5,8,20,0.92)', backdropFilter:'blur(20px)', WebkitBackdropFilter:'blur(20px)', border:'1px solid rgba(255,255,255,0.10)' }}>
      {label && <p className="text-[11px] font-semibold text-slate-300 mb-2 uppercase tracking-wider">{label}</p>}
      {payload.map((e, i) => (
        <div key={i} className="flex items-center gap-2 py-0.5">
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: e.color as string, boxShadow:`0 0 5px ${e.color}` }} />
          <span className="text-xs text-slate-400">{e.name}:</span>
          <span className="text-xs font-bold text-white ml-auto pl-3">
            {typeof e.value === 'number' ? e.value.toLocaleString() : e.value}
          </span>
        </div>
      ))}
    </div>
  );
}

// Fix #4: scatter tooltip with company name + ARR + churn
function PersonaTooltip({ active, payload }: TooltipProps<ValueType, NameType>) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  return (
    <div className="rounded-xl p-3 shadow-2xl"
      style={{ background:'rgba(5,8,20,0.92)', backdropFilter:'blur(20px)', WebkitBackdropFilter:'blur(20px)', border:'1px solid rgba(255,255,255,0.10)' }}>
      <p className="text-xs font-bold text-white mb-1">{d?.company}</p>
      <p className="text-[11px] text-slate-400">Segment: <span className="text-slate-200 font-medium">{d?.segment}</span></p>
      <p className="text-[11px] text-slate-400">ARR: <span className="text-white font-semibold">${d?.arr}K</span></p>
      <p className="text-[11px] text-slate-400">Churn Risk: <span className="text-white font-semibold">{d?.churnRisk}%</span></p>
    </div>
  );
}

// Fix #7: top-aligned legend
function TopLegend({ payload }: { payload?: Array<{ color: string; value: string }> }) {
  if (!payload) return null;
  return (
    <div className="flex flex-wrap gap-4 mb-4">
      {payload.map((e, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-4 h-0.5 rounded-full inline-block" style={{ background: e.color, boxShadow:`0 0 4px ${e.color}` }} />
          <span className="text-xs font-medium text-slate-300">{e.value}</span>
        </div>
      ))}
    </div>
  );
}

// Section header
function SectionHeader({ icon: Icon, title, subtitle }: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ background:'rgba(99,102,241,0.18)', border:'1px solid rgba(99,102,241,0.32)', boxShadow:'0 0 14px rgba(99,102,241,0.28)' }}>
        <Icon className="w-4 h-4 text-indigo-400" />
      </div>
      <div>
        <h2 className="text-sm font-semibold text-white tracking-tight">{title}</h2>
        {subtitle && <p className="text-[11px] text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
}

// Fix #7: time range selector with high-contrast active state
const TIME_RANGES = ['30d', '90d', '1Y'] as const;
type TimeRange = typeof TIME_RANGES[number];

// ─── Main View ────────────────────────────────────────────────────────────────

export default function IntelligenceHubView() {
  const [activeRange, setActiveRange] = useState<TimeRange>('1Y');

  return (
    <div className="space-y-8">

      {/* ── Page Header ── */}
      <div className="flex items-start justify-between">
        <div>
          {/* Fix #8: pulsing live dot */}
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] px-2.5 py-1 rounded-full"
              style={{ background:'rgba(99,102,241,0.15)', border:'1px solid rgba(99,102,241,0.3)', color:'#818cf8', boxShadow:'0 0 10px rgba(99,102,241,0.2)' }}>
              Live Intelligence
            </span>
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"
              style={{ boxShadow:'0 0 8px rgba(16,185,129,0.9)' }} />
          </div>
          <h1 className="text-4xl font-bold text-white tracking-tight"
            style={{ textShadow:'0 0 40px rgba(99,102,241,0.3)' }}>
            Intelligence Hub
          </h1>
          <p className="text-slate-400 mt-1.5 text-sm">
            Real-time portfolio overview · Revenue forecasting · AI confidence scoring
          </p>
        </div>

        <div className="hidden md:flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs text-slate-400"
          style={glassCard}>
          <Cpu className="w-3.5 h-3.5 text-indigo-400" />
          <span>Model updated <strong className="text-white">2 min ago</strong></span>
        </div>
      </div>

      {/* ── Zone A: KPI Strip ── */}
      {/* Fix #2: proper 5-col grid — no overflow clipping */}
      <div>
        <SectionHeader icon={Activity} title="Key Performance Indicators"
          subtitle="AI confidence-weighted · rolling 30d" />
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4 mt-4">
          {kpiData.map((kpi, i) => (
            <KpiCard key={i} title={kpi.title} value={kpi.value} trend={kpi.trend}
              confidence={kpi.confidence} unit={kpi.unit} sparkData={kpi.sparkData} />
          ))}
        </div>
      </div>

      {/* ── Zone B: Revenue Forecast + Persona Map ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Revenue Forecast — 2/3 */}
        <div className="lg:col-span-2">
          <div className="p-6" style={glassCard}>

            {/* Header row */}
            <div className="flex items-start justify-between mb-2">
              <SectionHeader icon={TrendingUp} title="Revenue Forecast"
                subtitle="Historical actuals + AI projection + 95% confidence band" />

              {/* Fix #7: high-contrast range selector */}
              <div className="flex gap-1 p-1 rounded-lg"
                style={{ background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.07)' }}>
                {TIME_RANGES.map((r) => (
                  <button key={r} onClick={() => setActiveRange(r)}
                    className="px-4 py-1.5 rounded-md text-xs font-semibold transition-all duration-200"
                    style={activeRange === r
                      ? { background:'#4f46e5', color:'#fff', boxShadow:'0 0 10px rgba(99,102,241,0.4)' }
                      : { color:'#64748b' }
                    }>
                    {r}
                  </button>
                ))}
              </div>
            </div>

            {/* Fix #7: legend ABOVE chart */}
            <ResponsiveContainer width="100%" height={330}>
              <AreaChart data={revenueData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  {/* Fix #5: upper gradient for band fill */}
                  <linearGradient id="gradUpper" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"   stopColor="#6366f1" stopOpacity={0.22} />
                    <stop offset="100%" stopColor="#6366f1" stopOpacity={0.02} />
                  </linearGradient>
                  {/* Fix #5: lower bound — solid transparent fill to anchor band bottom */}
                  <linearGradient id="gradLower" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"   stopColor="#0b0d1a" stopOpacity={1} />
                    <stop offset="100%" stopColor="#0b0d1a" stopOpacity={1} />
                  </linearGradient>
                  <linearGradient id="gradHistorical" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"   stopColor="#818cf8" stopOpacity={0.28} />
                    <stop offset="100%" stopColor="#818cf8" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="gradForecasted" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"   stopColor="#10b981" stopOpacity={0.22} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
                  </linearGradient>
                  <filter id="neonGlow" x="-20%" y="-20%" width="140%" height="140%">
                    <feGaussianBlur stdDeviation="3" result="blur" />
                    <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                  </filter>
                </defs>

                <CartesianGrid strokeDasharray="1 8" stroke="rgba(255,255,255,0.04)" vertical={false} />
                <XAxis dataKey="month" {...sharedXAxis} />
                <YAxis {...sharedYAxis} tickFormatter={(v: number) => `$${(v/1000).toFixed(1)}K`} />
                <Tooltip content={<GlassTooltip />} cursor={{ stroke:'rgba(255,255,255,0.07)', strokeWidth:1 }} />
                {/* Fix #7: legend above via verticalAlign="top" */}
                <Legend verticalAlign="top" height={40} content={<TopLegend />} />

                {/* Fix #5: upper confidence band area */}
                <Area type="monotone" dataKey="upper_bound"
                  fill="url(#gradUpper)" stroke="rgba(99,102,241,0.3)" strokeWidth={1}
                  strokeDasharray="4 4" name="Upper Bound" dot={false} activeDot={false} />

                {/* Fix #5: lower confidence band area — masks below lower_bound */}
                <Area type="monotone" dataKey="lower_bound"
                  fill="url(#gradLower)" stroke="rgba(99,102,241,0.2)" strokeWidth={1}
                  strokeDasharray="4 4" name="Lower Bound" dot={false} activeDot={false} />

                <Area type="monotone" dataKey="historical"
                  fill="url(#gradHistorical)" stroke="#818cf8" strokeWidth={2.5}
                  name="Historical MRR" dot={false} connectNulls={false}
                  activeDot={{ r:5, fill:'#818cf8', stroke:'rgba(129,140,248,0.4)', strokeWidth:4 }}
                  filter="url(#neonGlow)" />

                <Area type="monotone" dataKey="forecasted"
                  fill="url(#gradForecasted)" stroke="#10b981" strokeWidth={2}
                  strokeDasharray="6 4" name="Forecasted MRR" dot={false}
                  activeDot={{ r:5, fill:'#10b981', stroke:'rgba(16,185,129,0.4)', strokeWidth:4 }}
                  filter="url(#neonGlow)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Persona Map — 1/3 */}
        <div>
          <div className="p-6 h-full" style={glassCard}>
            <div className="mb-2">
              <SectionHeader icon={Zap} title="Persona Map"
                subtitle="ARR ($K) vs Churn Risk (%)" />
            </div>

            <ResponsiveContainer width="100%" height={330}>
              {/* Fix #4: scatter dots larger (r=8 default via shape), proper axis labels */}
              <ScatterChart margin={{ top: 10, right: 12, bottom: 28, left: 0 }}>
                <defs>
                  <filter id="dotGlow">
                    <feGaussianBlur stdDeviation="3" result="blur" />
                    <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                  </filter>
                </defs>

                <CartesianGrid strokeDasharray="1 8" stroke="rgba(255,255,255,0.04)" />

                {/* Fix #4: axis labels */}
                <XAxis type="number" dataKey="arr" name="ARR ($K)" {...sharedXAxis}
                  label={{ value:'ARR ($K)', position:'insideBottom', offset:-12, fill:'#94a3b8', fontSize:11 }} />
                <YAxis type="number" dataKey="churnRisk" name="Churn Risk (%)" {...sharedYAxis}
                  label={{ value:'Churn %', angle:-90, position:'insideLeft', offset:8, fill:'#94a3b8', fontSize:11 }} />

                <Tooltip cursor={{ strokeDasharray:'3 3', stroke:'rgba(255,255,255,0.08)' }}
                  content={<PersonaTooltip />} />
                <Legend verticalAlign="top" height={40} content={<TopLegend />} />

                {/* Fix #4: r=9 gives clearly visible dots */}
                <Scatter name="Champions"  data={personaData.filter(p=>p.segment==='Champions')}
                  fill="#10b981" fillOpacity={0.9} filter="url(#dotGlow)"
                  shape={(props: any) => <circle cx={props.cx} cy={props.cy} r={9} fill="#10b981" fillOpacity={0.85} />} />
                <Scatter name="At-Risk"    data={personaData.filter(p=>p.segment==='At-Risk')}
                  fill="#ef4444" fillOpacity={0.9} filter="url(#dotGlow)"
                  shape={(props: any) => <circle cx={props.cx} cy={props.cy} r={9} fill="#ef4444" fillOpacity={0.85} />} />
                <Scatter name="Growth"     data={personaData.filter(p=>p.segment==='Growth')}
                  fill="#f59e0b" fillOpacity={0.9} filter="url(#dotGlow)"
                  shape={(props: any) => <circle cx={props.cx} cy={props.cy} r={9} fill="#f59e0b" fillOpacity={0.85} />} />
                <Scatter name="Established" data={personaData.filter(p=>p.segment==='Established')}
                  fill="#818cf8" fillOpacity={0.9} filter="url(#dotGlow)"
                  shape={(props: any) => <circle cx={props.cx} cy={props.cy} r={9} fill="#818cf8" fillOpacity={0.85} />} />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* ── Zone C: MRR Movement — Fix #6: AreaChart for visual mass ── */}
      <div>
        <div className="p-6" style={glassCard}>
          <div className="mb-2">
            <SectionHeader icon={Activity} title="MRR Movement Breakdown"
              subtitle="New · Expansion · Contraction · Churn — last 6 months" />
          </div>

          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={mrrData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="gradNew" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#6366f1" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#6366f1" stopOpacity={0.03} />
                </linearGradient>
                <linearGradient id="gradExpansion" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#10b981" stopOpacity={0.03} />
                </linearGradient>
                <linearGradient id="gradContraction" x1="0" y1="1" x2="0" y2="0">
                  <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.03} />
                </linearGradient>
                <linearGradient id="gradChurn" x1="0" y1="1" x2="0" y2="0">
                  <stop offset="0%" stopColor="#ef4444" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#ef4444" stopOpacity={0.03} />
                </linearGradient>
                <filter id="areaGlow">
                  <feGaussianBlur stdDeviation="2.5" result="blur" />
                  <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
              </defs>

              <CartesianGrid strokeDasharray="1 8" stroke="rgba(255,255,255,0.04)" vertical={false} />
              <XAxis dataKey="month" {...sharedXAxis} />
              <YAxis {...sharedYAxis} tickFormatter={(v: number) => `${v > 0 ? '+' : ''}$${v}`} />
              <Tooltip content={<GlassTooltip />} cursor={{ stroke:'rgba(255,255,255,0.07)', strokeWidth:1 }} />
              <Legend verticalAlign="top" height={40} content={<TopLegend />} />

              {/* Fix #6: strokeWidth=3 + filled areas for visual mass */}
              <Area type="monotone" dataKey="new" stroke="#6366f1" strokeWidth={3}
                fill="url(#gradNew)" name="New MRR" dot={false}
                activeDot={{ r:5, fill:'#6366f1', stroke:'rgba(99,102,241,0.4)', strokeWidth:3 }}
                filter="url(#areaGlow)" />
              <Area type="monotone" dataKey="expansion" stroke="#10b981" strokeWidth={3}
                fill="url(#gradExpansion)" name="Expansion" dot={false}
                activeDot={{ r:5, fill:'#10b981', stroke:'rgba(16,185,129,0.4)', strokeWidth:3 }}
                filter="url(#areaGlow)" />
              <Area type="monotone" dataKey="contraction" stroke="#f59e0b" strokeWidth={2.5}
                fill="url(#gradContraction)" name="Contraction" strokeDasharray="5 3" dot={false}
                activeDot={{ r:4, fill:'#f59e0b', stroke:'rgba(245,158,11,0.4)', strokeWidth:3 }}
                filter="url(#areaGlow)" />
              <Area type="monotone" dataKey="churn" stroke="#ef4444" strokeWidth={2.5}
                fill="url(#gradChurn)" name="Churn" strokeDasharray="5 3" dot={false}
                activeDot={{ r:4, fill:'#ef4444', stroke:'rgba(239,68,68,0.4)', strokeWidth:3 }}
                filter="url(#areaGlow)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

    </div>
  );
}

import { ArrowUp, ArrowDown, TrendingUp } from 'lucide-react';
import {
  LineChart,
  Line,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';

export interface KpiCardProps {
  title: string;
  value: string | number;
  trend?: number; // positive = up, negative = down
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  unit?: string;
  sparkData?: number[]; // optional override; defaults to mock
}

// ─── Confidence badge config ──────────────────────────────────────────────────
const confidenceConfig = {
  HIGH:   { bg: 'bg-emerald-500/15', text: 'text-emerald-300', border: 'border-emerald-500/30', dot: 'bg-emerald-400', shadow: '0 0 8px rgba(16,185,129,0.4)' },
  MEDIUM: { bg: 'bg-amber-500/15',   text: 'text-amber-300',   border: 'border-amber-500/30',   dot: 'bg-amber-400',   shadow: '0 0 8px rgba(245,158,11,0.4)'  },
  LOW:    { bg: 'bg-red-500/15',     text: 'text-red-300',     border: 'border-red-500/30',     dot: 'bg-red-400',     shadow: '0 0 8px rgba(239,68,68,0.4)'   },
};

// Default 7-day mock sparkline data (index → value)
const DEFAULT_SPARK: number[] = [10, 15, 12, 20, 18, 22, 25];

// Recharts expects an array of objects
type SparkPoint = { v: number };
function toSparkPoints(data: number[]): SparkPoint[] {
  return data.map((v) => ({ v }));
}

export default function KpiCard({ title, value, trend, confidence, unit, sparkData }: KpiCardProps) {
  const isPositive = trend !== undefined && trend >= 0;
  const isNegative = trend !== undefined && trend < 0;
  const trendColor = isPositive ? 'text-emerald-400' : isNegative ? 'text-red-400' : 'text-slate-400';
  const trendBg    = isPositive ? 'bg-emerald-500/10 border-emerald-500/20' : isNegative ? 'bg-red-500/10 border-red-500/20' : '';
  const TrendIcon  = isPositive ? ArrowUp : isNegative ? ArrowDown : TrendingUp;
  const config     = confidenceConfig[confidence];

  // Sparkline color mirrors trend direction
  const sparkColor = isNegative ? '#ef4444' : '#6366f1';
  const sparkPoints = toSparkPoints(sparkData ?? DEFAULT_SPARK);

  return (
    <div
      className="group relative flex flex-col rounded-2xl border border-white/10 p-5
                 shadow-2xl transition-all duration-300 cursor-default overflow-hidden
                 hover:border-white/20 hover:shadow-[0_8px_32px_rgba(99,102,241,0.15)]"
      style={{
        background: 'rgba(255, 255, 255, 0.045)',
        backdropFilter: 'blur(28px)',
        WebkitBackdropFilter: 'blur(28px)',
      }}
    >
      {/* Hover glow orb — top-left */}
      <div
        className="absolute -top-10 -left-10 w-32 h-32 rounded-full opacity-0 group-hover:opacity-100
                   transition-opacity duration-500 pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(99,102,241,0.14) 0%, transparent 70%)' }}
      />

      {/* ── Row 1: Title + Neon icon orb ── */}
      <div className="flex items-start justify-between mb-3">
        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest leading-tight">
          {title}
        </p>
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{
            background: 'rgba(99,102,241,0.18)',
            border: '1px solid rgba(99,102,241,0.3)',
            boxShadow: '0 0 10px rgba(99,102,241,0.25)',
          }}
        >
          <TrendingUp className="w-3.5 h-3.5 text-indigo-400" />
        </div>
      </div>

      {/* ── Row 2: Big value ── */}
      <div className="flex items-baseline gap-1.5 mb-3">
        <span
          className="text-2xl font-bold text-white tracking-tight"
          style={{ textShadow: '0 0 20px rgba(255,255,255,0.25), 0 0 40px rgba(99,102,241,0.18)' }}
        >
          {value}
        </span>
        {unit && <span className="text-xs text-slate-500 font-medium">{unit}</span>}
      </div>

      {/* ── Row 3: Sparkline ── */}
      <div className="mb-3 -mx-1">
        <ResponsiveContainer width="100%" height={30}>
          <LineChart data={sparkPoints} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
            <Tooltip
              content={() => null}      /* no tooltip on mini spark */
              cursor={false}
            />
            <Line
              type="monotone"
              dataKey="v"
              stroke={sparkColor}
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* ── Row 4: Trend delta badge ── */}
      {trend !== undefined && (
        <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border w-fit mb-2 ${trendBg}`}>
          <TrendIcon size={11} className={trendColor} />
          <span className={`text-[11px] font-semibold ${trendColor}`}>
            {trend > 0 ? '+' : ''}{trend}%
          </span>
          <span className="text-[11px] text-slate-500 ml-0.5">vs last</span>
        </div>
      )}

      {/* ── Row 5: Confidence badge ── */}
      <div
        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full w-fit
                    border text-[10px] font-bold uppercase tracking-wider
                    ${config.bg} ${config.text} ${config.border}`}
        style={{ boxShadow: config.shadow }}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
        {confidence}
      </div>
    </div>
  );
}

import { ArrowUp, ArrowDown } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from './ui/Card';

export interface KpiCardProps {
  title: string;
  value: string | number;
  trend?: number; // positive = up, negative = down
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  unit?: string;
}

const confidenceConfig = {
  HIGH: { bg: 'bg-emerald-500/20', text: 'text-emerald-300', border: 'border-emerald-500/30' },
  MEDIUM: { bg: 'bg-yellow-500/20', text: 'text-yellow-300', border: 'border-yellow-500/30' },
  LOW: { bg: 'bg-red-500/20', text: 'text-red-300', border: 'border-red-500/30' },
};

export default function KpiCard({ title, value, trend, confidence, unit }: KpiCardProps) {
  const trendColor = trend ? (trend >= 0 ? 'text-emerald-400' : 'text-red-400') : 'text-slate-400';
  const trendIcon = trend ? (trend >= 0 ? <ArrowUp size={16} /> : <ArrowDown size={16} />) : null;
  const config = confidenceConfig[confidence];

  return (
    <Card className="flex flex-col justify-between">
      <CardHeader className="pb-3 mb-0">
        <CardTitle className="text-sm font-medium text-slate-300">{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-bold text-slate-50">{value}</span>
          {unit && <span className="text-sm text-slate-400">{unit}</span>}
        </div>

        {trend !== undefined && (
          <div className="flex items-center gap-1">
            <div className={`flex items-center gap-1 ${trendColor}`}>
              {trendIcon}
              <span className="text-sm font-medium">{trend > 0 ? '+' : ''}{trend}%</span>
            </div>
            <span className="text-xs text-slate-500">vs last period</span>
          </div>
        )}

        <div className={`inline-flex w-fit px-2.5 py-1 rounded-full text-xs font-medium ${config.bg} ${config.text} border ${config.border}`}>
          {confidence}
        </div>
      </CardContent>
    </Card>
  );
}

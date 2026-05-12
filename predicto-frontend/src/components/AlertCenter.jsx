import { useMemo, useEffect, useState } from 'react';
import {
  AlertCircle,
  TrendingDown,
  ShieldAlert,
  Zap,
  ArrowRight,
  X,
  Bell,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

/** Shared builder for drawer content + header badge counts */
export function buildAlertsList(forecastData, personaData) {
  const dynamicAlerts = [];

  if (forecastData && forecastData.segments) {
    forecastData.segments.forEach((seg) => {
      const pct = seg.pct_change_vs_current ?? '';
      const isDown =
        seg.trend_direction === 'down' ||
        seg.trend === '▼' ||
        seg.trend === 'down' ||
        (typeof pct === 'string' && pct.trim().startsWith('-'));

      if (isDown) {
        dynamicAlerts.push({
          id: `fc-${seg.segment}`,
          type: 'critical',
          icon: TrendingDown,
          title: `${seg.segment} Revenue Drop`,
          description: `Forecast predicts a ${pct} change next period. Immediate sales intervention recommended.`,
          action: 'View Forecast',
        });
      }
    });
  }

  if (personaData && personaData.personas) {
    const highRiskPersonas = personaData.personas.filter((p) => p.churn_risk === 'high');
    if (highRiskPersonas.length > 0) {
      dynamicAlerts.push({
        id: 'persona-churn',
        type: 'warning',
        icon: ShieldAlert,
        title: 'High Churn Risk Detected',
        description: `${highRiskPersonas.length} customer segments show behavior patterns consistent with imminent churn.`,
        action: 'Audit Personas',
      });
    }
  }

  if (dynamicAlerts.length === 0) {
    dynamicAlerts.push({
      id: 'stable',
      type: 'info',
      icon: Zap,
      title: 'System Optimal',
      description:
        'All business segments are performing within predicted variance. No critical anomalies detected.',
      action: 'View Report',
    });
  }

  return dynamicAlerts;
}

export function countPriorityAlerts(forecastData, personaData) {
  return buildAlertsList(forecastData, personaData).filter((a) => a.type !== 'info').length;
}

export default function AlertCenter({
  open,
  onClose,
  forecastData,
  personaData,
}) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const alerts = useMemo(
    () => buildAlertsList(forecastData, personaData),
    [forecastData, personaData]
  );

  const typeStyles = {
    critical: 'bg-rose-500/10 border-rose-500/20 text-rose-400',
    warning: 'bg-amber-500/10 border-amber-500/20 text-amber-400',
    info: 'bg-blue-500/10 border-blue-500/20 text-blue-400',
  };

  const panelVariants = isMobile
    ? {
        initial: { y: '100%', opacity: 0.98 },
        animate: { y: 0, opacity: 1 },
        exit: { y: '100%', opacity: 0.98 },
      }
    : {
        initial: { x: '100%' },
        animate: { x: 0 },
        exit: { x: '100%' },
      };

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop — below panel, above main scroll */}
          <motion.button
            type="button"
            aria-label="Close alerts"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[35] bg-black/50 backdrop-blur-[2px] md:bg-black/40"
            onClick={onClose}
          />

          {/* Slide-over / bottom sheet — max 350px wide on md+ */}
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-labelledby="alert-center-title"
            variants={panelVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
            className={[
              'fixed z-[40] flex flex-col bg-[#0f172a] shadow-2xl shadow-black/40',
              'border-gray-800 overflow-hidden',
              // Desktop / tablet: docked right, capped at 350px
              'md:inset-y-0 md:right-0 md:left-auto md:h-full md:w-full md:max-w-[350px] md:border-l',
              // Mobile: bottom sheet, full width, height capped (does not eat half the viewport horizontally)
              'max-md:inset-x-0 max-md:bottom-0 max-md:top-auto max-md:max-h-[min(85vh,560px)] max-md:h-auto max-md:rounded-t-2xl max-md:border max-md:border-b-0',
            ].join(' ')}
          >
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-gray-800/80 px-4 py-3 bg-[#0f172a]/95">
              <h3
                id="alert-center-title"
                className="text-base font-bold text-white flex items-center gap-2 min-w-0"
              >
                <AlertCircle size={18} className="text-brand-primary shrink-0" />
                <span className="truncate">Intelligence Alerts</span>
              </h3>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[10px] uppercase tracking-widest text-gray-500 font-bold hidden sm:inline">
                  Live
                </span>
                <button
                  type="button"
                  onClick={onClose}
                  className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-[#1e293b] transition-colors"
                  aria-label="Close alerts panel"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 py-4 space-y-3 custom-scrollbar min-h-0">
              {alerts.map((alert, i) => (
                <motion.div
                  key={alert.id}
                  initial={{ opacity: 0, x: isMobile ? 0 : -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: Math.min(i * 0.05, 0.3) }}
                  className={`p-3 rounded-xl border ${typeStyles[alert.type]} flex gap-3 group cursor-pointer hover:scale-[1.01] transition-all max-w-full`}
                >
                  <div
                    className={`p-2 rounded-lg shrink-0 ${
                      alert.type === 'critical'
                        ? 'bg-rose-500/20'
                        : alert.type === 'warning'
                          ? 'bg-amber-500/20'
                          : 'bg-blue-500/20'
                    } h-fit`}
                  >
                    <alert.icon size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start gap-2 mb-1">
                      <h4 className="font-bold text-sm text-white leading-snug">{alert.title}</h4>
                      <ArrowRight
                        size={14}
                        className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5"
                      />
                    </div>
                    <p className="text-xs text-gray-400 leading-relaxed mb-2 break-words">
                      {alert.description}
                    </p>
                    <div className="flex justify-between items-center gap-2 mt-2 flex-wrap">
                      <span className="text-[10px] font-bold uppercase tracking-tighter opacity-60 group-hover:opacity-100 transition-opacity">
                        Action: {alert.action}
                      </span>
                      <span className="text-[10px] text-gray-500 whitespace-nowrap">Just now</span>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

/** Bell trigger for the header — keeps layout compact */
export function AlertBellButton({ forecastData, personaData, open, onClick }) {
  const priorityCount = useMemo(
    () => countPriorityAlerts(forecastData, personaData),
    [forecastData, personaData]
  );

  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative p-2.5 text-gray-400 hover:text-white transition-colors bg-[#1e293b]/50 border border-gray-700/50 rounded-full shadow-sm hover:bg-[#1e293b] ${open ? 'ring-2 ring-brand-primary/40 text-white' : ''}`}
      title="Intelligence alerts"
      aria-expanded={open}
      aria-label="Open intelligence alerts"
    >
      <Bell size={18} />
      {priorityCount > 0 && (
        <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white border-2 border-[#0f172a]">
          {priorityCount > 9 ? '9+' : priorityCount}
        </span>
      )}
    </button>
  );
}

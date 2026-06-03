import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import AppShell from '@/components/shell/AppShell';
import IntelligenceHubView from '@/views/IntelligenceHub/IntelligenceHubView';
import PipelineView from '@/views/Pipeline/PipelineView';
import RiskRetentionView from '@/views/RiskRetention/RiskRetentionView';
import IntelligenceLabView from '@/views/IntelligenceLab/IntelligenceLabView';
import DataWorkspaceView from '@/views/DataWorkspace/DataWorkspaceView';
import ReportsView from '@/views/Reports/ReportsView';
import CausalEngineView from '@/views/IntelligenceLab/CausalEngine/CausalEngineView';
import TopologyOptimizerView from '@/views/IntelligenceLab/TopologyOptimizer/TopologyOptimizerView';
import WarRoomView from '@/views/IntelligenceLab/WarRoom/WarRoomView';
import OnboardingView from '@/views/Onboarding/OnboardingView';
import { useUserName, getUserName, setUserName } from '@/store/useUserStore';
import { Globe, User, CheckCircle, Server } from 'lucide-react';

const Dashboard = () => {
  const { t } = useTranslation();
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-slate-100">{t('nav.dashboard')}</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="bg-slate-800 p-6 rounded-lg border border-slate-700">
          <p className="text-slate-300">{t('common.noData')}</p>
        </div>
      </div>
    </div>
  );
};

const Simulator = () => {
  const { t } = useTranslation();
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-slate-100">{t('nav.simulator')}</h2>
      <div className="bg-slate-800 p-6 rounded-lg border border-slate-700">
        <p className="text-slate-300">{t('common.noData')}</p>
      </div>
    </div>
  );
};

const Personas = () => {
  const { t } = useTranslation();
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-slate-100">{t('nav.personas')}</h2>
      <div className="bg-slate-800 p-6 rounded-lg border border-slate-700">
        <p className="text-slate-300">{t('common.noData')}</p>
      </div>
    </div>
  );
};

const Playbooks = () => {
  const { t } = useTranslation();
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-slate-100">{t('nav.playbooks')}</h2>
      <div className="bg-slate-800 p-6 rounded-lg border border-slate-700">
        <p className="text-slate-300">{t('common.noData')}</p>
      </div>
    </div>
  );
};

const Settings = () => {
  const { t, i18n } = useTranslation();
  const currentUserName = useUserName();
  const [nameInput, setNameInput] = useState(currentUserName);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Sync state if username changes elsewhere
  useEffect(() => {
    setNameInput(currentUserName);
  }, [currentUserName]);

  const handleSaveName = (e: React.FormEvent) => {
    e.preventDefault();
    if (nameInput.trim()) {
      setUserName(nameInput.trim());
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    }
  };

  const handleLanguageChange = (lang: string) => {
    i18n.changeLanguage(lang);
    localStorage.setItem("predicto_lang", lang);
    const dir = lang === "ar" ? "rtl" : "ltr";
    document.documentElement.dir = dir;
    document.documentElement.lang = lang;
  };

  const isRtl = i18n.dir() === "rtl";

  return (
    <div style={{ padding: "24px", maxWidth: "800px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "24px" }} className="animate-fade-in">
      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: "24px", fontWeight: 600, color: "var(--p-ink)", letterSpacing: "-0.5px" }}>
          {t("nav.settings")}
        </h2>
        <p style={{ fontSize: "13px", color: "var(--p-ink-tertiary)" }}>
          {isRtl ? "تخصيص وإعداد مساحة عمل Predicto الخاصة بك." : "Customize and configure your Predicto workspace."}
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "20px" }}>
        {/* Profile Card */}
        <div className="surface-1" style={{ borderRadius: "16px", border: "1px solid var(--p-hairline)", padding: "20px 24px", display: "flex", flexDirection: "column", gap: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: "rgba(94,106,210,0.1)", border: "1px solid rgba(94,106,210,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <User size={16} color="var(--p-primary-hover)" />
            </div>
            <div>
              <h3 style={{ fontSize: "14px", fontWeight: 600, color: "var(--p-ink)", margin: 0 }}>
                {isRtl ? "الملف الشخصي" : "Profile Settings"}
              </h3>
              <p style={{ fontSize: "11px", color: "var(--p-ink-tertiary)", margin: 0 }}>
                {isRtl ? "تحديث اسم المستخدم الخاص بك المستخدم في التحيات والتقارير." : "Update your display name used in greetings and reports."}
              </p>
            </div>
          </div>

          <form onSubmit={handleSaveName} style={{ display: "flex", flexWrap: "wrap", gap: "12px", alignItems: "flex-end" }}>
            <div style={{ flex: 1, minWidth: "240px" }}>
              <label style={{ display: "block", fontSize: "11px", fontWeight: 600, textTransform: "uppercase", color: "var(--p-ink-tertiary)", marginBottom: "6px", letterSpacing: "0.5px" }}>
                {t("onboarding.nameLabel")}
              </label>
              <input
                type="text"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                placeholder={t("onboarding.namePlaceholder")}
                style={{
                  width: "100%",
                  padding: "10px 14px",
                  background: "rgba(255,255,255,0.02)",
                  border: "1px solid var(--p-hairline)",
                  borderRadius: "8px",
                  color: "var(--p-ink)",
                  fontSize: "14px",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>
            <button type="submit" className="btn" style={{ height: "40px", padding: "0 20px", display: "flex", alignItems: "center", gap: "6px", background: "var(--p-primary)", color: "#fff", border: "none", cursor: "pointer", borderRadius: "8px" }}>
              {t("common.save", "Save")}
            </button>
          </form>
          {saveSuccess && (
            <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "#4ade80", fontSize: "12px", marginTop: "4px" }}>
              <CheckCircle size={14} />
              <span>{isRtl ? "تم حفظ الاسم بنجاح!" : "Name saved successfully!"}</span>
            </div>
          )}
        </div>

        {/* Preferences Card */}
        <div className="surface-1" style={{ borderRadius: "16px", border: "1px solid var(--p-hairline)", padding: "20px 24px", display: "flex", flexDirection: "column", gap: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: "rgba(94,106,210,0.1)", border: "1px solid rgba(94,106,210,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Globe size={16} color="var(--p-primary-hover)" />
            </div>
            <div>
              <h3 style={{ fontSize: "14px", fontWeight: 600, color: "var(--p-ink)", margin: 0 }}>
                {isRtl ? "التفضيلات واللغة" : "Preferences & Language"}
              </h3>
              <p style={{ fontSize: "11px", color: "var(--p-ink-tertiary)", margin: 0 }}>
                {isRtl ? "اختر لغة العرض المفضلة لديك وتخطيط الواجهة." : "Select your preferred display language and layout direction."}
              </p>
            </div>
          </div>

          <div style={{ display: "flex", gap: "12px" }}>
            {[
              { code: "en", label: "English (US)" },
              { code: "ar", label: "العربية (RTL)" }
            ].map((lang) => {
              const active = i18n.language === lang.code;
              return (
                <button
                  key={lang.code}
                  onClick={() => handleLanguageChange(lang.code)}
                  style={{
                    flex: 1,
                    padding: "12px",
                    borderRadius: "10px",
                    border: active ? "1px solid rgba(94,106,210,0.4)" : "1px solid var(--p-hairline)",
                    background: active ? "rgba(94,106,210,0.08)" : "rgba(255,255,255,0.01)",
                    color: active ? "var(--p-primary-hover)" : "var(--p-ink-muted)",
                    fontWeight: active ? 600 : 400,
                    fontSize: "13px",
                    cursor: "pointer",
                    transition: "all 150ms",
                    textAlign: "center",
                  }}
                >
                  {lang.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Diagnostics & Integrations */}
        <div className="surface-1" style={{ borderRadius: "16px", border: "1px solid var(--p-hairline)", padding: "20px 24px", display: "flex", flexDirection: "column", gap: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: "rgba(94,106,210,0.1)", border: "1px solid rgba(94,106,210,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Server size={16} color="var(--p-primary-hover)" />
            </div>
            <div>
              <h3 style={{ fontSize: "14px", fontWeight: 600, color: "var(--p-ink)", margin: 0 }}>
                {isRtl ? "حالة النظام ومحركات الذكاء الاصطناعي" : "System Diagnostics & Engines"}
              </h3>
              <p style={{ fontSize: "11px", color: "var(--p-ink-tertiary)", margin: 0 }}>
                {isRtl ? "حالة تشغيل الخدمات والمحركات الذكية في الخلفية." : "Operational status of back-end processing pipelines and models."}
              </p>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {[
              { name: "GROQ Ingestion Parser", status: "online", statusAr: "نشط", speed: "12ms" },
              { name: "GRU Revenue Forecast Engine", status: "online", statusAr: "نشط", speed: "185ms" },
              { name: "DoubleML Counterfactual Estimator", status: "online", statusAr: "نشط", speed: "410ms" },
              { name: "K-Means Customer Segmentation", status: "online", statusAr: "نشط", speed: "45ms" }
            ].map((srv, idx) => (
              <div key={idx} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: "rgba(255,255,255,0.01)", borderRadius: "8px", border: "1px solid var(--p-hairline)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#4ade80" }} />
                  <span style={{ fontSize: "12px", fontWeight: 500, color: "var(--p-ink)" }}>{srv.name}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <span style={{ fontSize: "11px", color: "var(--p-ink-tertiary)", fontFamily: "var(--font-mono)" }}>{srv.speed}</span>
                  <span style={{ fontSize: "11px", color: "#4ade80", fontWeight: 600, textTransform: "uppercase" }}>
                    {isRtl ? srv.statusAr : srv.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

const TITLE_MAP: Record<string, string> = {
  '/dashboard': 'nav.dashboard',
  '/simulator': 'nav.simulator',
  '/intelligence-hub': 'nav.intelligenceHub',
  '/pipeline': 'nav.pipeline',
  '/risk-retention': 'nav.riskRetention',
  '/war-room': 'nav.warRoom',
  '/personas': 'nav.personas',
  '/playbooks': 'nav.playbooks',
  '/intelligence-lab': 'nav.intelligenceLab',
  '/intelligence-lab/causal-engine': 'nav.causalEngine',
  '/intelligence-lab/topology-optimizer': 'nav.topologyOptimizer',
  '/data-workspace': 'nav.dataWorkspace',
  '/reports': 'nav.reports',
  '/settings': 'nav.settings',
};

function ShellWrapper() {
  const location = useLocation();
  const navigate = useNavigate();
  const title = TITLE_MAP[location.pathname] || 'nav.intelligenceHub';

  return (
    <AppShell
      activePath={location.pathname}
      pageTitle={title}
      onNavigate={navigate}
    >
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/simulator" element={<Simulator />} />
        <Route path="/intelligence-hub" element={<IntelligenceHubView />} />
        <Route path="/pipeline" element={<PipelineView />} />
        <Route path="/risk-retention" element={<RiskRetentionView />} />
        <Route path="/war-room" element={<WarRoomView />} />
        <Route path="/personas" element={<Personas />} />
        <Route path="/playbooks" element={<Playbooks />} />
        <Route path="/intelligence-lab" element={<IntelligenceLabView />} />
        <Route path="/intelligence-lab/causal-engine" element={<CausalEngineView />} />
        <Route path="/intelligence-lab/topology-optimizer" element={<TopologyOptimizerView />} />
        <Route path="/data-workspace" element={<DataWorkspaceView />} />
        <Route path="/reports" element={<ReportsView />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </AppShell>
  );
}

export default function Router() {
  const [hasUser, setHasUser] = useState(!!getUserName());

  const handleOnboardingComplete = (name: string) => {
    setUserName(name);
    setHasUser(true);
  };

  return (
    <BrowserRouter>
      {hasUser ? (
        <ShellWrapper />
      ) : (
        <OnboardingView onComplete={handleOnboardingComplete} />
      )}
    </BrowserRouter>
  );
}

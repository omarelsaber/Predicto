/**
 * LanguageSwitcher.tsx
 * Predicto — Compact language toggle for the topbar
 *
 * Toggles between EN and AR, persists preference,
 * and triggers RTL/LTR direction change via i18n.
 */

import React from "react";
import { useTranslation } from "react-i18next";
import { Globe } from "lucide-react";

const LanguageSwitcher: React.FC = () => {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");

  const toggle = () => {
    const next = isAr ? "en" : "ar";
    i18n.changeLanguage(next);
  };

  return (
    <button
      className="btn-icon"
      onClick={toggle}
      title={isAr ? "Switch to English" : "التبديل إلى العربية"}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 4,
        padding: "4px 8px",
        borderRadius: 8,
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: "0.5px",
        color: "var(--p-ink-muted)",
        minWidth: 44,
        justifyContent: "center",
      }}
    >
      <Globe size={13} />
      <span>{isAr ? "EN" : "AR"}</span>
    </button>
  );
};

export default LanguageSwitcher;

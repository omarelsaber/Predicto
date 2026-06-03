/**
 * personaMapping.ts
 * Predicto — Frontend mapping for backend labels
 *
 * Translates English backend labels (personas, segments, risk levels,
 * deal stages) to the current UI language on-the-fly.
 */

import i18n from "@/i18n";

/** Persona labels from backend → localized display */
const PERSONA_MAP: Record<string, Record<string, string>> = {
  en: {
    Champions: "Champions",
    "Growth Stars": "Growth Stars",
    "Core Stable": "Core Stable",
    "Nurture Pool": "Nurture Pool",
    "Watch List": "Watch List",
    "At Risk": "At Risk",
    "At-Risk": "At-Risk",
  },
  ar: {
    Champions: "الأبطال",
    "Growth Stars": "نجوم النمو",
    "Core Stable": "النواة المستقرة",
    "Nurture Pool": "مجموعة الرعاية",
    "Watch List": "قائمة المراقبة",
    "At Risk": "معرضون للخطر",
    "At-Risk": "معرضون للخطر",
  },
};

/** Segment labels from backend → localized display */
const SEGMENT_MAP: Record<string, Record<string, string>> = {
  en: {
    Enterprise: "Enterprise",
    "Mid-Market": "Mid-Market",
    SMB: "SMB",
    Starter: "Starter",
  },
  ar: {
    Enterprise: "المؤسسات الكبرى",
    "Mid-Market": "السوق المتوسط",
    SMB: "الأعمال الصغيرة والمتوسطة",
    Starter: "مبتدئ",
  },
};

/** Risk level labels → localized display */
const RISK_MAP: Record<string, Record<string, string>> = {
  en: {
    Critical: "Critical",
    High: "High",
    Medium: "Medium",
    Low: "Low",
  },
  ar: {
    Critical: "حرج",
    High: "مرتفع",
    Medium: "متوسط",
    Low: "منخفض",
  },
};

/** Deal stage labels → localized display */
const STAGE_MAP: Record<string, Record<string, string>> = {
  en: {
    Discovery: "Discovery",
    Qualification: "Qualification",
    Proposal: "Proposal",
    Negotiation: "Negotiation",
    Closing: "Closing",
    "Closed Won": "Closed Won",
    "Closed Lost": "Closed Lost",
  },
  ar: {
    Discovery: "الاستكشاف",
    Qualification: "التأهيل",
    Proposal: "العرض",
    Negotiation: "التفاوض",
    Closing: "الإغلاق",
    "Closed Won": "تم الفوز",
    "Closed Lost": "تم الخسارة",
  },
};

/** Helper: look up a label in a mapping, fallback to raw label */
function translate(
  map: Record<string, Record<string, string>>,
  label: string
): string {
  const lang = i18n.language?.startsWith("ar") ? "ar" : "en";
  return map[lang]?.[label] ?? label;
}

export const tPersona = (label: string) => translate(PERSONA_MAP, label);
export const tSegment = (label: string) => translate(SEGMENT_MAP, label);
export const tRisk = (label: string) => translate(RISK_MAP, label);
export const tStage = (label: string) => translate(STAGE_MAP, label);

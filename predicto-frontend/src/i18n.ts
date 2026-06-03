/**
 * i18n.ts
 * Predicto — Internationalization Configuration
 *
 * Sets up i18next with:
 *  - HTTP backend for loading translations from /locales/{lang}/translation.json
 *  - Browser language detection (localStorage → navigator)
 *  - RTL/LTR direction switching on language change
 */

import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import HttpBackend from "i18next-http-backend";
import LanguageDetector from "i18next-browser-languagedetector";

const RTL_LANGUAGES = ["ar", "he", "fa", "ur"];

/** Update <html> dir and lang attributes + Arabic font */
function applyDirection(lng: string): void {
  const dir = RTL_LANGUAGES.includes(lng) ? "rtl" : "ltr";
  document.documentElement.dir = dir;
  document.documentElement.lang = lng;

  // Toggle Arabic body class for font-family override
  if (dir === "rtl") {
    document.body.classList.add("lang-ar");
  } else {
    document.body.classList.remove("lang-ar");
  }
}

i18n
  .use(HttpBackend)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: "en",
    supportedLngs: ["en", "ar"],
    debug: false,

    interpolation: {
      escapeValue: false, // React already escapes
    },

    backend: {
      loadPath: "/locales/{{lng}}/translation.json",
    },

    detection: {
      order: ["localStorage", "navigator"],
      lookupLocalStorage: "predicto_lang",
      caches: ["localStorage"],
    },

    react: {
      useSuspense: true,
    },
  });

// Apply direction on init
applyDirection(i18n.language || "en");

// Apply direction on every language change
i18n.on("languageChanged", (lng) => {
  applyDirection(lng);
});

export default i18n;

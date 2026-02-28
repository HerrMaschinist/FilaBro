import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "@/locales/en";
import de from "@/locales/de";

i18n.use(initReactI18next).init({
  compatibilityJSON: "v4",
  resources: {
    en: { translation: en },
    de: { translation: de },
  },
  lng: "en",
  fallbackLng: "en",
  interpolation: { escapeValue: false },
  initImmediate: false,
  saveMissing: true,
  missingKeyHandler: __DEV__
    ? (_lngs: readonly string[], _ns: string, key: string) => {
        console.warn(`[i18n] Missing translation key: "${key}"`);
      }
    : undefined,
});

export default i18n;

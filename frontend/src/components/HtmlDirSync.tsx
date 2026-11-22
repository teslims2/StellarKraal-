"use client";
/**
 * HtmlDirSync — Issue #1524
 *
 * Synchronises the <html> element's `dir` and `lang` attributes with the
 * active i18n locale whenever the user switches languages. This is required
 * for RTL layout support because the `dir` attribute on the root element is
 * the standard mechanism browsers and CSS use to flip directional properties.
 *
 * Next.js App Router renders <html lang="en"> as a static attribute. Because
 * the user's locale is only known on the client (it is stored in localStorage
 * and a cookie), we can only update these attributes after hydration. This
 * component does exactly that — it listens to I18nContext and updates the DOM
 * attribute without causing a hydration mismatch.
 *
 * RTL locales: none of the currently supported locales (en, sw) are RTL.
 * Kiswahili (sw) is a Latin-script LTR language. The infrastructure is in
 * place so that adding an RTL locale (e.g. Arabic `ar`) in the future only
 * requires adding it to RTL_LOCALES below.
 */
import { useEffect } from "react";
import { useI18n, type Locale } from "@/context/I18nContext";

/** BCP 47 language tags for each supported locale. */
const LOCALE_LANG: Record<Locale, string> = {
  en: "en",
  sw: "sw",
};

/** Locales that require right-to-left layout. */
const RTL_LOCALES: Set<Locale> = new Set([
  // Add RTL locales here, e.g.: "ar", "he", "fa"
]);

export default function HtmlDirSync() {
  const { locale } = useI18n();

  useEffect(() => {
    const html = document.documentElement;
    const dir = RTL_LOCALES.has(locale) ? "rtl" : "ltr";
    html.setAttribute("lang", LOCALE_LANG[locale] ?? locale);
    html.setAttribute("dir", dir);
  }, [locale]);

  // Renders nothing — only manages DOM attributes as a side effect.
  return null;
}

"use client";
/**
 * i18n Context — Issue #1207
 *
 * Lightweight, cookie-backed i18n for the StellarKraal frontend.
 * Supports English (en) and Kiswahili (sw) locales on the /loans and
 * /collateral pages, with the language switcher persisting selection to the
 * `stellarkraal_locale` cookie so the choice survives page reloads.
 *
 * Architecture choice: Next.js App Router does not support next-i18next's
 * page-level getServerSideProps pattern. This context provides an equivalent
 * client-side solution that is tree-shakeable and requires no additional
 * dependencies.
 */
import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export type Locale = "en" | "sw";

export interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, fallback?: string) => string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const SUPPORTED_LOCALES: Locale[] = ["en", "sw"];
export const DEFAULT_LOCALE: Locale = "en";
const COOKIE_NAME = "stellarkraal_locale";

// ─── Translation loader ───────────────────────────────────────────────────────

type TranslationDict = Record<string, unknown>;

/** Deeply resolve a dotted key path in a nested object. */
function resolvePath(obj: TranslationDict, path: string): string | undefined {
  const parts = path.split(".");
  let cursor: unknown = obj;
  for (const part of parts) {
    if (cursor == null || typeof cursor !== "object") return undefined;
    cursor = (cursor as TranslationDict)[part];
  }
  return typeof cursor === "string" ? cursor : undefined;
}

/** Cache loaded translations to avoid redundant network fetches. */
const translationCache: Partial<Record<Locale, TranslationDict>> = {};

async function loadTranslations(locale: Locale): Promise<TranslationDict> {
  if (translationCache[locale]) return translationCache[locale]!;
  try {
    const res = await fetch(`/locales/${locale}/common.json`);
    if (!res.ok) throw new Error(`Failed to load locale: ${locale}`);
    const data = (await res.json()) as TranslationDict;
    translationCache[locale] = data;
    return data;
  } catch {
    // If sw fails to load, fall back to en
    if (locale !== DEFAULT_LOCALE) {
      return loadTranslations(DEFAULT_LOCALE);
    }
    return {};
  }
}

// ─── Storage helpers (localStorage + cookie) ─────────────────────────────────
//
// The locale preference is stored in both localStorage (primary, per AC #1067)
// and a cookie (secondary, allows server-side middleware to read it without JS).

const LS_KEY = "stellarkraal_locale";

function readLocalePreference(): Locale {
  if (typeof window === "undefined") return DEFAULT_LOCALE;

  // 1. Try localStorage first (primary storage per AC #1067)
  try {
    const lsValue = localStorage.getItem(LS_KEY);
    if (lsValue && (SUPPORTED_LOCALES as string[]).includes(lsValue)) {
      return lsValue as Locale;
    }
  } catch {
    // localStorage may be blocked (e.g. private browsing in some browsers)
  }

  // 2. Fall back to cookie
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${COOKIE_NAME}=([^;]*)`)
  );
  const cookieValue = match ? decodeURIComponent(match[1]) : null;
  return (SUPPORTED_LOCALES as string[]).includes(cookieValue ?? "")
    ? (cookieValue as Locale)
    : DEFAULT_LOCALE;
}

function writeLocalePreference(locale: Locale): void {
  if (typeof window === "undefined") return;

  // Write to localStorage (primary)
  try {
    localStorage.setItem(LS_KEY, locale);
  } catch {
    // Ignore write errors (storage quota exceeded, etc.)
  }

  // Write to cookie (secondary — for SSR / middleware)
  const maxAge = 60 * 60 * 24 * 365;
  document.cookie = `${COOKIE_NAME}=${locale}; path=/; max-age=${maxAge}; SameSite=Lax`;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const I18nContext = createContext<I18nContextValue>({
  locale: DEFAULT_LOCALE,
  setLocale: () => {},
  t: (key: string, fallback?: string) => fallback ?? key,
});

// ─── Provider ─────────────────────────────────────────────────────────────────

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);
  const [translations, setTranslations] = useState<TranslationDict>({});

  // Hydrate locale from localStorage / cookie on mount
  useEffect(() => {
    const saved = readLocalePreference();
    setLocaleState(saved);
    loadTranslations(saved).then(setTranslations);
  }, []);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    writeLocalePreference(next);
    loadTranslations(next).then(setTranslations);
  }, []);

  /** Resolve a dotted key such as "collateral.title" from the loaded dict. */
  const t = useCallback(
    (key: string, fallback?: string): string => {
      return resolvePath(translations, key) ?? fallback ?? key;
    },
    [translations]
  );

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useI18n(): I18nContextValue {
  return useContext(I18nContext);
}

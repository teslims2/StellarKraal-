"use client";
/**
 * ThemeProvider — manages light / dark / system theme preference.
 *
 * Closes #1424:
 *  - Tailwind dark mode uses the 'class' strategy (see tailwind.config.ts).
 *  - Three modes: 'light', 'dark', and 'system' (follows OS preference).
 *  - Selected mode is persisted to localStorage under the 'theme' key.
 *  - ThemeScript applies the class before first paint to avoid flash-of-wrong-theme.
 *  - System preference changes update the UI automatically when mode is 'system'.
 */
import { createContext, useContext, useEffect, useState } from "react";

/** The three user-selectable modes. */
export type ThemeMode = "light" | "dark" | "system";

/** The resolved (applied) theme — always either light or dark. */
export type Theme = "light" | "dark";

interface ThemeContextValue {
  /** The resolved (applied) theme. */
  theme: Theme;
  /** The user-selected mode (may be 'system'). */
  mode: ThemeMode;
  /** Cycle through light → dark → system. */
  toggle: () => void;
  /** Explicitly set the mode. */
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "light",
  mode: "system",
  toggle: () => {},
  setMode: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

/** Resolve a mode to the actual applied theme. */
function resolveTheme(mode: ThemeMode): Theme {
  if (mode === "system") {
    return typeof window !== "undefined" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }
  return mode;
}

/**
 * Inline script injected into <head> before the page renders.
 * Applies the correct 'dark' class (or removes it) so there is no
 * flash-of-wrong-theme before React hydrates.
 *
 * Logic:
 *   1. Read the stored preference from localStorage ('light', 'dark', or 'system').
 *   2. When stored as 'system' or absent, fall back to prefers-color-scheme.
 *   3. Toggle the 'dark' class on <html> accordingly.
 */
export function ThemeScript() {
  const script = `
    (function() {
      try {
        var stored = localStorage.getItem('theme');
        var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        var resolved;
        if (stored === 'dark') {
          resolved = 'dark';
        } else if (stored === 'light') {
          resolved = 'light';
        } else {
          // 'system' or no stored value — follow OS preference
          resolved = prefersDark ? 'dark' : 'light';
        }
        document.documentElement.classList.toggle('dark', resolved === 'dark');
      } catch (e) {}
    })();
  `;
  // biome-ignore lint: dangerouslySetInnerHTML is intentional for blocking script
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}

/** Cycle order for the toggle button. */
const CYCLE: ThemeMode[] = ["light", "dark", "system"];

export default function ThemeProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  // Initial mode: read from localStorage (or default to 'system').
  const [mode, setModeState] = useState<ThemeMode>("system");
  const [theme, setTheme] = useState<Theme>("light");

  // On mount, sync state with what ThemeScript already applied.
  useEffect(() => {
    const stored = localStorage.getItem("theme") as ThemeMode | null;
    const initialMode: ThemeMode =
      stored === "light" || stored === "dark" || stored === "system"
        ? stored
        : "system";
    const initialTheme = resolveTheme(initialMode);
    setModeState(initialMode);
    setTheme(initialTheme);
    document.documentElement.classList.toggle("dark", initialTheme === "dark");

    // Listen for OS-level preference changes — only matters when mode is 'system'.
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = (e: MediaQueryListEvent) => {
      setModeState((currentMode) => {
        if (currentMode === "system") {
          const next: Theme = e.matches ? "dark" : "light";
          setTheme(next);
          document.documentElement.classList.toggle("dark", next === "dark");
        }
        return currentMode;
      });
    };
    mq.addEventListener("change", handleChange);
    return () => mq.removeEventListener("change", handleChange);
  }, []);

  function applyMode(next: ThemeMode) {
    const resolved = resolveTheme(next);
    localStorage.setItem("theme", next);
    document.documentElement.classList.toggle("dark", resolved === "dark");
    setModeState(next);
    setTheme(resolved);
  }

  function toggle() {
    setModeState((prev) => {
      const idx = CYCLE.indexOf(prev);
      const next = CYCLE[(idx + 1) % CYCLE.length];
      applyMode(next);
      return next;
    });
  }

  return (
    <ThemeContext.Provider value={{ theme, mode, toggle, setMode: applyMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

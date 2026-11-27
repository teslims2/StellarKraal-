"use client";
/**
 * ThemeToggle — cycles between light, dark, and system (OS preference) modes.
 *
 * Closes #1424:
 *  - Three modes: light → dark → system (follows OS preference).
 *  - Sun icon in dark mode, Moon icon in light mode, Monitor icon in system mode.
 *  - Defaults to `prefers-color-scheme` on first visit (handled by ThemeProvider +
 *    ThemeScript; this component just consumes the context).
 *  - User preference is persisted to `localStorage` via ThemeProvider.
 *  - Keyboard accessible: inherits native <button> tab-stop, activates on Enter/Space.
 *  - Screen-reader friendly:
 *      • `aria-label` announces the *current* mode.
 *      • A visually-hidden `aria-live="polite"` region announces state changes.
 *  - `focus-visible` ring satisfies WCAG 2.4.7 (Focus Visible).
 */
import { useEffect, useState } from "react";
import { Sun, Moon, Monitor } from "lucide-react";
import { Icon } from "@/components/Icon";
import { useTheme, type ThemeMode } from "./ThemeProvider";

const MODE_LABELS: Record<ThemeMode, string> = {
  light: "Light mode",
  dark: "Dark mode",
  system: "System preference",
};

const MODE_ICONS: Record<ThemeMode, typeof Sun> = {
  light: Sun,
  dark: Moon,
  system: Monitor,
};

export default function ThemeToggle() {
  const { mode, toggle } = useTheme();

  /**
   * Announcement string for the polite live region.
   * Updated *after* the toggle so the screen reader reads the new state.
   */
  const [announcement, setAnnouncement] = useState<string>("");

  /**
   * Update the live-region text whenever the mode changes so assistive
   * technology announces the result of the toggle action.
   */
  useEffect(() => {
    if (announcement === "") return; // skip the initial mount — no user action yet
    setAnnouncement(`Theme: ${MODE_LABELS[mode]}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  function handleToggle() {
    toggle();
    // Set the announcement now; the effect above fires too but this handles fast presses.
    const labels: ThemeMode[] = ["light", "dark", "system"];
    const nextMode = labels[(labels.indexOf(mode) + 1) % labels.length];
    setAnnouncement(`Theme: ${MODE_LABELS[nextMode]}`);
  }

  const CurrentIcon = MODE_ICONS[mode];

  return (
    <>
      <button
        type="button"
        onClick={handleToggle}
        aria-label={`Theme: ${MODE_LABELS[mode]}. Click to cycle theme.`}
        title={`Theme: ${MODE_LABELS[mode]}`}
        className={[
          "rounded-lg p-2 min-h-[44px] min-w-[44px] flex items-center justify-center",
          "transition-colors duration-200",
          "hover:bg-[var(--color-border)]",
          // focus-visible ring — WCAG 2.4.7 Focus Visible
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold)]",
        ].join(" ")}
      >
        {/* Icon is decorative; aria-label on the button conveys the action */}
        <Icon
          icon={CurrentIcon}
          size="md"
          className="text-[var(--color-text)]"
          aria-hidden={true}
        />
      </button>

      {/*
       * Visually-hidden live region — announces the toggle result to screen
       * readers without disrupting the visual layout.
       */}
      <span
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {announcement}
      </span>
    </>
  );
}

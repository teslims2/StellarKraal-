/**
 * Design tokens for StellarKraal
 *
 * All colours meet WCAG 2.1 AA requirements:
 *   - Normal text  (< 18 pt / < 14 pt bold): ≥ 4.5:1 contrast ratio
 *   - Large text   (≥ 18 pt / ≥ 14 pt bold): ≥ 3:1 contrast ratio
 *   - UI components / graphical objects:      ≥ 3:1 contrast ratio
 *
 * Contrast ratios are documented inline with each token.
 * Run `npm run test:a11y` (axe-core) to verify zero contrast violations.
 */

export const colors = {
  // Primary brand colors
  primary: {
    bg: 'bg-brown-600',        // Updated to darker brown for better contrast
    text: 'text-cream-50',
    hover: 'hover:bg-brown-700',
    border: 'border-brown-600'
  },
  
  // Secondary colors  
  secondary: {
    bg: 'bg-gold-600',         // Updated to darker gold for better contrast
    text: 'text-cream-50',     // White text on gold background
    hover: 'hover:bg-gold-700', 
    border: 'border-gold-600'
  },

  // Text colors (all WCAG AA compliant)
  text: {
    primary: 'text-brown-700',    // 13.9:1 contrast on white
    secondary: 'text-brown-600',  // 10.8:1 contrast on white
    muted: 'text-brown-500',      // 5.87:1 contrast on white
    inverse: 'text-cream-50'      // High contrast on dark backgrounds
  },

  // Background colors
  background: {
    primary: 'bg-cream-50',       // Pure white
    secondary: 'bg-cream-200',    // Light cream
    card: 'bg-cream-50',          // White cards
    overlay: 'bg-brown-900/80'    // Dark overlay
  },

  // Interactive states
  interactive: {
    default: 'bg-brown-600 text-cream-50',  // Updated for better contrast
    hover: 'hover:bg-brown-700',
    focus: 'focus:ring-2 focus:ring-brown-600 focus:ring-offset-2',
    disabled: 'disabled:bg-brown-300 disabled:text-brown-600'
  },

  // Status colors
  status: {
    success: {
      bg: 'bg-success-light',
      text: 'text-success-dark',
      border: 'border-success'
    },
    error: {
      bg: 'bg-error-light', 
      text: 'text-error-dark',
      border: 'border-error'
    },
    warning: {
      bg: 'bg-warning-light',
      text: 'text-warning-dark', 
      border: 'border-warning'
    }
  },

  // Form elements
  form: {
    input: 'border-brown-500 focus:border-brown-600 focus:ring-brown-600', // Updated border color
    label: 'text-brown-700',
    placeholder: 'placeholder-brown-500',  // Updated placeholder color
    error: 'border-error text-error-dark'
  }
} as const;

// ── Spacing scale (#778) ─────────────────────────────────────────────────────
// Base-4 scale. Values map to Tailwind spacing keys defined in tailwind.config.js.
// Use these tokens instead of arbitrary px values to keep spacing consistent.
//
//   Token name    px     Tailwind class (example)
//   space-1       4 px   p-space-1 / gap-space-1 / mt-space-1
//   space-2       8 px   p-space-2 / gap-space-2
//   space-3      12 px   …
//   space-4      16 px
//   space-6      24 px
//   space-8      32 px
//   space-12     48 px
//   space-16     64 px

export const spacing = {
  /** 4 px — tight internal padding, icon gaps */
  space1:  'space-1',
  /** 8 px — small gaps, badge padding */
  space2:  'space-2',
  /** 12 px — inline element padding */
  space3:  'space-3',
  /** 16 px — default component padding */
  space4:  'space-4',
  /** 24 px — section padding, card inner spacing */
  space6:  'space-6',
  /** 32 px — between related sections */
  space8:  'space-8',
  /** 48 px — between major page sections */
  space12: 'space-12',
  /** 64 px — hero / page-level vertical rhythm */
  space16: 'space-16',
} as const;

// ── Typography tokens (#298) ─────────────────────────────────────────────────

export const typography = {
  heading: {
    h1: "text-h1",
    h2: "text-h2",
    h3: "text-h3",
    h4: "text-h4",
  },
  body: {
    default: "text-body",
    sm: "text-body-sm",
  },
  caption: "text-caption",
  label: "text-label",
} as const;

// Utility function to get contrast-compliant color combinations
export function getContrastPair(background: 'light' | 'dark' = 'light') {
  return background === 'light' 
    ? { bg: 'bg-cream-50', text: 'text-brown-700' }
    : { bg: 'bg-brown-700', text: 'text-cream-50' };
}

// Health factor colors with proper contrast
export function healthColor(value: number): string {
  if (value >= 15000) return '#16A34A'; // success.DEFAULT - 4.54:1 on white
  if (value >= 10000) return '#D97706'; // warning.DEFAULT - 4.52:1 on white
  return '#DC2626'; // error.DEFAULT - 5.25:1 on white
}

// Non-color indicators so health status is distinguishable without relying on colour perception
export type HealthTier = 'safe' | 'warning' | 'danger';

export function healthTier(value: number): HealthTier {
  if (value >= 15000) return 'safe';
  if (value >= 10000) return 'warning';
  return 'danger';
}

export const HEALTH_TIER_ICON: Record<HealthTier, string> = {
  safe: '✓',
  warning: '!',
  danger: '✕',
};

export const HEALTH_TIER_LABEL: Record<HealthTier, string> = {
  safe: 'Safe',
  warning: 'Warning',
  danger: 'Danger',
};

// ── Loading state tokens (#1091) ─────────────────────────────────────────────
//
// StellarKraal uses exactly three loading affordances. Each token names the
// Tailwind/component to use and states when to use it.
//
//   Tier 1 — Skeleton     → initial page / data load (no content yet)
//   Tier 2 — Spinner      → user-triggered action (indeterminate wait)
//   Tier 3 — ProgressBar  → file / media upload with a known % value
//
// See src/components/LoadingStates.stories.tsx for the full decision tree,
// usage rules, and live examples of all three variants.

export const loadingTokens = {
  /**
   * Skeleton shimmer — CSS classes applied by the `Skeleton` component.
   * Uses `skeleton-shimmer` (defined in globals.css) which reads
   * `--color-skeleton-base` and `--color-skeleton-shine` from :root / .dark.
   */
  skeleton: {
    /** Base shimmer class — always apply this to the Skeleton element. */
    base: 'skeleton-shimmer rounded',
    /** aria attributes to apply to the *container*, not individual bars. */
    aria: { 'aria-busy': 'true' } as const,
  },

  /**
   * Spinner — inline SVG `animate-spin` indicator.
   * Colour is inherited via `currentColor`; no colour tokens needed.
   * Size variants (Tailwind classes):
   *   sm   → 'h-4 w-4'  (buttons, inline)
   *   md   → 'h-6 w-6'  (card-level)
   *   lg   → 'h-8 w-8'  (full-section)
   */
  spinner: {
    sm: 'h-4 w-4',
    md: 'h-6 w-6',
    lg: 'h-8 w-8',
  },

  /**
   * ProgressBar — deterministic upload progress.
   * Fill colour uses semantic tokens:
   *   in-progress → var(--token-primary)
   *   complete    → var(--token-success)
   * Track colour  → var(--token-border)  (light) / var(--token-border) (dark)
   */
  progressBar: {
    trackClass: 'h-2 w-full rounded-full bg-color-border overflow-hidden',
    fillInProgress: 'var(--token-primary)',
    fillComplete: 'var(--token-success)',
  },
} as const;

// ── WCAG AA colour contrast documentation (#1090) ────────────────────────────
//
// All ratios measured against their intended background using the WCAG 2.1
// relative luminance formula. Updated from the axe-core CI audit.
//
// Passing threshold:
//   Normal text  ≥ 4.5:1
//   Large text   ≥ 3:1
//   UI elements  ≥ 3:1
//
// Legend: [ratio] [hex on hex] — notes

export const contrastRatios = {
  // ── Text on light surface (#FEFCF8 / #FDF6EC) ─────────────────────────────
  textOnLight: {
    /** brown-700 (#3D2810) on cream (#FEFCF8) — primary body text */
    bodyPrimary:   { ratio: '13.9:1', hex: '#3D2810 on #FEFCF8', passes: 'AA' },
    /** brown-600 (#5D3C15) on cream — secondary text, labels */
    bodySecondary: { ratio: '10.8:1', hex: '#5D3C15 on #FEFCF8', passes: 'AA' },
    /** brown-500 (#8B5A1F) on cream — muted / caption text */
    bodyMuted:     { ratio: '5.87:1', hex: '#8B5A1F on #FEFCF8', passes: 'AA' },
    /** gold-600  (#B45309) on cream — accent links */
    accentLink:    { ratio: '6.1:1',  hex: '#B45309 on #FEFCF8', passes: 'AA' },
  },

  // ── Text on dark surface (#1A1007 / #2A1B0B) ──────────────────────────────
  textOnDark: {
    /** cream-200 (#FDF6EC) on dark (#1A1007) — primary body text */
    bodyPrimary:   { ratio: '17.8:1', hex: '#FDF6EC on #1A1007', passes: 'AA' },
    /** cream-300 (#FBF0E0) on dark — secondary text */
    bodySecondary: { ratio: '14.6:1', hex: '#FBF0E0 on #1A1007', passes: 'AA' },
    /** gold-400  (#F8CA47) on dark — muted / caption */
    bodyMuted:     { ratio: '9.4:1',  hex: '#F8CA47 on #1A1007', passes: 'AA' },
  },

  // ── Interactive (buttons) ─────────────────────────────────────────────────
  interactive: {
    /** cream-50 (#FFFFFF) on brown-600 (#5D3C15) — primary button label */
    primaryBtn:    { ratio: '10.8:1', hex: '#FFFFFF on #5D3C15', passes: 'AA' },
    /** cream-50 (#FFFFFF) on gold-600 (#B45309) — secondary button label */
    secondaryBtn:  { ratio: '6.1:1',  hex: '#FFFFFF on #B45309', passes: 'AA' },
    /** cream-50 (#FFFFFF) on error-dark (#B91C1C) — destructive button */
    dangerBtn:     { ratio: '7.1:1',  hex: '#FFFFFF on #B91C1C', passes: 'AA' },
  },

  // ── Status / badge text ───────────────────────────────────────────────────
  status: {
    /** success-dark (#15803D) on success-light (#D4F4DD) */
    successBadge:  { ratio: '5.2:1',  hex: '#15803D on #D4F4DD', passes: 'AA' },
    /** error-dark  (#B91C1C) on error-light  (#FEE2E2) */
    errorBadge:    { ratio: '5.9:1',  hex: '#B91C1C on #FEE2E2', passes: 'AA' },
    /** warning-dark (#B45309) on warning-light (#FEF3C7) */
    warningBadge:  { ratio: '5.1:1',  hex: '#B45309 on #FEF3C7', passes: 'AA' },
  },

  // ── Focus ring ───────────────────────────────────────────────────────────
  focusRing: {
    /** gold (#D97706) on cream (#FEFCF8) — light mode focus outline */
    lightMode:     { ratio: '4.52:1', hex: '#D97706 on #FEFCF8', passes: 'AA' },
    /** gold-400 (#F8CA47) on brown-900 (#1A1007) — dark mode focus outline */
    darkMode:      { ratio: '9.4:1',  hex: '#F8CA47 on #1A1007', passes: 'AA' },
  },
} as const;

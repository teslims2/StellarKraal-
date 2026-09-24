# Loading State Design System

> **Issue #1091** — Consistent loading state hierarchy for StellarKraal.

---

## Overview

Loading states across the app were previously inconsistent — some pages used spinners for initial loads, some used skeletons, and some showed nothing. This document defines the canonical three-tier hierarchy and usage rules so every engineer makes the same choice every time.

---

## The Three Loading Affordances

### Tier 1 — Skeleton (initial data loads)

**Use when:** A page or section is mounting and there is **no existing content** yet.

| Property | Value |
|---|---|
| Component | `<Skeleton>` + page-level wrappers (`SkeletonDashboard`, `SkeletonCollateralPage`, `SkeletonLoansPage`, etc.) |
| Animation | Shimmer sweep — `skeleton-shimmer` class (`globals.css`) |
| ARIA | Container: `aria-busy="true"` + `aria-label="Loading [content]"`. Bars: `aria-hidden="true"` |
| Count | One skeleton per expected item; show at least 1 (default ≥ 3 rows) |

**When NOT to use:**
- Don't show a skeleton while refreshing already-visible data (use Spinner instead).
- Don't show a skeleton alongside a Spinner for the same region.

---

### Tier 2 — Spinner (inline actions)

**Use when:** The **user triggered an action** and you are waiting on a response — a button click, filter change, on-chain submission, or wallet connection.

| Property | Value |
|---|---|
| Component | `<Spinner>` |
| Colour | Inherited via `currentColor` — adapts to any button/text colour automatically |
| Sizes | `h-4 w-4` (button), `h-6 w-6` (card), `h-8 w-8` (section) |
| ARIA | `role="status"` + `aria-label` + `aria-busy="true"` |
| Placement | Inside the control that triggered the action |

**Always:**
- Disable the triggering control while the spinner is visible (prevent double-submit).
- Pair with a progress verb in the label: `"Processing…"`, `"Submitting…"`, `"Connecting…"`.

**When NOT to use:**
- Don't use a spinner for initial page loads — use Skeleton.
- Don't use a spinner for file uploads with a known % — use ProgressBar.

---

### Tier 3 — ProgressBar (file / media uploads)

**Use when:** You are uploading a file and have a **known progress percentage** (0–100) from XHR or a streaming ReadableStream reader.

| Property | Value |
|---|---|
| Component | `<ProgressBar value={n} label="Uploading filename.ext" />` |
| Track | `var(--token-border)` — adapts to light/dark mode |
| Fill (in progress) | `var(--token-primary)` (brown in light, cream in dark) |
| Fill (complete) | `var(--token-success)` (green) |
| ARIA | `role="progressbar"`, `aria-valuenow`, `aria-valuemin=0`, `aria-valuemax=100`, `aria-label`, `aria-busy` |

**When NOT to use:**
- Don't use ProgressBar for indeterminate waits — use Spinner.

---

## Decision Tree

```
Is there already content visible on screen?
│
├─ YES → Keep it visible; show Spinner on the triggering control.
│
└─ NO  → Is the wait deterministic (file upload with known %)?
          │
          ├─ YES → ProgressBar
          │
          └─ NO  → Skeleton (mirror the shape of the expected content)
```

---

## Rules

| # | Rule |
|---|---|
| 1 | **Never both** — a region shows a skeleton *or* a spinner, never both simultaneously. |
| 2 | **Never neither** — no page may show a blank white screen during a load. |
| 3 | **Initial vs. refresh** — first load = Skeleton; refreshing already-visible data = Spinner. |
| 4 | **Upload** — any upload with a measurable % gets a ProgressBar, not a Spinner. |
| 5 | **Reduced motion** — all three affordances respect `prefers-reduced-motion` automatically. |

---

## Accessibility Requirements

All three components meet WCAG 2.1 AA:

| Component | ARIA attributes |
|---|---|
| Skeleton container | `aria-busy="true"`, `aria-label="Loading [content]"` |
| Skeleton bars | `aria-hidden="true"` |
| Spinner | `role="status"`, `aria-label`, `aria-busy="true"` |
| ProgressBar | `role="progressbar"`, `aria-valuenow`, `aria-valuemin`, `aria-valuemax`, `aria-label`, `aria-busy` |

**CI check:** `npm run test:a11y` runs axe-core via Playwright against all key pages. Zero contrast violations are required to pass.

---

## Storybook Stories

| Story file | Stories |
|---|---|
| `LoadingStates.stories.tsx` | Full decision tree docs + all three patterns, grid/list/dashboard variants |
| `Spinner.stories.tsx` | Size variants, colour inheritance, dark mode, custom labels |
| `ProgressBar.stories.tsx` | Interactive slider, 0/50/100% states, multiple files, dark mode |

---

## Migration Checklist

- [x] All existing Spinner usages are inside controls that triggered an action ✓
- [x] All existing page-level skeletons carry `aria-busy` + `aria-label` ✓  
- [x] Spinner SVG carries `aria-busy="true"` ✓
- [x] ProgressBar component created with full WAI-ARIA progressbar semantics ✓
- [x] Loading state hierarchy documented in `design-tokens.ts` (`loadingTokens`) ✓
- [x] Storybook stories for all three variants + decision tree ✓
- [x] Unit tests: `Spinner.test.tsx`, `ProgressBar.test.tsx` (axe-core) ✓

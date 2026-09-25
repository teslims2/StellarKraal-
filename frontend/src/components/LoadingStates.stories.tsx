import type { Meta, StoryObj } from "@storybook/react";
import Spinner from "./Spinner";
import Skeleton from "./Skeleton";
import ProgressBar from "./ProgressBar";
import SkeletonCollateralCard from "./SkeletonCollateralCard";
import SkeletonLoanCard from "./SkeletonLoanCard";
import SkeletonDashboard from "./SkeletonDashboard";

/**
 * # Loading State Design System
 *
 * StellarKraal uses **exactly three** loading affordances. Choosing the correct
 * one keeps the interface feeling fast and prevents "spinner soup" or blank
 * white screens during loads.
 *
 * ---
 *
 * ## 1. Skeleton — for initial data loads
 *
 * When a page or section is mounting and has **no existing data yet**, render a
 * skeleton that mirrors the shape of the content that will appear.
 *
 * - **When**: Page entry / first fetch.
 * - **Where**: Full pages (`SkeletonDashboard`, `SkeletonCollateralPage`, …)
 *   and individual cards (`SkeletonCollateralCard`, `SkeletonLoanCard`, …).
 * - **How many**: One skeleton per expected item; show ≥ 1 (default 3 rows).
 * - **Accessibility**: The container must carry `aria-busy="true"` and an
 *   `aria-label` describing what is loading. Individual shimmer bars are
 *   `aria-hidden`.
 *
 * ---
 *
 * ## 2. Spinner — for inline actions
 *
 * When the **user triggers an action** and you are waiting on a response
 * (button click, filter change, on-chain submit, wallet connect), show a
 * `Spinner` *inside the control* that triggered it.
 *
 * - **When**: User-initiated actions with an indeterminate wait time.
 * - **Where**: Inside the button/link that triggered the action.
 * - **Always**: Disable the control while the spinner is visible.
 * - **Label**: Pair with a progress verb — "Processing…", "Submitting…".
 * - **Accessibility**: `role="status"` + `aria-label` + `aria-busy="true"`.
 *
 * ---
 *
 * ## 3. ProgressBar — for file uploads
 *
 * When uploading a file and you have a **known percentage** (from XHR or a
 * streaming response reader), show a `ProgressBar`.
 *
 * - **When**: File / media uploads with a deterministic progress value (0–100).
 * - **Where**: Adjacent to the filename or upload control.
 * - **Never**: Use for indeterminate waits — use Spinner instead.
 * - **Accessibility**: `role="progressbar"` with `aria-valuenow`,
 *   `aria-valuemin`, `aria-valuemax`, and `aria-label`.
 *
 * ---
 *
 * ## Decision tree
 *
 * ```
 * Is there existing data on screen?
 *   YES → Keep existing data visible; show Spinner on the triggering control.
 *   NO  → Is the wait deterministic (file upload %)?
 *           YES → ProgressBar
 *           NO  → Skeleton (mirror the layout of the expected content)
 * ```
 *
 * ---
 *
 * ## Rules
 *
 * 1. **Never both** — a region shows a skeleton *or* an inline spinner, never both.
 * 2. **Never neither** — no page may show a blank white screen during a load.
 * 3. **Initial vs. refresh** — first load = skeleton; refreshing already-visible
 *    data in response to a user action = spinner (keep stale data on screen).
 * 4. **Upload** — any upload with a knowable % gets a ProgressBar, not a Spinner.
 * 5. **Reduced motion** — all three affordances respect `prefers-reduced-motion`.
 */
const meta: Meta = {
  title: "Guidelines/Loading States",
  parameters: { layout: "padded" },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof meta>;

// ─────────────────────────────────────────────────────────────────────────────
// 1. Skeleton — initial data loads
// ─────────────────────────────────────────────────────────────────────────────

/**
 * **Skeleton — collateral grid** (page entry, 3 placeholder cards)
 *
 * Mirror the expected card layout so the page height stays stable.
 */
export const SkeletonCollateralGrid: Story = {
  name: "Skeleton / Collateral grid",
  render: () => (
    <div
      className="grid grid-cols-1 md:grid-cols-3 gap-4"
      aria-busy="true"
      aria-label="Loading collateral"
    >
      {[...Array(3)].map((_, i) => (
        <SkeletonCollateralCard key={i} />
      ))}
    </div>
  ),
};

/**
 * **Skeleton — loan list** (page entry, 3 placeholder rows)
 */
export const SkeletonLoanList: Story = {
  name: "Skeleton / Loan list",
  render: () => (
    <div
      className="space-y-2"
      aria-busy="true"
      aria-label="Loading loans"
    >
      {[...Array(3)].map((_, i) => (
        <SkeletonLoanCard key={i} />
      ))}
    </div>
  ),
};

/**
 * **Skeleton — full dashboard** (page-level, mirrors the Dashboard layout)
 */
export const SkeletonFullDashboard: Story = {
  name: "Skeleton / Full dashboard",
  render: () => <SkeletonDashboard />,
};

/**
 * **Skeleton — generic bar** (reusable building block for custom skeletons)
 *
 * Compose multiple `Skeleton` bars inside a container with `aria-busy` +
 * `aria-label` to build new page-level skeletons.
 */
export const SkeletonGenericBar: Story = {
  name: "Skeleton / Generic bar",
  render: () => (
    <div className="space-y-3 max-w-sm" aria-busy="true" aria-label="Loading content">
      <Skeleton className="h-6 w-48" />
      <Skeleton className="h-4 w-64" />
      <Skeleton className="h-4 w-56" />
      <Skeleton className="h-10 w-full rounded-lg" />
    </div>
  ),
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. Spinner — inline actions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * **Spinner — inside a primary button**
 *
 * The spinner inherits the button text colour. The control is disabled while
 * loading to prevent double submissions.
 */
export const SpinnerInPrimaryButton: Story = {
  name: "Spinner / In primary button",
  render: () => (
    <div className="flex flex-col gap-3 max-w-xs">
      <button
        disabled
        aria-disabled="true"
        className="bg-brown-600 text-cream-50 py-2.5 px-5 rounded-xl font-semibold flex items-center justify-center gap-2 opacity-90"
      >
        <Spinner label="Processing loan" />
        Processing…
      </button>
      <button
        disabled
        aria-disabled="true"
        className="bg-gold-600 text-cream-50 py-2.5 px-5 rounded-xl font-semibold flex items-center justify-center gap-2 opacity-90"
      >
        <Spinner label="Submitting collateral" />
        Submitting…
      </button>
      <p className="text-xs text-brown-500">
        Spinner inherits the button text colour via <code>currentColor</code>.
        The control is disabled to prevent double submits.
      </p>
    </div>
  ),
};

/**
 * **Spinner — size variants**
 *
 * Use `h-4 w-4` (default) for buttons, `h-6 w-6` for cards, `h-8 w-8` for
 * full-section inline loading states.
 */
export const SpinnerSizes: Story = {
  name: "Spinner / Size variants",
  render: () => (
    <div className="flex items-center gap-6 text-brown-700">
      <div className="flex flex-col items-center gap-1">
        <Spinner className="h-4 w-4" label="Loading (small)" />
        <span className="text-xs text-brown-500">h-4 (button)</span>
      </div>
      <div className="flex flex-col items-center gap-1">
        <Spinner className="h-6 w-6" label="Loading (medium)" />
        <span className="text-xs text-brown-500">h-6 (card)</span>
      </div>
      <div className="flex flex-col items-center gap-1">
        <Spinner className="h-8 w-8" label="Loading (large)" />
        <span className="text-xs text-brown-500">h-8 (section)</span>
      </div>
    </div>
  ),
};

/**
 * **Spinner — colour inheritance**
 *
 * The spinner adapts to any parent text colour — no extra configuration needed
 * for light or dark mode.
 */
export const SpinnerColourInheritance: Story = {
  name: "Spinner / Colour inheritance",
  render: () => (
    <div className="flex gap-6 items-center flex-wrap">
      {[
        { cls: "text-brown-600", label: "Brown" },
        { cls: "text-gold-600", label: "Gold" },
        { cls: "text-error-dark", label: "Error" },
        { cls: "text-success-dark", label: "Success" },
      ].map(({ cls, label }) => (
        <div key={label} className={`${cls} flex items-center gap-1`}>
          <Spinner className="h-5 w-5" label={`Loading (${label})`} />
          <span className="text-sm">{label}</span>
        </div>
      ))}
    </div>
  ),
};

/**
 * **Spinner — dark mode**
 *
 * Colour is inherited from the parent so no additional configuration is needed.
 */
export const SpinnerDarkMode: Story = {
  name: "Spinner / Dark mode",
  render: () => (
    <div className="dark bg-brown-900 p-6 rounded-2xl flex items-center gap-2 text-cream-50 max-w-xs">
      <Spinner className="h-5 w-5" label="Loading transactions" />
      <span className="text-sm">Loading transactions…</span>
    </div>
  ),
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. ProgressBar — file uploads
// ─────────────────────────────────────────────────────────────────────────────

/**
 * **ProgressBar — 0 %** (just started)
 */
export const ProgressBarEmpty: Story = {
  name: "ProgressBar / 0%",
  render: () => (
    <div className="max-w-sm space-y-2">
      <p className="text-sm font-medium text-brown-700">document.pdf</p>
      <ProgressBar value={0} label="Uploading document.pdf" />
      <p className="text-xs text-brown-500">0 % — just started</p>
    </div>
  ),
};

/**
 * **ProgressBar — 45 %** (in progress)
 */
export const ProgressBarInProgress: Story = {
  name: "ProgressBar / 45%",
  render: () => (
    <div className="max-w-sm space-y-2">
      <p className="text-sm font-medium text-brown-700">collateral-photo.jpg</p>
      <ProgressBar value={45} label="Uploading collateral-photo.jpg" />
      <p className="text-xs text-brown-500">45 % — uploading</p>
    </div>
  ),
};

/**
 * **ProgressBar — 100 %** (complete — fill turns success green)
 */
export const ProgressBarComplete: Story = {
  name: "ProgressBar / 100%",
  render: () => (
    <div className="max-w-sm space-y-2">
      <p className="text-sm font-medium text-brown-700">collateral-photo.jpg</p>
      <ProgressBar value={100} label="Uploading collateral-photo.jpg" />
      <p className="text-xs text-success-dark font-medium">Upload complete ✓</p>
    </div>
  ),
};

/**
 * **ProgressBar — multiple files** (each with its own bar)
 */
export const ProgressBarMultipleFiles: Story = {
  name: "ProgressBar / Multiple files",
  render: () => (
    <div className="max-w-sm space-y-4">
      {[
        { name: "registration-form.pdf", value: 100 },
        { name: "collateral-photo.jpg", value: 72 },
        { name: "valuation-report.pdf", value: 30 },
      ].map(({ name, value }) => (
        <div key={name} className="space-y-1">
          <p className="text-sm text-brown-700">{name}</p>
          <ProgressBar value={value} label={`Uploading ${name}`} />
        </div>
      ))}
    </div>
  ),
};

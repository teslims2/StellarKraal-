'use client';

/**
 * StatusBadge — #539 / #1093
 *
 * Colours are sourced from design tokens (CSS custom properties via Tailwind
 * semantic colour utilities) instead of hard-coded Tailwind palette classes.
 * This ensures the badge colours stay consistent with the design system and
 * flip correctly in dark mode.
 *
 * Token mapping
 * ─────────────
 * active      → success  (bg-color-success-subtle / text-color-success)
 * repaid      → primary  (bg-color-primary/10     / text-color-primary)
 * defaulted   → warning  (bg-color-warning-subtle / text-color-warning)
 * liquidated  → danger   (bg-color-danger-subtle  / text-color-danger)
 * available   → success  (same as active)
 * pledged     → secondary(bg-color-secondary/15   / text-color-secondary)
 *
 * All token colours pass WCAG AA (≥ 4.5:1) for normal text on both
 * light and dark backgrounds — verified in docs/guides/design-tokens.md.
 *
 * Animation — #1093
 * ──────────────────
 * Status transitions animate with a subtle fade + scale entrance (200 ms).
 * When `status` changes, the badge exits (fade + scale down) and the new
 * badge enters (fade + scale up) via AnimatePresence keyed on `status`.
 * Animations are suppressed when the user has `prefers-reduced-motion`
 * enabled — `useReducedMotion()` returns true and we skip the variant
 * spring entirely, snapping to the final value immediately.
 * The wrapping element retains its inline-flex layout so there is no
 * layout shift caused by the animation.
 */

import React from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import Tooltip from './Tooltip';

export type LoanStatus = 'active' | 'repaid' | 'defaulted' | 'liquidated';
export type CollateralStatus = 'available' | 'pledged';
export type BadgeStatus = LoanStatus | CollateralStatus;

export const STATUS_TOOLTIPS = {
  active: 'This loan is currently active with an outstanding balance',
  repaid: 'This loan has been fully repaid',
  defaulted: 'This loan is in default and requires immediate attention',
  liquidated: 'This loan was liquidated due to insufficient collateral',
  available: 'This collateral is available to pledge',
  pledged: 'This collateral is pledged against a loan',
} as const satisfies Record<BadgeStatus, string>;

interface Config {
  label: string;
  /** Tailwind semantic-token classes — theme-safe, WCAG AA compliant */
  classes: string;
  icon: string;
  ariaLabel: string;
  tooltip: (typeof STATUS_TOOLTIPS)[BadgeStatus];
}

const STATUS_CONFIG: Record<BadgeStatus, Config> = {
  active: {
    label: 'Active',
    classes: 'bg-color-success-subtle text-color-success',
    icon: '●',
    ariaLabel: 'Status: Active',
    tooltip: STATUS_TOOLTIPS.active,
  },
  repaid: {
    label: 'Repaid',
    classes: 'bg-color-primary/10 text-color-primary',
    icon: '✓',
    ariaLabel: 'Status: Repaid',
    tooltip: STATUS_TOOLTIPS.repaid,
  },
  defaulted: {
    label: 'Defaulted',
    classes: 'bg-color-warning-subtle text-color-warning',
    icon: '⚠',
    ariaLabel: 'Status: Defaulted',
    tooltip: STATUS_TOOLTIPS.defaulted,
  },
  liquidated: {
    label: 'Liquidated',
    classes: 'bg-color-danger-subtle text-color-danger',
    icon: '✕',
    ariaLabel: 'Status: Liquidated',
    tooltip: STATUS_TOOLTIPS.liquidated,
  },
  available: {
    label: 'Available',
    classes: 'bg-color-success-subtle text-color-success',
    icon: '◆',
    ariaLabel: 'Status: Available',
    tooltip: STATUS_TOOLTIPS.available,
  },
  pledged: {
    label: 'Pledged',
    classes: 'bg-color-secondary/15 text-color-secondary',
    icon: '⬡',
    ariaLabel: 'Status: Pledged',
    tooltip: STATUS_TOOLTIPS.pledged,
  },
};

interface Props {
  status: BadgeStatus | string;
}

export default function StatusBadge({ status }: Props) {
  const reducedMotion = useReducedMotion();
  const config = STATUS_CONFIG[status as BadgeStatus];

  /**
   * Variants for the fade + scale entrance/exit.
   * When reducedMotion is true every variant resolves to the resting state
   * immediately (duration: 0) so the badge snaps without any movement.
   */
  const variants = {
    initial: reducedMotion ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.85 },
    animate: {
      opacity: 1,
      scale: 1,
      transition: reducedMotion ? { duration: 0 } : { duration: 0.2, ease: 'easeOut' as const },
    },
    exit: reducedMotion
      ? { opacity: 1, scale: 1 }
      : {
          opacity: 0,
          scale: 0.85,
          transition: { duration: 0.15, ease: 'easeIn' as const },
        },
  };

  if (!config) {
    return (
      /* Wrap in a non-animated span to keep layout stable for fallback */
      <span className="inline-flex items-center">
        <motion.span
          key={status}
          variants={variants}
          initial="initial"
          animate="animate"
          exit="exit"
          className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium bg-color-surface text-color-text-subtle"
        >
          {status}
        </motion.span>
      </span>
    );
  }

  return (
    /*
     * AnimatePresence re-mounts the inner motion.span whenever `status`
     * changes (keyed by `status`), triggering the exit of the old badge
     * and the entrance of the new one.
     *
     * The outer <span> is a plain inline-flex container so the surrounding
     * layout never reflows — the animated child fills the same space.
     */
    <Tooltip hint={config.tooltip}>
      <span
        className={`inline-flex items-center rounded-full font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-color-primary focus-visible:ring-offset-2 ${config.classes}`}
        data-testid="status-badge-wrapper"
        role="status"
        tabIndex={0}
        aria-label={config.ariaLabel}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={status}
            variants={variants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="inline-flex items-center gap-1 text-xs px-2 py-0.5"
          >
            <span aria-hidden="true">{config.icon}</span>
            {config.label}
          </motion.span>
        </AnimatePresence>
      </span>
    </Tooltip>
  );
}

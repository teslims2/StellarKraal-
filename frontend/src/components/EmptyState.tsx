'use client';

import React from 'react';
import {
  EmptyCollateralIllustration,
  EmptyLoansIllustration,
  EmptyTransactionsIllustration,
} from './illustrations';

/** Built-in, accessible illustrations that can be selected by name. */
export type EmptyStateIllustrationName = 'loans' | 'collateral' | 'transactions';

const NAMED_ILLUSTRATIONS: Record<EmptyStateIllustrationName, () => React.JSX.Element> = {
  loans: EmptyLoansIllustration,
  collateral: EmptyCollateralIllustration,
  transactions: EmptyTransactionsIllustration,
};

export interface EmptyStateProps {
  /**
   * A named brand illustration or a custom graphic. Illustrations must carry
   * their own `role="img"` and `aria-label`; decorative content is hidden by
   * the caller (see the default emoji fallback below).
   */
  illustration?: EmptyStateIllustrationName | React.ReactNode;
  /** Empty-state heading. `heading` is kept as a backwards-compatible alias. */
  title?: string;
  /** Supporting copy. `message` is kept as a backwards-compatible alias. */
  description?: string;
  heading?: string;
  message?: string;
  /** Primary call-to-action label. */
  ctaLabel?: string;
  /** Callback for the primary call-to-action. */
  onCta?: () => void;
  /** Renders the primary call-to-action as a link instead of a button. */
  ctaHref?: string;
  /**
   * Optional secondary wording added to the CTA's accessible name. Keeps
   * long-standing labels (e.g. "Request a Loan") discoverable while the
   * visible, onboarding-friendly wording can be more specific.
   */
  ctaAlias?: string;
  // Aliases used by older call sites and the `components/ui` wrapper.
  actionLabel?: string;
  onAction?: () => void;
  actionHref?: string;
  /** Decorative emoji used when no illustration is supplied. */
  icon?: string;
  /** Renders a secondary "Clear filters" action for filtered result sets. */
  isFiltered?: boolean;
  onClearFilters?: () => void;
  clearFiltersLabel?: string;
  children?: React.ReactNode;
}

/**
 * Shared empty state for list and dashboard pages.
 *
 * Colours come from the design-token CSS variables, so the component and the
 * built-in illustrations adapt automatically when the `.dark` class is applied.
 * Illustrations are never wrapped in `aria-hidden` — they are meaningful
 * graphics with `role="img"` and descriptive `aria-label`s (#780, #1505).
 */
export default function EmptyState({
  illustration,
  title,
  description,
  heading,
  message,
  ctaLabel,
  onCta,
  ctaHref,
  ctaAlias,
  actionLabel,
  onAction,
  actionHref,
  icon,
  isFiltered,
  onClearFilters,
  clearFiltersLabel = 'Clear filters',
  children,
}: EmptyStateProps) {
  const headingText = title ?? heading ?? '';
  const descriptionText = description ?? message ?? '';
  const label = ctaLabel ?? actionLabel;
  const href = ctaHref ?? actionHref;
  const handleAction = onCta ?? onAction;

  const NamedIllustration =
    typeof illustration === 'string' && illustration in NAMED_ILLUSTRATIONS
      ? NAMED_ILLUSTRATIONS[illustration as EmptyStateIllustrationName]
      : null;

  const actionContent = label ? (
    <>
      <span>{label}</span>
      {ctaAlias ? <span className="sr-only">{ctaAlias}</span> : null}
    </>
  ) : null;

  const actionClasses =
    'inline-flex min-h-[44px] items-center justify-center rounded-xl bg-[color:var(--token-accent)] px-6 py-2.5 text-sm font-semibold text-[color:var(--token-on-primary)] shadow-sm transition-colors hover:bg-[color:var(--token-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--token-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--token-surface)] dark:bg-[color:var(--token-accent)] dark:text-[color:var(--token-on-primary)]';

  const secondaryClasses =
    'inline-flex min-h-[44px] items-center justify-center rounded-xl border border-[color:var(--token-border-strong)] bg-transparent px-6 py-2.5 text-sm font-semibold text-[color:var(--token-primary)] transition-colors hover:bg-[color:var(--token-surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--token-accent)] focus-visible:ring-offset-2 dark:border-[color:var(--token-border-strong)] dark:text-[color:var(--token-primary)]';

  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[color:var(--token-border)] bg-[color:var(--token-surface)] px-6 py-16 text-center dark:border-[color:var(--token-border-strong)] dark:bg-[color:var(--token-surface-raised)]">
      {/* Meaningful illustrations expose their own role="img" + aria-label. */}
      <div className="mb-6 flex items-center justify-center text-[color:var(--token-primary)] dark:text-[color:var(--token-primary)]">
        {NamedIllustration ? (
          <NamedIllustration />
        ) : illustration ? (
          illustration
        ) : (
          <span aria-hidden="true" className="text-5xl">
            {icon || '📭'}
          </span>
        )}
      </div>

      <h3 className="mb-2 text-xl font-semibold text-[color:var(--token-text)] dark:text-[color:var(--token-text)]">
        {headingText}
      </h3>

      <p
        role="status"
        className="mb-6 max-w-sm text-sm text-[color:var(--token-text-muted)] dark:text-[color:var(--token-text-muted)]"
      >
        {descriptionText}
      </p>

      <div className="flex flex-col items-center gap-3 sm:flex-row">
        {label && href ? (
          <a href={href} onClick={handleAction} className={actionClasses}>
            {actionContent}
          </a>
        ) : label && handleAction ? (
          <button type="button" onClick={handleAction} className={actionClasses}>
            {actionContent}
          </button>
        ) : null}

        {isFiltered && onClearFilters ? (
          <button type="button" onClick={onClearFilters} className={secondaryClasses}>
            {clearFiltersLabel}
          </button>
        ) : null}
      </div>

      {children}
    </div>
  );
}

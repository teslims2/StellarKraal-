import type { ReactNode } from 'react';
import SharedEmptyState, { type EmptyStateIllustrationName } from '../../src/components/EmptyState';

export type EmptyStateIllustration = 'loans' | 'collateral' | 'transactions';

export interface EmptyStateProps {
  /** Named brand illustration or a custom accessible graphic. */
  illustration?: EmptyStateIllustration | ReactNode;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  actionHref?: string;
  children?: ReactNode;
}

const NAMED_ILLUSTRATIONS: Record<EmptyStateIllustration, EmptyStateIllustrationName> = {
  loans: 'loans',
  collateral: 'collateral',
  transactions: 'transactions',
};

/**
 * Thin adapter around the shared empty state so legacy `components/ui`
 * consumers get the accessible, dark-mode-aware implementation too (#1505).
 */
export default function EmptyState({
  illustration,
  title,
  description,
  actionLabel,
  onAction,
  actionHref,
  children,
}: EmptyStateProps) {
  const resolvedIllustration =
    typeof illustration === 'string'
      ? (NAMED_ILLUSTRATIONS[illustration as EmptyStateIllustration] ?? 'loans')
      : illustration;

  return (
    <SharedEmptyState
      illustration={resolvedIllustration}
      title={title}
      description={description}
      ctaLabel={actionLabel}
      onCta={onAction}
      ctaHref={actionHref}
    >
      {children}
    </SharedEmptyState>
  );
}

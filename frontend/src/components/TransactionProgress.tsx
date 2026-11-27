'use client';

import type { TransactionStatus } from '@/hooks/useTransactionStatus';

export type TransactionProgressPhase = 'submitting' | TransactionStatus;

interface Props {
  phase: TransactionProgressPhase;
  hash?: string | null;
  error?: string | null;
  onDismiss?: () => void;
}

const labels: Record<TransactionProgressPhase, string> = {
  submitting: 'Submitting transaction…',
  pending: 'Awaiting confirmation…',
  confirmed: 'Transaction confirmed',
  failed: 'Transaction failed',
};

/** Shared lifecycle indicator for wallet transactions. */
export default function TransactionProgress({ phase, hash, error, onDismiss }: Props) {
  const terminal = phase === 'confirmed' || phase === 'failed';
  const explorerUrl = hash
    ? `https://stellar.expert/explorer/testnet/tx/${encodeURIComponent(hash)}`
    : null;

  return (
    <div className="rounded-xl border p-3 text-sm" role="status" aria-live="polite">
      <div className="flex items-center gap-2 font-medium">
        {!terminal && <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />}
        <span>{labels[phase]}</span>
      </div>
      {hash && (
        <div className="mt-2 space-y-1">
          <p className="text-xs">Transaction hash</p>
          {explorerUrl ? (
            <a className="break-all font-mono text-xs underline" href={explorerUrl} target="_blank" rel="noreferrer">{hash}</a>
          ) : <p className="break-all font-mono text-xs">{hash}</p>}
        </div>
      )}
      {error && <p className="mt-1 text-red-600">{error}</p>}
      {terminal && onDismiss && (
        <button type="button" className="mt-2 text-xs underline" onClick={onDismiss}>Dismiss</button>
      )}
    </div>
  );
}

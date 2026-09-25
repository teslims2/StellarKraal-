'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

export interface RiskLoan {
  id: string;
  health_factor?: number | null;
  status?: string;
}

interface Props {
  loans: RiskLoan[];
  thresholdBps?: number;
}

export default function RiskAlertBanner({ loans, thresholdBps = 12_000 }: Props) {
  const atRiskLoan = useMemo(
    () =>
      loans.find(
        (loan) =>
          loan.health_factor != null &&
          loan.health_factor < thresholdBps &&
          !['repaid', 'liquidated'].includes((loan.status ?? '').toLowerCase())
      ),
    [loans, thresholdBps]
  );
  const [dismissedLoanId, setDismissedLoanId] = useState<string | null>(null);

  useEffect(() => {
    if (!atRiskLoan) return;
    try {
      setDismissedLoanId(sessionStorage.getItem('stellarkraal-risk-alert-dismissed'));
    } catch {
      setDismissedLoanId(null);
    }
  }, [atRiskLoan]);

  if (!atRiskLoan || dismissedLoanId === atRiskLoan.id) return null;

  return (
    <aside
      role="alert"
      aria-live="assertive"
      className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-300 bg-red-50 p-4 text-red-900 dark:border-red-800 dark:bg-red-950/30 dark:text-red-100"
    >
      <div>
        <p className="font-semibold">Loan #{atRiskLoan.id} is at risk of liquidation.</p>
        <p className="text-sm">Health factor: {(atRiskLoan.health_factor! / 10_000).toFixed(2)}x. Repay or add collateral to restore safety.</p>
      </div>
      <div className="flex items-center gap-2">
        <Link
          href={`/loans/${atRiskLoan.id}`}
          className="rounded-lg bg-red-700 px-3 py-2 text-sm font-semibold text-white hover:bg-red-800"
        >
          Review loan
        </Link>
        <button
          type="button"
          aria-label="Dismiss liquidation risk alert"
          onClick={() => {
            try {
              sessionStorage.setItem('stellarkraal-risk-alert-dismissed', atRiskLoan.id);
            } catch {
              // sessionStorage can be unavailable in private browsing
            }
            setDismissedLoanId(atRiskLoan.id);
          }}
          className="rounded-lg border border-red-300 px-3 py-2 text-sm hover:bg-red-100 dark:hover:bg-red-900"
        >
          Dismiss
        </button>
      </div>
    </aside>
  );
}

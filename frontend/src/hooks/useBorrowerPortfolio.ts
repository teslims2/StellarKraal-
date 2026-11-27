'use client';

import useSWR from 'swr';
import { API, fetcher } from '@/lib/api';
import type { Collateral } from '@/hooks/useCollateral';
import type { Loan } from '@/hooks/useLoans';

export interface BorrowerLoan extends Loan {
  outstanding?: number;
  interestAccrued?: number;
  health_factor?: number | null;
}

interface BorrowerPortfolioResponse {
  loans?: BorrowerLoan[];
  collateral?: Collateral[];
}

const DEFAULT_REFRESH_INTERVAL_MS = 15_000;

function getRefreshInterval(): number {
  const configured = process.env.NEXT_PUBLIC_LOAN_POLL_INTERVAL_MS;
  if (configured === undefined) return DEFAULT_REFRESH_INTERVAL_MS;

  const parsed = Number.parseInt(configured, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_REFRESH_INTERVAL_MS;
}

/** Fetch the connected borrower's loans and collateral from the aggregate API. */
export function useBorrowerPortfolio(wallet: string | null) {
  const key = wallet ? `${API}/api/borrowers/${encodeURIComponent(wallet)}` : null;
  const refreshInterval = getRefreshInterval();
  const { data, error, isLoading, mutate } = useSWR<BorrowerPortfolioResponse>(key, fetcher, {
    refreshInterval,
    revalidateOnFocus: refreshInterval > 0,
  });

  return {
    loans: Array.isArray(data?.loans) ? data.loans : [],
    collaterals: Array.isArray(data?.collateral) ? data.collateral : [],
    isLoading,
    error: error ? (error as Error).message : null,
    refresh: () => mutate(),
  };
}

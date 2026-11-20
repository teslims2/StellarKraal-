'use client';
import useSWR from 'swr';
import { API, fetcher } from '@/lib/api';

export interface Loan {
  id: string;
  borrower: string;
  amount: number;
  status: string;
  createdAt: string;
}

interface LoansResponse {
  data?: Loan[];
}

const LOANS_KEY = `${API}/api/loans`;

/**
 * Default polling interval in milliseconds for real-time loan status updates.
 *
 * Reads NEXT_PUBLIC_LOAN_POLL_INTERVAL_MS from the environment so the interval
 * can be overridden in test environments without a code change (closes #1535).
 * Falls back to 15 000 ms (15 seconds) when the variable is not set.
 */
const DEFAULT_POLL_INTERVAL_MS =
  parseInt(process.env.NEXT_PUBLIC_LOAN_POLL_INTERVAL_MS ?? '', 10) || 15_000;

/**
 * Cached, background-revalidated list of all loans.
 *
 * Polling behaviour (closes #1535):
 * - Refreshes every `refreshInterval` ms (default: 15 s).
 * - Pauses when the browser tab is hidden; SWR's `revalidateOnFocus` and
 *   `refreshWhenHidden: false` together ensure no requests fire while the tab
 *   is in the background.
 * - Resumes and immediately re-fetches when the tab becomes visible again
 *   via `revalidateOnFocus: true`.
 * - The interval is configurable via NEXT_PUBLIC_LOAN_POLL_INTERVAL_MS for
 *   test environments.
 */
export function useLoans(options?: { refreshInterval?: number }) {
  const interval = options?.refreshInterval ?? DEFAULT_POLL_INTERVAL_MS;

  const { data, error, isLoading, mutate } = useSWR<Loan[] | LoansResponse>(LOANS_KEY, fetcher, {
    refreshInterval: interval,
    // Do not poll while the tab is hidden; resume when it becomes visible.
    refreshWhenHidden: false,
    // Re-fetch immediately when the user returns to the tab.
    revalidateOnFocus: true,
  });

  const loans: Loan[] = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : [];

  return {
    loans,
    isLoading,
    error: error ? (error as Error).message : null,
    refresh: () => mutate(),
  };
}

/**
 * Cached single loan lookup by id. Returns `undefined` while the id is empty so
 * SWR skips the request until one is provided.
 */
export function useLoan(id: string | null | undefined) {
  const key = id ? `${API}/api/loan/${id}` : null;
  const { data, error, isLoading, mutate } = useSWR<unknown>(key, fetcher);

  return {
    loan: data ?? null,
    isLoading,
    error: error ? (error as Error).message : null,
    refresh: () => mutate(),
  };
}

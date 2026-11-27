'use client';
/**
 * useWalletBalance — Issue #1428
 *
 * Fetches the XLM balance for a connected wallet from the Horizon API.
 * Polls every 30 seconds while the page is active (document visible).
 * Returns a loading state and the raw balance string (or null).
 */
import { useState, useEffect, useRef, useCallback } from 'react';

const NETWORK = (process.env.NEXT_PUBLIC_NETWORK ?? 'TESTNET').toUpperCase();
const HORIZON_URL =
  NETWORK === 'MAINNET' ? 'https://horizon.stellar.org' : 'https://horizon-testnet.stellar.org';

const POLL_INTERVAL_MS = 30_000;

export type WalletBalanceState = {
  /** Raw XLM balance string from Horizon (e.g. "25.0000000"), or null when unavailable. */
  xlmBalance: string | null;
  /** True while the first fetch is in flight. */
  loading: boolean;
};

/**
 * Returns the XLM balance for `address`, or null when no address is provided.
 * Automatically re-fetches every 30 seconds while the page is visible.
 */
export function useWalletBalance(address: string | null): WalletBalanceState {
  const [xlmBalance, setXlmBalance] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const isMounted = useRef(true);

  const fetchBalance = useCallback(async () => {
    if (!address) {
      setXlmBalance(null);
      setLoading(false);
      return;
    }

    // Only show the loading skeleton on the initial fetch (balance is null).
    if (xlmBalance === null) setLoading(true);

    try {
      const res = await fetch(`${HORIZON_URL}/accounts/${address}`);
      if (!res.ok) throw new Error('account not found');
      const data = await res.json();
      const native = (data.balances as Array<{ asset_type: string; balance: string }>).find(
        (b) => b.asset_type === 'native',
      );
      if (isMounted.current) setXlmBalance(native ? native.balance : '0');
    } catch {
      // Keep the previous value on transient network errors.
      if (isMounted.current && xlmBalance === null) setXlmBalance(null);
    } finally {
      if (isMounted.current) setLoading(false);
    }
  }, [address]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch immediately when address changes.
  useEffect(() => {
    if (!address) {
      setXlmBalance(null);
      setLoading(false);
      return;
    }
    setXlmBalance(null);
    fetchBalance();
  }, [address]); // eslint-disable-line react-hooks/exhaustive-deps

  // Poll every 30 s while the page is visible.
  useEffect(() => {
    if (!address) return;

    const tick = () => {
      if (document.visibilityState === 'visible') fetchBalance();
    };

    const interval = setInterval(tick, POLL_INTERVAL_MS);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [address, fetchBalance]);

  // Track mount state to prevent setState after unmount.
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  return { xlmBalance, loading };
}

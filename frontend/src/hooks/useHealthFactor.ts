'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import { usePolling } from './usePolling';

const POLL_INTERVAL = 30_000;
const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export function useHealthFactor(loanId: string) {
  const [healthFactor, setHealthFactor] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [hasFetched, setHasFetched] = useState(false);

  const fetch_ = useCallback(async () => {
    if (!loanId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API}/api/health/${loanId}`);
      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      const data = await res.json();
      setHealthFactor(Number(data.health_factor ?? 0));
      setLastUpdated(new Date());
      setHasFetched(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to fetch health factor');
    } finally {
      setLoading(false);
    }
  }, [loanId]);

  usePolling(fetch_, POLL_INTERVAL);

  const lastUpdatedLabel = lastUpdated
    ? new Intl.RelativeTimeFormat('en', { numeric: 'auto' }).format(
        -Math.floor((Date.now() - lastUpdated.getTime()) / 1000),
        'second'
      )
    : null;

  return { healthFactor, loading, error, lastUpdated, lastUpdatedLabel, hasFetched, refresh: fetch_ };
}

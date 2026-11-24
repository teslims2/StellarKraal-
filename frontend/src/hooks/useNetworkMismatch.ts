'use client';
import { useEffect, useRef, useState } from 'react';
import { getNetworkDetails } from '@/lib/freighterClient';

/** Polling interval for re-checking the wallet network (ms). */
const POLL_INTERVAL_MS = 5_000;

function normalizeNetwork(network: string | null | undefined): string | null {
  const normalized = network?.trim().toLowerCase();
  if (!normalized) return null;
  return normalized === 'public' ? 'mainnet' : normalized;
}

async function getFreighterNetwork(): Promise<string | null> {
  try {
    const result = await getNetworkDetails();
    return normalizeNetwork(result.network);
  } catch {
    return null;
  }
}

/**
 * Compares the wallet's active network to NEXT_PUBLIC_NETWORK.
 * Returns `true` when connected and the networks differ.
 *
 * Polls Freighter every POLL_INTERVAL_MS while the wallet address is set so
 * the mismatch state stays current when the user switches networks in the
 * extension without disconnecting.
 */
export function useNetworkMismatch(walletAddress: string | null): boolean {
  const [mismatch, setMismatch] = useState(false);
  // Keep latest walletAddress in a ref so the interval callback always uses
  // the current value without needing to be re-created on every render.
  const addressRef = useRef(walletAddress);
  addressRef.current = walletAddress;

  useEffect(() => {
    if (!walletAddress) {
      setMismatch(false);
      return;
    }

    let cancelled = false;

    const check = async () => {
      if (!addressRef.current) {
        if (!cancelled) setMismatch(false);
        return;
      }
      const walletNetwork = await getFreighterNetwork();
      if (cancelled) return;
      if (!walletNetwork) return;
      const appNetwork =
        normalizeNetwork(process.env.NEXT_PUBLIC_NETWORK ?? 'testnet') ?? 'testnet';
      setMismatch(walletNetwork !== appNetwork);
    };

    // Check immediately, then on a polling interval.
    void check();
    const id = setInterval(() => void check(), POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [walletAddress]);

  return mismatch;
}

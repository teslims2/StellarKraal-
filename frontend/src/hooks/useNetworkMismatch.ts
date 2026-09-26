'use client';
import { useEffect, useState } from 'react';
import { getNetworkDetails } from '@/lib/freighterClient';

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
 */
export function useNetworkMismatch(walletAddress: string | null): boolean {
  const [mismatch, setMismatch] = useState(false);

  useEffect(() => {
    if (!walletAddress) {
      setMismatch(false);
      return;
    }

    getFreighterNetwork().then((walletNetwork) => {
      if (!walletNetwork) return;
      const appNetwork =
        normalizeNetwork(process.env.NEXT_PUBLIC_NETWORK ?? 'testnet') ?? 'testnet';
      setMismatch(walletNetwork !== appNetwork);
    });
  }, [walletAddress]);

  return mismatch;
}

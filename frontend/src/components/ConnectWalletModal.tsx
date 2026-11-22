'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import Modal from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { useWallet } from '@/context/WalletContext';
import { loadFreighter } from '@/lib/freighterClient';

export const WALLET_STORAGE_KEY = 'stellarkraal_wallet';

const DEFAULT_NETWORK = 'testnet';
const EXTENSION_NOT_INSTALLED =
  'Freighter extension is not installed. Install Freighter to connect your wallet.';

export interface ConnectWalletModalProps {
  open: boolean;
  onClose: () => void;
  onConnected?: (address: string) => void;
  onDisconnected?: () => void;
}

function normalizeNetwork(network: string | null | undefined): string | null {
  const normalized = network?.trim().toLowerCase();
  if (!normalized) return null;
  return normalized === 'public' ? 'mainnet' : normalized;
}

function networkLabel(network: string): string {
  if (network === 'mainnet') return 'Mainnet';
  if (network === 'testnet') return 'Testnet';
  return network.charAt(0).toUpperCase() + network.slice(1);
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === 'string' && error.trim()) return error;
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = error.message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return 'Unable to connect to Freighter. Please try again.';
}

function isExtensionError(message: string): boolean {
  return /not installed|not detected|not found|unavailable|extension/i.test(message);
}

function notifyConnected(callback: ((address: string) => void) | undefined, address: string): void {
  if (!callback) return;
  try {
    callback(address);
  } catch {
    return;
  }
}

function notifyDisconnected(callback: (() => void) | undefined): void {
  if (!callback) return;
  try {
    callback();
  } catch {
    return;
  }
}

export function ConnectWalletModal({
  open,
  onClose,
  onConnected,
  onDisconnected,
}: ConnectWalletModalProps) {
  const generatedTitleId = useId();
  const titleId = `${generatedTitleId}-title`;
  const expectedNetwork =
    normalizeNetwork(process.env.NEXT_PUBLIC_NETWORK ?? DEFAULT_NETWORK) ?? DEFAULT_NETWORK;
  const expectedNetworkLabel = networkLabel(expectedNetwork);
  const {
    publicKey: address,
    isConnected: walletConnected,
    network: connectedNetwork,
    connect,
    disconnect,
  } = useWallet();
  const [freighterInstalled, setFreighterInstalled] = useState<boolean | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const requestIdRef = useRef(0);
  const detectionRef = useRef<Promise<boolean> | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestIdRef.current += 1;
    };
  }, []);

  const checkFreighter = useCallback(async (): Promise<boolean> => {
    if (detectionRef.current) return detectionRef.current;

    const request = (async () => {
      try {
        const freighter = await loadFreighter();
        const result = await freighter.isConnected();
        const installed =
          typeof result === 'boolean'
            ? result
            : typeof result === 'object' && result !== null && 'isConnected' in result
              ? result.isConnected === true
              : false;
        if (mountedRef.current) {
          setFreighterInstalled(installed);
          setError(installed ? null : EXTENSION_NOT_INSTALLED);
        }
        return installed;
      } catch (connectionError) {
        const message = getErrorMessage(connectionError);
        const extensionMissing = isExtensionError(message);
        if (mountedRef.current) {
          if (extensionMissing) setFreighterInstalled(false);
          setError(extensionMissing ? EXTENSION_NOT_INSTALLED : message);
        }
        return false;
      }
    })();

    detectionRef.current = request.finally(() => {
      detectionRef.current = null;
    });
    return detectionRef.current;
  }, []);

  useEffect(() => {
    if (!open) return;
    void checkFreighter();
  }, [checkFreighter, open]);

  function isCurrentRequest(requestId: number): boolean {
    return mountedRef.current && requestId === requestIdRef.current;
  }

  async function handleConnect() {
    if (isConnecting) return;

    const requestId = ++requestIdRef.current;
    setIsConnecting(true);
    setError(null);

    try {
      const installed = await checkFreighter();
      if (!installed || !isCurrentRequest(requestId)) return;

      const connectedAddress = await connect();
      if (!isCurrentRequest(requestId)) return;
      if (!connectedAddress) {
        throw new Error('Freighter did not return a wallet address. Please try again.');
      }
      notifyConnected(onConnected, connectedAddress);
    } catch (connectionError) {
      if (!isCurrentRequest(requestId)) return;
      const message = getErrorMessage(connectionError);
      if (isExtensionError(message)) {
        setFreighterInstalled(false);
        setError(EXTENSION_NOT_INSTALLED);
      } else {
        setError(message);
      }
    } finally {
      if (isCurrentRequest(requestId)) setIsConnecting(false);
    }
  }

  function handleDisconnect() {
    requestIdRef.current += 1;
    setIsConnecting(false);
    setError(null);
    disconnect();
    notifyDisconnected(onDisconnected);
  }

  function handleClose() {
    requestIdRef.current += 1;
    setIsConnecting(false);
    onClose();
  }

  const isChecking = freighterInstalled === null && !error;

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Connect Freighter Wallet"
      titleId={titleId}
      size="sm"
    >
      {address && walletConnected ? (
        <div className="space-y-4">
          <div
            role="status"
            aria-live="polite"
            aria-atomic="true"
            aria-label={`Wallet connected: ${address}`}
            className="rounded-xl border border-[color:var(--token-success)] bg-[color:var(--token-success-subtle)] px-4 py-3"
          >
            <p className="text-sm font-semibold text-[color:var(--token-success)]">
              Wallet connected
            </p>
            <p
              data-testid="connect-wallet-address"
              className="mt-2 break-all font-mono text-sm text-[color:var(--token-text)]"
            >
              {address}
            </p>
          </div>
          {connectedNetwork && connectedNetwork !== expectedNetwork ? (
            <div
              role="alert"
              aria-live="assertive"
              className="rounded-xl border border-[color:var(--token-warning)] bg-[color:var(--token-warning-subtle)] px-4 py-3 text-sm text-[color:var(--token-text)]"
            >
              <p className="font-semibold">Network mismatch: wrong Freighter network</p>
              <p className="mt-1">
                Freighter is connected to {networkLabel(connectedNetwork)}. This app expects{' '}
                {expectedNetworkLabel}. Please switch to {expectedNetworkLabel} in Freighter and try
                again.
              </p>
            </div>
          ) : null}
          <Button variant="danger" onClick={handleDisconnect} fullWidth>
            Disconnect
          </Button>
        </div>
      ) : isConnecting ? (
        <div className="space-y-4" aria-live="polite" aria-busy="true">
          <p className="text-sm text-[color:var(--token-text-subtle)]">Connecting to Freighter…</p>
          <Button isLoading aria-label="Connecting to Freighter wallet" fullWidth>
            Connect Wallet
          </Button>
        </div>
      ) : error ? (
        <div
          role="alert"
          aria-live="assertive"
          className="space-y-4 rounded-xl border border-[color:var(--token-danger)] bg-[color:var(--token-danger-subtle)] px-4 py-3 text-sm"
        >
          <p className="font-semibold text-[color:var(--token-danger)]">{error}</p>
          {freighterInstalled === false ? (
            <a
              href="https://freighter.app"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block font-semibold text-[color:var(--token-accent)] underline"
            >
              Install Freighter
            </a>
          ) : null}
          <Button variant="secondary" onClick={handleConnect} fullWidth>
            Retry connection
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {isChecking ? (
            <div
              role="status"
              aria-live="polite"
              className="text-sm text-[color:var(--token-text-subtle)]"
            >
              Checking for Freighter…
            </div>
          ) : (
            <p className="text-sm text-[color:var(--token-text-subtle)]">
              Connect your Freighter wallet to continue.
            </p>
          )}
          <p className="text-sm text-[color:var(--token-text-muted)]">
            This app expects {expectedNetworkLabel}.
          </p>
          <Button onClick={handleConnect} fullWidth>
            Connect Wallet
          </Button>
        </div>
      )}
    </Modal>
  );
}

export default ConnectWalletModal;

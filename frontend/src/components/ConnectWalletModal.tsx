'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import Modal from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { getAddress, getNetworkDetails, isConnected, setAllowed } from '@/lib/freighterClient';

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

function getResultError(value: unknown): unknown {
  if (typeof value !== 'object' || value === null || !('error' in value)) return null;
  return value.error == null ? null : value.error;
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

function isInstalledResult(result: unknown): boolean {
  if (typeof result === 'boolean') return result;
  if (typeof result !== 'object' || result === null || !('isConnected' in result)) return false;
  return result.isConnected === true;
}

function isPermissionDenied(result: unknown): boolean {
  return (
    typeof result === 'object' &&
    result !== null &&
    'isAllowed' in result &&
    result.isAllowed === false
  );
}

async function readFreighterNetwork(): Promise<string | null> {
  try {
    const details = await getNetworkDetails();
    if (getResultError(details)) return null;
    return normalizeNetwork(details.network);
  } catch {
    return null;
  }
}

function persistAddress(address: string): void {
  try {
    window.localStorage.setItem(WALLET_STORAGE_KEY, address);
  } catch {
    return;
  }
}

function clearPersistedAddress(): void {
  try {
    window.localStorage.removeItem(WALLET_STORAGE_KEY);
  } catch {
    return;
  }
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
  const [address, setAddress] = useState<string | null>(null);
  const [connectedNetwork, setConnectedNetwork] = useState<string | null>(null);
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
        const result = await isConnected();
        const installed = isInstalledResult(result);
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
    setConnectedNetwork(null);

    try {
      const installed = await checkFreighter();
      if (!installed || !isCurrentRequest(requestId)) return;

      const permission = await setAllowed();
      const permissionError = getResultError(permission);
      if (permissionError) throw new Error(getErrorMessage(permissionError));
      if (isPermissionDenied(permission)) {
        throw new Error('Permission to connect was not granted. Please try again.');
      }

      const addressResult = await getAddress();
      const addressError = getResultError(addressResult);
      if (addressError) throw new Error(getErrorMessage(addressError));
      if (!addressResult.address) {
        throw new Error('Freighter did not return a wallet address. Please try again.');
      }
      if (!isCurrentRequest(requestId)) return;

      const connectedAddress = addressResult.address;
      setAddress(connectedAddress);
      persistAddress(connectedAddress);
      notifyConnected(onConnected, connectedAddress);

      const walletNetwork = await readFreighterNetwork();
      if (!isCurrentRequest(requestId)) return;
      setConnectedNetwork(walletNetwork);
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
    setAddress(null);
    setConnectedNetwork(null);
    setIsConnecting(false);
    setError(null);
    clearPersistedAddress();
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
      {address ? (
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

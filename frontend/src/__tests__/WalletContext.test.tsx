/**
 * Unit tests for the auth-aware WalletContext (#1532).
 *
 * Covers:
 *  - the provider exposes the derived `isAuthenticated` flag
 *  - `isFreighterInstalled` reflects whether the extension injected its API
 *  - `connectFreighter()` reports an error and prompts install when the
 *    extension is absent
 *  - `connectFreighter()` stores the public key and sets `isAuthenticated`
 *    when the extension is present
 *  - `disconnectAndClear()` clears the session cookie + persisted key and
 *    redirects home
 */
import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { WalletProvider, useWalletContext } from '@/context/WalletContext';

// ── Mocks ─────────────────────────────────────────────────────────────────────
// `useWallet` reads from @/lib/freighterClient; keep its async helpers stable
// so the provider's mount effect does not throw.
jest.mock('@/lib/freighterClient', () => ({
  isConnected: jest.fn().mockResolvedValue(true),
  isAllowed: jest.fn().mockResolvedValue(false),
  setAllowed: jest.fn().mockResolvedValue(undefined),
  getAddress: jest.fn().mockResolvedValue({ address: 'GCONNECTED' }),
  getNetworkDetails: jest.fn().mockResolvedValue({ network: 'PUBLIC' }),
}));

// Stable router push so we can assert the post-disconnect redirect.
const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), refresh: jest.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

// Read the wallet value out of the tree via a tiny consumer.
function Consumer({ onValue }: { onValue: (v: ReturnType<typeof useWalletContext>) => void }) {
  const v = useWalletContext();
  React.useEffect(() => {
    onValue(v);
  }, [onValue, v]);
  return null;
}

function renderProvider(onValue: (v: ReturnType<typeof useWalletContext>) => void) {
  return render(
    <WalletProvider>
      <Consumer onValue={onValue} />
    </WalletProvider>
  );
}

beforeEach(() => {
  mockPush.mockClear();
  localStorage.clear();
  // Reset document.cookie so each test starts clean.
  document.cookie = 'session=; path=/; max-age=0';
  // Remove any injected Freighter API by default.
  (window as unknown as Record<string, unknown>).freighter = undefined;
  (window as unknown as Record<string, unknown>).freighterApi = undefined;
});

describe('WalletContext', () => {
  it('exposes isAuthenticated=false before any connection', () => {
    let value: ReturnType<typeof useWalletContext> | null = null;
    renderProvider((v) => {
      value = v;
    });
    expect(value).not.toBeNull();
    expect(value!.isAuthenticated).toBe(false);
    expect(value!.connectError).toBeNull();
  });

  it('reports isFreighterInstalled=true when the extension injected its API', () => {
    (window as unknown as Record<string, unknown>).freighter = {
      requestAccess: jest.fn().mockResolvedValue(undefined),
      getPublicKey: jest.fn().mockResolvedValue('GABC'),
    };
    let value: ReturnType<typeof useWalletContext> | null = null;
    renderProvider((v) => {
      value = v;
    });
    expect(value!.isFreighterInstalled).toBe(true);
  });

  it('connectFreighter surfaces an error and opens the install page when the extension is missing', async () => {
    const openSpy = jest.spyOn(window, 'open').mockImplementation(() => null);
    let value: ReturnType<typeof useWalletContext> | null = null;
    renderProvider((v) => {
      value = v;
    });

    await act(async () => {
      await value!.connectFreighter();
    });

    expect(value!.connectError).toMatch(/Freighter wallet not found/i);
    expect(value!.isConnecting).toBe(false);
    expect(value!.isFreighterInstalled).toBe(false);
    expect(openSpy).toHaveBeenCalled();
    openSpy.mockRestore();
  });

  it('connectFreighter stores the public key and flips isAuthenticated when the extension is present', async () => {
    (window as unknown as Record<string, unknown>).freighter = {
      requestAccess: jest.fn().mockResolvedValue(undefined),
      getPublicKey: jest.fn().mockResolvedValue('GABC123'),
    };
    let value: ReturnType<typeof useWalletContext> | null = null;
    renderProvider((v) => {
      value = v;
    });

    await act(async () => {
      await value!.connectFreighter();
    });

    expect(value!.isAuthenticated).toBe(true);
    expect(value!.isConnecting).toBe(false);
    expect(value!.connectError).toBeNull();
    // The public key is persisted for the next page load.
    expect(window.localStorage.getItem('freighter_public_key')).toBe('GABC123');
  });

  it('disconnectAndClear clears the persisted key + session cookie and redirects to /', async () => {
    (window as unknown as Record<string, unknown>).freighter = {
      requestAccess: jest.fn().mockResolvedValue(undefined),
      getPublicKey: jest.fn().mockResolvedValue('GABC123'),
    };
    let value: ReturnType<typeof useWalletContext> | null = null;
    renderProvider((v) => {
      value = v;
    });

    await act(async () => {
      await value!.connectFreighter();
    });
    expect(value!.isAuthenticated).toBe(true);

    // Seed a session cookie so we can prove it is cleared.
    document.cookie = 'session=jwt-value; path=/';

    await act(async () => {
      value!.disconnectAndClear();
    });

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/'));
    expect(value!.isAuthenticated).toBe(false);
    expect(window.localStorage.getItem('freighter_public_key')).toBeNull();
    // The session cookie was expired (max-age=0).
    expect(document.cookie).not.toContain('session=jwt-value');
  });
});

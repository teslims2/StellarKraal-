/**
 * WalletSessionLoss.test.tsx — Issue #1509
 *
 * Covers graceful handling of session expiry and external wallet disconnects:
 *  - SessionExpiredModal prompts a reconnect when the session JWT has expired
 *  - Reconnect renews the session in place (no navigation)
 *  - External wallet disconnect is detected and surfaces the reconnect prompt
 *  - Navbar wallet menu disconnect clears state and redirects to connect screen
 *  - LoanWizard pauses (keeps state) while a reconnect is required
 *  - Expiry no longer hard-redirects; "Extend session" warning still shows
 */
import React from 'react';
import { render, screen, act, waitFor, fireEvent } from '@testing-library/react';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('focus-trap-react', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn() }),
  usePathname: () => '/borrow',
}));

jest.mock('next/link', () => {
  const Link = ({ href, children, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  );
  Link.displayName = 'Link';
  return Link;
});

const ADDRESS = 'GTESTADDRESS1234567890';

const mockFreighter = {
  isConnected: jest.fn(),
  isAllowed: jest.fn(),
  getAddress: jest.fn(),
  setAllowed: jest.fn(),
};
jest.mock('@/lib/freighterClient', () => ({
  isConnected: (...a: unknown[]) => mockFreighter.isConnected(...a),
  isAllowed: (...a: unknown[]) => mockFreighter.isAllowed(...a),
  getAddress: (...a: unknown[]) => mockFreighter.getAddress(...a),
  setAllowed: (...a: unknown[]) => mockFreighter.setAllowed(...a),
}));

jest.mock('@/hooks/useAtRiskLoans', () => ({ useAtRiskLoans: () => ({ atRiskCount: 0 }) }));
jest.mock('@/hooks/useNotifications', () => ({
  useNotifications: () => ({
    notifications: [],
    unreadCount: 0,
    markRead: jest.fn(),
    markAllRead: jest.fn(),
    dismiss: jest.fn(),
    dismissAll: jest.fn(),
  }),
}));
jest.mock('@/components/KeyboardShortcutsProvider', () => ({ useShortcutsHelp: () => null }));
jest.mock('@/components/LanguageSwitcher', () => () => null);
jest.mock('@/components/ThemeToggle', () => () => null);

// Keep the wizard steps trivial — we only care about the pause behaviour.
jest.mock('@/components/wizard/steps/StepCollateral', () => () => (
  <div>Collateral step content</div>
));
jest.mock('@/components/wizard/steps/StepAmount', () => () => <div />);
jest.mock('@/components/wizard/steps/StepReview', () => () => <div />);
jest.mock('@/components/wizard/steps/StepConfirm', () => () => <div />);

import {
  WalletProvider,
  useWalletContext,
  WALLET_WATCH_INTERVAL_MS,
} from '@/context/WalletContext';
import SessionExpiredModal from '@/components/SessionExpiredModal';
import SessionTimeoutBanner from '@/components/SessionTimeoutBanner';
import Navbar from '@/components/Navbar';
import LoanWizard from '@/components/wizard/LoanWizard';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function setSessionCookie(expSeconds: number | null) {
  let value = '';
  if (expSeconds !== null) {
    const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const payload = btoa(JSON.stringify({ sub: ADDRESS, exp: expSeconds }));
    value = `session=${header}.${payload}.sig`;
  }
  Object.defineProperty(document, 'cookie', { writable: true, configurable: true, value });
}

function nowSec() {
  return Math.floor(Date.now() / 1000);
}

function AddressProbe() {
  const { address } = useWalletContext();
  return <span data-testid="address">{address ?? 'none'}</span>;
}

function renderApp(children: React.ReactNode) {
  return render(
    <WalletProvider>
      <AddressProbe />
      <SessionExpiredModal />
      {children}
    </WalletProvider>
  );
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  localStorage.setItem('stellarkraal_wallet', ADDRESS);
  mockFreighter.isConnected.mockResolvedValue({ isConnected: true });
  mockFreighter.isAllowed.mockResolvedValue({ isAllowed: true });
  mockFreighter.getAddress.mockResolvedValue({ address: ADDRESS });
  mockFreighter.setAllowed.mockResolvedValue({ isAllowed: true });
  setSessionCookie(null);
  global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 } as Response);
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Session expiry (#1509)', () => {
  it('shows the reconnect modal instead of redirecting when the session expires', async () => {
    setSessionCookie(nowSec() - 10);
    renderApp(<p>Current page content</p>);
    await flush();

    expect(await screen.findByTestId('session-expired-modal')).toBeInTheDocument();
    expect(screen.getByText(/your session has expired/i)).toBeInTheDocument();
    // Page content is still rendered underneath — context is preserved
    expect(screen.getByText('Current page content')).toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('reconnect renews the session in place and closes the modal', async () => {
    setSessionCookie(nowSec() - 10);
    renderApp(<p>Current page content</p>);
    await screen.findByTestId('session-expired-modal');

    global.fetch = jest.fn().mockImplementation(async () => {
      setSessionCookie(nowSec() + 3600); // backend sets a fresh cookie
      return { ok: true, status: 200 } as Response;
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('session-expired-reconnect'));
    });

    await waitFor(() =>
      expect(screen.queryByTestId('session-expired-modal')).not.toBeInTheDocument()
    );
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/auth/refresh'),
      expect.objectContaining({ method: 'POST', credentials: 'include' })
    );
    expect(screen.getByText('Current page content')).toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('shows an error when the session cannot be renewed', async () => {
    setSessionCookie(nowSec() - 10);
    renderApp(null);
    await screen.findByTestId('session-expired-modal');
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 401 } as Response);

    await act(async () => {
      fireEvent.click(screen.getByTestId('session-expired-reconnect'));
    });

    expect(await screen.findByTestId('session-expired-error')).toHaveTextContent(
      /couldn't be renewed/i
    );
    expect(screen.getByTestId('session-expired-modal')).toBeInTheDocument();
  });

  it('disconnect from the modal clears state and goes to the connect screen', async () => {
    setSessionCookie(nowSec() - 10);
    renderApp(null);
    await screen.findByTestId('session-expired-modal');

    await act(async () => {
      fireEvent.click(screen.getByTestId('session-expired-disconnect'));
    });

    expect(mockPush).toHaveBeenCalledWith('/');
    expect(screen.getByTestId('address')).toHaveTextContent('none');
    expect(localStorage.getItem('stellarkraal_wallet')).toBeNull();
  });
});

describe('Session expiry warning (#1509)', () => {
  it("shows an 'Extend session' warning within 5 minutes of expiry", async () => {
    setSessionCookie(nowSec() + 4 * 60);
    render(<SessionTimeoutBanner />);
    await flush();
    expect(screen.getByTestId('session-timeout-banner')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /extend session/i })).toBeInTheDocument();
  });
});

describe('External wallet disconnect (#1509)', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('detects the wallet being locked/revoked and prompts a reconnect', async () => {
    renderApp(<p>Current page content</p>);
    await flush();
    await flush();
    expect(screen.getByTestId('address')).toHaveTextContent(ADDRESS);
    expect(screen.queryByTestId('session-expired-modal')).not.toBeInTheDocument();

    // User revokes access in the Freighter extension
    mockFreighter.isAllowed.mockResolvedValue({ isAllowed: false });
    await act(async () => {
      jest.advanceTimersByTime(WALLET_WATCH_INTERVAL_MS);
    });
    await flush();

    expect(screen.getByTestId('session-expired-modal')).toBeInTheDocument();
    expect(screen.getByText(/wallet disconnected/i)).toBeInTheDocument();
    expect(screen.getByText('Current page content')).toBeInTheDocument();
  });

  it('treats an account switch in Freighter as a lost connection', async () => {
    renderApp(null);
    await flush();
    await flush();

    mockFreighter.getAddress.mockResolvedValue({ address: 'GOTHERACCOUNT' });
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });
    await flush();

    expect(screen.getByTestId('session-expired-modal')).toBeInTheDocument();
  });

  it('ignores transient Freighter errors', async () => {
    renderApp(null);
    await flush();
    await flush();

    mockFreighter.isConnected.mockRejectedValue(new Error('extension busy'));
    await act(async () => {
      jest.advanceTimersByTime(WALLET_WATCH_INTERVAL_MS);
    });
    await flush();

    expect(screen.queryByTestId('session-expired-modal')).not.toBeInTheDocument();
  });
});

describe('Navbar wallet menu (#1509)', () => {
  it('disconnect button clears session state and redirects to the connect screen', async () => {
    setSessionCookie(nowSec() + 3600);
    renderApp(<Navbar />);
    const trigger = await screen.findByTestId('wallet-menu-trigger');

    fireEvent.click(trigger);
    await act(async () => {
      fireEvent.click(screen.getByTestId('navbar-disconnect-btn'));
    });

    expect(mockPush).toHaveBeenCalledWith('/');
    expect(screen.getByTestId('address')).toHaveTextContent('none');
    expect(localStorage.getItem('stellarkraal_wallet')).toBeNull();
    expect(document.cookie).toMatch(/session=;/);
  });
});

describe('LoanWizard mid-flow disconnect (#1509)', () => {
  it('pauses the wizard with a reconnect prompt instead of crashing', async () => {
    setSessionCookie(nowSec() - 10);
    renderApp(<LoanWizard walletAddress={ADDRESS} />);
    await flush();

    expect(await screen.findByTestId('wizard-paused')).toHaveTextContent(/loan request paused/i);
    // The step stays mounted (progress kept) but is inert while paused
    expect(screen.getByText('Collateral step content')).toBeInTheDocument();
    expect(screen.getByTestId('wizard-reconnect-btn')).toBeInTheDocument();
  });

  it('renders normally when no reconnect is needed', async () => {
    setSessionCookie(nowSec() + 3600);
    renderApp(<LoanWizard walletAddress={ADDRESS} />);
    await flush();

    expect(screen.queryByTestId('wizard-paused')).not.toBeInTheDocument();
    expect(screen.getByText('Collateral step content')).toBeInTheDocument();
  });
});

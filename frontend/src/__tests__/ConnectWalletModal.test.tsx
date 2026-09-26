import type { ComponentProps, ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

jest.mock('focus-trap-react', () => ({
  __esModule: true,
  default: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

jest.mock('@/lib/freighterClient', () => ({
  isConnected: jest.fn(),
  setAllowed: jest.fn(),
  getAddress: jest.fn(),
  getNetworkDetails: jest.fn(),
}));

import ConnectWalletModal, { WALLET_STORAGE_KEY } from '@/components/ConnectWalletModal';
import { getAddress, getNetworkDetails, isConnected, setAllowed } from '@/lib/freighterClient';

const mockIsConnected = isConnected as jest.Mock;
const mockSetAllowed = setAllowed as jest.Mock;
const mockGetAddress = getAddress as jest.Mock;
const mockGetNetworkDetails = getNetworkDetails as jest.Mock;
const address = 'GABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890';
const originalNetwork = process.env.NEXT_PUBLIC_NETWORK;

function renderModal(props: Partial<ComponentProps<typeof ConnectWalletModal>> = {}) {
  return render(<ConnectWalletModal open onClose={jest.fn()} {...props} />);
}

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  process.env.NEXT_PUBLIC_NETWORK = 'testnet';
  mockIsConnected.mockResolvedValue({ isConnected: true });
  mockSetAllowed.mockResolvedValue({ isAllowed: true });
  mockGetAddress.mockResolvedValue({ address });
  mockGetNetworkDetails.mockResolvedValue({
    network: 'TESTNET',
    networkUrl: 'https://testnet.stellar.org',
    networkPassphrase: 'Test SDF Network ; September 2015',
  });
});

afterAll(() => {
  if (originalNetwork === undefined) {
    delete process.env.NEXT_PUBLIC_NETWORK;
  } else {
    process.env.NEXT_PUBLIC_NETWORK = originalNetwork;
  }
});

test('connects with the mocked client and exposes the wallet address', async () => {
  const onConnected = jest.fn();
  renderModal({ onConnected });

  fireEvent.click(screen.getByRole('button', { name: /connect wallet/i }));

  expect(await screen.findByTestId('connect-wallet-address')).toHaveTextContent(address);
  expect(mockSetAllowed).toHaveBeenCalledTimes(1);
  expect(mockGetNetworkDetails).toHaveBeenCalledTimes(1);
  expect(localStorage.getItem(WALLET_STORAGE_KEY)).toBe(address);
  expect(onConnected).toHaveBeenCalledWith(address);
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  expect(screen.getByRole('status', { name: /wallet connected/i })).toBeInTheDocument();
});

test('shows the expected mainnet warning for a testnet wallet', async () => {
  process.env.NEXT_PUBLIC_NETWORK = 'mainnet';
  mockGetNetworkDetails.mockResolvedValue({
    network: 'TESTNET',
    networkUrl: 'https://testnet.stellar.org',
    networkPassphrase: 'Test SDF Network ; September 2015',
  });
  renderModal();

  fireEvent.click(screen.getByRole('button', { name: /connect wallet/i }));

  const warning = await screen.findByRole('alert');
  expect(warning).toHaveTextContent(/wrong freighter network/i);
  expect(warning).toHaveTextContent(/mainnet/i);
});

test('does not report a mismatch for Freighter PUBLIC on mainnet', async () => {
  process.env.NEXT_PUBLIC_NETWORK = 'mainnet';
  mockGetNetworkDetails.mockResolvedValue({
    network: 'PUBLIC',
    networkUrl: 'https://stellar.org',
    networkPassphrase: 'Public Global Stellar Network ; September 2015',
  });
  renderModal();

  fireEvent.click(screen.getByRole('button', { name: /connect wallet/i }));

  expect(await screen.findByTestId('connect-wallet-address')).toHaveTextContent(address);
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

test('disconnect clears address state, storage, and invokes the callback', async () => {
  const onDisconnected = jest.fn();
  renderModal({ onDisconnected });

  fireEvent.click(screen.getByRole('button', { name: /connect wallet/i }));
  await screen.findByTestId('connect-wallet-address');
  fireEvent.click(screen.getByRole('button', { name: /disconnect/i }));

  await waitFor(() =>
    expect(screen.queryByTestId('connect-wallet-address')).not.toBeInTheDocument()
  );
  expect(localStorage.getItem(WALLET_STORAGE_KEY)).toBeNull();
  expect(onDisconnected).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button', { name: /connect wallet/i })).toBeInTheDocument();
});

test('shows an install prompt and retry when Freighter is unavailable', async () => {
  mockIsConnected.mockResolvedValue({ isConnected: false });
  renderModal();

  expect(await screen.findByText(/freighter extension is not installed/i)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /install freighter/i })).toHaveAttribute(
    'href',
    'https://freighter.app'
  );
  expect(screen.getByRole('button', { name: /retry connection/i })).toBeInTheDocument();
});

test('shows connection errors and retries successfully', async () => {
  mockGetAddress.mockRejectedValueOnce(new Error('User rejected the request'));
  renderModal();

  fireEvent.click(screen.getByRole('button', { name: /connect wallet/i }));
  expect(await screen.findByRole('alert')).toHaveTextContent(/user rejected the request/i);

  fireEvent.click(screen.getByRole('button', { name: /retry connection/i }));
  expect(await screen.findByTestId('connect-wallet-address')).toHaveTextContent(address);
  expect(mockGetAddress).toHaveBeenCalledTimes(2);
});

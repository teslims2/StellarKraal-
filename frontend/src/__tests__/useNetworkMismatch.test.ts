import { renderHook, waitFor } from '@testing-library/react';
import { useNetworkMismatch } from '../hooks/useNetworkMismatch';

const mockGetNetworkDetails = jest.fn();

jest.mock('../lib/freighterClient', () => ({
  getNetworkDetails: () => mockGetNetworkDetails(),
}));

beforeEach(() => {
  mockGetNetworkDetails.mockReset();
  process.env.NEXT_PUBLIC_NETWORK = 'testnet';
});

test('no mismatch when wallet network matches app (testnet)', async () => {
  mockGetNetworkDetails.mockResolvedValue({ network: 'TESTNET' });
  const { result } = renderHook(() => useNetworkMismatch('GABC'));
  await waitFor(() => expect(result.current).toBe(false));
});

test('mismatch when wallet is on mainnet but app targets testnet', async () => {
  mockGetNetworkDetails.mockResolvedValue({ network: 'PUBLIC' });
  const { result } = renderHook(() => useNetworkMismatch('GABC'));
  await waitFor(() => expect(result.current).toBe(true));
});

test('no mismatch when Freighter PUBLIC matches the mainnet app', async () => {
  process.env.NEXT_PUBLIC_NETWORK = 'mainnet';
  mockGetNetworkDetails.mockResolvedValue({ network: 'PUBLIC' });
  const { result } = renderHook(() => useNetworkMismatch('GABC'));
  await waitFor(() => expect(result.current).toBe(false));
});

test('no mismatch when wallet address is null', async () => {
  const { result } = renderHook(() => useNetworkMismatch(null));
  await waitFor(() => expect(result.current).toBe(false));
});

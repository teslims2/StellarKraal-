jest.mock('@stellar/freighter-api', () => ({
  getAddress: jest.fn(),
  getNetworkDetails: jest.fn(),
  isAllowed: jest.fn(),
  isConnected: jest.fn(),
  setAllowed: jest.fn(),
  signTransaction: jest.fn(),
}));

import { getNetworkDetails as freighterGetNetworkDetails } from '@stellar/freighter-api';
import { getNetworkDetails } from '@/lib/freighterClient';

const mockFreighterGetNetworkDetails = freighterGetNetworkDetails as jest.Mock;
const details = {
  network: 'TESTNET',
  networkUrl: 'https://testnet.stellar.org',
  networkPassphrase: 'Test SDF Network ; September 2015',
};

afterEach(() => {
  delete (window as Window & { __STELLARKRAAL_E2E__?: unknown }).__STELLARKRAAL_E2E__;
  jest.clearAllMocks();
});

test('uses getNetworkDetails from the wallet test seam', async () => {
  const seamGetNetworkDetails = jest.fn().mockResolvedValue(details);
  Object.defineProperty(window, '__STELLARKRAAL_E2E__', {
    configurable: true,
    value: { getNetworkDetails: seamGetNetworkDetails },
  });

  await expect(getNetworkDetails()).resolves.toEqual(details);
  expect(seamGetNetworkDetails).toHaveBeenCalledTimes(1);
  expect(mockFreighterGetNetworkDetails).not.toHaveBeenCalled();
});

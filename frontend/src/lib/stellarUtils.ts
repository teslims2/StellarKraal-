import { Networks, TransactionBuilder } from '@stellar/stellar-sdk';
import { Server } from '@stellar/stellar-sdk/rpc';
import { formatXlmFromStroops } from '@/lib/formatMoney';

const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || 'https://soroban-testnet.stellar.org';
const NETWORK_PASSPHRASE =
  process.env.NEXT_PUBLIC_NETWORK === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET;

/** Format stroops (1e-7 XLM) to a locale-aware XLM string */
export function formatStroops(stroops: number | bigint): string {
  return formatXlmFromStroops(stroops);
}

/** Returns a CSS color string based on health factor bps */
export function healthColor(bps: number): string {
  if (bps >= 15_000) return '#16a34a'; // green
  if (bps >= 10_000) return '#ca8a04'; // yellow
  return '#dc2626'; // red
}

/** Submit a signed XDR transaction and return the transaction hash immediately.
 *
 * The previous implementation polled the RPC for up to ~30s waiting for
 * on-chain confirmation. That blocked the UI and prevented optimistic updates.
 * Callers that need to track confirmation should use `useTransactionStatus`
 * against `GET /api/v1/transactions/:hash/status` instead.
 */
export async function submitSignedXdr(signedXdr: string): Promise<string> {
  if (typeof window !== 'undefined' && window.__STELLARKRAAL_E2E__?.submitSignedXdr) {
    return Promise.resolve(window.__STELLARKRAAL_E2E__.submitSignedXdr(signedXdr));
  }

  const server = new Server(RPC_URL);
  const tx = TransactionBuilder.fromXDR(signedXdr, NETWORK_PASSPHRASE);
  const result = await server.sendTransaction(tx);
  if (result.status === 'ERROR') {
    throw new Error(`Transaction failed: ${result.errorResult}`);
  }
  return result.hash;
}

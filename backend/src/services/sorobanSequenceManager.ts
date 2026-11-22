/**
 * SorobanSequenceManager — serialises Soroban transaction submissions and
 * automatically retries on sequence-number mismatch errors.
 *
 * Background
 * ----------
 * The Stellar protocol requires every transaction to carry the sender account's
 * current sequence number + 1.  When multiple backend processes or concurrent
 * requests submit transactions for the same account simultaneously, they race
 * to claim the same sequence number and all but one will be rejected with a
 * "tx_bad_seq" error.
 *
 * This module resolves issue #1527 by:
 *   1. Serialising submissions through a per-account async queue so only one
 *      in-flight transaction exists per account at a time.
 *   2. Catching sequence-number mismatch errors and refreshing the account
 *      sequence before retrying the entire submission callback.
 *   3. Exposing environment-variable knobs for retry limits and backoff.
 *   4. Incrementing a Prometheus counter on every sequence-error so the ops
 *      team can alert when mismatch rates exceed a threshold.
 */

import { Counter } from "prom-client";
import { registry } from "../metrics";

// ── Prometheus counter ────────────────────────────────────────────────────────

/**
 * Incremented each time a sequence-number mismatch is detected, regardless of
 * whether the subsequent retry succeeds.  Label `account` is the Stellar
 * account public key; label `outcome` is either "retried" or "exhausted".
 */
export const sorobanSequenceErrorsTotal = new Counter({
  name: "soroban_sequence_errors_total",
  help: "Total number of Soroban sequence-number mismatch errors",
  labelNames: ["account", "outcome"] as const,
  registers: [registry],
});

// ── Configuration ─────────────────────────────────────────────────────────────

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const SEQUENCE_MAX_RETRIES = envInt("SOROBAN_SEQUENCE_MAX_RETRIES", 3);
export const SEQUENCE_BASE_BACKOFF_MS = envInt("SOROBAN_SEQUENCE_BASE_BACKOFF_MS", 200);

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Returns true when `err` is a Stellar sequence-number mismatch error.
 * The Horizon / Soroban RPC surfaces this as the string "tx_bad_seq" in the
 * result codes, or as an `extras.result_codes.transaction` field.
 */
export function isSequenceMismatchError(err: unknown): boolean {
  if (!err) return false;
  if (typeof err === "string") return err.includes("tx_bad_seq");
  if (err instanceof Error) {
    if (err.message.includes("tx_bad_seq")) return true;
  }
  if (typeof err === "object") {
    const anyErr = err as Record<string, unknown>;
    // Horizon envelope: { extras: { result_codes: { transaction: "tx_bad_seq" } } }
    const extras = anyErr.extras as Record<string, unknown> | undefined;
    const resultCodes = extras?.result_codes as Record<string, unknown> | undefined;
    if (resultCodes?.transaction === "tx_bad_seq") return true;
    // Soroban RPC envelope: { error: { code: -32600, message: "..tx_bad_seq.." } }
    const rpcError = anyErr.error as Record<string, unknown> | undefined;
    if (typeof rpcError?.message === "string" && rpcError.message.includes("tx_bad_seq")) {
      return true;
    }
  }
  return false;
}

// ── Per-account serialisation queue ──────────────────────────────────────────

type QueuedTask = () => Promise<void>;

/**
 * A per-account FIFO queue that runs one task at a time.
 * Tasks are thunks that resolve or reject their own promise.
 */
class AccountQueue {
  private running = false;
  private readonly queue: QueuedTask[] = [];

  enqueue<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push(async () => {
        try {
          resolve(await task());
        } catch (err) {
          reject(err);
        }
      });
      this.drain();
    });
  }

  private drain(): void {
    if (this.running) return;
    const next = this.queue.shift();
    if (!next) return;
    this.running = true;
    next().finally(() => {
      this.running = false;
      this.drain();
    });
  }
}

// ── SorobanSequenceManager ────────────────────────────────────────────────────

/**
 * Options for a managed Soroban submission.
 */
export interface SubmitOptions {
  /**
   * The Stellar account public key that is the fee-payer / source of the
   * transaction.  Used as the queue key so only one submission per account is
   * in-flight at a time.
   */
  account: string;

  /**
   * Async callback that refreshes the account sequence number from the network
   * and returns the updated sequence as a `bigint`.  Called before the initial
   * attempt and before every retry.
   */
  refreshSequence: () => Promise<bigint>;

  /**
   * Async callback that builds and submits the transaction for the given
   * sequence number.  It receives the latest sequence number so it can
   * reconstruct the transaction envelope with the correct value before signing.
   */
  submit: (sequence: bigint) => Promise<void>;

  /** Override the global retry limit for this individual submission. */
  maxRetries?: number;

  /** Override the base backoff interval (ms) for this individual submission. */
  baseBackoffMs?: number;
}

/**
 * Manages serialised Soroban transaction submissions with automatic sequence-
 * number-mismatch recovery.
 *
 * Usage:
 * ```ts
 * const manager = new SorobanSequenceManager();
 * await manager.submit({
 *   account: sourcePublicKey,
 *   refreshSequence: () => server.loadAccount(sourcePublicKey).then(a => BigInt(a.sequenceNumber())),
 *   submit: async (seq) => {
 *     const tx = buildTransaction(seq);
 *     await server.sendTransaction(tx);
 *   },
 * });
 * ```
 */
export class SorobanSequenceManager {
  private readonly queues = new Map<string, AccountQueue>();

  private getQueue(account: string): AccountQueue {
    let q = this.queues.get(account);
    if (!q) {
      q = new AccountQueue();
      this.queues.set(account, q);
    }
    return q;
  }

  /**
   * Enqueues a Soroban transaction submission for `account`, serialises it with
   * other submissions for the same account, and retries on sequence mismatch.
   */
  async submit(opts: SubmitOptions): Promise<void> {
    const {
      account,
      refreshSequence,
      submit,
      maxRetries = SEQUENCE_MAX_RETRIES,
      baseBackoffMs = SEQUENCE_BASE_BACKOFF_MS,
    } = opts;

    const queue = this.getQueue(account);

    return queue.enqueue(async () => {
      let sequence = await refreshSequence();
      let attempt = 0;

      while (true) {
        try {
          await submit(sequence);
          return;
        } catch (err) {
          if (!isSequenceMismatchError(err)) {
            throw err;
          }

          attempt += 1;
          sorobanSequenceErrorsTotal.inc({
            account,
            outcome: attempt >= maxRetries ? "exhausted" : "retried",
          });

          if (attempt >= maxRetries) {
            throw err;
          }

          const backoff = baseBackoffMs * Math.pow(2, attempt - 1);
          await sleep(backoff);
          sequence = await refreshSequence();
        }
      }
    });
  }
}

export const sorobanSequenceManager = new SorobanSequenceManager();

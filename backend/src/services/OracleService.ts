/**
 * OracleService — #1480
 *
 * Fetches TWAP prices from the Soroban contract and aggregates them using the
 * multi-oracle median strategy described in ADR-006. Health factor calculations
 * and liquidation eligibility checks consume TWAP prices rather than spot
 * prices, as specified in ADR-007, to prevent flash-loan price manipulation.
 *
 * Usage:
 *   const oracleService = new OracleService(rpcClient);
 *   const twapPrice = await oracleService.getTwapPrice("xlm-usd");
 */

import {
  Contract,
  TransactionBuilder,
  BASE_FEE,
  Networks,
  scValToNative,
} from "@stellar/stellar-sdk";
import { getCachedTwapPrice, TWAP_CACHE_TTL_SECONDS } from "../utils/twapCache";
import { fireAlert } from "../utils/alerting";
import { config } from "../config";
import logger from "../utils/logger";

// ── Constants ────────────────────────────────────────────────────────────────

/**
 * Default TWAP observation window in seconds (matches ADR-007 default: 1 hour).
 * Override with the TWAP_OBSERVATION_WINDOW_SECONDS environment variable.
 */
export const DEFAULT_TWAP_WINDOW_SECONDS = 3_600;

/**
 * Maximum age in seconds for a TWAP price before it is considered stale and
 * liquidations are blocked. Defaults to 2× the observation window.
 * Override with ORACLE_STALENESS_THRESHOLD_SECONDS.
 */
export const DEFAULT_STALENESS_THRESHOLD_SECONDS = DEFAULT_TWAP_WINDOW_SECONDS * 2;

/** Simulation-only Stellar account used for read-only contract calls. */
const SIMULATION_ACCOUNT =
  "GASPH4OCYOERATXIKLPNURXUP7ISAQU2KWFB5XLUJ3LQHKHOCN3CEGD6";

const NETWORK_PASSPHRASE =
  config.NEXT_PUBLIC_NETWORK === "mainnet" ? Networks.PUBLIC : Networks.TESTNET;

const CONTRACT_ID = config.CONTRACT_ID;

// ── Types ────────────────────────────────────────────────────────────────────

/**
 * Raw TWAPData returned by the `get_twap_data` contract entry-point (ADR-007).
 */
export interface TwapData {
  /** Most recently accepted spot price from the oracle. */
  current_price: number;
  /** Rolling time-weighted average price over the observation window. */
  twap_price: number;
  /** Ledger timestamp of the last accepted price submission. */
  last_update: number;
}

/**
 * Result of a TWAP price fetch, including staleness metadata.
 */
export interface TwapPriceResult {
  /** Time-weighted average price to use for health factor / liquidation calculations. */
  twapPrice: number;
  /** Spot price from the most recent oracle submission. */
  spotPrice: number;
  /** Unix timestamp (seconds) of the last oracle price update. */
  lastUpdate: number;
  /** True when the price is fresher than the staleness threshold. */
  isFresh: boolean;
  /** Age of the price in seconds at the time of this fetch. */
  ageSeconds: number;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Compute the median of a non-empty array of numbers.
 * Implements the multi-oracle median aggregation strategy from ADR-006.
 */
export function median(values: number[]): number {
  if (values.length === 0) {
    throw new RangeError("median requires at least one value");
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!;
}

// ── OracleService ────────────────────────────────────────────────────────────

export class OracleService {
  private readonly observationWindowSeconds: number;
  private readonly stalenessThresholdSeconds: number;

  constructor(
    private readonly rpcClient: {
      getAccount(id: string): Promise<unknown>;
      simulateTransaction(tx: unknown): Promise<unknown>;
    },
    options: {
      observationWindowSeconds?: number;
      stalenessThresholdSeconds?: number;
    } = {}
  ) {
    this.observationWindowSeconds =
      options.observationWindowSeconds ??
      parseInt(
        process.env["TWAP_OBSERVATION_WINDOW_SECONDS"] ?? String(DEFAULT_TWAP_WINDOW_SECONDS),
        10
      );

    this.stalenessThresholdSeconds =
      options.stalenessThresholdSeconds ??
      parseInt(
        process.env["ORACLE_STALENESS_THRESHOLD_SECONDS"] ??
          String(DEFAULT_STALENESS_THRESHOLD_SECONDS),
        10
      );
  }

  /**
   * Fetch raw TWAP data from the contract, with Redis/memory caching.
   * Returns null when the contract call fails or returns no data.
   */
  async fetchTwapData(asset: string): Promise<TwapData | null> {
    return getCachedTwapPrice<TwapData | null>(asset, async () => {
      try {
        const contract = new Contract(CONTRACT_ID);
        const account = (await this.rpcClient.getAccount(SIMULATION_ACCOUNT)) as Parameters<
          ConstructorParameters<typeof TransactionBuilder>[0]["increment"]
        >[0];
        const tx = new TransactionBuilder(account as any, {
          fee: BASE_FEE,
          networkPassphrase: NETWORK_PASSPHRASE,
        })
          .addOperation(contract.call("get_twap_data"))
          .setTimeout(30)
          .build();

        const sim = await this.rpcClient.simulateTransaction(tx);
        const retval = (sim as { result?: { retval: unknown } }).result?.retval;
        if (retval == null) return null;

        const native = scValToNative(retval as Parameters<typeof scValToNative>[0]);
        if (
          typeof native !== "object" ||
          native === null ||
          typeof (native as Record<string, unknown>)["twap_price"] !== "number"
        ) {
          logger.warn("OracleService: unexpected twap_data shape", { native });
          return null;
        }

        return native as TwapData;
      } catch (err) {
        logger.warn("OracleService: fetchTwapData failed", {
          asset,
          error: err instanceof Error ? err.message : String(err),
        });
        return null;
      }
    });
  }

  /**
   * Return TWAP price data for the given asset.
   *
   * - Fetches `get_twap_data` from the Soroban contract (cached for
   *   {@link TWAP_CACHE_TTL_SECONDS} seconds).
   * - Checks freshness against {@link stalenessThresholdSeconds}.
   * - Fires a stale-oracle alert when the price is old, so ops teams are
   *   notified before the data influences a liquidation decision.
   *
   * @param asset - Oracle asset identifier (e.g. `"xlm-usd"`).
   * @returns Price result with freshness metadata, or null when no price is available.
   */
  async getTwapPrice(asset: string): Promise<TwapPriceResult | null> {
    const data = await this.fetchTwapData(asset);
    if (!data) return null;

    const nowSeconds = Math.floor(Date.now() / 1_000);
    const ageSeconds = nowSeconds - data.last_update;
    const isFresh = ageSeconds <= this.stalenessThresholdSeconds;

    if (!isFresh) {
      logger.warn("OracleService: stale price detected", {
        asset,
        ageSeconds,
        stalenessThresholdSeconds: this.stalenessThresholdSeconds,
        lastUpdate: data.last_update,
      });

      await fireAlert(
        {
          id: `oracle_stale_${asset}`,
          name: "Oracle Price Stale",
          severity: "warning",
          cooldownMs: 15 * 60 * 1_000, // 15-minute alert cooldown
          runbook: "oracle-staleness.md",
          pagerduty: false,
        },
        `Oracle price for ${asset} is ${ageSeconds}s old (threshold: ${this.stalenessThresholdSeconds}s)`,
        { asset, ageSeconds, lastUpdate: data.last_update }
      );
    }

    return {
      twapPrice: data.twap_price,
      spotPrice: data.current_price,
      lastUpdate: data.last_update,
      isFresh,
      ageSeconds,
    };
  }

  /**
   * Aggregate TWAP prices from multiple oracle assets using the median
   * strategy from ADR-006. Returns the median TWAP across all responsive
   * oracles that return fresh prices.
   *
   * @param assets - List of oracle asset identifiers to query.
   * @param requireFresh - When true (default), only fresh prices contribute to
   *   the median. When all prices are stale the method returns null.
   * @returns Median TWAP price, or null when no fresh prices are available.
   */
  async getMedianTwapPrice(
    assets: string[],
    requireFresh = true
  ): Promise<number | null> {
    const results = await Promise.allSettled(assets.map((a) => this.getTwapPrice(a)));

    const twapValues: number[] = [];
    for (const result of results) {
      if (result.status !== "fulfilled" || result.value === null) continue;
      if (requireFresh && !result.value.isFresh) continue;
      twapValues.push(result.value.twapPrice);
    }

    if (twapValues.length === 0) {
      logger.warn("OracleService: no fresh TWAP prices available", {
        assets,
        requireFresh,
      });
      return null;
    }

    return median(twapValues);
  }

  /**
   * Determine whether a stale oracle price should block a liquidation decision.
   * Returns true when the price is fresh enough for liquidation; false when
   * the stale-price guard should halt the operation.
   */
  async isLiquidationAllowed(asset: string): Promise<boolean> {
    const result = await this.getTwapPrice(asset);
    if (!result) {
      logger.warn("OracleService: no TWAP price available; blocking liquidation", { asset });
      return false;
    }
    if (!result.isFresh) {
      logger.warn("OracleService: stale price blocks liquidation", {
        asset,
        ageSeconds: result.ageSeconds,
        stalenessThresholdSeconds: this.stalenessThresholdSeconds,
      });
      return false;
    }
    return true;
  }
}

// ── Singleton ─────────────────────────────────────────────────────────────────

/**
 * Default OracleService instance backed by the shared RPC client.
 * Import this in route handlers and jobs that need TWAP prices.
 */
// Lazy singleton — avoids circular import at module load time.
let _defaultOracleService: OracleService | null = null;

export function getOracleService(): OracleService {
  if (!_defaultOracleService) {
    // Imported lazily to avoid circular dependency with rpcClient
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const rpcClient = require("../utils/rpcClient").default;
    _defaultOracleService = new OracleService(rpcClient);
  }
  return _defaultOracleService;
}

/** Exposed for testing — replace the singleton with a mock. */
export function _setOracleService(service: OracleService): void {
  _defaultOracleService = service;
}

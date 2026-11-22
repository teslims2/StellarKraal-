/**
 * HealthFactorService — #1480
 *
 * Centralizes the health factor calculation so that route handlers and
 * background jobs share a single, testable implementation.
 *
 * As specified in ADR-007, health factor calculations and liquidation
 * eligibility checks use TWAP prices instead of spot prices to prevent
 * flash-loan price manipulation. The collateral value passed to
 * `computeHealthFactor` must be derived from the TWAP price returned by
 * {@link OracleService.getTwapPrice}, not from the raw spot price.
 *
 * Formula:
 *   healthFactor = (collateralValue * liquidationThreshold) / debtValue
 *
 * Where `collateralValue = collateralCount × twapPrice`.
 *
 * Edge cases:
 *   - Zero debt: the loan is fully repaid, so there is no risk of
 *     liquidation. We return `Infinity` to represent an unbounded health
 *     factor (callers should treat this as "healthy").
 *   - Zero collateral value with outstanding debt: the loan is fully
 *     underwater. We return `0` so callers treat it as liquidatable.
 *   - Zero collateral value and zero debt: nothing is owed and nothing is
 *     locked, so we return `Infinity` (healthy / no risk).
 *   - Stale oracle price: the caller is responsible for checking
 *     `TwapPriceResult.isFresh` before computing the health factor. When the
 *     price is stale, callers should block liquidation and emit an alert
 *     (handled by {@link OracleService.isLiquidationAllowed}).
 */

import { OracleService, TwapPriceResult } from "./OracleService";

export interface HealthFactorLoan {
  collateralValue: number;
  debtValue: number;
  liquidationThreshold: number;
}

export interface HealthFactorLoanRepository {
  findById(loanId: string): Promise<HealthFactorLoan | null>;
}

/**
 * Extended loan data that includes collateral count and oracle asset, so the
 * service can substitute the TWAP-adjusted collateral value.
 */
export interface HealthFactorLoanWithOracle extends HealthFactorLoan {
  /** Number of collateral units (e.g. head of livestock). */
  collateralCount?: number;
  /** Oracle asset identifier used to look up the TWAP price (e.g. `"xlm-usd"`). */
  oracleAsset?: string;
}

export interface HealthFactorLoanRepositoryWithOracle {
  findById(loanId: string): Promise<HealthFactorLoanWithOracle | null>;
}

export class HealthFactorService {
  constructor(
    private readonly loanRepository:
      | HealthFactorLoanRepository
      | HealthFactorLoanRepositoryWithOracle,
    private readonly oracleService?: OracleService
  ) {}

  /**
   * Calculate the health factor for a given loan using TWAP-adjusted collateral
   * value when an oracle service is available and the loan exposes `collateralCount`
   * and `oracleAsset`.
   *
   * Falls back to the stored `collateralValue` (spot-price-based) when:
   * - No `oracleService` is injected.
   * - The loan does not expose `collateralCount` / `oracleAsset`.
   * - The oracle returns no price data.
   *
   * @param loanId Identifier of the loan to evaluate.
   * @returns The health factor. `Infinity` when there is no debt; `0` when
   *          collateral is zero but debt remains.
   * @throws Error if the loan cannot be found.
   */
  async calculateHealthFactor(loanId: string): Promise<number> {
    const loan = await this.loanRepository.findById(loanId);

    if (!loan) {
      throw new Error(`Loan not found: ${loanId}`);
    }

    // Attempt TWAP-adjusted collateral value when oracle data is available.
    if (this.oracleService && "collateralCount" in loan && loan.collateralCount != null && loan.oracleAsset) {
      const twapResult: TwapPriceResult | null = await this.oracleService
        .getTwapPrice(loan.oracleAsset)
        .catch(() => null);

      if (twapResult !== null) {
        const twapCollateralValue = loan.collateralCount * twapResult.twapPrice;
        return HealthFactorService.computeHealthFactor({
          collateralValue: twapCollateralValue,
          debtValue: loan.debtValue,
          liquidationThreshold: loan.liquidationThreshold,
        });
      }
    }

    // Fallback: use stored collateral value.
    return HealthFactorService.computeHealthFactor(loan);
  }

  /**
   * Calculate health factor using an explicit TWAP price result.
   *
   * Use this overload in liquidation checks where the caller has already
   * fetched the TWAP price and verified freshness with
   * {@link OracleService.isLiquidationAllowed}.
   *
   * @param loan The loan record (needs collateralCount or collateralValue).
   * @param twapResult A fresh TWAP price result from OracleService.
   * @returns Health factor computed with TWAP-adjusted collateral value.
   */
  static computeHealthFactorWithTwap(
    loan: HealthFactorLoan & { collateralCount?: number },
    twapResult: TwapPriceResult
  ): number {
    const collateralValue =
      loan.collateralCount != null
        ? loan.collateralCount * twapResult.twapPrice
        : loan.collateralValue;

    return HealthFactorService.computeHealthFactor({
      collateralValue,
      debtValue: loan.debtValue,
      liquidationThreshold: loan.liquidationThreshold,
    });
  }

  /**
   * Pure calculation helper, exposed for unit testing in isolation from
   * persistence.
   *
   * The `collateralValue` passed here must already be TWAP-adjusted when used
   * for liquidation decisions (see ADR-007). For origination checks, the spot
   * price is acceptable but must pass the deviation guard.
   */
  static computeHealthFactor(loan: HealthFactorLoan): number {
    const { collateralValue, debtValue, liquidationThreshold } = loan;

    // No debt: nothing can be liquidated.
    if (debtValue <= 0) {
      return Infinity;
    }

    // Debt exists but collateral is worthless: fully underwater.
    if (collateralValue <= 0) {
      return 0;
    }

    return (collateralValue * liquidationThreshold) / debtValue;
  }
}

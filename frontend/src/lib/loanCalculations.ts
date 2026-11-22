/**
 * Shared loan calculation helpers.
 *
 * These utilities are consumed by the repayment flow (RepayPanel / RepayModal)
 * and the loan wizard (LoanForm) to preview health factors, LTV ratios and
 * risk zones as the user adjusts repayment or loan amounts.
 */

/** Health factor at or above which a position is considered safe. */
export const HEALTH_FACTOR_SAFE = 2.0;

/** Health factor below which a position is considered high risk (liquidation territory). */
export const HEALTH_FACTOR_HIGH_RISK = 1.2;

/** Health factor at or below which a position is considered at risk of liquidation. */
export const HEALTH_FACTOR_LIQUIDATION = 1.0;

/** LTV (as a fraction, e.g. 0.5 = 50%) at or below which borrowing is considered safe. */
export const LTV_SAFE = 0.5;

/** LTV (as a fraction) above which borrowing is considered high risk. */
export const LTV_HIGH_RISK = 0.75;

/** LTV (as a fraction) at which the protocol would typically liquidate. */
export const LTV_LIQUIDATION = 0.8;

export type RiskZone = 'safe' | 'caution' | 'high-risk';

export interface RiskZoneThresholds {
  /** Health factor at or above which the position is safe. */
  safe: number;
  /** Health factor below which the position is high risk. */
  highRisk: number;
  /** Health factor at or below which the position is liquidatable. */
  liquidation: number;
}

export const HEALTH_FACTOR_RISK_ZONES: RiskZoneThresholds = {
  safe: HEALTH_FACTOR_SAFE,
  highRisk: HEALTH_FACTOR_HIGH_RISK,
  liquidation: HEALTH_FACTOR_LIQUIDATION,
};

export interface LtvRiskZoneThresholds {
  /** LTV (fraction) at or below which borrowing is safe. */
  safe: number;
  /** LTV (fraction) above which borrowing is high risk. */
  highRisk: number;
  /** LTV (fraction) at which the position is liquidatable. */
  liquidation: number;
}

export const LTV_RISK_ZONES: LtvRiskZoneThresholds = {
  safe: LTV_SAFE,
  highRisk: LTV_HIGH_RISK,
  liquidation: LTV_LIQUIDATION,
};

/**
 * Classify a health factor into a risk zone.
 * Returns `null` when the health factor is not a finite positive number.
 */
export function getHealthFactorRiskZone(healthFactor: number): RiskZone | null {
  if (!Number.isFinite(healthFactor) || healthFactor <= 0) {
    return null;
  }
  if (healthFactor >= HEALTH_FACTOR_SAFE) {
    return 'safe';
  }
  if (healthFactor >= HEALTH_FACTOR_HIGH_RISK) {
    return 'caution';
  }
  return 'high-risk';
}

/**
 * Classify an LTV ratio (as a fraction) into a risk zone.
 * Returns `null` when the LTV is not a finite non-negative number.
 */
export function getLtvRiskZone(ltv: number): RiskZone | null {
  if (!Number.isFinite(ltv) || ltv < 0) {
    return null;
  }
  if (ltv <= LTV_SAFE) {
    return 'safe';
  }
  if (ltv <= LTV_HIGH_RISK) {
    return 'caution';
  }
  return 'high-risk';
}

/**
 * Compute the health factor for a position.
 *
 * Health factor = (collateral value * liquidation threshold) / outstanding debt.
 *
 * Returns `Infinity` when there is no outstanding debt (a debt-free position is
 * infinitely healthy) and `0` when the collateral value is non-positive while
 * debt remains.
 */
export function computeHealthFactor(
  collateralValue: number,
  outstandingBalance: number,
  liquidationThreshold: number = LTV_LIQUIDATION,
): number {
  if (!Number.isFinite(collateralValue) || collateralValue <= 0) {
    return outstandingBalance > 0 ? 0 : Infinity;
  }
  if (!Number.isFinite(outstandingBalance) || outstandingBalance <= 0) {
    return Infinity;
  }
  const threshold = Number.isFinite(liquidationThreshold) && liquidationThreshold > 0
    ? liquidationThreshold
    : LTV_LIQUIDATION;
  return (collateralValue * threshold) / outstandingBalance;
}

/**
 * Compute the projected health factor after applying a repayment.
 *
 * The repayment reduces the outstanding balance (clamped to zero). Collateral
 * value is assumed unchanged by a repayment.
 */
export function computeProjectedHealthFactor(
  collateralValue: number,
  outstandingBalance: number,
  repaymentAmount: number,
  liquidationThreshold: number = LTV_LIQUIDATION,
): number {
  const safeOutstanding = Number.isFinite(outstandingBalance) && outstandingBalance > 0
    ? outstandingBalance
    : 0;
  const safeRepayment = Number.isFinite(repaymentAmount) && repaymentAmount > 0
    ? repaymentAmount
    : 0;
  const remainingBalance = Math.max(0, safeOutstanding - safeRepayment);
  return computeHealthFactor(collateralValue, remainingBalance, liquidationThreshold);
}

/**
 * Compute the minimum repayment amount required to restore the position to a
 * target health factor (defaults to the safe threshold).
 *
 * Returns `0` when the position is already at or above the target health factor
 * or when there is no outstanding debt.
 */
export function computeMinimumRepayment(
  collateralValue: number,
  outstandingBalance: number,
  targetHealthFactor: number = HEALTH_FACTOR_SAFE,
  liquidationThreshold: number = LTV_LIQUIDATION,
): number {
  if (!Number.isFinite(outstandingBalance) || outstandingBalance <= 0) {
    return 0;
  }
  if (!Number.isFinite(collateralValue) || collateralValue <= 0) {
    // No collateral: the entire balance must be repaid to clear the debt.
    return outstandingBalance;
  }
  const target = Number.isFinite(targetHealthFactor) && targetHealthFactor > 0
    ? targetHealthFactor
    : HEALTH_FACTOR_SAFE;
  const threshold = Number.isFinite(liquidationThreshold) && liquidationThreshold > 0
    ? liquidationThreshold
    : LTV_LIQUIDATION;

  // Solve (collateral * threshold) / (balance - repayment) = target
  // => repayment = balance - (collateral * threshold) / target
  const maxSustainableDebt = (collateralValue * threshold) / target;
  const repayment = outstandingBalance - maxSustainableDebt;
  if (repayment <= 0) {
    return 0;
  }
  return Math.min(repayment, outstandingBalance);
}

/**
 * Compute the loan-to-value ratio as a fraction (e.g. 0.5 = 50%).
 *
 * Returns `0` when collateral value is non-positive.
 */
export function computeLtv(loanAmount: number, collateralValue: number): number {
  if (!Number.isFinite(collateralValue) || collateralValue <= 0) {
    return 0;
  }
  const safeLoan = Number.isFinite(loanAmount) && loanAmount > 0 ? loanAmount : 0;
  return safeLoan / collateralValue;
}

/**
 * Compute the maximum loan amount permitted for a given collateral value and
 * maximum LTV (as a fraction).
 */
export function computeMaxLoanAmount(
  collateralValue: number,
  maxLtv: number = LTV_LIQUIDATION,
): number {
  if (!Number.isFinite(collateralValue) || collateralValue <= 0) {
    return 0;
  }
  const ltv = Number.isFinite(maxLtv) && maxLtv > 0 ? maxLtv : LTV_LIQUIDATION;
  return collateralValue * ltv;
}

/**
 * Compute the projected health factor for a prospective loan amount against a
 * given collateral value.
 */
export function computeLoanHealthFactor(
  collateralValue: number,
  loanAmount: number,
  liquidationThreshold: number = LTV_LIQUIDATION,
): number {
  return computeHealthFactor(collateralValue, loanAmount, liquidationThreshold);
}

/**
 * Clamp a value into the inclusive [min, max] range.
 */
export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}

/**
 * Format a health factor for display. Debt-free positions render as "∞".
 */
export function formatHealthFactor(healthFactor: number): string {
  if (!Number.isFinite(healthFactor)) {
    return healthFactor > 0 ? '∞' : '—';
  }
  return healthFactor.toFixed(2);
}

/**
 * Format an LTV fraction as a percentage string (e.g. 0.5 -> "50.00%").
 */
export function formatLtv(ltv: number): string {
  if (!Number.isFinite(ltv)) {
    return '—';
  }
  return `${(ltv * 100).toFixed(2)}%`;
}
export interface RepaymentCalculationInput {
  amount: number;
  outstanding: number;
  collateralValue: number;
}

export interface RepaymentCalculation {
  appliedAmount: number;
  remainingBalance: number;
  projectedHealthFactorBps: number | null;
  overpayment: boolean;
}

export function calculateRepaymentPreview({
  amount,
  outstanding,
  collateralValue,
}: RepaymentCalculationInput): RepaymentCalculation {
  if (!Number.isFinite(amount) || amount <= 0 || outstanding < 0 || collateralValue < 0) {
    return {
      appliedAmount: 0,
      remainingBalance: Math.max(0, outstanding),
      projectedHealthFactorBps: null,
      overpayment: false,
    };
  }
  const appliedAmount = Math.min(amount, outstanding);
  const remainingBalance = Math.max(0, outstanding - appliedAmount);
  return {
    appliedAmount,
    remainingBalance,
    projectedHealthFactorBps:
      remainingBalance === 0
        ? null
        : Math.round((collateralValue * 10_000) / remainingBalance),
    overpayment: amount > outstanding,
  };
}

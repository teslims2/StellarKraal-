import { calculateRepaymentPreview } from './repaymentMath';

describe('calculateRepaymentPreview', () => {
  it('returns no applied amount for zero', () => {
    expect(
      calculateRepaymentPreview({ amount: 0, outstanding: 100, collateralValue: 500 })
    ).toEqual({
      appliedAmount: 0,
      remainingBalance: 100,
      projectedHealthFactorBps: 50_000,
      overpayment: false,
    });
  });

  it('accepts an exact outstanding balance', () => {
    expect(
      calculateRepaymentPreview({ amount: 100, outstanding: 100, collateralValue: 500 })
    ).toEqual({
      appliedAmount: 100,
      remainingBalance: 0,
      projectedHealthFactorBps: null,
      overpayment: false,
    });
  });

  it('caps overpayment and marks it', () => {
    expect(
      calculateRepaymentPreview({ amount: 150, outstanding: 100, collateralValue: 500 })
    ).toEqual({
      appliedAmount: 100,
      remainingBalance: 0,
      projectedHealthFactorBps: null,
      overpayment: true,
    });
  });
});

"use client";

import { useMemo, useState } from "react";
import HealthGauge from "@/components/HealthGauge";
import { useLoans, useRepaymentPreview, RepaymentPreview } from "@/hooks/use-queries";

interface Props {
  onProceed: (loanId: string, amount: string) => void;
}

function formatAmount(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

export default function LoanRepaymentCalculator({ onProceed }: Props) {
  const [loanId, setLoanId] = useState("");
  const [amount, setAmount] = useState("");

  const parsedLoanId = useMemo(() => Number(loanId), [loanId]);
  const parsedAmount = useMemo(() => Number(amount), [amount]);

  const { data: loansData } = useLoans(1, 50);
  const loanOptions = useMemo(() => {
    if (!loansData?.data) return [];
    return loansData.data
      .map((item) => Number(item?.id))
      .filter((id) => Number.isFinite(id));
  }, [loansData]);

  const {
    data: preview,
    isLoading: loading,
    error,
  } = useRepaymentPreview(
    Number.isInteger(parsedLoanId) && parsedLoanId >= 0 ? parsedLoanId : null,
    Number.isFinite(parsedAmount) && parsedAmount > 0 ? parsedAmount : null
  );

  const errorMessage = error ? (error as Error).message : null;

  return (
    <div className="bg-white rounded-2xl p-6 shadow mb-4">
      <h2 className="text-xl font-semibold text-brown mb-1">
        Repayment Calculator
      </h2>
      <p className="text-sm text-brown/70 mb-4">
        Preview principal, interest, fees, and health impact before repaying.
      </p>

      <div className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-brown mb-1">
            Loan ID
          </label>
          <input
            className="w-full border border-brown/30 rounded-lg px-3 py-2"
            placeholder="Enter loan ID"
            value={loanId}
            onChange={(e) => setLoanId(e.target.value)}
            list="loan-options"
            type="number"
          />
          <datalist id="loan-options">
            {loanOptions.map((id) => (
              <option key={id} value={id} />
            ))}
          </datalist>
        </div>

        <div>
          <label className="block text-sm font-medium text-brown mb-1">
            Repayment Amount (stroops)
          </label>
          <input
            className="w-full border border-brown/30 rounded-lg px-3 py-2"
            placeholder="Enter repayment amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            type="number"
          />
        </div>
      </div>

      {loading && <p className="text-sm text-brown/70 mt-4">Calculating...</p>}
      {error && <p className="text-sm text-red-600 mt-4">{error}</p>}

      {preview && (
        <div className="mt-5 border border-brown/10 rounded-xl p-4 bg-cream/40">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="bg-white rounded-lg p-3 border border-brown/10">
              <p className="text-brown/60">Principal</p>
              <p className="font-semibold text-brown">
                {formatAmount(preview.breakdown.principal)}
              </p>
            </div>
            <div className="bg-white rounded-lg p-3 border border-brown/10">
              <p className="text-brown/60">Interest</p>
              <p className="font-semibold text-brown">
                {formatAmount(preview.breakdown.interest)}
              </p>
            </div>
            <div className="bg-white rounded-lg p-3 border border-brown/10">
              <p className="text-brown/60">Fees</p>
              <p className="font-semibold text-brown">
                {formatAmount(preview.breakdown.fees)}
              </p>
            </div>
            <div className="bg-white rounded-lg p-3 border border-brown/10">
              <p className="text-brown/60">Remaining Balance</p>
              <p className="font-semibold text-brown">
                {formatAmount(preview.breakdown.remaining_balance)}
              </p>
            </div>
          </div>

          <div className="mt-4">
            <p className="text-sm font-medium text-brown">
              Projected Health Factor
            </p>
            {preview.fully_repaid ? (
              <p className="text-sm text-green-700 mt-1">
                Fully repaid (health factor becomes infinite).
              </p>
            ) : (
              preview.projected_health_factor_bps !== null && (
                <HealthGauge value={preview.projected_health_factor_bps} />
              )
            )}
          </div>

          <button
            type="button"
            className="mt-4 w-full bg-brown text-cream py-2.5 rounded-xl font-semibold hover:bg-brown/80 transition"
            onClick={() =>
              onProceed(
                String(preview.loan_id),
                String(preview.repayment_amount),
              )
            }
          >
            Proceed to Repay
          </button>
        </div>
      )}
    </div>
  );
}

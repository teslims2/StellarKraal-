"use client";
import { useEffect, useState } from "react";
import { signTransaction } from "@stellar/freighter-api";
import { submitSignedXdr } from "@/lib/stellarUtils";
import { useRepayLoan } from "@/hooks/use-queries";

interface Props {
  walletAddress: string;
  initialLoanId?: string;
  initialAmount?: string;
}

export default function RepayPanel({
  walletAddress,
  initialLoanId = "",
  initialAmount = "",
}: Props) {
  const [loanId, setLoanId] = useState(initialLoanId);
  const [amount, setAmount] = useState(initialAmount);
  const [status, setStatus] = useState<string | null>(null);

  const repayMutation = useRepayLoan();
  const loading = repayMutation.isPending;

  useEffect(() => {
    setLoanId(initialLoanId);
  }, [initialLoanId]);

  useEffect(() => {
    setAmount(initialAmount);
  }, [initialAmount]);

  async function repay() {
    setStatus(null);
    try {
      const { xdr } = await repayMutation.mutateAsync({
        borrower: walletAddress,
        loan_id: parseInt(loanId),
        amount: parseInt(amount),
      });
      const { signedTxXdr } = await signTransaction(xdr, {
        network: process.env.NEXT_PUBLIC_NETWORK || "TESTNET",
      });
      await submitSignedXdr(signedTxXdr);
      setStatus("✅ Repayment submitted!");
    } catch (e: any) {
      setStatus(`❌ ${e.message}`);
    }
  }

  return (
    <div className="bg-white rounded-2xl p-6 shadow mb-4">
      <h2 className="text-xl font-semibold text-brown mb-3">Repay Loan</h2>
      <div className="space-y-3">
        <input
          className="w-full border border-brown/30 rounded-lg px-3 py-2"
          placeholder="Loan ID"
          value={loanId}
          onChange={(e) => setLoanId(e.target.value)}
          type="number"
        />
        <input
          className="w-full border border-brown/30 rounded-lg px-3 py-2"
          placeholder="Amount (stroops)"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          type="number"
        />
        <button
          onClick={repay}
          disabled={loading}
          className="w-full bg-gold text-brown py-2.5 rounded-xl font-semibold hover:bg-gold/80 transition disabled:opacity-50"
        >
          {loading ? "Processing…" : "Repay"}
        </button>
      </div>
      {status && <p className="text-sm mt-2">{status}</p>}
    </div>
  );
}

"use client";
import { useState } from "react";
import { signTransaction } from "@stellar/freighter-api";
import { submitSignedXdr } from "@/lib/stellarUtils";

interface Props {
  walletAddress: string;
}

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export default function RepayPanel({ walletAddress }: Props) {
  const [loanId, setLoanId] = useState("");
  const [amount, setAmount] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function repay() {
    setLoading(true);
    setStatus(null);
    try {
      const res = await fetch(`${API}/api/loan/repay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ borrower: walletAddress, loan_id: parseInt(loanId), amount: parseInt(amount) }),
      });
      const { xdr } = await res.json();
      const { signedTxXdr } = await signTransaction(xdr, { network: process.env.NEXT_PUBLIC_NETWORK || "TESTNET" });
      await submitSignedXdr(signedTxXdr);
      setStatus("✅ Repayment submitted!");
    } catch (e: any) {
      setStatus(`❌ ${e.message}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-surface rounded-token-xl p-token-lg shadow-token mb-token-md">
      <h2 className="text-token-xl font-semibold text-brand-brown mb-token-sm">Repay Loan</h2>
      <div className="space-y-token-sm">
        <input className="w-full border border-brand-brown/30 rounded-token px-token-sm py-2" placeholder="Loan ID" value={loanId} onChange={(e) => setLoanId(e.target.value)} type="number" />
        <input className="w-full border border-brand-brown/30 rounded-token px-token-sm py-2" placeholder="Amount (stroops)" value={amount} onChange={(e) => setAmount(e.target.value)} type="number" />
        <button onClick={repay} disabled={loading} className="w-full bg-brand-gold text-brand-brown py-2.5 rounded-token-xl font-semibold hover:bg-brand-gold/80 transition disabled:opacity-50">
          {loading ? "Processing…" : "Repay"}
        </button>
      </div>
      {status && <p className="text-token-sm mt-2">{status}</p>}
    </div>
  );
}

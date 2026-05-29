"use client";
import { useState } from "react";
import { signTransaction } from "@stellar/freighter-api";
import { submitSignedXdr } from "@/lib/stellarUtils";

interface Props {
  walletAddress: string;
}

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

const inputCls =
  "w-full border border-brown/30 dark:border-gold/40 rounded-lg px-3 py-2 bg-white dark:bg-[#2A1A08] text-brown dark:text-cream placeholder:text-brown/40 dark:placeholder:text-cream/40 focus:outline-none focus:ring-2 focus:ring-gold dark:focus:ring-[#F5D060]";

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
    <div className="bg-white dark:bg-[#1C1008] rounded-2xl p-6 shadow border border-transparent dark:border-gold/20 mb-4">
      <h2 className="text-xl font-semibold text-brown dark:text-cream mb-3">Repay Loan</h2>
      <div className="space-y-3">
        <input className={inputCls} placeholder="Loan ID" value={loanId} onChange={(e) => setLoanId(e.target.value)} type="number" />
        <input className={inputCls} placeholder="Amount (stroops)" value={amount} onChange={(e) => setAmount(e.target.value)} type="number" />
        <button
          onClick={repay}
          disabled={loading}
          className="w-full bg-gold text-brown py-2.5 rounded-xl font-semibold hover:opacity-90 transition disabled:opacity-50"
        >
          {loading ? "Processing…" : "Repay"}
        </button>
      </div>
      {status && <p className="text-sm mt-2 text-brown dark:text-cream">{status}</p>}
    </div>
  );
}

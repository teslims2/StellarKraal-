"use client";
import { useState } from "react";
import { signTransaction } from "@stellar/freighter-api";
import { submitSignedXdr } from "@/lib/stellarUtils";

interface Props {
  walletAddress: string;
}

const ANIMAL_TYPES = ["cattle", "goat", "sheep"];
const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

const inputCls = "w-full border border-brand-brown/30 rounded-token px-token-sm py-2";

export default function LoanForm({ walletAddress }: Props) {
  const [step, setStep] = useState<"collateral" | "loan">("collateral");
  const [animalType, setAnimalType] = useState("cattle");
  const [count, setCount] = useState("");
  const [appraisedValue, setAppraisedValue] = useState("");
  const [collateralId, setCollateralId] = useState("");
  const [loanAmount, setLoanAmount] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function registerCollateral() {
    setLoading(true);
    setStatus(null);
    try {
      const res = await fetch(`${API}/api/collateral/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          owner: walletAddress,
          animal_type: animalType,
          count: parseInt(count),
          appraised_value: parseInt(appraisedValue),
        }),
      });
      const { xdr } = await res.json();
      const { signedTxXdr } = await signTransaction(xdr, { network: process.env.NEXT_PUBLIC_NETWORK || "TESTNET" });
      const result = await submitSignedXdr(signedTxXdr);
      setStatus(`✅ Collateral registered! ID: ${result}`);
      setStep("loan");
    } catch (e: any) {
      setStatus(`❌ ${e.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function requestLoan() {
    setLoading(true);
    setStatus(null);
    try {
      const res = await fetch(`${API}/api/loan/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          borrower: walletAddress,
          collateral_id: parseInt(collateralId),
          amount: parseInt(loanAmount),
        }),
      });
      const { xdr } = await res.json();
      const { signedTxXdr } = await signTransaction(xdr, { network: process.env.NEXT_PUBLIC_NETWORK || "TESTNET" });
      const result = await submitSignedXdr(signedTxXdr);
      setStatus(`✅ Loan disbursed! Loan ID: ${result}`);
    } catch (e: any) {
      setStatus(`❌ ${e.message}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-surface rounded-token-xl p-token-lg shadow-token mt-token-lg space-y-token-md">
      {step === "collateral" ? (
        <>
          <h2 className="text-token-xl font-semibold text-brand-brown">1. Register Collateral</h2>
          <select className={inputCls} value={animalType} onChange={(e) => setAnimalType(e.target.value)}>
            {ANIMAL_TYPES.map((a) => <option key={a}>{a}</option>)}
          </select>
          <input className={inputCls} placeholder="Count" value={count} onChange={(e) => setCount(e.target.value)} type="number" />
          <input className={inputCls} placeholder="Appraised value (stroops)" value={appraisedValue} onChange={(e) => setAppraisedValue(e.target.value)} type="number" />
          <button onClick={registerCollateral} disabled={loading} className="w-full bg-brand-brown text-brand-cream py-2.5 rounded-token-xl font-semibold hover:bg-brand-brown/80 transition disabled:opacity-50">
            {loading ? "Processing…" : "Register & Continue"}
          </button>
        </>
      ) : (
        <>
          <h2 className="text-token-xl font-semibold text-brand-brown">2. Request Loan</h2>
          <input className={inputCls} placeholder="Collateral ID" value={collateralId} onChange={(e) => setCollateralId(e.target.value)} type="number" />
          <input className={inputCls} placeholder="Loan amount (stroops)" value={loanAmount} onChange={(e) => setLoanAmount(e.target.value)} type="number" />
          <button onClick={requestLoan} disabled={loading} className="w-full bg-brand-gold text-brand-brown py-2.5 rounded-token-xl font-semibold hover:bg-brand-gold/80 transition disabled:opacity-50">
            {loading ? "Processing…" : "Request Loan"}
          </button>
        </>
      )}
      {status && <p className="text-token-sm mt-2">{status}</p>}
    </div>
  );
}

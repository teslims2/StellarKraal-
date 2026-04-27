"use client";
import { useState } from "react";
import { signTransaction } from "@stellar/freighter-api";
import { submitSignedXdr } from "@/lib/stellarUtils";
import { useRegisterCollateral, useRequestLoan } from "@/hooks/use-queries";

interface Props {
  walletAddress: string;
}

const ANIMAL_TYPES = ["cattle", "goat", "sheep"];

export default function LoanForm({ walletAddress }: Props) {
  const [step, setStep] = useState<"collateral" | "loan">("collateral");
  const [animalType, setAnimalType] = useState("cattle");
  const [count, setCount] = useState("");
  const [appraisedValue, setAppraisedValue] = useState("");
  const [collateralId, setCollateralId] = useState("");
  const [loanAmount, setLoanAmount] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  const registerCollateralMutation = useRegisterCollateral();
  const requestLoanMutation = useRequestLoan();

  const loading = registerCollateralMutation.isPending || requestLoanMutation.isPending;

  async function registerCollateral() {
    setStatus(null);
    try {
      const { xdr } = await registerCollateralMutation.mutateAsync({
        owner: walletAddress,
        animal_type: animalType,
        count: parseInt(count),
        appraised_value: parseInt(appraisedValue),
      });
      const { signedTxXdr } = await signTransaction(xdr, { network: process.env.NEXT_PUBLIC_NETWORK || "TESTNET" });
      const result = await submitSignedXdr(signedTxXdr);
      setStatus(`✅ Collateral registered! ID: ${result}`);
      setStep("loan");
    } catch (e: any) {
      setStatus(`❌ ${e.message}`);
    }
  }

  async function requestLoan() {
    setStatus(null);
    try {
      const { xdr } = await requestLoanMutation.mutateAsync({
        borrower: walletAddress,
        collateral_id: parseInt(collateralId),
        amount: parseInt(loanAmount),
      });
      const { signedTxXdr } = await signTransaction(xdr, { network: process.env.NEXT_PUBLIC_NETWORK || "TESTNET" });
      const result = await submitSignedXdr(signedTxXdr);
      setStatus(`✅ Loan disbursed! Loan ID: ${result}`);
    } catch (e: any) {
      setStatus(`❌ ${e.message}`);
    }
  }

  return (
    <div className="bg-white rounded-2xl p-6 shadow mt-6 space-y-4">
      {step === "collateral" ? (
        <>
          <h2 className="text-xl font-semibold text-brown">1. Register Collateral</h2>
          <select
            className="w-full border border-brown/30 rounded-lg px-3 py-2"
            value={animalType}
            onChange={(e) => setAnimalType(e.target.value)}
          >
            {ANIMAL_TYPES.map((a) => <option key={a}>{a}</option>)}
          </select>
          <input className="w-full border border-brown/30 rounded-lg px-3 py-2" placeholder="Count" value={count} onChange={(e) => setCount(e.target.value)} type="number" />
          <input className="w-full border border-brown/30 rounded-lg px-3 py-2" placeholder="Appraised value (stroops)" value={appraisedValue} onChange={(e) => setAppraisedValue(e.target.value)} type="number" />
          <button onClick={registerCollateral} disabled={loading} className="w-full bg-brown text-cream py-2.5 rounded-xl font-semibold hover:bg-brown/80 transition disabled:opacity-50">
            {loading ? "Processing…" : "Register & Continue"}
          </button>
        </>
      ) : (
        <>
          <h2 className="text-xl font-semibold text-brown">2. Request Loan</h2>
          <input className="w-full border border-brown/30 rounded-lg px-3 py-2" placeholder="Collateral ID" value={collateralId} onChange={(e) => setCollateralId(e.target.value)} type="number" />
          <input className="w-full border border-brown/30 rounded-lg px-3 py-2" placeholder="Loan amount (stroops)" value={loanAmount} onChange={(e) => setLoanAmount(e.target.value)} type="number" />
          <button onClick={requestLoan} disabled={loading} className="w-full bg-gold text-brown py-2.5 rounded-xl font-semibold hover:bg-gold/80 transition disabled:opacity-50">
            {loading ? "Processing…" : "Request Loan"}
          </button>
        </>
      )}
      {status && <p className="text-sm mt-2">{status}</p>}
    </div>
  );
}

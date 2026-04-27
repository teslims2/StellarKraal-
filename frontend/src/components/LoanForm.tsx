"use client";
import { useState, useEffect } from "react";
import { signTransaction } from "@stellar/freighter-api";
import { submitSignedXdr } from "@/lib/stellarUtils";
import { useFormAutoSave } from "@/hooks/useFormAutoSave";

interface Props {
  walletAddress: string;
}

const ANIMAL_TYPES = ["cattle", "goat", "sheep"];
const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export default function LoanForm({ walletAddress }: Props) {
  const [step, setStep] = useState<"collateral" | "loan">("collateral");
  const [animalType, setAnimalType] = useState("cattle");
  const [count, setCount] = useState("");
  const [appraisedValue, setAppraisedValue] = useState("");
  const [collateralId, setCollateralId] = useState("");
  const [loanAmount, setLoanAmount] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showRestorePrompt, setShowRestorePrompt] = useState(false);

  const formData = step === "collateral" 
    ? { animalType, count, appraisedValue }
    : { collateralId, loanAmount };

  const { lastSaved, hasSavedData, restoreSavedData, clearSavedData } = useFormAutoSave({
    storageKey: `stellarkraal_loan_form_${step}`,
    data: formData,
    walletAddress,
  });

  useEffect(() => {
    if (hasSavedData) {
      setShowRestorePrompt(true);
    }
  }, [hasSavedData]);

  const handleRestore = () => {
    const saved = restoreSavedData();
    if (saved) {
      if (step === "collateral") {
        setAnimalType(saved.animalType || "cattle");
        setCount(saved.count || "");
        setAppraisedValue(saved.appraisedValue || "");
      } else {
        setCollateralId(saved.collateralId || "");
        setLoanAmount(saved.loanAmount || "");
      }
    }
    setShowRestorePrompt(false);
  };

  async function registerCollateral() {
    setLoading(true);
    setStatus(null);
    try {
      const res = await fetch(`${API}/api/v1/collateral/register`, {
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
      clearSavedData();
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
      const res = await fetch(`${API}/api/v1/loan/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          borrower: walletAddress,
          collateral_ids: [parseInt(collateralId)],
          amount: parseInt(loanAmount),
        }),
      });
      const { xdr } = await res.json();
      const { signedTxXdr } = await signTransaction(xdr, { network: process.env.NEXT_PUBLIC_NETWORK || "TESTNET" });
      const result = await submitSignedXdr(signedTxXdr);
      setStatus(`✅ Loan disbursed! Loan ID: ${result}`);
      clearSavedData();
    } catch (e: any) {
      setStatus(`❌ ${e.message}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-white rounded-2xl p-6 shadow mt-6 space-y-4">
      {showRestorePrompt && (
        <div className="bg-gold/20 border border-gold rounded-lg p-4 mb-4">
          <p className="text-sm text-brown mb-2">
            You have unsaved progress. Would you like to restore it?
          </p>
          <div className="flex gap-2">
            <button
              onClick={handleRestore}
              className="px-4 py-1.5 bg-gold text-brown rounded-lg text-sm font-medium hover:bg-gold/80"
            >
              Restore
            </button>
            <button
              onClick={() => { clearSavedData(); setShowRestorePrompt(false); }}
              className="px-4 py-1.5 bg-brown/10 text-brown rounded-lg text-sm hover:bg-brown/20"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
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
      {lastSaved && !loading && (
        <p className="text-xs text-brown/60 text-center">
          Auto-saved at {lastSaved.toLocaleTimeString()}
        </p>
      )}
      {status && <p className="text-sm mt-2">{status}</p>}
    </div>
  );
}

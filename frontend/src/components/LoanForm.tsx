"use client";
import { useState } from "react";
import { signTransaction } from "@stellar/freighter-api";
import { submitSignedXdr } from "@/lib/stellarUtils";

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
      const signedTxXdr = await signTransaction(xdr, { network: process.env.NEXT_PUBLIC_NETWORK || "TESTNET" });
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
      const signedTxXdr = await signTransaction(xdr, { network: process.env.NEXT_PUBLIC_NETWORK || "TESTNET" });
      const result = await submitSignedXdr(signedTxXdr);
      setStatus(`✅ Loan disbursed! Loan ID: ${result}`);
    } catch (e: any) {
      setStatus(`❌ ${e.message}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-white rounded-2xl p-6 shadow mt-6 space-y-4">
      {step === "collateral" ? (
        <>
          <h2 className="text-xl font-semibold text-brown">1. Register Collateral</h2>
          <div>
            <label className="block text-sm font-medium text-brown mb-1">Animal Type</label>
            <select
              className="w-full border border-brown/30 rounded-lg px-3 py-2 min-h-[44px]"
              value={animalType}
              onChange={(e) => setAnimalType(e.target.value)}
            >
              {ANIMAL_TYPES.map((a) => <option key={a}>{a}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-brown mb-1">Count</label>
            <input
              className="w-full border border-brown/30 rounded-lg px-3 py-2 min-h-[44px]"
              placeholder="Count"
              value={count}
              onChange={(e) => setCount(e.target.value)}
              type="number"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-brown mb-1">Appraised Value (stroops)</label>
            <input
              className="w-full border border-brown/30 rounded-lg px-3 py-2 min-h-[44px]"
              placeholder="Appraised value (stroops)"
              value={appraisedValue}
              onChange={(e) => setAppraisedValue(e.target.value)}
              type="number"
            />
          </div>
          <button
            onClick={registerCollateral}
            disabled={loading}
            className="w-full bg-brown text-cream min-h-[44px] rounded-xl font-semibold hover:bg-brown/80 transition disabled:opacity-50"
          >
            {loading ? "Processing…" : "Register & Continue"}
          </button>
        </>
      ) : (
        <>
          <h2 className="text-xl font-semibold text-brown">2. Request Loan</h2>
          <div>
            <label className="block text-sm font-medium text-brown mb-1">Collateral ID</label>
            <input
              className="w-full border border-brown/30 rounded-lg px-3 py-2 min-h-[44px]"
              placeholder="Collateral ID"
              value={collateralId}
              onChange={(e) => setCollateralId(e.target.value)}
              type="number"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-brown mb-1">Loan Amount (stroops)</label>
            <input
              className="w-full border border-brown/30 rounded-lg px-3 py-2 min-h-[44px]"
              placeholder="Loan amount (stroops)"
              value={loanAmount}
              onChange={(e) => setLoanAmount(e.target.value)}
              type="number"
            />
          </div>
          <button
            onClick={requestLoan}
            disabled={loading}
            className="w-full bg-gold text-brown min-h-[44px] rounded-xl font-semibold hover:bg-gold/80 transition disabled:opacity-50"
          >
            {loading ? "Processing…" : "Request Loan"}
          </button>
        </>
      )}
      {status && <p className="text-sm mt-2">{status}</p>}
    </div>
  );
}

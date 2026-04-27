"use client";
import { useState } from "react";
import WalletConnect from "@/components/WalletConnect";
import CollateralCard from "@/components/CollateralCard";
import RepayPanel from "@/components/RepayPanel";
import HealthGauge from "@/components/HealthGauge";
import LoanRepaymentCalculator from "@/components/LoanRepaymentCalculator";

export default function Dashboard() {
  const [wallet, setWallet] = useState<string>("GTESTWALLET1234567890");
  const [loanId, setLoanId] = useState("");
  const [healthFactor, setHealthFactor] = useState<number | null>(null);
  const [repayLoanId, setRepayLoanId] = useState("");
  const [repayAmount, setRepayAmount] = useState("");

  function handleProceedToRepay(nextLoanId: string, nextAmount: string) {
    setRepayLoanId(nextLoanId);
    setRepayAmount(nextAmount);
  }

  async function fetchHealth() {
    if (!loanId) return;
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/api/health/${loanId}`,
    );
    const data = await res.json();
    setHealthFactor(Number(data.health_factor ?? 0));
  }

  return (
    <main className="max-w-2xl mx-auto px-4 py-10">
      <h1 className="text-3xl font-bold text-brown mb-6">Dashboard</h1>
      <WalletConnect onConnect={setWallet} />
      {wallet && (
        <>
          <CollateralCard walletAddress={wallet} />
          <LoanRepaymentCalculator onProceed={handleProceedToRepay} />
          <RepayPanel
            walletAddress={wallet}
            initialLoanId={repayLoanId}
            initialAmount={repayAmount}
          />
          <div className="mt-8 bg-white rounded-2xl p-6 shadow">
            <h2 className="text-xl font-semibold text-brown mb-3">
              Health Factor
            </h2>
            <div className="flex flex-col md:flex-row gap-2">
              <input
                className="border border-brown/30 rounded-lg px-3 py-2 w-full min-h-[44px]"
                placeholder="Loan ID"
                value={loanId}
                onChange={(e) => setLoanId(e.target.value)}
              />
              <button
                onClick={fetchHealth}
                className="bg-gold text-brown font-semibold px-4 min-h-[44px] w-full md:w-auto rounded-lg hover:bg-gold/80 transition"
              >
                Check
              </button>
            </div>
            {healthFactor !== null && <HealthGauge value={healthFactor} />}
          </div>
        </>
      )}
    </main>
  );
}

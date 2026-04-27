"use client";

import { useState } from "react";
import WalletConnect from "@/components/WalletConnect";
import CollateralCard from "@/components/CollateralCard";
import LoanRepaymentCalculator from "@/components/LoanRepaymentCalculator";
import RepayPanel from "@/components/RepayPanel";
import HealthGauge from "@/components/HealthGauge";
import { useHealthFactor } from "@/hooks/use-queries";

export default function Dashboard() {
  const [wallet, setWallet] = useState<string | null>(null);
  const [loanId, setLoanId] = useState("");
  const [repayLoanId, setRepayLoanId] = useState("");
  const [repayAmount, setRepayAmount] = useState("");

  const parsedLoanId = loanId ? Number(loanId) : null;
  const {
    data: healthData,
    isLoading: healthLoading,
    error: healthError,
    refetch: fetchHealth,
  } = useHealthFactor(parsedLoanId);

  function handleProceedToRepay(nextLoanId: string, nextAmount: string) {
    setRepayLoanId(nextLoanId);
    setRepayAmount(nextAmount);
  }

  const healthFactor = healthData?.health_factor ?? null;

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
            <div className="flex gap-2 items-center">
              <input
                className="border border-brown/30 rounded-lg px-3 py-2 flex-1"
                placeholder="Loan ID"
                value={loanId}
                onChange={(e) => setLoanId(e.target.value)}
                type="number"
              />
              <button
                onClick={() => fetchHealth()}
                disabled={healthLoading || !loanId}
                className="bg-gold text-brown font-semibold px-4 py-2 rounded-lg hover:bg-gold/80 transition disabled:opacity-50"
              >
                {healthLoading ? "..." : "Check"}
              </button>
            </div>
            {healthError && (
              <p className="text-sm text-red-600 mt-2">{healthError.message}</p>
            )}
            {healthFactor !== null && !healthError && <HealthGauge value={healthFactor} />}
          </div>
        </>
      )}
    </main>
  );
}

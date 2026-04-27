"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import WalletConnect from "@/components/WalletConnect";
import CollateralCard from "@/components/CollateralCard";
import RepayPanel from "@/components/RepayPanel";
import HealthGauge from "@/components/HealthGauge";
import LoanRepaymentCalculator from "@/components/LoanRepaymentCalculator";
import SkeletonHealthDashboard from "@/components/SkeletonHealthDashboard";
import { useMinLoadingTime } from "@/hooks/useMinLoadingTime";

export default function Dashboard() {
  const router = useRouter();
  const [wallet, setWallet] = useState<string | null>(null);
  const [loanId, setLoanId] = useState("");
  const [activeLoanId, setActiveLoanId] = useState("");
  const [repayLoanId, setRepayLoanId] = useState("");
  const [repayAmount, setRepayAmount] = useState("");
  const [isHealthLoading, withMinLoading] = useMinLoadingTime();

  const { healthFactor, loading, lastUpdated, refresh } = useHealthFactor(activeLoanId);

  function handleProceedToRepay(nextLoanId: string, nextAmount: string) {
    setRepayLoanId(nextLoanId);
    setRepayAmount(nextAmount);
  }

  async function fetchHealth() {
    if (!loanId) return;
    await withMinLoading(async () => {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/health/${loanId}`,
      );
      const data = await res.json();
      setHealthFactor(Number(data.health_factor ?? 0));
    });
  }

  return (
    <main className="max-w-6xl mx-auto px-4 py-10">
      <h1 className="text-3xl font-bold text-brown mb-6">Dashboard</h1>
      <WalletConnect onConnect={setWallet} />
      {wallet && (
        <>
          <CollateralCard
            walletAddress={wallet}
            onRegisterCollateral={() => router.push("/borrow")}
          />
          <LoanRepaymentCalculator
            onProceed={handleProceedToRepay}
            onApplyForLoan={() => router.push("/borrow")}
          />
          <RepayPanel
            walletAddress={wallet}
            initialLoanId={repayLoanId}
            initialAmount={repayAmount}
          />
          {isHealthLoading ? (
            <SkeletonHealthDashboard />
          ) : (
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
                />
                <button
                  onClick={fetchHealth}
                  className="bg-gold text-brown font-semibold px-4 py-2 rounded-lg hover:bg-gold/80 transition"
                >
                  Check
                </button>
              </div>
              {healthFactor !== null && <HealthGauge value={healthFactor} />}
            </div>
          )}
        </>
      )}
    </main>
  );
}

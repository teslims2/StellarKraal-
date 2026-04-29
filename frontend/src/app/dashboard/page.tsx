import { useState } from "react";
import { useRouter } from "next/navigation";
import WalletConnect from "@/components/WalletConnect";
import CollateralCard from "@/components/CollateralCard";
import RepayPanel from "@/components/RepayPanel";
import HealthGauge from "@/components/HealthGauge";
import LoanRepaymentCalculator from "@/components/LoanRepaymentCalculator";
import TransactionHistory from "@/components/TransactionHistory";
import { useHealthFactor } from "@/hooks/useHealthFactor";

export default function Dashboard() {
  const router = useRouter();
  const [wallet, setWallet] = useState<string | null>(null);
  const [loanId, setLoanId] = useState("");
  const [activeLoanId, setActiveLoanId] = useState("");
  
  const { showOnboarding, openOnboarding, closeOnboarding } = useOnboarding();
  const { healthFactor } = useHealthFactor(activeLoanId);

  function handleProceedToRepay(nextLoanId: string, nextAmount: string) {
    // Navigate to repay section or handle repayment flow
    setActiveLoanId(nextLoanId);
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
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-brown">Dashboard</h1>
        <HelpMenu onShowOnboarding={openOnboarding} />
      </div>
      
      <OnboardingModal isOpen={showOnboarding} onClose={closeOnboarding} />
      
      <WalletConnect onConnect={setWallet} />
      {wallet && (
        <>
          <CollateralCard
            walletAddress={wallet}
          />
          <LoanRepaymentCalculator
            onProceed={handleProceedToRepay}
            onApplyForLoan={() => router.push("/borrow")}
          />
          <RepayPanel
            walletAddress={wallet}
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
            {healthFactor !== null && (
              <HealthGauge
                value={healthFactor}
              />
            )}
          </div>
        </>
      )}
    </main>
  );
}

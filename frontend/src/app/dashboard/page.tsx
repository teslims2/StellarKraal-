'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { GlossaryTerm } from '@/components/GlossaryTerm';
import WalletConnect from '@/components/WalletConnect';
import CollateralCard from '@/components/CollateralCard';
import RepayPanel from '@/components/RepayPanel';
import HealthGauge from '@/components/HealthGauge';
import LoanRepaymentCalculator from '@/components/LoanRepaymentCalculator';
import TransactionHistory from '@/components/TransactionHistory';
import SkeletonHealthDashboard from '@/components/SkeletonHealthDashboard';
import ErrorState from '@/components/ErrorState';
import HelpMenu from '@/components/HelpMenu';
import OnboardingModal from '@/components/OnboardingModal';
import Card from '@/components/Card';
import { useHealthFactor } from '@/hooks/useHealthFactor';
import { useOnboarding } from '@/hooks/useOnboarding';

export default function Dashboard() {
  const router = useRouter();
  const [wallet, setWallet] = useState<string | null>(null);
  const [loanId, setLoanId] = useState('');
  const [activeLoanId, setActiveLoanId] = useState('');

  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.search.includes('mockWallet=true')) {
      setWallet('GBXXXXXXMOCKWALLETADDRESSXXXXXX');
    }
  }, []);

  const { showOnboarding, openOnboarding, closeOnboarding } = useOnboarding();
  const {
    healthFactor,
    loading: isHealthLoading,
    error: healthError,
    refresh: refreshHealth,
  } = useHealthFactor(activeLoanId);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  function handleProceedToRepay(nextLoanId: string, _amount: string) {
    setLoanId(nextLoanId);
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl sm:text-3xl font-bold text-brown">Dashboard</h1>
        <HelpMenu onShowOnboarding={openOnboarding} />
      </div>

      <OnboardingModal isOpen={showOnboarding} onClose={closeOnboarding} />

      <WalletConnect onConnect={setWallet} />

      {wallet && (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <CollateralCard walletAddress={wallet} />
            <LoanRepaymentCalculator
              onProceed={handleProceedToRepay}
              onApplyForLoan={() => router.push('/borrow')}
            />
          </div>

          <div className="mt-4">
            <RepayPanel walletAddress={wallet} />
          </div>

          <div className="mt-4">
            <TransactionHistory walletAddress={wallet} />
          </div>

          {isHealthLoading ? (
            <SkeletonHealthDashboard />
          ) : (
            <Card
              className="mt-8"
              header={
                <h2 className="text-xl font-semibold text-brown-700">
                  <GlossaryTerm termKey="healthFactor" />
                </h2>
              }
            >
              <div className="flex items-center gap-2">
                <input
                  className="flex-1 rounded-lg border border-brown-300 px-3 py-2"
                  placeholder="Loan ID"
                  value={loanId}
                  onChange={(e) => setLoanId(e.target.value)}
                />
                <button
                  onClick={() => {
                    setActiveLoanId(loanId);
                    refreshHealth();
                  }}
                  className="rounded-lg bg-gold-500 px-4 py-2 font-semibold text-cream-50 transition hover:bg-gold-600 flex items-center gap-2"
                >
                  Check
                </button>
              </div>
              {healthError && (
                <div className="mt-4">
                  <ErrorState message={healthError} onRetry={refreshHealth} />
                </div>
              )}
              {healthFactor !== null && !healthError && <HealthGauge value={healthFactor} />}
            </Card>
          )}
        </>
      )}

      {/* Repayment history section */}
      <div className="bg-white rounded-2xl p-6 shadow mb-4">
        <h2 className="text-xl font-semibold text-brown mb-1">Repayment History</h2>
        {repayHistory.length > 0 ? (
          <RepayPanel walletAddress={wallet} />
        ) : (
          <RepaymentEmptyState onViewLoans={fetchHealth} />
        )}
      </div>

      {/* Health factor section */}
      <div className="mt-4 bg-white rounded-2xl p-6 shadow">
        <h2 className="text-xl font-semibold text-brown mb-3">Health Factor</h2>
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
        {healthFactor !== null ? (
          <HealthGauge value={healthFactor} />
        ) : (
          <LoansEmptyState onBorrow={() => router.push("/borrow")} />
        )}
      </div>
    </main>
  );
}

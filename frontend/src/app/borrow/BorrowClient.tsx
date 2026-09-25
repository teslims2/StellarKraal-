"use client";
import { useState } from "react";
import dynamic from "next/dynamic";
import LoanForm from "@/components/LoanForm";
import PageTransition from "@/components/PageTransition";
import { Hero } from "@/components/Hero";
import Spinner from "@/components/Spinner";
import ErrorBoundary from "@/components/ErrorBoundary";

// Heavy components loaded lazily to reduce initial JS bundle (#1070)
const WalletConnect = dynamic(() => import("@/components/WalletConnect"), {
  ssr: false,
  loading: () => <Spinner />,
});
const CollateralRegistrationForm = dynamic(
  () => import("@/components/CollateralRegistrationForm"),
  {
    ssr: false,
    loading: () => <Spinner />,
  },
);

export default function BorrowClient() {
  const [wallet, setWallet] = useState<string | null>(null);
  const [collateralId, setCollateralId] = useState<string | null>(null);

  return (
    <PageTransition>
      <Hero className="py-10">
        <main className="max-w-lg mx-auto px-4">
          <h1 className="text-3xl font-bold text-brown mb-6">Borrow</h1>
          <WalletConnect onConnect={setWallet} />
          {wallet && (
            <ErrorBoundary section="Collateral Registration" onRetry={() => {}}>
              <CollateralRegistrationForm
                walletAddress={wallet}
                onSuccess={(id) => setCollateralId(id)}
              />
            </ErrorBoundary>
          )}
          {collateralId && (
            <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-sm text-green-800">
                Collateral registered with ID: {collateralId}
              </p>
            </div>
          )}
          {wallet && collateralId && (
            <LoanForm walletAddress={wallet} initialCollateralId={collateralId} />
          )}
        </main>
      </Hero>
    </PageTransition>
  );
}

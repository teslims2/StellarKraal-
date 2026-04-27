"use client";
import { useState } from "react";
import WalletConnect from "@/components/WalletConnect";
import CollateralCard from "@/components/CollateralCard";
import RepayPanel from "@/components/RepayPanel";
import HealthGauge from "@/components/HealthGauge";

export default function Dashboard() {
  const [wallet, setWallet] = useState<string | null>(null);
  const [loanId, setLoanId] = useState("");
  const [healthFactor, setHealthFactor] = useState<number | null>(null);

  async function fetchHealth() {
    if (!loanId) return;
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/health/${loanId}`);
    const data = await res.json();
    setHealthFactor(Number(data.health_factor ?? 0));
  }

  return (
    <main className="max-w-2xl mx-auto px-token-md py-token-xl">
      <h1 className="text-token-2xl font-bold text-brand-brown mb-token-lg">Dashboard</h1>
      <WalletConnect onConnect={setWallet} />
      {wallet && (
        <>
          <CollateralCard walletAddress={wallet} />
          <RepayPanel walletAddress={wallet} />
          <div className="mt-token-xl bg-surface rounded-token-xl p-token-lg shadow-token">
            <h2 className="text-token-xl font-semibold text-brand-brown mb-token-sm">Health Factor</h2>
            <div className="flex gap-2 items-center">
              <input
                className="border border-brand-brown/30 rounded-token px-token-sm py-2 flex-1"
                placeholder="Loan ID"
                value={loanId}
                onChange={(e) => setLoanId(e.target.value)}
              />
              <button
                onClick={fetchHealth}
                className="bg-brand-gold text-brand-brown font-semibold px-token-md py-2 rounded-token hover:bg-brand-gold/80 transition"
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

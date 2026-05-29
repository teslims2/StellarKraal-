"use client";
import { useState } from "react";
import WalletConnect from "@/components/WalletConnect";
import CollateralCard from "@/components/CollateralCard";
import RepayPanel from "@/components/RepayPanel";
import HealthGauge from "@/components/HealthGauge";
import ThemeToggle from "@/components/ThemeToggle";

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
    <main className="max-w-2xl mx-auto px-4 py-10">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-brown dark:text-cream">Dashboard</h1>
        <ThemeToggle />
      </div>
      <WalletConnect onConnect={setWallet} />
      {wallet && (
        <>
          <CollateralCard walletAddress={wallet} />
          <RepayPanel walletAddress={wallet} />
          <div className="mt-8 bg-white dark:bg-[#1C1008] rounded-2xl p-6 shadow border border-transparent dark:border-gold/20">
            <h2 className="text-xl font-semibold text-brown dark:text-cream mb-3">Health Factor</h2>
            <div className="flex gap-2 items-center">
              <input
                className="border border-brown/30 dark:border-gold/40 rounded-lg px-3 py-2 flex-1 bg-white dark:bg-[#2A1A08] text-brown dark:text-cream placeholder:text-brown/40 dark:placeholder:text-cream/40 focus:outline-none focus:ring-2 focus:ring-gold dark:focus:ring-[#F5D060]"
                placeholder="Loan ID"
                value={loanId}
                onChange={(e) => setLoanId(e.target.value)}
              />
              <button
                onClick={fetchHealth}
                className="bg-gold text-brown font-semibold px-4 py-2 rounded-lg hover:opacity-90 transition"
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

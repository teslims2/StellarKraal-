"use client";
import { useState } from "react";
import WalletConnect from "@/components/WalletConnect";
import LoanForm from "@/components/LoanForm";
import ErrorBoundary from "@/components/ErrorBoundary";

export default function Borrow() {
  const [wallet, setWallet] = useState<string | null>(null);
  return (
    <ErrorBoundary section="Borrow">
      <main className="max-w-lg mx-auto px-4 py-10">
        <h1 className="text-3xl font-bold text-brown mb-6">Borrow</h1>
        <WalletConnect onConnect={setWallet} />
        {wallet && <LoanForm walletAddress={wallet} />}
      </main>
    </ErrorBoundary>
  );
}

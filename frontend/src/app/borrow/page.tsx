"use client";
import { useState } from "react";
import WalletConnect from "@/components/WalletConnect";
import LoanForm from "@/components/LoanForm";
import ThemeToggle from "@/components/ThemeToggle";

export default function Borrow() {
  const [wallet, setWallet] = useState<string | null>(null);
  return (
    <main className="max-w-lg mx-auto px-4 py-10">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-brown dark:text-cream">Borrow</h1>
        <ThemeToggle />
      </div>
      <WalletConnect onConnect={setWallet} />
      {wallet && <LoanForm walletAddress={wallet} />}
    </main>
  );
}

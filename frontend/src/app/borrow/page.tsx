"use client";
import { useState } from "react";
import WalletConnect from "@/components/WalletConnect";
import LoanForm from "@/components/LoanForm";

export default function Borrow() {
  const [wallet, setWallet] = useState<string | null>(null);
  return (
    <main className="w-full max-w-lg mx-auto px-4 py-10">
      <h1 className="text-3xl font-bold text-brown mb-6">Borrow</h1>
      <WalletConnect onConnect={setWallet} />
      {wallet && <LoanForm walletAddress={wallet} />}
    </main>
  );
}

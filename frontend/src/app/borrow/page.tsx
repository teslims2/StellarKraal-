"use client";
import { useState } from "react";
import WalletConnect from "@/components/WalletConnect";
import LoanForm from "@/components/LoanForm";

export default function Borrow() {
  const [wallet, setWallet] = useState<string | null>(null);
  return (
    <main className="max-w-lg mx-auto px-token-md py-token-xl">
      <h1 className="text-token-2xl font-bold text-brand-brown mb-token-lg">Borrow</h1>
      <WalletConnect onConnect={setWallet} />
      {wallet && <LoanForm walletAddress={wallet} />}
    </main>
  );
}

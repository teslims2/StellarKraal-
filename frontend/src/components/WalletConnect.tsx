"use client";
import { useState } from "react";
import { isConnected, getAddress, setAllowed } from "@stellar/freighter-api";

interface Props {
  onConnect: (address: string) => void;
}

export default function WalletConnect({ onConnect }: Props) {
  const [address, setAddress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function connect() {
    try {
      const connected = await isConnected();
      if (!connected) {
        await setAllowed();
      }
      const { address: addr } = await getAddress();
      setAddress(addr);
      onConnect(addr);
    } catch (e: any) {
      setError(e.message);
    }
  }

  if (address) {
    return (
      <div className="bg-brand-brown/10 rounded-token-xl px-token-md py-token-sm mb-token-lg text-token-sm font-mono text-brand-brown">
        ✅ {address.slice(0, 8)}…{address.slice(-6)}
      </div>
    );
  }

  return (
    <div className="mb-token-lg">
      <button
        onClick={connect}
        className="bg-brand-brown text-brand-cream px-5 py-2.5 rounded-token-xl font-semibold hover:bg-brand-brown/80 transition"
      >
        Connect Freighter Wallet
      </button>
      {error && <p className="text-status-danger text-token-sm mt-2">{error}</p>}
    </div>
  );
}

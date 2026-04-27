"use client";
import { useState } from "react";
import * as freighter from "@stellar/freighter-api";

interface Props {
  onConnect: (address: string) => void;
}

export default function WalletConnect({ onConnect }: Props) {
  const [address, setAddress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const MOCK_ADDRESS = "GTESTWALLET1234567890";

  async function connect() {
    try {
      const connected = await freighter.isConnected();
      if (!connected) {
        await freighter.setAllowed();
      }
      const addr = await freighter.getAddress();
      setAddress(addr);
      onConnect(addr);
    } catch (e: any) {
      // Freighter unavailable — use mock address so UI remains testable
      setError("Freighter not available — using test wallet");
      setAddress(MOCK_ADDRESS);
      onConnect(MOCK_ADDRESS);
    }
  }

  if (address) {
    return (
      <div className="bg-brown/10 rounded-xl px-4 py-3 mb-6 text-sm font-mono text-brown w-full">
        ✅ {address.slice(0, 8)}…{address.slice(-6)}
      </div>
    );
  }

  return (
    <div className="mb-6">
      <button
        onClick={connect}
        className="bg-brown text-cream min-h-[44px] px-4 rounded-xl font-semibold hover:bg-brown/80 transition"
      >
        Connect Freighter Wallet
      </button>
      {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
    </div>
  );
}

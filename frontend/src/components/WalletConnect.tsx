"use client";
import { useState } from "react";
import { isConnected, getAddress, setAllowed } from "@stellar/freighter-api";
import { colors } from "@/lib/design-tokens";

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
      <div className={`${colors.status.success.bg} rounded-xl px-4 py-3 mb-6 text-sm font-mono ${colors.status.success.text}`}>
        ✅ {address.slice(0, 8)}…{address.slice(-6)}
      </div>
    );
  }

  return (
    <div className="mb-6">
      <button
        onClick={connect}
        className={`${colors.primary.bg} ${colors.primary.text} px-5 py-2.5 rounded-xl font-semibold ${colors.primary.hover} transition ${colors.interactive.focus}`}
      >
        Connect Freighter Wallet
      </button>
      {error && <p className={`${colors.status.error.text} text-sm mt-2`}>{error}</p>}
    </div>
  );
}

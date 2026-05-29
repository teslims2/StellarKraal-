"use client";
import { useState } from "react";

interface Props {
  walletAddress: string;
}

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export default function CollateralCard({ walletAddress }: Props) {
  const [collateralId, setCollateralId] = useState("");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  async function lookup() {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/loan/${collateralId}`);
      setData(await res.json());
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-white dark:bg-[#1C1008] rounded-2xl p-6 shadow border border-transparent dark:border-gold/20 mb-4">
      <h2 className="text-xl font-semibold text-brown dark:text-cream mb-3">Loan Lookup</h2>
      <div className="flex gap-2">
        <input
          className="border border-brown/30 dark:border-gold/40 rounded-lg px-3 py-2 flex-1 bg-white dark:bg-[#2A1A08] text-brown dark:text-cream placeholder:text-brown/40 dark:placeholder:text-cream/40 focus:outline-none focus:ring-2 focus:ring-gold dark:focus:ring-[#F5D060]"
          placeholder="Loan ID"
          value={collateralId}
          onChange={(e) => setCollateralId(e.target.value)}
        />
        <button
          onClick={lookup}
          disabled={loading}
          className="bg-brown dark:bg-gold text-cream dark:text-brown px-4 py-2 rounded-lg hover:opacity-90 transition disabled:opacity-50"
        >
          {loading ? "…" : "Fetch"}
        </button>
      </div>
      {data && (
        <pre className="mt-4 bg-cream dark:bg-[#2A1A08] text-brown dark:text-cream rounded-lg p-3 text-xs overflow-auto border border-brown/10 dark:border-gold/20">
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  );
}

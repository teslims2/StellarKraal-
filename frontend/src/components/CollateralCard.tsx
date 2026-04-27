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
    <div className="bg-surface rounded-token-xl p-token-lg shadow-token mb-token-md">
      <h2 className="text-token-xl font-semibold text-brand-brown mb-token-sm">Loan Lookup</h2>
      <div className="flex gap-2">
        <input
          className="border border-brand-brown/30 rounded-token px-token-sm py-2 flex-1"
          placeholder="Loan ID"
          value={collateralId}
          onChange={(e) => setCollateralId(e.target.value)}
        />
        <button onClick={lookup} disabled={loading} className="bg-brand-brown text-brand-cream px-token-md py-2 rounded-token hover:bg-brand-brown/80 transition disabled:opacity-50">
          {loading ? "…" : "Fetch"}
        </button>
      </div>
      {data && (
        <pre className="mt-token-md bg-surface-muted rounded-token p-token-sm text-token-sm overflow-auto">
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  );
}

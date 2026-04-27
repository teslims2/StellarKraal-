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
    <div className="bg-white rounded-2xl p-6 shadow mb-4">
      <h2 className="text-xl font-semibold text-brown mb-3">Loan Lookup</h2>
      <div className="flex flex-col md:flex-row gap-2">
        <input
          className="border border-brown/30 rounded-lg px-3 py-2 w-full min-h-[44px]"
          placeholder="Loan ID"
          value={collateralId}
          onChange={(e) => setCollateralId(e.target.value)}
        />
        <button onClick={lookup} disabled={loading} className="bg-brown text-cream px-4 min-h-[44px] w-full md:w-auto rounded-lg hover:bg-brown/80 transition disabled:opacity-50">
          {loading ? "…" : "Fetch"}
        </button>
      </div>
      {data && (
        <pre className="mt-4 bg-cream rounded-lg p-3 text-xs overflow-auto">
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  );
}

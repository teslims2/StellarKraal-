"use client";
import { useState } from "react";
import EmptyState from "./EmptyState";
import { EmptyCollateralIllustration } from "./illustrations";

interface Props {
  walletAddress: string;
  onRegisterCollateral?: () => void;
}

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export default function CollateralCard({ walletAddress, onRegisterCollateral }: Props) {
  const [collateralId, setCollateralId] = useState("");
  const [data, setData] = useState<any>(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(false);

  async function lookup() {
    setLoading(true);
    setNotFound(false);
    setData(null);
    try {
      const res = await fetch(`${API}/api/loan/${collateralId}`);
      const json = await res.json();
      if (!json || json.error || res.status === 404) {
        setNotFound(true);
      } else {
        setData(json);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-white rounded-2xl p-6 shadow mb-4">
      <h2 className="text-xl font-semibold text-brown mb-3">Loan Lookup</h2>
      <div className="flex flex-col md:flex-row gap-2">
        <input
          className="w-full border border-brown/30 rounded-lg px-3 py-2 min-h-[44px] md:flex-1"
          placeholder="Loan ID"
          value={collateralId}
          onChange={(e) => setCollateralId(e.target.value)}
        />
        <button
          onClick={lookup}
          disabled={loading}
          className="bg-brown text-cream px-4 py-2 rounded-lg hover:bg-brown/80 transition disabled:opacity-50 w-full md:w-auto min-h-[44px]"
        >
          {loading ? "…" : "Fetch"}
        </button>
      </div>
      {notFound && (
        <EmptyState
          illustration={<EmptyCollateralIllustration />}
          message="No collateral registered"
          ctaLabel="Register Collateral"
          onCta={() => onRegisterCollateral?.()}
        />
      )}
      {data && (
        <pre className="mt-4 bg-cream rounded-lg p-3 text-xs overflow-auto">
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  );
}

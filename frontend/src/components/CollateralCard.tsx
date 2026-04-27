"use client";
import { useState } from "react";
import { useLoan } from "@/hooks/use-queries";

interface Props {
  walletAddress: string;
}

export default function CollateralCard({ walletAddress }: Props) {
  const [collateralId, setCollateralId] = useState("");

  const parsedId = collateralId ? Number(collateralId) : null;
  const { data, isLoading: loading, error } = useLoan(parsedId);

  return (
    <div className="bg-white rounded-2xl p-6 shadow mb-4">
      <h2 className="text-xl font-semibold text-brown mb-3">Loan Lookup</h2>
      <div className="flex gap-2">
        <input
          className="border border-brown/30 rounded-lg px-3 py-2 flex-1"
          placeholder="Loan ID"
          value={collateralId}
          onChange={(e) => setCollateralId(e.target.value)}
          type="number"
        />
        <div className="bg-brown text-cream px-4 py-2 rounded-lg min-w-[80px] text-center">
          {loading ? "…" : "Ready"}
        </div>
      </div>
      {error && (
        <p className="text-sm text-red-600 mt-2">{error.message}</p>
      )}
      {data && (
        <pre className="mt-4 bg-cream rounded-lg p-3 text-xs overflow-auto">
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  );
}

"use client";
import { useState } from "react";
import { useMinLoadingTime } from "@/hooks/useMinLoadingTime";
import SkeletonCollateralCard from "./SkeletonCollateralCard";

interface Props {
  walletAddress: string;
  onRegisterCollateral?: () => void;
}

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export default function CollateralCard({ walletAddress, onRegisterCollateral }: Props) {
  const [collateralId, setCollateralId] = useState("");
  const [data, setData] = useState<any>(null);
  const [isLoading, withMinLoading] = useMinLoadingTime();

  async function lookup() {
    await withMinLoading(async () => {
      const res = await fetch(`${API}/api/loan/${collateralId}`);
      setData(await res.json());
    });
  }

  if (isLoading) return <SkeletonCollateralCard />;

  return (
    <div className="bg-white rounded-2xl p-6 shadow mb-4">
      <h2 className="text-xl font-semibold text-brown mb-3">Loan Lookup</h2>
      <div className="flex gap-2">
        <input
          className="border border-brown/30 rounded-lg px-3 py-2 flex-1"
          placeholder="Loan ID"
          value={collateralId}
          onChange={(e) => setCollateralId(e.target.value)}
        />
        <button
          onClick={lookup}
          disabled={isLoading}
          className="bg-brown text-cream px-4 py-2 rounded-lg hover:bg-brown/80 transition disabled:opacity-50"
        >
          Fetch
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

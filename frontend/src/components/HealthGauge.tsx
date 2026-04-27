"use client";
import { healthColor } from "@/lib/stellarUtils";

interface Props {
  value: number; // bps, 10_000 = 1.0
  loading?: boolean;
  lastUpdated?: Date | null;
  onRefresh?: () => void;
}

export default function HealthGauge({ value, loading, lastUpdated, onRefresh }: Props) {
  const ratio = Math.min(value / 20_000, 1);
  const pct = Math.round(ratio * 100);
  const color = healthColor(value);
  const label = value >= 10_000 ? "Healthy" : "At Risk";
  const showWarning = value > 0 && value < 12_000;

  return (
    <div className="mt-4">
      {showWarning && (
        <div className="mb-3 px-4 py-2 rounded-lg bg-red-50 border border-red-300 text-red-700 text-sm font-medium">
          ⚠️ Health factor is critically low. Your position may be at risk of liquidation.
        </div>
      )}

      <div className="flex justify-between items-center text-sm mb-1">
        <span className="font-semibold" style={{ color }}>{label}</span>
        <span className="text-brown/60">{(value / 10_000).toFixed(2)}x</span>
      </div>

      <div className="w-full bg-brown/10 rounded-full h-4 overflow-hidden">
        <div
          className="h-4 rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>

      <div className="flex justify-between items-center mt-2 text-xs text-brown/50">
        <span>
          {lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString()}` : ""}
        </span>
        {onRefresh && (
          <button
            onClick={onRefresh}
            disabled={loading}
            className="flex items-center gap-1 text-brown/60 hover:text-brown transition disabled:opacity-40"
          >
            <svg
              className={`w-3 h-3 ${loading ? "animate-spin" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        )}
      </div>
    </div>
  );
}

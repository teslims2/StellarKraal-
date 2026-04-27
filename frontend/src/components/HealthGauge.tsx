"use client";
import { healthColor } from "@/lib/stellarUtils";

interface Props {
  value: number; // bps, 10_000 = 1.0
}

export default function HealthGauge({ value }: Props) {
  const ratio = Math.min(value / 20_000, 1); // cap at 200%
  const pct = Math.round(ratio * 100);
  const { text, bg } = healthColor(value);
  const label = value >= 10_000 ? "Healthy" : "At Risk";

  return (
    <div className="mt-token-md">
      <div className="flex justify-between text-token-sm mb-1">
        <span className={`font-semibold ${text}`}>{label}</span>
        <span className="text-brand-brown/60">{(value / 10_000).toFixed(2)}x</span>
      </div>
      <div className="w-full bg-brand-brown/10 rounded-full h-4 overflow-hidden">
        <div
          className={`h-4 rounded-full transition-all duration-500 ${bg}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

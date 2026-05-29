'use client';
import { useEffect, useState } from 'react';

interface Props {
  value: number; // bps, 10_000 = 1.0
}

// SVG arc gauge — half-circle (180°), centre (100,100), radius 80
const CX = 100;
const CY = 100;
const R = 80;
const STROKE = 14;

// Convert angle (0=left, 180=right along bottom arc) to SVG x,y on the circle
function polar(angleDeg: number) {
  const rad = (Math.PI * angleDeg) / 180;
  return {
    x: CX + R * Math.cos(Math.PI - rad),
    y: CY - R * Math.sin(Math.PI - rad),
  };
}

function arcPath(startDeg: number, endDeg: number) {
  const s = polar(startDeg);
  const e = polar(endDeg);
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${s.x} ${s.y} A ${R} ${R} 0 ${large} 0 ${e.x} ${e.y}`;
}

// Zones: 0–50% = danger (red), 50–75% = warning (amber), 75–100% = safe (green)
// Mapped onto 0–180° arc
const ZONES = [
  { from: 0, to: 90, color: '#DC2626' }, // danger
  { from: 90, to: 135, color: '#D97706' }, // warning
  { from: 135, to: 180, color: '#16A34A' }, // safe
];

// Max value we display (200% = 20_000 bps)
const MAX_BPS = 20_000;

function bpsToAngle(bps: number) {
  return Math.min(bps / MAX_BPS, 1) * 180;
}

function zoneLabel(bps: number) {
  if (bps >= 15_000) return 'Safe';
  if (bps >= 10_000) return 'Warning';
  return 'Danger';
}

function needleColor(bps: number) {
  if (bps >= 15_000) return '#16A34A';
  if (bps >= 10_000) return '#D97706';
  return '#DC2626';
}

export default function HealthGauge({ value }: Props) {
  const [angle, setAngle] = useState(0);

  // Animate to target angle on mount / value change
  useEffect(() => {
    const id = requestAnimationFrame(() => setAngle(bpsToAngle(value)));
    return () => cancelAnimationFrame(id);
  }, [value]);

  const label = zoneLabel(value);
  const color = needleColor(value);
  const displayValue = (value / 10_000).toFixed(2);

  // Needle tip
  const tip = polar(angle);
  // Needle base (short perpendicular stub at centre)
  const baseAngleRad = (Math.PI * (180 - angle)) / 180;
  const bx = CX + 8 * Math.cos(baseAngleRad + Math.PI / 2);
  const by = CY - 8 * Math.sin(baseAngleRad + Math.PI / 2);
  const bx2 = CX + 8 * Math.cos(baseAngleRad - Math.PI / 2);
  const by2 = CY - 8 * Math.sin(baseAngleRad - Math.PI / 2);

  return (
    <div
      className="mt-4 flex flex-col items-center"
      role="meter"
      aria-label="Health factor gauge"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={MAX_BPS}
    >
      <svg viewBox="20 20 160 90" className="w-full max-w-xs" aria-hidden="true">
        {/* Background track */}
        <path
          d={arcPath(0, 180)}
          fill="none"
          stroke="#e5e7eb"
          strokeWidth={STROKE}
          strokeLinecap="round"
        />

        {/* Colour zones */}
        {ZONES.map((z) => (
          <path
            key={z.from}
            d={arcPath(z.from, z.to)}
            fill="none"
            stroke={z.color}
            strokeWidth={STROKE}
            opacity={0.25}
          />
        ))}

        {/* Active fill arc */}
        {angle > 0 && (
          <path
            d={arcPath(0, angle)}
            fill="none"
            stroke={color}
            strokeWidth={STROKE}
            strokeLinecap="round"
            style={{ transition: 'd 0.6s ease-out' }}
          />
        )}

        {/* Needle */}
        <polygon
          points={`${tip.x},${tip.y} ${bx},${by} ${bx2},${by2}`}
          fill={color}
          style={{ transition: 'all 0.6s ease-out' }}
        />
        <circle cx={CX} cy={CY} r={5} fill={color} />
      </svg>

      {/* Numeric value + label */}
      <div className="mt-1 text-center">
        <span className="text-2xl font-bold" style={{ color }} data-testid="gauge-value">
          {displayValue}x
        </span>
        <span className="ml-2 text-sm font-medium" style={{ color }} data-testid="gauge-label">
          {label}
        </span>
      </div>

      {/* Zone legend */}
      <div className="mt-2 flex gap-4 text-xs text-gray-500">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-4 rounded" style={{ background: '#DC2626' }} />
          Danger &lt;1.0x
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-4 rounded" style={{ background: '#D97706' }} />
          Warning 1.0–1.5x
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-4 rounded" style={{ background: '#16A34A' }} />
          Safe &gt;1.5x
        </span>
      </div>
    </div>
  );
}

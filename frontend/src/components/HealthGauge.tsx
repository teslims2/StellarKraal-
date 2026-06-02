'use client';
import { useEffect, useState } from 'react';
import { healthColor } from '@/lib/design-tokens';

interface Props {
  value: number; // bps, 10_000 = 1.0
}

const CX = 100;
const CY = 100;
const R = 80;

/** Convert a 0-1 ratio on a 180° half-circle to an SVG point. */
function arcPoint(ratio: number): [number, number] {
  // 0 = left (180°), 1 = right (0°) — sweep left-to-right
  const angle = Math.PI - ratio * Math.PI;
  return [CX + R * Math.cos(angle), CY - R * Math.sin(angle)];
}

/** Build a semicircular arc path from ratio `a` to `b`. */
function arcPath(a: number, b: number): string {
  const [x1, y1] = arcPoint(a);
  const [x2, y2] = arcPoint(b);
  const large = b - a > 0.5 ? 1 : 0;
  return `M ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2}`;
}

const ZONES = [
  { from: 0, to: 0.5, color: '#DC2626' }, // danger  (0–1.0x)
  { from: 0.5, to: 0.75, color: '#D97706' }, // warning (1.0–1.5x)
  { from: 0.75, to: 1, color: '#16A34A' }, // safe    (1.5–2.0x)
];

export default function HealthGauge({ value }: Props) {
  // ratio: 0 = 0x health factor, 1 = 2.0x (20_000 bps)
  const targetRatio = Math.min(Math.max(value / 20_000, 0), 1);
  const [ratio, setRatio] = useState(0);

  // Animate from 0 to target on mount / value change
  useEffect(() => {
    const id = requestAnimationFrame(() => setRatio(targetRatio));
    return () => cancelAnimationFrame(id);
  }, [targetRatio]);

  const color = healthColor(value);
  const label = value >= 15_000 ? 'Safe' : value >= 10_000 ? 'Warning' : 'Danger';

  // Needle tip
  const [nx, ny] = arcPoint(ratio);
  // Needle base is slightly offset from centre
  const baseAngle = Math.PI - ratio * Math.PI;
  const bx = CX + 8 * Math.cos(baseAngle + Math.PI / 2);
  const by = CY - 8 * Math.sin(baseAngle + Math.PI / 2);
  const bx2 = CX + 8 * Math.cos(baseAngle - Math.PI / 2);
  const by2 = CY - 8 * Math.sin(baseAngle - Math.PI / 2);

  return (
    <div
      className="mt-4 flex flex-col items-center"
      role="img"
      aria-label={`Health factor ${(value / 10_000).toFixed(2)}x — ${label}`}
    >
      <svg viewBox="0 0 200 110" className="w-full max-w-xs" aria-hidden="true">
        {/* Background track */}
        <path
          d={arcPath(0, 1)}
          fill="none"
          stroke="#E5E7EB"
          strokeWidth={14}
          strokeLinecap="butt"
        />
        {/* Colour zones */}
        {ZONES.map((z) => (
          <path
            key={z.color}
            d={arcPath(z.from, z.to)}
            fill="none"
            stroke={z.color}
            strokeWidth={14}
            strokeLinecap="butt"
            opacity={0.25}
          />
        ))}
        {/* Active fill up to current value */}
        {ratio > 0 && (
          <path
            d={arcPath(0, ratio)}
            fill="none"
            stroke={color}
            strokeWidth={14}
            strokeLinecap="round"
            style={{ transition: 'all 600ms cubic-bezier(.4,0,.2,1)' }}
          />
        )}
        {/* Needle */}
        <polygon
          points={`${nx},${ny} ${bx},${by} ${bx2},${by2}`}
          fill={color}
          style={{ transition: 'all 600ms cubic-bezier(.4,0,.2,1)' }}
        />
        <circle cx={CX} cy={CY} r={6} fill={color} />
        {/* Value label */}
        <text x={CX} y={CY + 22} textAnchor="middle" fontSize={15} fontWeight="700" fill={color}>
          {(value / 10_000).toFixed(2)}x
        </text>
        {/* Zone labels */}
        <text x={22} y={106} fontSize={9} fill="#DC2626" textAnchor="middle">
          Danger
        </text>
        <text x={CX} y={24} fontSize={9} fill="#D97706" textAnchor="middle">
          Warning
        </text>
        <text x={178} y={106} fontSize={9} fill="#16A34A" textAnchor="middle">
          Safe
        </text>
      </svg>
      <span className="text-sm font-semibold" style={{ color }}>
        {label}
      </span>
    </div>
  );
}

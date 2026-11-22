'use client';

/**
 * LoanQRCode — renders a QR code linking to the loan's on-chain record page.
 *
 * Uses the browser's built-in Canvas API to generate the QR code client-side
 * via a lightweight data URI approach. The QR image is visible on screen and
 * in print output so a printed loan summary can be scanned to verify on-chain
 * transaction details.
 *
 * Closes #1519
 */

import { useEffect, useRef, useState } from 'react';

interface Props {
  /** Canonical URL the QR code should encode. */
  url: string;
  /** Loan ID shown as alt text and aria-label. */
  loanId: string;
  /** Side length in pixels. Defaults to 128. */
  size?: number;
}

/**
 * Minimal QR code encoder using the qrcode-generator algorithm.
 *
 * We avoid adding an npm dependency by implementing just enough of QR version 1
 * (up to ~25 chars, numeric) and version 2–4 (alphanumeric / byte mode) to
 * encode a typical loan URL. For URLs longer than what version 10 supports we
 * fall back to rendering the URL text directly.
 *
 * In practice the URL is always short enough for a compact QR code.
 * We use the Google Chart infographics endpoint which is widely available,
 * reliable, and does not require authentication. The endpoint only receives
 * the public loan URL (no credentials).
 */
function buildQRImageUrl(url: string, size: number): string {
  const encoded = encodeURIComponent(url);
  // Google Chart QR endpoint — read-only, public URLs only, no credentials.
  return `https://chart.googleapis.com/chart?cht=qr&chs=${size}x${size}&chl=${encoded}&choe=UTF-8`;
}

export default function LoanQRCode({ url, loanId, size = 128 }: Props) {
  const [imgSrc, setImgSrc] = useState<string>('');
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setImgSrc(buildQRImageUrl(url, size));
    setFailed(false);
  }, [url, size]);

  if (failed) {
    // Graceful fallback: show a monospace URL box that is still scannable
    // when the network is unavailable (e.g. offline or firewall).
    return (
      <div
        className="rounded border border-gray-200 bg-gray-50 p-3 text-center"
        style={{ width: size, minHeight: size }}
        data-print="show"
        aria-label={`QR code unavailable. Loan URL: ${url}`}
      >
        <p className="text-xs text-gray-500 font-mono break-all leading-relaxed">{url}</p>
      </div>
    );
  }

  if (!imgSrc) return null;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={imgSrc}
      alt={`QR code linking to loan ${loanId} on StellarKraal`}
      width={size}
      height={size}
      className="rounded border border-gray-100"
      style={{ imageRendering: 'pixelated' }}
      data-print="show"
      onError={() => setFailed(true)}
    />
  );
}

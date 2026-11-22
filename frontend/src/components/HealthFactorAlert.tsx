'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

/**
 * HealthFactorAlert — warning/critical banners for the loan detail page.
 *
 * Closes #1515. Acceptance criteria:
 *  - Amber warning banner when loan state is 'at_risk' (HF < 1.2).
 *  - Red critical banner when HF drops below liquidation threshold (< 1.0).
 *  - Banners include a direct link to the repayment flow with outstanding pre-filled.
 *  - Banners dismissible per session but re-appear on next visit if loan remains at risk.
 *
 * Value convention: healthFactor is passed as a decimal (e.g. 1.15), NOT bps.
 */

interface Props {
  /** Health factor as a decimal (e.g. 1.15 means 115% collateralisation). */
  healthFactor: number;
  /** Loan ID — used to build the repayment URL and to scope the session-dismiss key. */
  loanId?: string;
  /** Current outstanding amount in stroops. Pre-fills the repayment flow when provided. */
  outstanding?: number;
}

const WARNING_THRESHOLD = 1.2;
const CRITICAL_THRESHOLD = 1.0;

function dismissKey(loanId: string, severity: 'warning' | 'critical') {
  return `hf_alert_dismissed:${loanId}:${severity}`;
}

function repayUrl(loanId?: string, outstanding?: number): string {
  const base = loanId ? `/loans/${loanId}/repay` : '/loans';
  if (outstanding !== undefined && outstanding > 0) {
    return `${base}?amount=${outstanding}`;
  }
  return base;
}

export default function HealthFactorAlert({ healthFactor, loanId, outstanding }: Props) {
  const isCritical = healthFactor < CRITICAL_THRESHOLD;
  const isAtRisk = healthFactor < WARNING_THRESHOLD;

  // Per-session dismissal keyed by loanId + severity.
  // Falls back to in-memory state when no loanId is provided (e.g. in tests).
  const severity = isCritical ? 'critical' : 'warning';
  const storageKey = loanId ? dismissKey(loanId, severity) : null;

  const [dismissed, setDismissed] = useState(false);

  // Read sessionStorage only on the client to avoid SSR mismatch.
  useEffect(() => {
    if (!storageKey) return;
    try {
      setDismissed(sessionStorage.getItem(storageKey) === '1');
    } catch {
      // sessionStorage unavailable (private browsing, server rendering).
    }
  }, [storageKey, healthFactor]); // re-run when healthFactor changes — a worsening position should un-dismiss

  if (!isAtRisk) return null;
  if (dismissed) return null;

  function handleDismiss() {
    setDismissed(true);
    if (storageKey) {
      try {
        sessionStorage.setItem(storageKey, '1');
      } catch {
        // sessionStorage unavailable — dismiss is in-memory only for this render.
      }
    }
  }

  const href = repayUrl(loanId, outstanding);

  return (
    <div
      role="alert"
      aria-live="assertive"
      aria-atomic="true"
      data-testid={isCritical ? 'hf-critical-alert' : 'hf-warning-banner'}
      className={`flex items-start gap-3 rounded-2xl border p-4 ${
        isCritical
          ? 'border-red-400 bg-red-50 text-red-900 dark:border-red-700 dark:bg-red-950/40 dark:text-red-100'
          : 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100'
      }`}
    >
      {/* Icon */}
      <span
        aria-hidden="true"
        className={`mt-0.5 flex-shrink-0 text-xl ${isCritical ? 'text-red-500' : 'text-amber-500'}`}
      >
        {isCritical ? '🚨' : '⚠️'}
      </span>

      <div className="min-w-0 flex-1">
        <p className="font-semibold text-sm leading-snug">
          {isCritical
            ? 'Critical: Liquidation Imminent'
            : 'Warning: Health Factor Below Safe Level'}
        </p>
        <p className="mt-1 text-sm opacity-90">
          {isCritical ? (
            <>
              Your health factor is{' '}
              <strong>{healthFactor.toFixed(2)}x</strong> — below 1.0. The loan is eligible for
              liquidation. Repay immediately or add collateral to protect your position.
            </>
          ) : (
            <>
              Your health factor is{' '}
              <strong>{healthFactor.toFixed(2)}x</strong> — below the safe threshold of 1.2x.
              Consider repaying part of the loan or adding collateral to reduce liquidation risk.
            </>
          )}
        </p>

        {/* Direct repayment action link — closes #1515 */}
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Link
            href={href}
            className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 ${
              isCritical
                ? 'bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-500'
                : 'bg-amber-500 text-white hover:bg-amber-600 focus-visible:ring-amber-400'
            }`}
            aria-label={
              outstanding !== undefined
                ? `Repay ${(outstanding / 1e7).toFixed(2)} XLM now`
                : 'Go to repayment'
            }
          >
            <svg
              aria-hidden="true"
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-4-4l4 4 4-4M5 21h14" />
            </svg>
            {outstanding !== undefined
              ? `Repay ${(outstanding / 1e7).toFixed(2)} XLM`
              : 'Repay now'}
          </Link>
        </div>
      </div>

      {/* Dismiss button — per-session, re-appears on next visit */}
      <button
        type="button"
        aria-label="Dismiss this alert for this session"
        onClick={handleDismiss}
        className={`ml-auto flex-shrink-0 rounded-lg p-1 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 ${
          isCritical
            ? 'text-red-400 hover:bg-red-100 focus-visible:ring-red-400 dark:hover:bg-red-900/40'
            : 'text-amber-400 hover:bg-amber-100 focus-visible:ring-amber-400 dark:hover:bg-amber-900/40'
        }`}
      >
        <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
          <path
            fillRule="evenodd"
            d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
            clipRule="evenodd"
          />
        </svg>
      </button>
    </div>
  );
}

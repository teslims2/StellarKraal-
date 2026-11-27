"use client";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { signTransaction } from "@/lib/freighterClient";
import { submitSignedXdr } from "@/lib/stellarUtils";
import { invalidateLoans, throwIfNotOk } from "@/lib/api";
import { classifyApiError } from "@/lib/apiErrorToast";
import Tooltip from "@/components/Tooltip";
import { colors } from "@/lib/design-tokens";
import Card from "@/components/Card";
import Spinner from "@/components/Spinner";
import { useToast } from "@/components/toast";
import { useNetworkMismatch } from "@/hooks/useNetworkMismatch";
import { useTransactionStatus } from "@/hooks/useTransactionStatus";
import TransactionProgress from "@/components/TransactionProgress";

interface Props {
  walletAddress: string;
  /** Pre-fill the loan ID field (e.g. from the calculator panel) */
  initialLoanId?: string;
  /** Pre-fill the amount field (stroops) */
  initialAmount?: string;
}

type RepayMode = "partial" | "full";

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

/** Estimated network fee in stroops for a single repayment transaction. */
const ESTIMATED_FEE_STROOPS = 100;

/**
 * Projects the health factor after repaying `repayAmount` stroops.
 *
 * Uses a simplified linear model: repaying debt reduces the debt component of
 * the health factor proportionally. When the full outstanding balance is
 * repaid the position is closed and the health factor is reported as Infinity.
 * Returns null when there is not enough data to compute a projection.
 */
function projectHealthFactor(
  currentHealthFactor: number | null,
  outstanding: number | null,
  repayAmount: number
): number | null {
  if (currentHealthFactor == null || outstanding == null || outstanding <= 0) return null;
  if (repayAmount <= 0) return currentHealthFactor;
  if (repayAmount >= outstanding) return Infinity;
  // healthFactor = collateralValue / debtValue; debt shrinks by the repaid share.
  const remainingShare = (outstanding - repayAmount) / outstanding;
  return currentHealthFactor / remainingShare;
}

function formatHealthFactor(hf: number | null): string {
  if (hf == null) return "—";
  if (!Number.isFinite(hf)) return "∞";
  return hf.toFixed(2);
}

function formatStroops(stroops: number | null): string {
  if (stroops == null) return "—";
  return (stroops / 10_000_000).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 7,
  });
}

export default function RepayPanel({ walletAddress, initialLoanId, initialAmount }: Props) {
  const router = useRouter();
  const [loanId, setLoanId] = useState(initialLoanId ?? "");
  const [amount, setAmount] = useState(initialAmount ?? "");
  const [mode, setMode] = useState<RepayMode>("partial");
  const [confirming, setConfirming] = useState(false);
  const [loanDetails, setLoanDetails] = useState<{
    outstanding: number | null;
    minimumRepayment: number | null;
    healthFactor: number | null;
  }>({ outstanding: null, minimumRepayment: null, healthFactor: null });
  const [loadingDetails, setLoadingDetails] = useState(false);
=======
  /**
   * `submitting` tracks whether a repayment request is in-flight.
   *
   * — Closes #1204: the submit button is disabled immediately on the first
   *   click and stays disabled until the network response (success OR error)
   *   arrives, preventing duplicate submissions.
   * — On error, `submitting` is set back to false so the user can retry.
   */
  const [submitting, setSubmitting] = useState(false);
  const [pendingHash, setPendingHash] = useState<string | null>(null);
  const [pendingError, setPendingError] = useState<string | null>(null);
  const [isStickyVisible, setIsStickyVisible] = useState(false);
  const toast = useToast();
  const networkMismatch = useNetworkMismatch(walletAddress);
  const mainButtonRef = useRef<HTMLButtonElement>(null);

  // Fetch outstanding balance, minimum repayment and current health factor
  // whenever the loan ID changes so the preview can be computed live.
  useEffect(() => {
    const parsedId = parseInt(loanId, 10);
    if (!loanId || Number.isNaN(parsedId)) {
      setLoanDetails({ outstanding: null, minimumRepayment: null, healthFactor: null });
      return;
    }
    let cancelled = false;
    setLoadingDetails(true);
    (async () => {
      try {
        const res = await fetch(`${API}/api/loan/${parsedId}`);
        await throwIfNotOk(res);
        const data = await res.json();
        if (cancelled) return;
        setLoanDetails({
          outstanding: typeof data.outstanding === "number" ? data.outstanding : null,
          minimumRepayment: typeof data.minimum_repayment === "number" ? data.minimum_repayment : null,
          healthFactor: typeof data.health_factor === "number" ? data.health_factor : null,
        });
      } catch {
        if (!cancelled) {
          setLoanDetails({ outstanding: null, minimumRepayment: null, healthFactor: null });
        }
      } finally {
        if (!cancelled) setLoadingDetails(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loanId]);

  const parsedAmount = parseInt(amount, 10);
  const repayAmount = Number.isNaN(parsedAmount) ? 0 : parsedAmount;
  const projectedHealthFactor = projectHealthFactor(
    loanDetails.healthFactor,
    loanDetails.outstanding,
    repayAmount
  );
  const belowMinimum =
    loanDetails.minimumRepayment != null &&
    repayAmount > 0 &&
    repayAmount < loanDetails.minimumRepayment;
  const exceedsOutstanding =
    loanDetails.outstanding != null && repayAmount > loanDetails.outstanding;

  function selectMode(next: RepayMode) {
    setMode(next);
    if (next === "full" && loanDetails.outstanding != null) {
      setAmount(String(loanDetails.outstanding));
    }
  }

  function requestConfirmation() {
    if (submitting) return;
    if (!loanId || repayAmount <= 0) {
      toast.error("Enter a loan ID and a repayment amount.");
      return;
    }
    if (belowMinimum) {
      toast.error("Amount is below the minimum repayment.");
      return;
    }
    if (exceedsOutstanding) {
      toast.error("Amount exceeds the outstanding balance.");
      return;
    }
    setConfirming(true);
  }

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        // Show sticky bar when main button is not intersecting (out of view)
        setIsStickyVisible(!entry.isIntersecting);
      },
      { threshold: 0 }
    );

    if (mainButtonRef.current) {
      observer.observe(mainButtonRef.current);
    }

    return () => observer.disconnect();
  }, []);

  /**
   * Repayment handler — closes #1204.
   *
   * The button is disabled immediately on click via `submitting` state.
   * The finally-block resets `submitting` to false on both success and error,
   * so the user can retry after a failure.
   */
  async function repay() {
    // Guard: ignore if already in-flight (e.g. keyboard-Enter spamming)
    if (submitting) return;

    setConfirming(false);
    setSubmitting(true);
    setPendingError(null);
    try {
      const idempotencyKey =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

      const res = await fetch(`${API}/api/loan/repay`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({
          borrower: walletAddress,
          loan_id: parseInt(loanId, 10),
          amount: parseInt(amount, 10),
        }),
      });
      await throwIfNotOk(res);
      const { xdr } = await res.json();
      const { signedTxXdr } = await signTransaction(xdr, {
        network: process.env.NEXT_PUBLIC_NETWORK || 'TESTNET',
      });
      const hash = await submitSignedXdr(signedTxXdr);
      setPendingHash(hash);
      invalidateLoans();
    } catch (e) {
      const { variant, message } = classifyApiError(e);
      toast[variant](message);
      // Re-enable the button on error so the user can retry — closes #1204
    } finally {
      setSubmitting(false);
    }
  }

  function handleTxTerminal(status: "confirmed" | "failed", errorCode?: string) {
    if (status === "confirmed") {
      const repaidAmount = amount;
      const repaidLoanId = loanId;
      toast.success("Repayment submitted successfully!", {
        description: repaidAmount
          ? `${repaidAmount} stroops repaid on loan #${repaidLoanId}.`
          : `Repayment confirmed for loan #${repaidLoanId}.`,
        action: {
          label: "View loan",
          onClick: () => router.push(`/loans/${repaidLoanId}`),
        },
      });
      setLoanId("");
      setAmount("");
      setMode("partial");
      setLoanDetails({ outstanding: null, minimumRepayment: null, healthFactor: null });
    } else if (status === "failed") {
      const msg = errorCode ? `Transaction failed: ${errorCode}` : 'Transaction failed';
      setPendingError(msg);
      toast.error(msg, {
        description: "Your repayment was not completed. Please try again.",
        action: {
          label: "Retry",
          onClick: () => {
            void repay();
          },
        },
      });
    }
    setPendingHash(null);
  }

  const transactionStatus = useTransactionStatus(pendingHash, {
    interval: 3000,
    onTerminal: handleTxTerminal,
  });

  function scrollToForm() {
    mainButtonRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  /** The button is disabled when a submission is in-flight or the network is wrong. */
  const isButtonDisabled = submitting || networkMismatch;

  return (
    <>
      <Card
        className="mb-4"
        header={<h2 className={`text-xl font-semibold ${colors.text.primary}`}>Repay Loan</h2>}
      >
        <div className="space-y-3 pb-4">
          <input
            className={`w-full ${colors.form.input} rounded-lg px-3 py-2 ${colors.text.primary} ${colors.form.placeholder}`}
            placeholder="Loan ID"
            value={loanId}
            onChange={(e) => setLoanId(e.target.value)}
            type="number"
            disabled={submitting}
            aria-label="Loan ID"
          />
          {/* Outstanding balance & minimum repayment — prominently displayed */}
          <div className="grid grid-cols-2 gap-3" aria-live="polite">
            <div className={`rounded-lg px-3 py-2 ${colors.form.input}`}>
              <p className={`text-xs ${colors.text.secondary}`}>Outstanding balance</p>
              <p className={`text-sm font-semibold ${colors.text.primary}`}>
                {loadingDetails ? "Loading…" : formatStroops(loanDetails.outstanding)}
              </p>
            </div>
            <div className={`rounded-lg px-3 py-2 ${colors.form.input}`}>
              <p className={`text-xs ${colors.text.secondary}`}>Minimum repayment</p>
              <p className={`text-sm font-semibold ${colors.text.primary}`}>
                {loadingDetails ? "Loading…" : formatStroops(loanDetails.minimumRepayment)}
              </p>
            </div>
          </div>

          {/* Partial vs full repayment toggle */}
          <div
            className="grid grid-cols-2 gap-2"
            role="radiogroup"
            aria-label="Repayment type"
          >
            <button
              type="button"
              role="radio"
              aria-checked={mode === "partial"}
              onClick={() => selectMode("partial")}
              disabled={submitting}
              className={`py-2 rounded-lg text-sm font-semibold transition ${colors.interactive.focus} ${
                mode === "partial"
                  ? `${colors.secondary.bg} ${colors.secondary.text}`
                  : `${colors.form.input} ${colors.text.primary}`
              }`}
            >
              Partial repayment
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={mode === "full"}
              onClick={() => selectMode("full")}
              disabled={submitting || loanDetails.outstanding == null}
              className={`py-2 rounded-lg text-sm font-semibold transition ${colors.interactive.focus} ${
                mode === "full"
                  ? `${colors.secondary.bg} ${colors.secondary.text}`
                  : `${colors.form.input} ${colors.text.primary}`
              }`}
            >
              Full repayment
            </button>
          </div>

          <input
            className={`w-full ${colors.form.input} rounded-lg px-3 py-2 ${colors.text.primary} ${colors.form.placeholder}`}
            placeholder="Amount (stroops)"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              if (mode === "full") setMode("partial");
            }}
            type="number"
            min={loanDetails.minimumRepayment ?? undefined}
            max={loanDetails.outstanding ?? undefined}
            disabled={submitting}
            aria-label="Repayment amount in stroops"
            aria-describedby="repay-health-preview"
          />

          {/* Live health-factor preview */}
          <div
            id="repay-health-preview"
            className={`rounded-lg px-3 py-2 text-sm ${colors.form.input} ${colors.text.primary}`}
            role="status"
            aria-live="polite"
          >
            <span className={colors.text.secondary}>Projected health factor: </span>
            <span className="font-semibold">{formatHealthFactor(projectedHealthFactor)}</span>
            {loanDetails.healthFactor != null && (
              <span className={`ml-2 text-xs ${colors.text.secondary}`}>
                (current {formatHealthFactor(loanDetails.healthFactor)})
              </span>
            )}
            {belowMinimum && (
              <p className="text-red-600 text-xs mt-1">Amount is below the minimum repayment.</p>
            )}
            {exceedsOutstanding && (
              <p className="text-red-600 text-xs mt-1">Amount exceeds the outstanding balance.</p>
            )}
          </div>

          <Tooltip hint="R — Repay loan">
            {/*
             * #1204: button is disabled immediately on first click (`submitting=true`)
             * and re-enabled only after the response arrives (finally block).
             * aria-disabled mirrors the disabled prop for AT compatibility.
             */}
            <button
              ref={mainButtonRef}
              onClick={requestConfirmation}
              disabled={isButtonDisabled}
              aria-disabled={isButtonDisabled}
              aria-label={submitting ? "Processing repayment…" : "Review repayment"}
              className={`w-full ${colors.secondary.bg} ${colors.secondary.text} py-2.5 rounded-xl font-semibold ${colors.secondary.hover} transition ${colors.interactive.disabled} ${colors.interactive.focus} flex items-center justify-center gap-2`}
            >
              {submitting ? (
                <>
                  <Spinner label="Processing repayment…" />
                  Processing…
                </>
              ) : "Review repayment"}
            </button>
          </Tooltip>
          {pendingHash && <TransactionProgress phase={transactionStatus} hash={pendingHash} error={pendingError} />}
        </div>
      </Card>

      {/* Confirmation step — summarizes amount, new health factor and fee */}
      {confirming && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="repay-confirm-title"
        >
          <div className={`w-full max-w-sm rounded-2xl p-5 space-y-4 bg-white dark:bg-[#1A1005] ${colors.text.primary}`}>
            <h3 id="repay-confirm-title" className="text-lg font-semibold">
              Confirm repayment
            </h3>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className={colors.text.secondary}>Repayment amount</dt>
                <dd className="font-semibold">{formatStroops(repayAmount)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className={colors.text.secondary}>New health factor</dt>
                <dd className="font-semibold">{formatHealthFactor(projectedHealthFactor)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className={colors.text.secondary}>Estimated fee</dt>
                <dd className="font-semibold">{formatStroops(ESTIMATED_FEE_STROOPS)}</dd>
              </div>
            </dl>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={submitting}
                className={`flex-1 py-2.5 rounded-xl font-semibold ${colors.form.input} ${colors.text.primary} ${colors.interactive.focus}`}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={repay}
                disabled={submitting || networkMismatch}
                aria-disabled={submitting || networkMismatch}
                className={`flex-1 ${colors.secondary.bg} ${colors.secondary.text} py-2.5 rounded-xl font-semibold ${colors.secondary.hover} transition ${colors.interactive.disabled} ${colors.interactive.focus} flex items-center justify-center gap-2`}
              >
                {submitting ? (
                  <>
                    <Spinner label="Processing repayment…" />
                    Processing…
                  </>
                ) : "Confirm repayment"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sticky CTA for Mobile */}
      <div
        className={`sm:hidden fixed bottom-0 left-0 right-0 p-4 bg-white dark:bg-[#1A1005] border-t border-brown/10 dark:border-gold/20 shadow-2xl z-50 transition-opacity duration-150 ${isStickyVisible ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
      >
        <button
          onClick={scrollToForm}
          disabled={isButtonDisabled}
          aria-disabled={isButtonDisabled}
          className="w-full bg-gold text-brown py-3 rounded-xl font-bold shadow-md active:scale-[0.98] transition-transform disabled:opacity-50"
        >
          {submitting ? "Processing…" : "Review repayment"}
        </button>
      </div>
    </>
  );
}

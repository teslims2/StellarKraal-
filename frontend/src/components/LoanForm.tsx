'use client';
import { useState } from 'react';
import { signTransaction } from '@/lib/freighterClient';
import { submitSignedXdr } from '@/lib/stellarUtils';
import { colors } from '@/lib/design-tokens';
import Spinner from '@/components/Spinner';
import { useToast } from '@/components/toast';
import { Input, Select, ErrorSummary, toSummaryErrors } from '@/components/ui';
import FieldTooltip from '@/components/FieldTooltip';
import FormSuccess from '@/components/FormSuccess';
import {
  LIMITS,
  fmt,
  validateAppraisedValue,
  validateCollateralId,
  validateCount,
  validateLoanAmount,
} from '@/lib/loanFormValidation';
import { useFetchWithRateLimit } from '@/hooks/useFetchWithRateLimit';
import { useNetworkMismatch } from '@/hooks/useNetworkMismatch';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { useTransactionStatus, type TransactionStatus } from '@/hooks/useTransactionStatus';
import { throwIfNotOk } from '@/lib/api';
import { classifyApiError } from '@/lib/apiErrorToast';

interface Props {
  walletAddress: string;
  initialCollateralId?: string;
}

const ANIMAL_TYPES = ['cattle', 'goat', 'sheep'];
const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

const COLLATERAL_FIELD_IDS = {
  count: 'loan-count',
  appraisedValue: 'loan-appraised-value',
};

const LOAN_FIELD_IDS = {
  collateralId: 'loan-collateral-id',
  loanAmount: 'loan-amount',
  loanAmountSlider: 'loan-amount-slider',
};

type FieldName = 'count' | 'appraisedValue' | 'collateralId' | 'loanAmount';

// ── LTV / health factor model ────────────────────────────────────────────────
// Maximum loan is 70% of collateral value (LTV cap). The slider's lower bound
// is the minimum loan amount; its upper bound is the LTV-derived maximum.
const MAX_LTV = 0.7;
// Health factor = (collateral value × liquidation threshold) / debt.
// A liquidation threshold of 80% means the position is liquidated once debt
// exceeds 80% of collateral value.
const LIQUIDATION_THRESHOLD = 0.8;
// Risk zone boundaries expressed as LTV fractions of the max LTV.
const SAFE_LTV = MAX_LTV * 0.5; // ≤ 35% LTV → safe
const CAUTION_LTV = MAX_LTV * 0.85; // ≤ 59.5% LTV → caution, above → high risk

function healthFactorFor(amount: number, collateralValue: number): number {
  if (amount <= 0) return Infinity;
  return (collateralValue * LIQUIDATION_THRESHOLD) / amount;
}

function riskZoneFor(ltv: number): 'safe' | 'caution' | 'high' {
  if (ltv <= SAFE_LTV) return 'safe';
  if (ltv <= CAUTION_LTV) return 'caution';
  return 'high';
}

const RISK_ZONE_STYLES: Record<'safe' | 'caution' | 'high', { label: string; text: string; dot: string }> = {
  safe: { label: 'Safe', text: 'text-emerald-600 dark:text-emerald-400', dot: 'bg-emerald-500' },
  caution: { label: 'Caution', text: 'text-amber-600 dark:text-amber-400', dot: 'bg-amber-500' },
  high: { label: 'High risk', text: 'text-red-600 dark:text-red-400', dot: 'bg-red-500' },
};

export default function LoanForm({ walletAddress, initialCollateralId }: Props) {
  const [step, setStep] = useState<'collateral' | 'loan'>(
    initialCollateralId ? 'loan' : 'collateral'
  );
  const [animalType, setAnimalType] = useState('cattle');
  const [count, setCount] = useState('');
  const [appraisedValue, setAppraisedValue] = useState('');
  const [collateralId, setCollateralId] = useState(initialCollateralId || '');
  const [loanAmount, setLoanAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitCount, setSubmitCount] = useState(0);
  const [collateralPendingHash, setCollateralPendingHash] = useState<string | null>(null);
  const [loanPendingHash, setLoanPendingHash] = useState<string | null>(null);
  const [pendingError, setPendingError] = useState<string | null>(null);
  const [successLoanId, setSuccessLoanId] = useState<string | null>(null);
  // Fields the user has left at least once — errors show on blur, not on every keystroke.
  const [touched, setTouched] = useState<Partial<Record<FieldName, boolean>>>({});
  const toast = useToast();
  const { retryCountdown, isRateLimited, fetchWithLimit } = useFetchWithRateLimit();
  const networkMismatch = useNetworkMismatch(walletAddress);
  const { isOnline } = useNetworkStatus();

  const collateralErrors = {
    count: validateCount(count),
    appraisedValue: validateAppraisedValue(appraisedValue),
  };
  const loanErrors = {
    collateralId: validateCollateralId(collateralId),
    loanAmount: validateLoanAmount(loanAmount),
  };

  const collateralHasErrors = Object.values(collateralErrors).some(Boolean);
  const loanHasErrors = Object.values(loanErrors).some(Boolean);

  // ── Slider bounds derived from the collateral value ────────────────────────
  const collateralValue = parseInt(appraisedValue, 10);
  const hasCollateralValue = Number.isFinite(collateralValue) && collateralValue > 0;
  const sliderMin = LIMITS.loanMin;
  const sliderMax = hasCollateralValue
    ? Math.max(sliderMin, Math.floor(collateralValue * MAX_LTV))
    : sliderMin;

  const parsedLoanAmount = parseInt(loanAmount, 10);
  const sliderValue = Number.isFinite(parsedLoanAmount)
    ? Math.min(Math.max(parsedLoanAmount, sliderMin), sliderMax)
    : sliderMin;

  const currentLtv = hasCollateralValue ? sliderValue / collateralValue : 0;
  const currentHealthFactor = hasCollateralValue
    ? healthFactorFor(sliderValue, collateralValue)
    : Infinity;
  const currentZone = riskZoneFor(currentLtv);
  const zoneStyle = RISK_ZONE_STYLES[currentZone];

  // Track overlay percentages for the risk zone markers.
  const safePct = (SAFE_LTV / MAX_LTV) * 100;
  const cautionPct = (CAUTION_LTV / MAX_LTV) * 100;

  function handleSliderChange(raw: string) {
    const next = parseInt(raw, 10);
    if (!Number.isFinite(next)) {
      setLoanAmount('');
      return;
    }
    const clamped = Math.min(Math.max(next, sliderMin), sliderMax);
    setLoanAmount(String(clamped));
    markTouched('loanAmount');
  }

  const allErrors: Record<FieldName, string | null> = { ...collateralErrors, ...loanErrors };
  const markTouched = (name: FieldName) => setTouched((t) => ({ ...t, [name]: true }));
  /** Inline error once the field was blurred or the form submitted. */
  const errorFor = (name: FieldName) =>
    touched[name] || submitted ? (allErrors[name] ?? undefined) : undefined;
  /** Success indicator once a blurred field holds a valid value. */
  const validFor = (name: FieldName) => !!touched[name] && !allErrors[name];

  function resetToStart() {
    setSuccessLoanId(null);
    setStep('collateral');
    setCount('');
    setAppraisedValue('');
    setCollateralId('');
    setLoanAmount('');
    setTouched({});
    setSubmitted(false);
  }

  const summaryErrors =
    submitted && step === 'collateral'
      ? toSummaryErrors(collateralErrors, COLLATERAL_FIELD_IDS)
      : submitted && step === 'loan'
        ? toSummaryErrors(loanErrors, LOAN_FIELD_IDS)
        : [];

  async function registerCollateral() {
    setSubmitted(true);
    setSubmitCount((c) => c + 1);
    if (collateralHasErrors) return;

    setLoading(true);
    setPendingError(null);
    try {
      const res = await fetchWithLimit(`${API}/api/collateral/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          owner: walletAddress,
          animal_type: animalType,
          count: parseInt(count),
          appraised_value: parseInt(appraisedValue),
        }),
      });
      await throwIfNotOk(res);
      const { xdr } = await res.json();
      const { signedTxXdr } = await signTransaction(xdr, {
        network: process.env.NEXT_PUBLIC_NETWORK || 'TESTNET',
      });
      const hash = await submitSignedXdr(signedTxXdr);
      setCollateralPendingHash(hash);
      toast.success('Collateral registration submitted', {
        description: `${animalType} × ${parseInt(count).toLocaleString()} · ${parseInt(appraisedValue).toLocaleString()} stroops. Waiting for confirmation…`,
      });
    } catch (e) {
      const { variant, message } = classifyApiError(e);
      toast[variant](message, {
        description: 'Your collateral was not registered. Please try again.',
        action: {
          label: 'Retry',
          onClick: () => {
            void registerCollateral();
          },
        },
      });
    } finally {
      setLoading(false);
    }
  }

  function handleCollateralTxTerminal(status: TransactionStatus, errorCode?: string) {
    if (status === 'confirmed' && collateralPendingHash) {
      toast.success('Collateral confirmed', {
        description: `${animalType} × ${parseInt(count).toLocaleString()} · ${parseInt(appraisedValue).toLocaleString()} stroops. Continue to request your loan.`,
      });
      setSubmitted(false);
      setTouched({});
      setStep('loan');
    } else if (status === 'failed') {
      const msg = errorCode
        ? `Collateral registration failed: ${errorCode}`
        : 'Collateral registration failed. Please try again.';
      setPendingError(msg);
      toast.error(msg, {
        description: 'The transaction did not go through. No collateral was registered.',
        action: {
          label: 'Retry',
          onClick: () => {
            void registerCollateral();
          },
        },
      });
    }
    setCollateralPendingHash(null);
  }

  useTransactionStatus(collateralPendingHash, {
    interval: 3000,
    onTerminal: handleCollateralTxTerminal,
  });

  async function requestLoan() {
    setSubmitted(true);
    setSubmitCount((c) => c + 1);
    if (loanHasErrors) return;

    setLoading(true);
    setPendingError(null);
    try {
      const res = await fetchWithLimit(`${API}/api/loan/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          borrower: walletAddress,
          collateral_id: parseInt(collateralId),
          amount: parseInt(loanAmount),
        }),
      });
      await throwIfNotOk(res);
      const { xdr } = await res.json();
      const { signedTxXdr } = await signTransaction(xdr, {
        network: process.env.NEXT_PUBLIC_NETWORK || 'TESTNET',
      });
      const hash = await submitSignedXdr(signedTxXdr);
      setLoanPendingHash(hash);
      toast.success('Loan request submitted', {
        description: `${parseInt(loanAmount).toLocaleString()} stroops against collateral #${collateralId}. Waiting for confirmation…`,
      });
    } catch (e) {
      const { variant, message } = classifyApiError(e);
      toast[variant](message, {
        description: 'Your loan request was not submitted. Please try again.',
        action: {
          label: 'Retry',
          onClick: () => {
            void requestLoan();
          },
        },
      });
    } finally {
      setLoading(false);
    }
  }

  function handleLoanTxTerminal(status: TransactionStatus, errorCode?: string) {
    if (status === 'confirmed' && loanPendingHash) {
      setSuccessLoanId(loanPendingHash);
      toast.success('Loan requested successfully', {
        description: `${parseInt(loanAmount).toLocaleString()} stroops against collateral #${collateralId}.`,
        action: {
          label: 'View My Loans',
          href: '/loans',
        },
      });
    } else if (status === 'failed') {
      const msg = errorCode
        ? `Loan request failed: ${errorCode}`
        : 'Loan request failed. Please try again.';
      setPendingError(msg);
      toast.error(msg, {
        description: 'The transaction did not go through. No loan was requested.',
        action: {
          label: 'Retry',
          onClick: () => {
            void requestLoan();
          },
        },
      });
    }
    setLoanPendingHash(null);
  }

  useTransactionStatus(loanPendingHash, {
    interval: 3000,
    onTerminal: handleLoanTxTerminal,
  });

  // ── Success state ────────────────────────────────────────────────────────────

  if (successLoanId) {
    return (
      <div className="bg-white dark:bg-[#1C1008] rounded-2xl p-6 shadow border border-transparent dark:border-gold/20 mt-6">
        <FormSuccess
          title="Loan Requested!"
          summary={
            <div className="space-y-1 text-left">
              <p>
                <span className="font-medium">Loan ID:</span>{' '}
                <span data-testid="success-loan-id">{successLoanId}</span>
              </p>
              <p>
                <span className="font-medium">Collateral ID:</span> {collateralId}
              </p>
              <p>
                <span className="font-medium">Amount:</span> {parseInt(loanAmount).toLocaleString()}{' '}
                stroops
              </p>
            </div>
          }
          onSubmitAnother={resetToStart}
          viewDetailsHref="/loans"
          viewDetailsLabel="View My Loans"
        />
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-[#1C1008] rounded-2xl p-6 shadow border border-transparent dark:border-gold/20 mt-6 space-y-4">
      {step === 'collateral' ? (
        <form
          data-onboarding-target="loan"
          noValidate
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void registerCollateral();
          }}
        >
          <h2 className="text-xl font-semibold text-brown-700 dark:text-cream-50">
            1. Register Collateral
          </h2>
          <ErrorSummary errors={summaryErrors} submitCount={submitCount} />
          <Select
            label="Animal Type"
            value={animalType}
            onChange={(e) => setAnimalType(e.target.value)}
            helperText="The type of livestock you are pledging as collateral."
            disabled={loading}
          >
            {ANIMAL_TYPES.map((a) => (
              <option key={a}>{a}</option>
            ))}
          </Select>
          <Input
            id={COLLATERAL_FIELD_IDS.count}
            label="Count"
            type="number"
            placeholder="Number of animals"
            value={count}
            inputMode="numeric"
            min={LIMITS.countMin}
            max={LIMITS.countMax}
            step={1}
            required
            onChange={(e) => setCount(e.target.value)}
            onBlur={() => markTouched('count')}
            error={errorFor('count')}
            success={validFor('count')}
            helperText={`Whole number between ${fmt(LIMITS.countMin)} and ${fmt(LIMITS.countMax)}.`}
            disabled={loading}
          />
          {/* Appraised Value with tooltip — #1095 */}
          <div>
            <div className="flex items-center gap-1 mb-1">
              <label
                htmlFor={COLLATERAL_FIELD_IDS.appraisedValue}
                className="text-sm font-medium text-brown-700"
              >
                Appraised Value (stroops)
              </label>
              <FieldTooltip
                content="Collateral value is the total worth of your animals as determined by the appraiser. Your maximum loan is 70% of this amount."
                label="What is Appraised Value?"
              />
            </div>
            <Input
              id={COLLATERAL_FIELD_IDS.appraisedValue}
              type="number"
              placeholder="Total appraised value"
              value={appraisedValue}
              inputMode="numeric"
              min={LIMITS.appraisedMin}
              step={1}
              required
              onChange={(e) => setAppraisedValue(e.target.value)}
              onBlur={() => markTouched('appraisedValue')}
              error={errorFor('appraisedValue')}
              success={validFor('appraisedValue')}
              helperText="Whole number of stroops (1 XLM = 10,000,000 stroops). You can borrow up to 70% of this."
              disabled={loading}
            />
          </div>
          <button
            type="submit"
            disabled={loading || isRateLimited || networkMismatch || !isOnline}
            aria-disabled={loading || isRateLimited || networkMismatch || !isOnline}
            title={!isOnline ? "You're offline" : undefined}
            className={`w-full ${colors.primary.bg} ${colors.primary.text} py-2.5 rounded-xl font-semibold ${colors.primary.hover} transition ${colors.interactive.disabled} ${colors.interactive.focus} flex items-center justify-center gap-2`}
          >
            {loading ? (
              <>
                <Spinner />
                Processing…
              </>
            ) : isRateLimited ? (
              `Retry in ${retryCountdown}s`
            ) : !isOnline ? (
              "You're offline"
            ) : (
              'Register & Continue'
            )}
          </button>
        </form>
      ) : (
        <>
          <form
            noValidate
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void requestLoan();
            }}
          >
            <h2 className="text-xl font-semibold text-brown-700 dark:text-cream-50">
              2. Request Loan
            </h2>
            <ErrorSummary errors={summaryErrors} submitCount={submitCount} />
            <Input
              id={LOAN_FIELD_IDS.collateralId}
              label="Collateral ID"
              type="number"
              placeholder="Your collateral ID"
              value={collateralId}
              inputMode="numeric"
              min={1}
              step={1}
              required
              onChange={(e) => setCollateralId(e.target.value)}
              onBlur={() => markTouched('collateralId')}
              error={errorFor('collateralId')}
              success={validFor('collateralId')}
              helperText="The numeric ID you received after registering collateral."
              disabled={loading}
            />
            <Input
              id={LOAN_FIELD_IDS.loanAmount}
              label="Loan Amount (stroops)"
              type="number"
              placeholder="Amount to borrow"
              value={loanAmount}
              inputMode="numeric"
              min={LIMITS.loanMin}
              max={hasCollateralValue ? sliderMax : undefined}
              step={1}
              required
              onChange={(e) => setLoanAmount(e.target.value)}
              onBlur={() => markTouched('loanAmount')}
              error={errorFor('loanAmount')}
              success={validFor('loanAmount')}
              helperText={`Whole number of stroops, minimum ${fmt(LIMITS.loanMin)}. Capped at 70% of your collateral value.`}
              disabled={loading}
            />
            {/* Interactive loan amount slider with LTV / health factor preview — #1491 */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label
                  htmlFor={LOAN_FIELD_IDS.loanAmountSlider}
                  className="text-sm font-medium text-brown-700 dark:text-cream-50"
                >
                  Adjust Loan Amount
                </label>
                <span className={`text-xs font-semibold ${zoneStyle.text}`} data-testid="ltv-zone">
                  <span className={`inline-block w-2 h-2 rounded-full mr-1 ${zoneStyle.dot}`} />
                  {zoneStyle.label}
                </span>
              </div>
              <div className="relative">
                {/* Risk zone markers overlaid on the track */}
                <div
                  aria-hidden="true"
                  className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-2 rounded-full overflow-hidden pointer-events-none"
                >
                  <div className="flex h-full w-full">
                    <div className="h-full bg-emerald-400/60" style={{ width: `${safePct}%` }} />
                    <div
                      className="h-full bg-amber-400/60"
                      style={{ width: `${cautionPct - safePct}%` }}
                    />
                    <div className="h-full bg-red-400/60" style={{ width: `${100 - cautionPct}%` }} />
                  </div>
                </div>
                <input
                  id={LOAN_FIELD_IDS.loanAmountSlider}
                  type="range"
                  min={sliderMin}
                  max={sliderMax}
                  step={1}
                  value={sliderValue}
                  onChange={(e) => handleSliderChange(e.target.value)}
                  disabled={loading || !hasCollateralValue}
                  aria-label="Loan amount slider"
                  aria-valuemin={sliderMin}
                  aria-valuemax={sliderMax}
                  aria-valuenow={sliderValue}
                  aria-valuetext={`${fmt(sliderValue)} stroops, ${(currentLtv * 100).toFixed(1)}% LTV`}
                  className="relative w-full appearance-none bg-transparent cursor-pointer accent-brown-600 disabled:cursor-not-allowed disabled:opacity-50"
                />
              </div>
              <div className="flex justify-between text-xs text-brown-500 dark:text-cream-200/60">
                <span>{fmt(sliderMin)}</span>
                <span>{hasCollateralValue ? fmt(sliderMax) : 'Enter collateral value'}</span>
              </div>
              <div
                className="flex items-center justify-between text-xs rounded-lg px-3 py-2 bg-cream-100 dark:bg-[#2A1A0C]"
                role="status"
                aria-live="polite"
              >
                <span className="text-brown-600 dark:text-cream-200/80">
                  LTV:{' '}
                  <span className="font-semibold" data-testid="ltv-value">
                    {hasCollateralValue ? `${(currentLtv * 100).toFixed(1)}%` : '—'}
                  </span>
                </span>
                <span className="text-brown-600 dark:text-cream-200/80">
                  Health Factor:{' '}
                  <span className={`font-semibold ${zoneStyle.text}`} data-testid="health-factor">
                    {hasCollateralValue && Number.isFinite(currentHealthFactor)
                      ? currentHealthFactor.toFixed(2)
                      : '—'}
                  </span>
                </span>
              </div>
            </div>
            <button
              type="submit"
              disabled={loading || isRateLimited || networkMismatch || !isOnline}
              aria-disabled={loading || isRateLimited || networkMismatch || !isOnline}
              title={!isOnline ? "You're offline" : undefined}
              className={`w-full ${colors.secondary.bg} ${colors.secondary.text} py-2.5 rounded-xl font-semibold ${colors.secondary.hover} transition ${colors.interactive.disabled} ${colors.interactive.focus} flex items-center justify-center gap-2`}
            >
              {loading ? (
                <>
                  <Spinner />
                  Processing…
                </>
              ) : isRateLimited ? (
                `Retry in ${retryCountdown}s`
              ) : !isOnline ? (
                "You're offline"
              ) : (
                'Request Loan'
              )}
            </button>
          </form>
          {(collateralPendingHash || loanPendingHash) && (
            <div
              className="mt-3 p-3 rounded-xl text-sm bg-amber-50 border border-amber-200 text-amber-800"
              role="status"
              aria-live="polite"
            >
              <p className="font-medium">Transaction pending confirmation...</p>
              <p className="font-mono text-xs mt-1 break-all">
                {collateralPendingHash || loanPendingHash}
              </p>
              {pendingError && <p className="text-red-600 mt-1">{pendingError}</p>}
            </div>
          )}
        </>
      )}
    </div>
  );
}

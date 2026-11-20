'use client';
import { useState } from 'react';
import { LoanWizardProvider, useWizard, type SubmittedLoan } from '@/context/LoanWizardContext';
import ErrorBoundary from '@/components/ErrorBoundary';
import { Button } from '@/components/ui';
import { formatXlmFromStroops } from '@/lib/formatMoney';
import { useOptionalWalletContext } from '@/context/WalletContext';
import StepCollateral from './steps/StepCollateral';
import StepAmount from './steps/StepAmount';
import StepReview from './steps/StepReview';
import StepConfirm from './steps/StepConfirm';

const STEPS = [
  { number: 1, label: 'Collateral' },
  { number: 2, label: 'Amount' },
  { number: 3, label: 'Review' },
  { number: 4, label: 'Confirm' },
];

interface Props {
  walletAddress: string;
}

function WizardInner({ walletAddress }: Props) {
  const { step, prevStep, reset } = useWizard();
  // Bumped on every retry so the ErrorBoundary's `key` changes and the
  // crashed step remounts cleanly, even when there's no previous step to
  // go back to (#522).
  const [retryKey, setRetryKey] = useState(0);
  const [submitted, setSubmitted] = useState<SubmittedLoan | null>(null);

  // #1509: if the wallet disconnects or the session expires mid-flow, pause
  // the wizard (steps stay mounted, so no progress is lost) and prompt the
  // user to reconnect instead of letting the next RPC/sign call crash.
  const wallet = useOptionalWalletContext();
  const paused = Boolean(wallet?.needsReconnect);

  function handleStepRetry() {
    setRetryKey((k) => k + 1);
    prevStep();
  }

  function handleCancel() {
    setSubmitted(null);
    reset();
  }

  return (
    <div className="bg-white rounded-2xl shadow-lg mt-6 overflow-hidden">
      {/* Progress Header */}
      <div className="bg-cream border-b border-brown/10 px-6 pt-5 pb-4">
        {/* Step label */}
        <div className="flex justify-between items-center mb-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-brown/50">
            Loan Request
          </span>
          <div className="flex items-center gap-3">
            <span className="text-xs font-medium text-brown/60" role="status" aria-live="polite">
              Step {step} of {STEPS.length}
            </span>
            <Button variant="ghost" size="sm" onClick={handleCancel} className="text-xs py-1 px-2">
              Cancel
            </Button>
          </div>
        </div>

        <div
          role="progressbar"
          aria-label="Loan request progress"
          aria-valuemin={1}
          aria-valuemax={STEPS.length}
          aria-valuenow={step}
          aria-valuetext={`Step ${step} of ${STEPS.length}: ${STEPS[step - 1]?.label ?? ''}`}
        >
          <ol className="flex items-center gap-0" aria-label="Loan request steps">
            {STEPS.map(({ number, label }, i) => {
              const isCompleted = step > number;
              const isCurrent = step === number;
              return (
                <li key={number} className="flex items-center flex-1 last:flex-none">
                  {/* Node */}
                  <div className="flex flex-col items-center">
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-all duration-300 ${
                        isCompleted
                          ? 'bg-brown border-brown text-cream'
                          : isCurrent
                            ? 'bg-gold border-gold text-brown'
                            : 'bg-white border-brown/25 text-brown/40'
                      }`}
                    >
                      {isCompleted ? (
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                          <path
                            d="M2 7l4 4 6-7"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      ) : (
                        number
                      )}
                    </div>
                    <span
                      className={`text-xs mt-1 font-medium transition-colors ${
                        isCurrent ? 'text-brown' : isCompleted ? 'text-brown/60' : 'text-brown/30'
                      }`}
                      aria-current={isCurrent ? 'step' : undefined}
                    >
                      {label}
                    </span>
                  </div>

                  {/* Connector line */}
                  {i < STEPS.length - 1 && (
                    <div className="flex-1 h-0.5 mx-1 mb-4 rounded-full overflow-hidden bg-brown/15">
                      <div
                        className="h-full bg-brown transition-all duration-500"
                        style={{ width: step > number ? '100%' : '0%' }}
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      </div>

      {/* Step Content — each step is wrapped in its own ErrorBoundary (#522)
          so a crash in one step doesn't take down the whole wizard. Retry
          navigates back to the previous step (or, on step 1 where there is
          none, simply remounts the step for another attempt). */}
      <div className="relative p-6">
        {paused && wallet && (
          <div
            role="alert"
            data-testid="wizard-paused"
            className="mb-6 rounded-2xl border border-gold bg-cream p-5 text-center"
          >
            <h2 className="text-lg font-bold text-brown">Loan request paused</h2>
            <p className="mt-2 text-sm text-brown/70">
              {wallet.sessionExpired ? 'Your session expired.' : 'Your wallet was disconnected.'}{' '}
              Reconnect to continue — your progress has been saved.
            </p>
            {wallet.reconnectError && (
              <p className="mt-2 text-sm text-red-700">{wallet.reconnectError}</p>
            )}
            <div className="mt-4 flex justify-center">
              <Button
                onClick={() => void wallet.reconnect()}
                disabled={wallet.reconnecting}
                data-testid="wizard-reconnect-btn"
              >
                {wallet.reconnecting ? 'Reconnecting…' : 'Reconnect wallet'}
              </Button>
            </div>
          </div>
        )}
        <div
          inert={paused}
          aria-hidden={paused || undefined}
          className={paused ? 'opacity-40 pointer-events-none select-none' : undefined}
        >
          {submitted && (
            <div
              role="status"
              className="mb-6 rounded-2xl border border-green-200 bg-green-50 p-5 text-center"
            >
              <p className="text-4xl" aria-hidden="true">
                ✅
              </p>
              <h2 className="mt-2 text-2xl font-bold text-brown">Loan Disbursed!</h2>
              <p className="mt-2 text-sm text-brown/60">
                Your loan request has been submitted to the network.
              </p>
              <dl className="mt-4 space-y-2 rounded-xl border border-brown/20 bg-white p-4 text-left text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="font-medium text-green-700">Loan ID</dt>
                  <dd className="break-all font-mono font-semibold text-brown">
                    {submitted.loanId}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-brown/60">Amount received</dt>
                  <dd className="font-semibold text-brown">
                    {formatXlmFromStroops(submitted.amount)}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-brown/60">Due in</dt>
                  <dd className="font-semibold text-brown">{submitted.termDays} days</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-brown/60">Total to repay</dt>
                  <dd className="font-bold text-brown">
                    {formatXlmFromStroops(submitted.totalRepay)}
                  </dd>
                </div>
              </dl>
            </div>
          )}
          {step === 1 && (
            <ErrorBoundary
              key={`collateral-${retryKey}`}
              section="Collateral"
              onRetry={handleStepRetry}
              retryLabel="↻ Try again"
            >
              <StepCollateral walletAddress={walletAddress} />
            </ErrorBoundary>
          )}
          {step === 2 && (
            <ErrorBoundary
              key={`amount-${retryKey}`}
              section="Amount"
              onRetry={handleStepRetry}
              retryLabel="← Back to previous step"
            >
              <StepAmount />
            </ErrorBoundary>
          )}
          {step === 3 && (
            <ErrorBoundary
              key={`review-${retryKey}`}
              section="Review"
              onRetry={handleStepRetry}
              retryLabel="← Back to previous step"
            >
              <StepReview />
            </ErrorBoundary>
          )}
          {step === 4 && (
            <ErrorBoundary
              key={`confirm-${retryKey}`}
              section="Confirm"
              onRetry={handleStepRetry}
              retryLabel="← Back to previous step"
            >
              <StepConfirm walletAddress={walletAddress} onSubmitted={setSubmitted} />
            </ErrorBoundary>
          )}
        </div>
      </div>
    </div>
  );
}

export default function LoanWizard({ walletAddress }: Props) {
  return (
    <LoanWizardProvider walletAddress={walletAddress}>
      <WizardInner walletAddress={walletAddress} />
    </LoanWizardProvider>
  );
}

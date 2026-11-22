'use client';
import { useEffect, useRef, useState, type RefObject } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import ErrorState from '@/components/ErrorState';
import DetailSkeleton from '@/components/DetailSkeleton';
import Breadcrumb from '@/components/Breadcrumb';
import HealthGauge, { SkeletonHealthGauge } from '@/components/HealthGauge';
import HealthFactorAlert from '@/components/HealthFactorAlert';
import RepaymentCountdown from '@/components/RepaymentCountdown';
import { useHealthFactor } from '@/hooks/useHealthFactor';
import PrintButton from '@/components/PrintButton';

// Heavy component — loaded lazily to reduce initial JS bundle (#1070)
const LoanRepaymentCalculator = dynamic(() => import('@/components/LoanRepaymentCalculator'), {
  ssr: false,
  loading: () => <DetailSkeleton />,
});

interface CollateralItem {
  id: string;
  asset: string;
  amount: number;
  value?: number;
}

interface TransactionRecord {
  id: string;
  type: string;
  amount: number;
  timestamp: string;
  txHash?: string;
}

interface LoanRecord {
  id: string;
  borrower: string;
  collateral_id: string;
  amount: number;
  outstanding?: number;
  collateral_value?: number;
  health_factor?: number;
  status: string;
  createdAt: string;
  /** ISO 8601 deadline for repayment, used to drive the countdown timer (closes #1250). */
  repaymentDeadline?: string | null;
  /** Itemised collateral positions backing the loan. */
  collateral?: CollateralItem[];
  /** Lifecycle transaction history (disbursement, repayments, liquidations…). */
  transactions?: TransactionRecord[];
}

type ErrorType = '404' | '403' | 'network' | null;

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

type StickyLoanActionType = 'repay' | 'liquidate';

interface StickyLoanActionProps {
  targetRef: RefObject<HTMLElement | null>;
  action: StickyLoanActionType;
  onAction: () => void;
  disabled?: boolean;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;

  return {
    title: `Loan #${id}`,
    description: `View the terms, collateral details, repayment status, and health factor for loan ${id} on StellarKraal.`,
    alternates: { canonical: `https://stellarkraal.io/loans/${id}` },
    openGraph: {
      title: `Loan #${id} — StellarKraal`,
      description: `Livestock-backed micro-loan ${id}: collateral details, repayment terms, and on-chain status.`,
      url: `https://stellarkraal.io/loans/${id}`,
      images: [
        {
          url: '/og-banner.png',
          width: 1200,
          height: 630,
          alt: `StellarKraal loan #${id}`,
        },
      ],
    },
  };
}

export default function LoanDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [loan, setLoan] = useState<LoanRecord | null>(null);
  const [error, setError] = useState<ErrorType>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [primaryActionReady, setPrimaryActionReady] = useState(false);
  const primaryActionRef = useRef<HTMLButtonElement>(null);

  // Real-time health factor — polls every 30 s, pauses when tab is hidden.
  // loanId is passed as empty string until id is confirmed; hook no-ops on ''.
  const {
    healthFactor,
    loading: hfLoading,
    lastUpdatedLabel,
    hasFetched: hfHasFetched,
  } = useHealthFactor(id ?? '');

  const fetchLoan = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`${API}/api/loans/${id}`);
      if (res.status === 404) {
        setError('404');
        setLoan(null);
      } else if (res.status === 403) {
        setError('403');
        setLoan(null);
      } else if (!res.ok) {
        setError('network');
        setLoan(null);
      } else {
        const data = await res.json();
        setLoan(data.loan ?? data);
        setError(null);
      }
    } catch {
      setError('network');
      setLoan(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLoan();
  }, [id]);

  if (loading) {
    return <DetailSkeleton />;
  }

  if (error === '404') {
    return (
      <main className="max-w-2xl mx-auto px-4 py-10">
        <Link href="/loans" className="text-brown/60 hover:text-brown text-sm mb-6 inline-block">
          ← Back to Loans
        </Link>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20 p-6 text-center">
          <p className="text-5xl mb-4" aria-hidden="true">
            📄
          </p>
          <h1 className="text-2xl font-bold text-brown mb-2">Loan Not Found</h1>
          <p className="text-brown/60 mb-6">
            No loan record exists for ID <code className="bg-brown/10 px-1 rounded">{id}</code>.
          </p>
          <Link
            href="/loans"
            className="inline-block bg-brown text-cream px-5 py-2 rounded-xl font-semibold hover:bg-brown/80 transition focus:outline-none focus:ring-2 focus:ring-brown focus:ring-offset-2"
          >
            ← Back to Loans
          </Link>
        </div>
      </main>
    );
  }

  if (error === '403') {
    return (
      <main className="max-w-2xl mx-auto px-4 py-10">
        <Link href="/loans" className="text-brown/60 hover:text-brown text-sm mb-6 inline-block">
          ← Back to Loans
        </Link>
        <div className="rounded-2xl border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/20 p-6 text-center">
          <p className="text-5xl mb-4" aria-hidden="true">
            🔒
          </p>
          <h1 className="text-2xl font-bold text-brown mb-2">Access Denied</h1>
          <p className="text-brown/60 mb-6">
            You are not authorized to view loan{' '}
            <code className="bg-brown/10 px-1 rounded">{id}</code>.
          </p>
          <Link
            href="/loans"
            className="inline-block bg-brown text-cream px-5 py-2 rounded-xl font-semibold hover:bg-brown/80 transition focus:outline-none focus:ring-2 focus:ring-brown focus:ring-offset-2"
          >
            ← Back to Loans
          </Link>
        </div>
      </main>
    );
  }

  if (error === 'network') {
    return (
      <main className="max-w-2xl mx-auto px-4 py-10">
        <ErrorState message="Could not load loan – check your connection" onRetry={fetchLoan} />
      </main>
    );
  }

  if (!loan) {
    return (
      <main className="max-w-2xl mx-auto px-4 py-10">
        <p className="text-brown/60">No data available</p>
      </main>
    );
  }

  async function copyId() {
    const loanId = loan?.id;
    if (!loanId) return;
    try {
      await navigator.clipboard.writeText(loanId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard unavailable
    }
  }

  return (
    <main
      className={`mx-auto max-w-2xl px-4 py-10 print-header ${loan.status === 'active' ? 'pb-44 sm:pb-10' : ''}`}
      data-print-date={new Date().toLocaleDateString()}
    >
      <Breadcrumb />
      <Link href="/loans" className="text-brown/60 hover:text-brown text-sm mb-6 inline-block">
        ← Back to Loans
      </Link>

      <div className="bg-white rounded-2xl p-6 shadow mb-6">
        <h1 className="text-2xl font-bold text-brown mb-4">Loan #{loan.id}</h1>
        <div className="flex items-center gap-2 mb-4">
          <span className="text-brown/50 text-sm">Loan ID</span>
          <button
            onClick={() => void copyId()}
            aria-label={copied ? 'Loan ID copied' : 'Copy loan ID'}
            title={copied ? 'Copied!' : 'Copy ID'}
            className="shrink-0 text-brown/50 hover:text-brown transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brown rounded"
          >
            {copied ? (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4 text-green-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"
                />
              </svg>
            )}
          </button>
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <dt className="text-brown/50">Borrower</dt>
          <dd className="font-medium text-brown truncate" title={loan.borrower}>
            {loan.borrower.slice(0, 8)}…{loan.borrower.slice(-4)}
          </dd>
          <dt className="text-brown/50">Collateral ID</dt>
          <dd className="font-medium text-brown">{loan.collateral_id}</dd>
          <dt className="text-brown/50">Amount</dt>
          <dd className="font-medium text-brown">{(loan.amount / 1e7).toFixed(2)} XLM</dd>
          <dt className="text-brown/50">Outstanding Balance</dt>
          <dd className="font-medium text-brown">
            {((loan.outstanding ?? loan.amount) / 1e7).toFixed(2)} XLM
          </dd>
          <dt className="text-brown/50">Status</dt>
          <dd className="font-medium text-brown capitalize">{loan.status}</dd>
          <dt className="text-brown/50">Created</dt>
          <dd className="font-medium text-brown">
            {new Date(loan.createdAt).toLocaleDateString()}
          </dd>
        </dl>

        {/* Conditional actions based on loan state */}
        <div className="mt-6 flex flex-wrap gap-3">
          {loan.status === 'active' && (
            <Link
              href={`/loans/${loan.id}/repay`}
              className="inline-block bg-brown text-cream px-5 py-2 rounded-xl font-semibold hover:bg-brown/80 transition focus:outline-none focus:ring-2 focus:ring-brown focus:ring-offset-2"
            >
              Repay
            </Link>
          )}
          {loan.collateral_id && (
            <Link
              href={`/collateral/${loan.collateral_id}`}
              className="inline-block border border-brown/30 text-brown px-5 py-2 rounded-xl font-semibold hover:bg-brown/5 transition focus:outline-none focus:ring-2 focus:ring-brown focus:ring-offset-2"
            >
              View Collateral
            </Link>
          )}
        </div>
      </div>

      {/* Collateral list */}
      <section aria-label="Collateral" className="mb-6" data-testid="collateral-section">
        <div className="bg-white rounded-2xl p-6 shadow">
          <h2 className="text-lg font-semibold text-brown mb-3">Collateral</h2>
          {loan.collateral && loan.collateral.length > 0 ? (
            <ul className="divide-y divide-brown/10">
              {loan.collateral.map((item) => (
                <li key={item.id} className="flex items-center justify-between py-2 text-sm">
                  <span className="font-medium text-brown">{item.asset}</span>
                  <span className="text-brown/60">
                    {(item.amount / 1e7).toFixed(2)}
                    {typeof item.value === 'number' && (
                      <span className="ml-2 text-brown/40">
                        ({(item.value / 1e7).toFixed(2)} XLM)
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-brown/60">
              Collateral ID{' '}
              <code className="bg-brown/10 px-1 rounded">{loan.collateral_id}</code>
            </p>
          )}
        </div>
      </section>

      {/* Transaction history */}
      <section aria-label="Transaction history" className="mb-6" data-testid="transactions-section">
        <div className="bg-white rounded-2xl p-6 shadow">
          <h2 className="text-lg font-semibold text-brown mb-3">Transaction History</h2>
          {loan.transactions && loan.transactions.length > 0 ? (
            <ul className="divide-y divide-brown/10">
              {loan.transactions.map((tx) => (
                <li key={tx.id} className="flex items-center justify-between py-2 text-sm">
                  <div>
                    <span className="font-medium text-brown capitalize">{tx.type}</span>
                    <span className="ml-2 text-brown/40">
                      {new Date(tx.timestamp).toLocaleString()}
                    </span>
                  </div>
                  <span className="text-brown/60">{(tx.amount / 1e7).toFixed(2)} XLM</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-brown/60">No transactions recorded yet.</p>
          )}
        </div>
      </section>

      {loan.status === 'active' && (
        <>
          {/* Repayment countdown timer — closes #1250 */}
          {loan.repaymentDeadline && (
            <RepaymentCountdown
              deadline={loan.repaymentDeadline}
              className="mb-6"
            />
          )}

          {/* Real-time health factor gauge + alert banners */}
          <section aria-label="Health factor" className="mb-6" data-testid="health-factor-section">
            <div className="bg-white rounded-2xl p-6 shadow">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-semibold text-brown">Health Factor</h2>
                {lastUpdatedLabel && (
                  <span
                    className="text-xs text-brown/40"
                    aria-label={`Health factor last updated ${lastUpdatedLabel}`}
                  >
                    Updated {lastUpdatedLabel}
                  </span>
                )}
                {hfLoading && (
                  <span className="text-xs text-brown/40 animate-pulse" aria-live="polite">
                    Refreshing…
                  </span>
                )}
              </div>

              {/* Gauge — show skeleton until first fetch completes */}
              {hfHasFetched && healthFactor !== null ? (
                <HealthGauge
                  value={Math.round(healthFactor * 10_000)}
                  aria-label={`Health factor: ${healthFactor.toFixed(2)}`}
                />
              ) : (
                <SkeletonHealthGauge />
              )}

              {/* Warning / critical alert banners */}
              {hfHasFetched && healthFactor !== null && (
                <div className="mt-4">
                  <HealthFactorAlert
                    healthFactor={healthFactor}
                    loanId={loan.id}
                    outstanding={loan.outstanding ?? loan.amount}
                  />
                </div>
              )}
            </div>
          </section>

          <LoanRepaymentCalculator
            loanId={loan.id}
            outstanding={loan.outstanding ?? loan.amount}
            collateralValue={loan.collateral_value ?? loan.amount}
            actionButtonRef={primaryActionRef}
            onPrimaryActionReady={setPrimaryActionReady}
            onProceed={() => router.push('/dashboard')}
          />
          {primaryActionReady && (
            <StickyLoanAction
              targetRef={primaryActionRef}
              action="repay"
              onAction={() => primaryActionRef.current?.click()}
            />
          )}
        </>
      )}
    </main>
  );
}

export { StickyLoanAction };

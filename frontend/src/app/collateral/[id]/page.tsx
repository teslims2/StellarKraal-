'use client';
/**
 * Collateral Detail Page — /collateral/[id]
 *
 * Shows animal metadata, appraisal value, appraisal history timeline,
 * linked active loans with outstanding balance and health factor,
 * and an edit button for collateral in draft state (#1525).
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import Sparkline from '@/components/Sparkline';
import ErrorState from '@/components/ErrorState';
import DetailSkeleton from '@/components/DetailSkeleton';
import Breadcrumb from '@/components/Breadcrumb';
import CollateralLocationSection from '@/components/CollateralLocationSection';
import LiquidationThresholdBadge from '@/components/LiquidationThresholdBadge';
import StatusBadge from '@/components/StatusBadge';
import { formatXlmNumber } from '@/lib/formatMoney';

// Heavy components — loaded lazily to reduce initial JS bundle (#1070)
const PriceChart = dynamic(
  () => import('@/components/PriceChart').then((m) => ({ default: m.PriceChart })),
  {
    ssr: false,
    loading: () => <DetailSkeleton />,
  }
);
const TransactionHistory = dynamic(() => import('@/components/TransactionHistory'), {
  ssr: false,
  loading: () => <DetailSkeleton />,
});
// Issue #1209: Recharts-based appraisal history chart — lazy loaded
const AppraisalHistoryChart = dynamic(() => import('@/components/AppraisalHistoryChart'), {
  ssr: false,
  loading: () => <DetailSkeleton />,
});

interface AppraisalEntry {
  date: string;
  value: number;
}

interface LinkedLoan {
  id: string;
  borrower?: string;
  amount: number;
  status: string;
  createdAt?: string;
}

interface CollateralRecord {
  id: string;
  owner: string;
  animal_type: string;
  breed?: string;
  age_years?: number;
  weight_kg?: number;
  photo_url?: string;
  count: number;
  appraised_value: number;
  appraisal_history: AppraisalEntry[];
  createdAt: string;
  /** Collateral status — 'draft' allows editing; 'active' disables the edit button (#1525). */
  status?: CollateralStatus;
  /** Optional GPS / text location — shown in location section (#568, #1253). */
  location?: string | null;
  /** Optional GPS latitude — used by the Leaflet map (#1253). */
  latitude?: number | null;
  /** Optional GPS longitude — used by the Leaflet map (#1253). */
  longitude?: number | null;
  /** Liquidation threshold in bps from the backend, e.g. 8000 = 80% (#697). */
  liquidation_threshold_bps?: number | null;
  /** Loans currently backed by this collateral item (#1490). */
  loans?: LinkedLoan[];
}

/** Subset of a Loan record needed for the linked-loans table (#1525). */
interface LinkedLoan {
  id: string;
  status: string;
  principal: number;
  outstanding_balance: number;
  health_factor?: number | null;
}

type ErrorType = '404' | 'network' | null;

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

/** Health factor colour: green ≥ 1.5, amber 1.0–1.5, red < 1.0 */
function healthFactorClass(hf: number): string {
  if (hf >= 1.5) return 'text-green-600 font-semibold';
  if (hf >= 1.0) return 'text-amber-500 font-semibold';
  return 'text-red-600 font-bold';
}

export default function CollateralDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [record, setRecord] = useState<CollateralRecord | null>(null);
  const [error, setError] = useState<ErrorType>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [loans, setLoans] = useState<LinkedLoan[]>([]);
  const [loansLoading, setLoansLoading] = useState(true);
  const [loansError, setLoansError] = useState(false);

  // Linked loans — Issue #1525
  const [linkedLoans, setLinkedLoans] = useState<LinkedLoan[]>([]);
  const [loansLoading, setLoansLoading] = useState(false);

  const fetchCollateral = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`${API}/api/v1/collateral/${id}`);
      if (res.status === 404) {
        setError('404');
        setRecord(null);
      } else if (!res.ok) {
        setError('network');
        setRecord(null);
      } else {
        const data = await res.json();
        setRecord(data);
        setError(null);
        if (Array.isArray(data.loans)) {
          setLoans(data.loans);
          setLoansError(false);
        }
      }
    } catch {
      setError('network');
      setRecord(null);
    } finally {
      setLoading(false);
    }
  };

  /** Fetch active loans backed by this collateral (#1525). */
  const fetchLinkedLoans = async () => {
    setLoansLoading(true);
    try {
      const res = await fetch(`${API}/api/v1/loans?collateral_id=${encodeURIComponent(id)}&status=active`);
      if (res.ok) {
        const data = await res.json();
        // Accept both { loans: [...] } envelope and a bare array
        setLinkedLoans(Array.isArray(data) ? data : (data.loans ?? []));
      }
    } catch {
      // Non-fatal: linked loans are supplementary information
    } finally {
      setLoansLoading(false);
    }
  };

  async function copyId() {
    if (!id) return;
    try {
      await navigator.clipboard.writeText(id);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard unavailable
    }
  }

  const fetchLinkedLoans = async () => {
    try {
      setLoansLoading(true);
      setLoansError(false);
      const res = await fetch(`${API}/api/v1/collateral/${id}/loans`);
      if (!res.ok) {
        setLoansError(true);
        setLoans([]);
      } else {
        const data = await res.json();
        const list: LinkedLoan[] = Array.isArray(data) ? data : (data.loans ?? []);
        setLoans(list);
        setLoansError(false);
      }
    } catch {
      setLoansError(true);
      setLoans([]);
    } finally {
      setLoansLoading(false);
    }
  };

  useEffect(() => {
    fetchCollateral();
    fetchLinkedLoans();
  }, [id]);

  if (loading) {
    return <DetailSkeleton />;
  }

  if (error === '404') {
    return (
      <main className="max-w-2xl mx-auto px-4 py-10">
        <Link
          href="/collateral"
          className="text-brown/60 hover:text-brown text-sm mb-6 inline-block"
        >
          ← Back to Collateral List
        </Link>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20 p-6 text-center">
          <p className="text-5xl mb-4" aria-hidden="true">
            🐄
          </p>
          <h1 className="text-2xl font-bold text-brown mb-2">Collateral Not Found</h1>
          <p className="text-brown/60 mb-6">
            No collateral record exists for ID{' '}
            <code className="bg-brown/10 px-1 rounded">{id}</code>.
          </p>
          <Link
            href="/collateral"
            className="inline-block bg-brown text-cream px-5 py-2 rounded-xl font-semibold hover:bg-brown/80 transition focus:outline-none focus:ring-2 focus:ring-brown focus:ring-offset-2"
          >
            ← Back to Collateral List
          </Link>
        </div>
      </main>
    );
  }

  if (error === 'network') {
    return (
      <main className="max-w-2xl mx-auto px-4 py-10">
        <ErrorState
          message="Could not load collateral – check your connection"
          onRetry={fetchCollateral}
        />
      </main>
    );
  }

  if (!record) {
    return (
      <main className="max-w-2xl mx-auto px-4 py-10">
        <p className="text-brown/60">No data available</p>
      </main>
    );
  }

  const latestValue = record.appraised_value;
  const linkedLoans = loans.length > 0 ? loans : (record.loans ?? []);

  return (
    <main className="max-w-2xl mx-auto px-4 py-10" data-print="content">
      <Breadcrumb />
      <div className="flex items-center justify-between mb-6 no-print" data-print="hide">
        <Link
          href="/dashboard"
          className="text-brown/60 hover:text-brown text-sm"
        >
          ← Back to Dashboard
        </Link>

        {/* Edit button — Issue #1525: enabled for draft, disabled with tooltip for active */}
        {isDraft ? (
          <Link
            href={`/collateral/${id}/edit`}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold bg-brown text-cream hover:bg-brown/80 transition focus:outline-none focus:ring-2 focus:ring-brown focus:ring-offset-2"
            aria-label="Edit collateral"
          >
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
                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
              />
            </svg>
            Edit
          </Link>
        ) : (
          <span
            role="button"
            aria-disabled="true"
            aria-label="Editing is disabled for active collateral"
            title="Collateral is active and cannot be edited while backing a loan"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold bg-brown/20 text-brown/40 cursor-not-allowed select-none"
          >
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
                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
              />
            </svg>
            Edit
          </span>
        )}
      </div>

      {/* Animal profile */}
      <div
        className="bg-white rounded-2xl p-6 shadow mb-6 flex gap-6 items-start collateral-detail-card"
        data-print="show"
      >
        {record.photo_url ? (
          <div className="relative w-24 h-24 rounded-xl overflow-hidden flex-shrink-0">
            {/* priority — this is the first (and only) image visible above the fold
                on the detail page, so we preload it instead of lazy-loading it. */}
            <Image
              src={record.photo_url}
              alt={`${record.animal_type} collateral photo`}
              fill
              sizes="(max-width: 640px) 96px, 96px"
              className="object-cover"
              priority
              placeholder="blur"
              blurDataURL="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iOTYiIGhlaWdodD0iOTYiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3Qgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIgZmlsbD0iI0YwRDlCOCIvPjwvc3ZnPg=="
            />
          </div>
        ) : (
          <div className="w-24 h-24 rounded-xl bg-cream flex items-center justify-center text-4xl flex-shrink-0">
            {record.animal_type.toLowerCase().includes('goat')
              ? '🐐'
              : record.animal_type.toLowerCase().includes('sheep')
                ? '🐑'
                : '🐄'}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-brown capitalize">{record.animal_type}</h1>
          <div className="flex items-center gap-2 mb-3">
            <p className="text-brown/50 text-sm">ID: {record.id}</p>
            <button
              onClick={copyId}
              aria-label={copied ? 'Collateral ID copied' : 'Copy collateral ID'}
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
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            {record.breed && (
              <>
                <dt className="text-brown/50">Breed</dt>
                <dd className="font-medium text-brown">{record.breed}</dd>
              </>
            )}
            {record.age_years != null && (
              <>
                <dt className="text-brown/50">Age</dt>
                <dd className="font-medium text-brown">{record.age_years} yr</dd>
              </>
            )}
            {record.weight_kg != null && (
              <>
                <dt className="text-brown/50">Weight</dt>
                <dd className="font-medium text-brown">{record.weight_kg} kg</dd>
              </>
            )}
            <dt className="text-brown/50">Count</dt>
            <dd className="font-medium text-brown">{record.count}</dd>
            <dt className="text-brown/50">Owner</dt>
            <dd className="font-medium text-brown truncate" title={record.owner}>
              {record.owner.slice(0, 8)}…{record.owner.slice(-4)}
            </dd>
          </dl>
        </div>
      </div>

      {/* Current appraised value */}
      <div
        className="bg-gold/10 border border-gold/30 rounded-2xl p-6 shadow mb-6 text-center loan-summary-card"
        data-print="show"
      >
        <p className="text-sm text-brown/60 mb-1">Current Appraised Value</p>
        <p className="text-4xl font-bold text-brown">
          {(latestValue / 1e7).toFixed(2)}{' '}
          <span className="text-xl font-normal text-brown/60">XLM</span>
        </p>
        {record.appraisal_history.length >= 2 && (
          <div className="mt-3 flex justify-center">
            <Sparkline
              data={record.appraisal_history.map((entry) => ({
                date: entry.date,
                value: entry.value,
              }))}
            />
          </div>
        )}
      </div>

      {/* Linked active loans — Issue #1525 */}
      <div
        className="bg-white rounded-2xl p-6 shadow mb-6 loan-summary-card"
        data-print="show"
        aria-labelledby="linked-loans-heading"
      >
        <h2 id="linked-loans-heading" className="text-lg font-semibold text-brown mb-4">
          Active Loans Backed by This Collateral
        </h2>
        {loansLoading ? (
          <p className="text-brown/50 text-sm animate-pulse">Loading loans…</p>
        ) : linkedLoans.length === 0 ? (
          <p className="text-brown/50 text-sm">No active loans are backed by this collateral.</p>
        ) : (
          <table className="w-full text-sm" aria-label="Active loans backed by this collateral">
            <thead>
              <tr className="text-left text-brown/50 border-b border-brown/10">
                <th className="pb-2 font-medium">Loan ID</th>
                <th className="pb-2 font-medium text-right">Outstanding (XLM)</th>
                <th className="pb-2 font-medium text-right">Health Factor</th>
              </tr>
            </thead>
            <tbody>
              {linkedLoans.map((loan) => (
                <tr key={loan.id} className="border-b border-brown/5 last:border-0">
                  <td className="py-2">
                    <Link
                      href={`/loans/${loan.id}`}
                      className="font-mono text-xs text-brown hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brown rounded"
                    >
                      {loan.id.slice(0, 8)}…
                    </Link>
                  </td>
                  <td className="py-2 text-right font-medium text-brown">
                    {formatXlmNumber(loan.outstanding_balance / 1e7)}
                  </td>
                  <td className="py-2 text-right">
                    {loan.health_factor != null ? (
                      <span className={healthFactorClass(loan.health_factor)}>
                        {loan.health_factor.toFixed(2)}
                      </span>
                    ) : (
                      <span className="text-brown/40">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Appraisal history */}
      <section
        className="bg-white rounded-2xl p-6 shadow loan-summary-card"
        data-print="show"
        aria-labelledby="appraisal-history-heading"
      >
        <h2 id="appraisal-history-heading" className="text-lg font-semibold text-brown mb-4">
          Appraisal History
        </h2>
        {record.appraisal_history.length === 0 ? (
          <p className="text-brown/50 text-sm">No appraisal history yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">
                Appraisal history for collateral {record.id}, showing value over time
              </caption>
              <thead>
                <tr className="text-left text-brown/50 border-b border-brown/10">
                  <th scope="col" className="pb-2 font-medium">
                    Date
                  </th>
                  <th scope="col" className="pb-2 font-medium text-right">
                    Value (XLM)
                  </th>
                </tr>
              </thead>
              <tbody>
                {[...record.appraisal_history].reverse().map((entry, i) => (
                  <tr key={i} className="border-b border-brown/5 last:border-0">
                    <td className="py-2 text-brown/70">
                      {new Date(entry.date).toLocaleDateString()}
                    </td>
                    <td className="py-2 text-right font-medium text-brown dark:text-cream-50">
                      {formatXlmNumber(entry.value / 1e7)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Loans currently backed by this collateral — #1490 */}
      <section
        className="bg-white rounded-2xl p-6 shadow mt-6 loan-summary-card"
        data-print="show"
        aria-labelledby="linked-loans-heading"
      >
        <h2 id="linked-loans-heading" className="text-lg font-semibold text-brown mb-4">
          Linked Loans
        </h2>
        {loansLoading && linkedLoans.length === 0 ? (
          <p className="text-brown/50 text-sm" role="status">
            Loading linked loans…
          </p>
        ) : loansError && linkedLoans.length === 0 ? (
          <div className="text-sm">
            <p className="text-brown/50 mb-2">Could not load linked loans.</p>
            <button
              onClick={fetchLinkedLoans}
              className="text-brown underline hover:text-brown/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-brown rounded"
            >
              Retry
            </button>
          </div>
        ) : linkedLoans.length === 0 ? (
          <p className="text-brown/50 text-sm">This collateral is not backing any loans.</p>
        ) : (
          <ul className="divide-y divide-brown/5" aria-label="Loans backed by this collateral">
            {linkedLoans.map((loan) => (
              <li
                key={loan.id}
                className="py-3 flex flex-wrap items-center justify-between gap-2"
              >
                <div className="min-w-0">
                  <Link
                    href={`/loans/${loan.id}`}
                    className="font-medium text-brown hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brown rounded"
                  >
                    Loan {loan.id.slice(0, 8)}…{loan.id.slice(-4)}
                  </Link>
                  <p className="text-xs text-brown/50">
                    {formatXlmNumber(loan.amount / 1e7)} XLM
                    {loan.createdAt
                      ? ` · ${new Date(loan.createdAt).toLocaleDateString()}`
                      : ''}
                  </p>
                </div>
                <StatusBadge status={loan.status} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Transactions tied to this collateral — #530 */}
      <div className="mt-6" data-print="hide">
        <TransactionHistory collateralId={record.id} />
      </div>

      {/* Price history chart — hidden when printing (canvas-based) */}
      <div className="mt-6 no-print" data-print="hide">
        <PriceChart url={`${API}/api/v1/collateral/${id}/appraisals`} label="Price History" />
      </div>

      {/* Appraisal history chart (Recharts) — Issue #1209, #1490 */}
      <section
        className="mt-6 no-print"
        data-print="hide"
        aria-labelledby="appraisal-chart-heading"
      >
        <h2 id="appraisal-chart-heading" className="sr-only">
          Appraisal value over time
        </h2>
        <AppraisalHistoryChart collateralId={record.id} />
      </section>

      {/* Liquidation threshold — #697 */}
      <LiquidationThresholdBadge thresholdBps={record.liquidation_threshold_bps} />

      {/* Location placeholder — #568 / Leaflet map — #1253 */}
      <CollateralLocationSection
        location={record.location}
        latitude={record.latitude}
        longitude={record.longitude}
        animalType={record.animal_type}
      />
    </main>
  );
}

'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Download, RefreshCw } from 'lucide-react';
import EmptyState from './EmptyState';
import ErrorState from './ErrorState';
import { EmptyTransactionsIllustration } from './illustrations';
import Card from '@/components/Card';
import Pagination from '@/components/Pagination';
import { usePagination } from '@/hooks/usePagination';
import { useScrollPosition } from '@/hooks/useScrollPosition';
import { formatXlmFromStroops } from '@/lib/formatMoney';

export interface Transaction {
  id: number;
  loan_id: number;
  /** Transaction type — e.g. "loan", "repay", "liquidate", "Repayment", "Disbursement" */
  type?: string;
  amount: number;
  status?: string;
  created_at: string;
}

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

/** Canonical transaction types used for the type filter dropdown. */
const TRANSACTION_TYPES = ['loan', 'repay', 'liquidate', 'Repayment', 'Disbursement'];

// ─── Sub-components ──────────────────────────────────────────────────────────

/** Single transaction row for ≥640 px table layout */
function TransactionRow({ tx }: { tx: Transaction }) {
  return (
    <tr className="border-b border-brown-100 dark:border-brown-700/50 last:border-0">
      <td className="py-2 pr-4 text-sm text-brown-600 dark:text-brown-300">{tx.type ?? 'Repayment'}</td>
      <td className="py-2 pr-4 text-sm text-brown-600 dark:text-brown-300 font-mono">
        {formatXlmFromStroops(tx.amount)}
      </td>
      <td className="py-2 pr-4 text-sm text-brown-600 dark:text-brown-300">
        {new Date(tx.created_at).toLocaleDateString()}
      </td>
      <td className="py-2 text-sm">
        <StatusBadge status={tx.status} />
      </td>
    </tr>
  );
}

/** Single transaction card for <640 px mobile layout */
function TransactionCard({ tx }: { tx: Transaction }) {
  return (
    <li className="rounded-xl border border-brown-100 bg-cream-100 p-4 shadow-sm dark:bg-brown-800 dark:border-brown-700">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
        <div>
          <dt className="text-xs font-medium text-brown-500 dark:text-brown-300 uppercase tracking-wide">
            Type
          </dt>
          <dd className="mt-0.5 text-sm font-semibold text-brown-700 dark:text-cream-200">
            {tx.type ?? 'Repayment'}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-brown-500 dark:text-brown-300 uppercase tracking-wide">
            Amount
          </dt>
          <dd className="mt-0.5 text-sm font-mono text-brown-700 dark:text-cream-200">
            {formatXlmFromStroops(tx.amount)}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-brown-500 dark:text-brown-300 uppercase tracking-wide">
            Date
          </dt>
          <dd className="mt-0.5 text-sm text-brown-700 dark:text-cream-200">
            {new Date(tx.created_at).toLocaleDateString()}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-brown-500 dark:text-brown-300 uppercase tracking-wide">
            Status
          </dt>
          <dd className="mt-0.5">
            <StatusBadge status={tx.status} />
          </dd>
        </div>
      </dl>
    </li>
  );
}

function StatusBadge({ status }: { status?: string }) {
  const s = status ?? 'completed';
  const styles: Record<string, string> = {
    completed: 'bg-success-light text-success-dark',
    pending:   'bg-warning-light text-warning-dark',
    failed:    'bg-error-light text-error-dark',
  };
  const cls = styles[s.toLowerCase()] ?? styles.completed;
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium capitalize ${cls}`}>
      {s}
    </span>
  );
}

// ─── CSV export helper ────────────────────────────────────────────────────────

/**
 * Converts an array of transactions into a CSV blob and triggers a browser
 * download of `transactions.csv`. No third-party library required.
 */
function exportToCsv(transactions: Transaction[]): void {
  const headers = ['ID', 'Loan ID', 'Type', 'Amount (XLM)', 'Date', 'Status'];
  const rows = transactions.map((tx) => [
    tx.id,
    tx.loan_id,
    tx.type ?? 'Repayment',
    formatXlmFromStroops(tx.amount),
    new Date(tx.created_at).toISOString(),
    tx.status ?? 'completed',
  ]);

  const csvContent = [headers, ...rows]
    .map((row) =>
      row
        .map((cell) => {
          const value = String(cell);
          // Escape fields that contain commas, double-quotes, or newlines
          return value.includes(',') || value.includes('"') || value.includes('\n')
            ? `"${value.replace(/"/g, '""')}"`
            : value;
        })
        .join(','),
    )
    .join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', 'transactions.csv');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ─── Filter bar ──────────────────────────────────────────────────────────────

interface FilterBarProps {
  typeFilter: string;
  onTypeChange: (v: string) => void;
  dateFrom: string;
  onDateFromChange: (v: string) => void;
  dateTo: string;
  onDateToChange: (v: string) => void;
  onExport: () => void;
  hasData: boolean;
}

function FilterBar({
  typeFilter,
  onTypeChange,
  dateFrom,
  onDateFromChange,
  dateTo,
  onDateToChange,
  onExport,
  hasData,
}: FilterBarProps) {
  const inputCls =
    'rounded-lg border border-[color:var(--token-border)] bg-[color:var(--token-surface)] ' +
    'text-[color:var(--token-text)] text-sm px-3 py-2 ' +
    'focus:outline-none focus:ring-2 focus:ring-[color:var(--token-accent)] ' +
    'dark:bg-brown-800 dark:border-brown-600 dark:text-cream-100';

  return (
    <div className="flex flex-wrap items-end gap-3 mb-6">
      {/* Type filter */}
      <div className="flex flex-col gap-1">
        <label
          htmlFor="tx-type-filter"
          className="text-xs font-medium text-[color:var(--token-text-muted)] uppercase tracking-wide"
        >
          Type
        </label>
        <select
          id="tx-type-filter"
          value={typeFilter}
          onChange={(e) => onTypeChange(e.target.value)}
          className={inputCls}
        >
          <option value="">All types</option>
          {TRANSACTION_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      {/* Date from */}
      <div className="flex flex-col gap-1">
        <label
          htmlFor="tx-date-from"
          className="text-xs font-medium text-[color:var(--token-text-muted)] uppercase tracking-wide"
        >
          From
        </label>
        <input
          id="tx-date-from"
          type="date"
          value={dateFrom}
          max={dateTo || undefined}
          onChange={(e) => onDateFromChange(e.target.value)}
          className={inputCls}
        />
      </div>

      {/* Date to */}
      <div className="flex flex-col gap-1">
        <label
          htmlFor="tx-date-to"
          className="text-xs font-medium text-[color:var(--token-text-muted)] uppercase tracking-wide"
        >
          To
        </label>
        <input
          id="tx-date-to"
          type="date"
          value={dateTo}
          min={dateFrom || undefined}
          onChange={(e) => onDateToChange(e.target.value)}
          className={inputCls}
        />
      </div>

      {/* CSV export */}
      <button
        type="button"
        onClick={onExport}
        disabled={!hasData}
        aria-label="Export transactions to CSV"
        className={[
          'flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors',
          'bg-[color:var(--token-primary)] text-[color:var(--token-on-primary)]',
          'hover:bg-[color:var(--token-primary-hover)]',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--token-accent)]',
          'disabled:opacity-50 disabled:cursor-not-allowed',
        ].join(' ')}
      >
        <Download size={16} aria-hidden="true" />
        Export CSV
      </button>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface TransactionHistoryProps {
  /** Wallet address to scope the transaction list to (dashboard usage). */
  walletAddress?: string;
  /** Collateral ID to scope the transaction list to (collateral detail page — #530). */
  collateralId?: string;
  /** When true, shows the filter bar and CSV export. Defaults to false for embedded usage. */
  showFilters?: boolean;
}

export default function TransactionHistory({
  walletAddress,
  collateralId,
  showFilters = false,
}: TransactionHistoryProps) {
  useScrollPosition();
  const router = useRouter();

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters — only active when showFilters=true
  const [typeFilter, setTypeFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const fetchTransactions = useCallback(() => {
    setLoaded(false);
    setError(null);
    const params = new URLSearchParams();
    if (collateralId) params.set('collateralId', collateralId);
    if (walletAddress) params.set('borrower', walletAddress);
    // Pass filters to API when available
    if (showFilters && typeFilter) params.set('type', typeFilter);
    if (showFilters && dateFrom) params.set('from', dateFrom);
    if (showFilters && dateTo) params.set('to', dateTo);
    fetch(`${API}/api/v1/transactions?${params.toString()}`)
      .then((r) => {
        if (!r.ok) throw new Error(`Server error: ${r.status}`);
        return r.json();
      })
      .then((body) => {
        setTransactions(Array.isArray(body?.data) ? body.data : []);
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : 'Failed to load transactions');
        setTransactions([]);
      })
      .finally(() => setLoaded(true));
  }, [walletAddress, collateralId, showFilters, typeFilter, dateFrom, dateTo]);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  // Client-side filtering (for data already loaded, belt-and-suspenders approach)
  const filtered = transactions.filter((tx) => {
    if (typeFilter && tx.type !== typeFilter) return false;
    if (dateFrom && new Date(tx.created_at) < new Date(dateFrom)) return false;
    if (dateTo) {
      const end = new Date(dateTo);
      end.setHours(23, 59, 59, 999);
      if (new Date(tx.created_at) > end) return false;
    }
    return true;
  });

  if (!loaded) return null;

  if (error) {
    return (
      <Card
        className="mb-4"
        header={
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-brown-700 dark:text-cream-100">Transactions</h2>
            <button
              type="button"
              onClick={fetchTransactions}
              aria-label="Retry loading transactions"
              className="flex items-center gap-1 text-sm text-[color:var(--token-accent)] hover:underline"
            >
              <RefreshCw size={14} aria-hidden="true" />
              Retry
            </button>
          </div>
        }
      >
        <ErrorState message={error} onRetry={fetchTransactions} />
      </Card>
    );
  }

  const { page, limit, totalPages, setPage, setLimit, slice } = usePagination(filtered.length);
  const paginated = slice(filtered);

  if (filtered.length === 0 && !typeFilter && !dateFrom && !dateTo) {
    return (
      <Card
        className="mb-4"
        header={<h2 className="text-xl font-semibold text-brown-700 dark:text-cream-100">Transactions</h2>}
      >
        {showFilters && (
          <FilterBar
            typeFilter={typeFilter}
            onTypeChange={setTypeFilter}
            dateFrom={dateFrom}
            onDateFromChange={setDateFrom}
            dateTo={dateTo}
            onDateToChange={setDateTo}
            onExport={() => exportToCsv(transactions)}
            hasData={transactions.length > 0}
          />
        )}
        <EmptyState
          illustration={<EmptyTransactionsIllustration />}
          heading="No transactions yet"
          message="Your loan transactions will appear here."
          ctaLabel="View Loans"
          onCta={() => router.push('/dashboard')}
        />
      </Card>
    );
  }

  return (
    <Card
      className="mb-4"
      header={
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="text-xl font-semibold text-brown-700 dark:text-cream-100">Transactions</h2>
          {showFilters && (
            <button
              type="button"
              onClick={() => exportToCsv(filtered)}
              disabled={filtered.length === 0}
              aria-label="Export transactions to CSV"
              className={[
                'flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                'bg-[color:var(--token-primary)] text-[color:var(--token-on-primary)]',
                'hover:bg-[color:var(--token-primary-hover)]',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--token-accent)]',
                'disabled:opacity-50 disabled:cursor-not-allowed',
              ].join(' ')}
            >
              <Download size={14} aria-hidden="true" />
              Export CSV
            </button>
          )}
        </div>
      }
    >
      {/* Filters */}
      {showFilters && (
        <FilterBar
          typeFilter={typeFilter}
          onTypeChange={setTypeFilter}
          dateFrom={dateFrom}
          onDateFromChange={setDateFrom}
          dateTo={dateTo}
          onDateToChange={setDateTo}
          onExport={() => exportToCsv(filtered)}
          hasData={filtered.length > 0}
        />
      )}

      {/* No results after filtering */}
      {filtered.length === 0 && (
        <p className="text-sm text-[color:var(--token-text-muted)] py-4 text-center" role="status">
          No transactions match the current filters.
        </p>
      )}

      {/* Mobile: card list (< 640 px) */}
      {paginated.length > 0 && (
        <>
          <ul className="flex flex-col gap-3 sm:hidden" aria-label="Transaction list">
            {paginated.map((tx) => (
              <TransactionCard key={tx.id} tx={tx} />
            ))}
          </ul>

          {/* Desktop: table (≥ 640 px) — sticky header within a scrollable container */}
          <div
            className="hidden sm:block overflow-auto max-h-[28rem]"
            role="region"
            aria-label="Transaction table — scroll to see more rows"
          >
            <table className="w-full table-fixed border-collapse">
              <thead className="sticky top-0 z-10">
                <tr
                  className="border-b border-brown-200 dark:border-stone-600 text-left
                             bg-white dark:bg-stone-800"
                >
                  <th
                    scope="col"
                    className="w-1/4 py-3 pr-4 text-xs font-semibold uppercase tracking-wide
                               text-brown-500 dark:text-stone-400"
                  >
                    Type
                  </th>
                  <th
                    scope="col"
                    className="w-1/4 py-3 pr-4 text-xs font-semibold uppercase tracking-wide
                               text-brown-500 dark:text-stone-400"
                  >
                    Amount
                  </th>
                  <th
                    scope="col"
                    className="w-1/4 py-3 pr-4 text-xs font-semibold uppercase tracking-wide
                               text-brown-500 dark:text-stone-400"
                  >
                    Date
                  </th>
                  <th
                    scope="col"
                    className="w-1/4 py-3 text-xs font-semibold uppercase tracking-wide
                               text-brown-500 dark:text-stone-400"
                  >
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {paginated.map((tx) => (
                  <TransactionRow key={tx.id} tx={tx} />
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <Pagination
        page={page}
        totalPages={totalPages}
        limit={limit}
        onPageChange={setPage}
        onLimitChange={setLimit}
      />
    </Card>
  );
}

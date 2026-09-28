'use client';
import { Suspense, useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import SearchFilterBar from '@/components/SearchFilterBar';
import PageTransition from '@/components/PageTransition';
import Card from '@/components/Card';
import ScrollToTopButton from '@/components/ScrollToTopButton';
import { badgeVariants } from '@/lib/animations';
import { useScrollPosition } from '@/hooks/useScrollPosition';
import { useSearchFilter } from '@/hooks/useSearchFilter';

interface Loan {
  id: string;
  borrower: string;
  amount: number;
  status: string;
  createdAt: string;
}

const STATUS_OPTIONS = ['active', 'repaid', 'liquidated', 'pending'];
const TYPE_OPTIONS: string[] = [];
const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

/** Maps loan status to design-token badge classes (WCAG AA compliant). */
function statusBadgeClasses(status: string): string {
  switch (status) {
    case 'active':
      return 'bg-success-light text-success-dark';
    case 'repaid':
      return 'bg-gold-100 text-gold-700 dark:bg-gold-900/40 dark:text-gold-300';
    case 'liquidated':
      return 'bg-error-light text-error-dark';
    default:
      return 'bg-brown-100 text-brown-600 dark:bg-brown-700 dark:text-brown-300';
  }
}

/** Inline status badge rendered inside the Card `badge` slot. */
function LoanStatusBadge({ status, reduced }: { status: string; reduced: boolean | null }) {
  return (
    <motion.span
      key={status}
      variants={reduced ? undefined : badgeVariants}
      initial="initial"
      animate="animate"
      className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${statusBadgeClasses(status)}`}
    >
      {status}
    </motion.span>
  );
}

/** Amount range slider filter for the loans list. */
function AmountRangeFilter({
  min,
  max,
  value,
  onChange,
}: {
  min: number;
  max: number;
  value: [number, number];
  onChange: (range: [number, number]) => void;
}) {
  return (
    <fieldset>
      <legend className="text-xs font-semibold text-brown/60 uppercase tracking-wide mb-1">
        Amount range (XLM)
      </legend>
      <div className="flex items-center gap-2">
        <input
          type="range"
          aria-label="Minimum loan amount"
          min={min}
          max={max}
          value={value[0]}
          onChange={(e) => onChange([Number(e.target.value), value[1]])}
          className="w-24 accent-brown"
        />
        <span className="text-xs text-brown/60 w-16 text-center">
          {value[0].toLocaleString()} – {value[1].toLocaleString()}
        </span>
        <input
          type="range"
          aria-label="Maximum loan amount"
          min={min}
          max={max}
          value={value[1]}
          onChange={(e) => onChange([value[0], Number(e.target.value)])}
          className="w-24 accent-brown"
        />
      </div>
    </fieldset>
  );
}

function LoanListContent() {
  const [loans, setLoans] = useState<Loan[]>([]);
  const [loading, setLoading] = useState(true);
  const reduced = useReducedMotion();

  // Derive dynamic min/max amounts from loaded loans
  const [amountRange, setAmountRange] = useState<[number, number]>([0, 0]);
  const [selectedAmountRange, setSelectedAmountRange] = useState<[number, number]>([0, 0]);

  // useSearchFilter manages query, status chips, date range, and URL sync
  // SearchFilterBar renders its own instance that writes to URL; this instance
  // reads back from the URL so LoanListContent can filter the in-memory list.
  const {
    filters,
    debouncedQuery,
    clearAll,
    hasActiveFilters,
  } = useSearchFilter();

  useEffect(() => {
    setLoading(true);
    fetch(`${API}/api/loans`)
      .then((r) => r.json())
      .then((data: Loan[]) => {
        const list = Array.isArray(data) ? data : [];
        setLoans(list);
        if (list.length > 0) {
          const amounts = list.map((l) => l.amount);
          const minAmt = Math.min(...amounts);
          const maxAmt = Math.max(...amounts);
          setAmountRange([minAmt, maxAmt]);
          setSelectedAmountRange([minAmt, maxAmt]);
        }
      })
      .catch(() => setLoans([]))
      .finally(() => setLoading(false));
  }, []);

  const hasAmountFilter =
    amountRange[0] !== amountRange[1] &&
    (selectedAmountRange[0] !== amountRange[0] || selectedAmountRange[1] !== amountRange[1]);

  const filtered = loans.filter((loan) => {
    // Text search: ID or collateral ID (case-insensitive)
    const matchesQuery =
      !debouncedQuery ||
      loan.id.toLowerCase().includes(debouncedQuery.toLowerCase()) ||
      loan.borrower.toLowerCase().includes(debouncedQuery.toLowerCase());

    // Status chip filter
    const matchesStatus =
      filters.statuses.length === 0 || filters.statuses.includes(loan.status);

    // Amount range filter
    const matchesAmount =
      !hasAmountFilter ||
      (loan.amount >= selectedAmountRange[0] && loan.amount <= selectedAmountRange[1]);

    // Date range filter
    const loanDate = new Date(loan.createdAt);
    const matchesDateFrom = !filters.dateFrom || loanDate >= new Date(filters.dateFrom);
    const matchesDateTo = !filters.dateTo || loanDate <= new Date(filters.dateTo);

    return matchesQuery && matchesStatus && matchesAmount && matchesDateFrom && matchesDateTo;
  });

  const handleClearAll = () => {
    clearAll();
    setSelectedAmountRange(amountRange);
  };

  return (
    <div className="space-y-4">
      {/* Integrated SearchFilterBar — drives URL-synced query + status + date */}
      <SearchFilterBar
        statusOptions={STATUS_OPTIONS}
        typeOptions={TYPE_OPTIONS}
        searchPlaceholder="Search by loan ID or borrower…"
      />

      {/* Amount range slider — controlled locally, applied on top of URL filters */}
      {amountRange[0] !== amountRange[1] && (
        <div className="flex flex-wrap gap-4">
          <AmountRangeFilter
            min={amountRange[0]}
            max={amountRange[1]}
            value={selectedAmountRange}
            onChange={setSelectedAmountRange}
          />
          {hasAmountFilter && (
            <button
              onClick={() => setSelectedAmountRange(amountRange)}
              className="self-end text-xs text-brown/60 hover:text-brown underline"
              aria-label="Reset amount range filter"
            >
              Reset amount
            </button>
          )}
        </div>
      )}

      {/* Active filters summary */}
      {(hasActiveFilters || hasAmountFilter) && (
        <div className="flex flex-wrap gap-2 items-center" aria-label="Active filters">
          {hasAmountFilter && (
            <span className="inline-flex items-center gap-1 bg-gold/20 text-brown text-xs font-medium px-2 py-1 rounded-full">
              Amount: {selectedAmountRange[0].toLocaleString()} – {selectedAmountRange[1].toLocaleString()} XLM
              <button
                onClick={() => setSelectedAmountRange(amountRange)}
                aria-label="Remove amount range filter"
                className="hover:text-brown/60 transition"
              >
                ×
              </button>
            </span>
          )}
          {(hasActiveFilters || hasAmountFilter) && (
            <button
              onClick={handleClearAll}
              className="text-xs text-brown/60 hover:text-brown underline"
              aria-label="Clear all filters"
            >
              Clear all
            </button>
          )}
        </div>
      )}

      {loading ? (
        <p className="text-brown/60 text-sm" role="status" aria-live="polite">
          Loading…
        </p>
      ) : filtered.length === 0 ? (
        <p className="text-brown/60 text-sm" role="status" aria-live="polite">
          No loans match your filters.
        </p>
      ) : (
        <ul className="space-y-2" aria-label="Loans list">
          {filtered.map((loan) => (
            <li key={loan.id}>
              <Card
                title={`Loan #${loan.id}`}
                subtitle={loan.borrower}
                badge={<LoanStatusBadge status={loan.status} reduced={reduced} />}
                action={
                  <span className="text-sm font-medium text-brown-700 dark:text-cream-100">
                    {loan.amount.toLocaleString()} XLM
                  </span>
                }
                aria-label={`Loan ${loan.id}, ${loan.status}, ${loan.amount.toLocaleString()} XLM`}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function LoansListClient() {
  useScrollPosition();

  return (
    <PageTransition>
      <main className="max-w-3xl mx-auto px-4 py-10">
        <h1 className="text-3xl font-bold text-brown mb-6">Loans</h1>
        <Suspense
          fallback={
            <ul className="space-y-3 mt-4" aria-busy="true" aria-label="Loading loans">
              {[...Array(5)].map((_, i) => (
                <li
                  key={i}
                  className="bg-white dark:bg-brown-900 rounded-xl p-4 shadow-sm border border-brown/10 flex justify-between items-center"
                  aria-hidden="true"
                >
                  <div className="space-y-2">
                    <div className="skeleton-shimmer rounded h-4 w-24" />
                    <div className="skeleton-shimmer rounded h-3 w-44" />
                  </div>
                  <div className="text-right space-y-2">
                    <div className="skeleton-shimmer rounded h-4 w-20" />
                    <div className="skeleton-shimmer rounded h-5 w-16 rounded-full" />
                  </div>
                </li>
              ))}
            </ul>
          }
        >
          <LoanListContent />
        </Suspense>
      </main>
      <ScrollToTopButton />
    </PageTransition>
  );
}

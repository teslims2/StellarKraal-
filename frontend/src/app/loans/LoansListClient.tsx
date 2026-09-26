'use client';
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { motion, useReducedMotion } from 'framer-motion';
import SearchFilterBar from '@/components/SearchFilterBar';
import PageTransition from '@/components/PageTransition';
import Card from '@/components/Card';
import ScrollToTopButton from '@/components/ScrollToTopButton';
import LoansEmptyState from '@/components/LoansEmptyState';
import SkeletonLoansPage from '@/components/SkeletonLoansPage';
import { badgeVariants } from '@/lib/animations';
import { useScrollPosition } from '@/hooks/useScrollPosition';
import { useLoans } from '@/hooks/useLoans';
import Link from 'next/link';

// Closes #526 — integrated useLoans SWR hook, amount range filter, and collateral ID search.

const STATUS_OPTIONS = ['active', 'repaid', 'liquidated', 'pending'];
const TYPE_OPTIONS: string[] = [];
/** Max XLM slider bound — adjust if portfolio amounts grow beyond 100k */
const MAX_AMOUNT = 100_000;

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

function LoanListContent() {
  const searchParams = useSearchParams();
  const { loans, isLoading, error } = useLoans();
  const reduced = useReducedMotion();

  // Read filter state from URL (synced by useSearchFilter inside SearchFilterBar)
  const q = (searchParams.get('q') ?? '').toLowerCase();
  const statuses = searchParams.getAll('status');
  const amountMin = searchParams.get('amountMin') ? Number(searchParams.get('amountMin')) : null;
  const amountMax = searchParams.get('amountMax') ? Number(searchParams.get('amountMax')) : null;
  const dateFrom = searchParams.get('dateFrom') ?? '';
  const dateTo = searchParams.get('dateTo') ?? '';

  const filtered = loans.filter((loan) => {
    // Text search: loan ID, collateral ID (if present), or borrower address (case-insensitive)
    const collateralId = ('collateralId' in loan ? (loan as { collateralId?: string }).collateralId : '') ?? '';
    const matchesQuery =
      !q ||
      loan.id.toLowerCase().includes(q) ||
      loan.borrower.toLowerCase().includes(q) ||
      loan.status.toLowerCase().includes(q) ||
      collateralId.toLowerCase().includes(q);

    // Status chip filter
    const matchesStatus = statuses.length === 0 || statuses.includes(loan.status);

    // Amount range filter
    const matchesAmountMin = amountMin === null || loan.amount >= amountMin;
    const matchesAmountMax = amountMax === null || loan.amount <= amountMax;

    // Date range filter — compare against loan.createdAt
    const loanDate = loan.createdAt ? loan.createdAt.slice(0, 10) : '';
    const matchesDateFrom = !dateFrom || loanDate >= dateFrom;
    const matchesDateTo = !dateTo || loanDate <= dateTo;

    return (
      matchesQuery &&
      matchesStatus &&
      matchesAmountMin &&
      matchesAmountMax &&
      matchesDateFrom &&
      matchesDateTo
    );
  });

  if (error) {
    return (
      <p className="text-error-dark text-sm" role="alert">
        Failed to load loans: {error}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <SearchFilterBar
        statusOptions={STATUS_OPTIONS}
        typeOptions={TYPE_OPTIONS}
        searchPlaceholder="Search by loan ID, collateral ID, or borrower…"
        maxAmount={MAX_AMOUNT}
      />
      {isLoading ? (
        <SkeletonLoansPage />
      ) : loans.length === 0 ? (
        <LoansEmptyState />
      ) : filtered.length === 0 ? (
        <p className="text-brown/60 text-sm" role="status" aria-live="polite">
          No loans match your filters.
        </p>
      ) : (
        <ul className="space-y-2" aria-label="Loans list">
          {filtered.map((loan) => (
            <li key={loan.id}>
              <Link href={`/loans/${loan.id}`} className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-gold rounded-xl">
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
              </Link>
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
        <Suspense fallback={<SkeletonLoansPage />}>
          <LoanListContent />
        </Suspense>
      </main>
      <ScrollToTopButton />
    </PageTransition>
  );
}

'use client';
/**
 * LoansListClient — sortable, responsive loan list (closes #1244).
 *
 * Acceptance criteria:
 *  ✓ Sortable columns: Status, Amount, Created At, Health Factor
 *  ✓ Sort direction toggled by clicking the column header
 *  ✓ Sort state reflected in URL query params (?sortBy=amount&sortDir=asc)
 *  ✓ On screens < 640 px, table switches to card layout
 *  ✓ Accessible: column headers use aria-sort
 */
import { Suspense, useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { motion, useReducedMotion } from 'framer-motion';
import { Download, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import Link from 'next/link';
import SearchFilterBar from '@/components/SearchFilterBar';
import PageTransition from '@/components/PageTransition';
import Card from '@/components/Card';
import ScrollToTopButton from '@/components/ScrollToTopButton';
import Spinner from '@/components/Spinner';
import Pagination from '@/components/Pagination';
import { usePaginationParams } from '@/hooks/usePagination';
import { badgeVariants } from '@/lib/animations';
import { useScrollPosition } from '@/hooks/useScrollPosition';
import { useSearchFilter } from '@/hooks/useSearchFilter';
import { useI18n } from '@/context/I18nContext';
import { toCsvString, downloadCsv, csvFilename, type CsvColumn } from '@/lib/exportCsv';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// ── Types ──────────────────────────────────────────────────────────────────────

interface Loan {
  id: string;
  borrower: string;
  amount: number;
  status: string;
  health_factor?: number | null;
  collateralId?: string;
  createdAt: string;
  updatedAt?: string;
}

type SortKey = 'status' | 'amount' | 'createdAt' | 'health_factor';
type SortDir = 'asc' | 'desc';

const SORTABLE_COLUMNS: { key: SortKey; label: string }[] = [
  { key: 'status', label: 'Status' },
  { key: 'amount', label: 'Amount' },
  { key: 'createdAt', label: 'Created At' },
  { key: 'health_factor', label: 'Health Factor' },
];

// ── Constants ──────────────────────────────────────────────────────────────────

const STATUS_OPTIONS = ['active', 'at_risk', 'paused', 'repaid', 'liquidated', 'pending'];
const TYPE_OPTIONS: string[] = [];

/** CSV column definitions for loan export */
const LOAN_CSV_COLUMNS: CsvColumn<Loan>[] = [
  { header: 'Loan ID', value: (loan) => loan.id },
  { header: 'Status', value: (loan) => loan.status },
  { header: 'Amount (XLM)', value: (loan) => String(loan.amount) },
  {
    header: 'Health Factor',
    value: (loan) => (loan.health_factor != null ? String(loan.health_factor) : ''),
  },
  { header: 'Collateral ID', value: (loan) => loan.collateralId ?? '' },
  { header: 'Created At', value: (loan) => loan.createdAt },
  { header: 'Updated At', value: (loan) => loan.updatedAt ?? '' },
];

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Maps loan status to design-token badge classes (WCAG AA compliant). */
function statusBadgeClasses(status: string): string {
  switch (status) {
    case 'active':
      return 'bg-success-light text-success-dark';
    case 'at_risk':
      return 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300';
    case 'paused':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300';
    case 'repaid':
      return 'bg-gold-100 text-gold-700 dark:bg-gold-900/40 dark:text-gold-300';
    case 'liquidated':
      return 'bg-error-light text-error-dark';
    default:
      return 'bg-brown-100 text-brown-600 dark:bg-brown-700 dark:text-brown-300';
  }
}

/** Inline status badge */
function LoanStatusBadge({ status, reduced }: { status: string; reduced: boolean | null }) {
  return (
    <motion.span
      key={status}
      variants={reduced ? undefined : badgeVariants}
      initial="initial"
      animate="animate"
      className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${statusBadgeClasses(status)}`}
    >
      {status.replace('_', ' ')}
    </motion.span>
  );
}

/** Sort loans by the selected column and direction. */
function sortLoans(loans: Loan[], key: SortKey, dir: SortDir): Loan[] {
  return [...loans].sort((a, b) => {
    let cmp = 0;
    switch (key) {
      case 'status':
        cmp = a.status.localeCompare(b.status);
        break;
      case 'amount':
        cmp = a.amount - b.amount;
        break;
      case 'createdAt':
        cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        break;
      case 'health_factor': {
        const aHf = a.health_factor ?? -Infinity;
        const bHf = b.health_factor ?? -Infinity;
        cmp = aHf - bHf;
        break;
      }
    }
    return dir === 'asc' ? cmp : -cmp;
  });
}

// ── Export button ──────────────────────────────────────────────────────────────

function ExportCsvButton({ loans }: { loans: Loan[] }) {
  const [exporting, setExporting] = useState(false);

  async function handleExport() {
    setExporting(true);
    try {
      await Promise.resolve();
      const csv = toCsvString(loans, LOAN_CSV_COLUMNS);
      downloadCsv(csv, csvFilename('loans'));
    } finally {
      setExporting(false);
    }
  }

  return (
    <button
      onClick={handleExport}
      disabled={exporting || loans.length === 0}
      aria-label="Export loans to CSV"
      className="flex items-center gap-2 rounded-lg border border-brown/30 dark:border-gold/30 bg-white dark:bg-brown-900 px-3 py-2 text-sm font-medium text-brown dark:text-cream hover:bg-brown/5 dark:hover:bg-gold/10 transition disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
    >
      {exporting ? (
        <>
          <Spinner className="h-4 w-4" label="Generating CSV…" />
          <span>Exporting…</span>
        </>
      ) : (
        <>
          <Download className="h-4 w-4" aria-hidden="true" />
          <span>Export CSV</span>
        </>
      )}
    </button>
  );
}

// ── Sort indicator icon ────────────────────────────────────────────────────────

function SortIcon({
  column,
  sortBy,
  sortDir,
}: {
  column: SortKey;
  sortBy: SortKey;
  sortDir: SortDir;
}) {
  if (column !== sortBy) {
    return <ChevronsUpDown className="h-3.5 w-3.5 opacity-40" aria-hidden="true" />;
  }
  return sortDir === 'asc' ? (
    <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
  ) : (
    <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
  );
}

// ── Table (≥ 640 px) ───────────────────────────────────────────────────────────

function LoansTable({
  loans,
  sortBy,
  sortDir,
  onSort,
  reduced,
  t,
}: {
  loans: Loan[];
  sortBy: SortKey;
  sortDir: SortDir;
  onSort: (key: SortKey) => void;
  reduced: boolean | null;
  t: (key: string, fallback?: string) => string;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-brown/10 dark:border-brown-700 shadow-sm">
      <table className="w-full text-sm" aria-label={t('loans.title', 'Loans')}>
        <thead className="bg-brown/5 dark:bg-brown-800/50">
          <tr>
            {/* Non-sortable ID column */}
            <th
              scope="col"
              className="px-4 py-3 text-left font-semibold text-brown/70 dark:text-cream/70 whitespace-nowrap"
            >
              Loan ID
            </th>

            {SORTABLE_COLUMNS.map(({ key, label }) => (
              <th
                key={key}
                scope="col"
                aria-sort={
                  sortBy === key ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'
                }
                className="px-4 py-3 text-left font-semibold text-brown/70 dark:text-cream/70 whitespace-nowrap"
              >
                <button
                  type="button"
                  onClick={() => onSort(key)}
                  className="inline-flex items-center gap-1.5 hover:text-brown dark:hover:text-cream transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold rounded"
                  aria-label={`Sort by ${label}${sortBy === key ? `, currently ${sortDir === 'asc' ? 'ascending' : 'descending'}` : ''}`}
                >
                  {label}
                  <SortIcon column={key} sortBy={sortBy} sortDir={sortDir} />
                </button>
              </th>
            ))}

            {/* Borrower */}
            <th
              scope="col"
              className="px-4 py-3 text-left font-semibold text-brown/70 dark:text-cream/70 whitespace-nowrap"
            >
              Borrower
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-brown/10 dark:divide-brown-700">
          {loans.map((loan) => (
            <tr
              key={loan.id}
              className="bg-white dark:bg-brown-900 hover:bg-brown/5 dark:hover:bg-brown-800 transition-colors"
            >
              <td className="px-4 py-3 font-mono text-xs text-brown dark:text-cream">
                <Link
                  href={`/loans/${loan.id}`}
                  className="hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold rounded"
                >
                  #{loan.id.slice(0, 8)}
                </Link>
              </td>
              <td className="px-4 py-3">
                <LoanStatusBadge status={loan.status} reduced={reduced} />
              </td>
              <td className="px-4 py-3 font-medium text-brown dark:text-cream tabular-nums">
                {(loan.amount / 1e7).toFixed(2)} XLM
              </td>
              <td className="px-4 py-3 text-brown/70 dark:text-cream/70 tabular-nums">
                {new Date(loan.createdAt).toLocaleDateString()}
              </td>
              <td className="px-4 py-3 text-brown/70 dark:text-cream/70 tabular-nums">
                {loan.health_factor != null
                  ? (loan.health_factor > 100
                      ? (loan.health_factor / 10_000).toFixed(2)
                      : loan.health_factor.toFixed(2)) + 'x'
                  : '—'}
              </td>
              <td className="px-4 py-3 font-mono text-xs text-brown/60 dark:text-cream/60 truncate max-w-[10rem]">
                {loan.borrower.slice(0, 6)}…{loan.borrower.slice(-4)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Card list (< 640 px) ───────────────────────────────────────────────────────

function LoansCardList({
  loans,
  reduced,
  t,
}: {
  loans: Loan[];
  reduced: boolean | null;
  t: (key: string, fallback?: string) => string;
}) {
  return (
    <ul className="space-y-2" aria-label={t('loans.title', 'Loans')}>
      {loans.map((loan) => (
        <li key={loan.id}>
          <Link
            href={`/loans/${loan.id}`}
            className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold rounded-xl"
          >
            <Card
              title={`${t('loans.loanId', 'Loan')} #${loan.id}`}
              subtitle={`${loan.borrower.slice(0, 6)}…${loan.borrower.slice(-4)}`}
              badge={<LoanStatusBadge status={loan.status} reduced={reduced} />}
              action={
                <div className="text-right space-y-0.5">
                  <p className="text-sm font-medium text-brown-700 dark:text-cream-100 tabular-nums">
                    {(loan.amount / 1e7).toFixed(2)} XLM
                  </p>
                  {loan.health_factor != null && (
                    <p className="text-xs text-brown/50 dark:text-cream/50 tabular-nums">
                      HF{' '}
                      {loan.health_factor > 100
                        ? (loan.health_factor / 10_000).toFixed(2)
                        : loan.health_factor.toFixed(2)}
                      x
                    </p>
                  )}
                </div>
              }
              aria-label={`${t('loans.loanId', 'Loan')} ${loan.id}, ${loan.status}, ${(loan.amount / 1e7).toFixed(2)} XLM`}
            />
          </Link>
        </li>
      ))}
    </ul>
  );
}

// ── Main list content ──────────────────────────────────────────────────────────

function LoanListContent() {
  // Server-driven pagination (#1467): page and pageSize come from the URL and
  // only the requested page is fetched from the API.
  const { page, pageSize, setPage, setPageSize } = usePaginationParams(10);
  const [pageLoans, setPageLoans] = useState<Loan[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const reduced = useReducedMotion();
  const { t } = useI18n();

  // Sort state — read from URL query params
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const sortByParam = (searchParams.get('sortBy') ?? 'createdAt') as SortKey;
  const sortDirParam = (searchParams.get('sortDir') ?? 'desc') as SortDir;

  const validSortKeys: SortKey[] = ['status', 'amount', 'createdAt', 'health_factor'];
  const sortBy: SortKey = validSortKeys.includes(sortByParam) ? sortByParam : 'createdAt';
  const sortDir: SortDir = sortDirParam === 'asc' ? 'asc' : 'desc';

  const handleSort = useCallback(
    (key: SortKey) => {
      const newDir: SortDir = sortBy === key ? (sortDir === 'asc' ? 'desc' : 'asc') : 'asc';

      const params = new URLSearchParams(searchParams.toString());
      params.set('sortBy', key);
      params.set('sortDir', newDir);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [sortBy, sortDir, router, pathname, searchParams]
  );

  // Filter state from URL
  const { filters, debouncedQuery, clearAll } = useSearchFilter();

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    fetch(`${API}/api/loans?page=${page}&pageSize=${pageSize}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((data: Loan[] | { data?: Loan[]; total?: number }) => {
        if (Array.isArray(data)) {
          // Unpaginated response (older API): slice the page on the client.
          const start = (page - 1) * pageSize;
          setPageLoans(data.slice(start, start + pageSize));
          setTotal(data.length);
          return;
        }
        const items = Array.isArray(data?.data) ? data.data : [];
        setPageLoans(items);
        setTotal(typeof data?.total === 'number' ? data.total : items.length);
      })
      .catch((err: unknown) => {
        if ((err as Error)?.name === 'AbortError') return;
        setPageLoans([]);
        setTotal(0);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [page, pageSize]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // If the URL points past the last page (e.g. after rows were removed), move to the last page.
  useEffect(() => {
    if (!loading && total > 0 && page > totalPages) setPage(totalPages);
  }, [loading, total, page, totalPages, setPage]);

  // Filter (applied to the current page; server-side filters are not yet supported)
  const filtered = pageLoans.filter((loan) => {
    const matchesQuery =
      !debouncedQuery ||
      loan.id.toLowerCase().includes(debouncedQuery.toLowerCase()) ||
      loan.borrower.toLowerCase().includes(debouncedQuery.toLowerCase());

    const matchesStatus = filters.statuses.length === 0 || filters.statuses.includes(loan.status);

    const loanDate = new Date(loan.createdAt);
    const matchesDateFrom = !filters.dateFrom || loanDate >= new Date(filters.dateFrom);
    const matchesDateTo = !filters.dateTo || loanDate <= new Date(filters.dateTo);

    return matchesQuery && matchesStatus && matchesDateFrom && matchesDateTo;
  });

  // Sort
  const sorted = sortLoans(filtered, sortBy, sortDir);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <SearchFilterBar
          statusOptions={STATUS_OPTIONS}
          typeOptions={TYPE_OPTIONS}
          searchPlaceholder="Search by loan ID or borrower…"
        />
        <ExportCsvButton loans={sorted} />
      </div>

      {loading && pageLoans.length === 0 ? (
        <p className="text-brown/60 text-sm" role="status" aria-live="polite">
          {t('loans.loading', 'Loading…')}
        </p>
      ) : sorted.length === 0 ? (
        <p className="text-brown/60 text-sm" role="status" aria-live="polite">
          {t('loans.noResults', 'No loans match your filters.')}
        </p>
      ) : (
        <div
          aria-busy={loading}
          className={loading ? 'opacity-60 transition-opacity' : 'transition-opacity'}
        >
          {/* Table layout — visible on sm and up (≥ 640 px) */}
          <div className="hidden sm:block" data-testid="loans-table">
            <LoansTable
              loans={sorted}
              sortBy={sortBy}
              sortDir={sortDir}
              onSort={handleSort}
              reduced={reduced}
              t={t}
            />
          </div>

          {/* Card layout — visible below sm (< 640 px) */}
          <div className="block sm:hidden" data-testid="loans-cards">
            <LoansCardList loans={sorted} reduced={reduced} t={t} />
          </div>
        </div>
      )}

      {total > 0 && (
        <Pagination
          page={Math.min(page, totalPages)}
          totalPages={totalPages}
          limit={pageSize}
          onPageChange={setPage}
          onLimitChange={setPageSize}
          loading={loading}
        />
      )}
    </div>
  );
}

// ── Page shell ─────────────────────────────────────────────────────────────────

export default function LoansListClient() {
  useScrollPosition();
  const { t } = useI18n();

  return (
    <PageTransition>
      <main className="max-w-5xl mx-auto px-4 py-10">
        <h1 className="text-3xl font-bold text-brown mb-6">{t('loans.title', 'Loans')}</h1>
        <Suspense
          fallback={
            <div className="space-y-2 mt-4" aria-busy="true" aria-label="Loading loans">
              {[...Array(5)].map((_, i) => (
                <div
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
                </div>
              ))}
            </div>
          }
        >
          <LoanListContent />
        </Suspense>
      </main>
      <ScrollToTopButton />
    </PageTransition>
  );
}

'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import Card from '@/components/Card';
import SkeletonCollateralCard from '@/components/SkeletonCollateralCard';
import EmptyState from '@/components/EmptyState';
import MoneyAmount from '@/components/MoneyAmount';
import { formatFiat, formatXlmNumber } from '@/lib/formatMoney';
import { healthColor, healthTier, HEALTH_TIER_ICON, HEALTH_TIER_LABEL } from '@/lib/design-tokens';

interface Collateral {
  id: string;
  animal_type: string;
  count: number;
  appraised_value: number;
  createdAt: string;
  health_factor_bps?: number | null;
}

interface Props {
  collaterals: Collateral[];
  loading: boolean;
  onCardClick: (id: string) => void;
  onAddCollateral?: () => void;
  onBatchDelete?: (ids: string[]) => Promise<void>;
}

const ANIMAL_ICONS: Record<string, string> = {
  cattle: '🐄',
  goat: '🐐',
  sheep: '🐑',
};

/** Page size options specific to the collateral grid (cards-per-page). */
const COLLATERAL_PAGE_SIZES = [12, 24, 48] as const;
type CollateralPageSize = (typeof COLLATERAL_PAGE_SIZES)[number];
const DEFAULT_PAGE_SIZE: CollateralPageSize = 12;

export default function CollateralGrid({
  collaterals,
  loading,
  onCardClick,
  onAddCollateral,
  onBatchDelete,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // ── Pagination state (synced with URL ?page=N and ?limit=N) ────────────
  // Both currentPage and pageSize are derived directly from searchParams on
  // every render so browser back/forward navigation keeps them in sync with
  // the URL without any useState drift.
  const rawPage = parseInt(searchParams.get('page') ?? '1', 10);
  const pageSizeRaw = parseInt(searchParams.get('limit') ?? String(DEFAULT_PAGE_SIZE), 10);
  const pageSize = (COLLATERAL_PAGE_SIZES as readonly number[]).includes(pageSizeRaw)
    ? (pageSizeRaw as CollateralPageSize)
    : DEFAULT_PAGE_SIZE;

  const totalPages = Math.max(1, Math.ceil(collaterals.length / pageSize));
  const currentPage = Math.min(Math.max(1, isNaN(rawPage) ? 1 : rawPage), totalPages);

  const navigate = useCallback(
    (updates: Record<string, string>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(updates)) {
        params.set(k, v);
      }
      router.push(`${pathname}?${params.toString()}`);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [router, pathname, searchParams],
  );

  const setPage = useCallback(
    (p: number) => navigate({ page: String(p) }),
    [navigate],
  );

  const handlePageSizeChange = useCallback(
    (newSize: CollateralPageSize) => {
      navigate({ limit: String(newSize), page: '1' });
    },
    [navigate],
  );

  // Paginated slice of collaterals
  const start = (currentPage - 1) * pageSize;
  const pageCollaterals = collaterals.slice(start, start + pageSize);
  const showPagination = collaterals.length > pageSize;

  // ── Selection state ────────────────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);

  // Roving tabIndex state: first card gets tabIndex=0
  const [focusedIndex, setFocusedIndex] = useState<number>(0);

  // Refs array for all card buttons on the current page
  const cardRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const handleSelectOne = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedIds.size === collaterals.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(collaterals.map((c) => c.id)));
    }
  };

  const handleDeselectAll = () => {
    setSelectedIds(new Set());
  };

  const handleExportCSV = () => {
    const selectedCollaterals = collaterals.filter((c) => selectedIds.has(c.id));
    const headers = ['ID', 'Animal Type', 'Count', 'Appraised Value (XLM)', 'Registered Date'];
    const rows = selectedCollaterals.map((c) => [
      c.id,
      c.animal_type,
      c.count.toString(),
      formatXlmNumber(c.appraised_value / 1e7),
      new Date(c.createdAt).toLocaleDateString(),
    ]);

    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => `"${cell}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `collateral-export-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleBatchDelete = async () => {
    if (!onBatchDelete || selectedIds.size === 0) return;
    if (!confirm(`Are you sure you want to delete ${selectedIds.size} collateral item(s)?`)) return;

    setIsDeleting(true);
    try {
      await onBatchDelete(Array.from(selectedIds));
      setSelectedIds(new Set());
    } finally {
      setIsDeleting(false);
    }
  };

  // Handle Escape key to deselect all (global listener)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectedIds.size > 0) {
        handleDeselectAll();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedIds.size]);

  // Arrow-key / Home / End navigation within the grid
  const handleGridKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (pageCollaterals.length === 0) return;

      let nextIndex: number | null = null;

      switch (e.key) {
        case 'ArrowRight':
        case 'ArrowDown':
          e.preventDefault();
          nextIndex = Math.min(focusedIndex + 1, pageCollaterals.length - 1);
          break;
        case 'ArrowLeft':
        case 'ArrowUp':
          e.preventDefault();
          nextIndex = Math.max(focusedIndex - 1, 0);
          break;
        case 'Home':
          e.preventDefault();
          nextIndex = 0;
          break;
        case 'End':
          e.preventDefault();
          nextIndex = pageCollaterals.length - 1;
          break;
        default:
          return;
      }

      if (nextIndex !== null && nextIndex !== focusedIndex) {
        setFocusedIndex(nextIndex);
        cardRefs.current[nextIndex]?.focus();
      }
    },
    [focusedIndex, pageCollaterals.length],
  );

  // Keep refs array length in sync with page collaterals count
  cardRefs.current = cardRefs.current.slice(0, pageCollaterals.length);

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {[...Array(3)].map((_, i) => (
          <SkeletonCollateralCard key={i} />
        ))}
      </div>
    );
  }

  if (collaterals.length === 0) {
    return (
      <EmptyState
        icon="🐄"
        heading="No Collateral Registered"
        message="Register your livestock as collateral to unlock loans. Start by adding your first animal."
        ctaLabel="Register Collateral"
        onCta={onAddCollateral}
      />
    );
  }

  return (
    <div>
      {/* Batch Action Toolbar */}
      {selectedIds.size > 0 && (
        <div
          role="toolbar"
          className="mb-4 flex items-center gap-3 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 p-4"
        >
          <span className="text-sm font-medium text-blue-900 dark:text-blue-200">
            {selectedIds.size} selected
          </span>
          <div className="flex gap-2 ml-auto">
            <button
              onClick={handleExportCSV}
              className="px-3 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              disabled={isDeleting}
            >
              Export CSV
            </button>
            {onBatchDelete && (
              <button
                onClick={handleBatchDelete}
                className="px-3 py-2 text-sm font-medium rounded-lg bg-red-600 text-white hover:bg-red-700 transition focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:opacity-50"
                disabled={isDeleting}
              >
                {isDeleting ? 'Deleting...' : 'Delete'}
              </button>
            )}
            <button
              onClick={handleDeselectAll}
              className="px-3 py-2 text-sm font-medium rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100 hover:bg-gray-300 dark:hover:bg-gray-600 transition"
              aria-label="Deselect all items"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Grid Header with Select All */}
      {collaterals.length > 0 && (
        <div className="mb-4 flex items-center gap-2">
          <input
            type="checkbox"
            id="select-all"
            checked={selectedIds.size === collaterals.length && collaterals.length > 0}
            onChange={handleSelectAll}
            aria-label="Select all collaterals"
            className="w-4 h-4 rounded cursor-pointer"
          />
          <label htmlFor="select-all" className="text-sm text-brown/60 cursor-pointer">
            Select all
          </label>
        </div>
      )}

      {/* Grid */}
      <div
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
        onKeyDown={handleGridKeyDown}
        role="grid"
        aria-label="Collateral cards"
      >
        {pageCollaterals.map((collateral, i) => {
          const usdValue = (collateral.appraised_value / 1e7) * 0.12;
          const icon = ANIMAL_ICONS[collateral.animal_type] || '🐾';
          const healthFactorBps = collateral.health_factor_bps;
          const showHealthIndicator = healthFactorBps !== undefined && healthFactorBps !== null;
          const healthColorHex = showHealthIndicator ? healthColor(healthFactorBps) : undefined;
          const isSelected = selectedIds.has(collateral.id);

          return (
            <div
              key={collateral.id}
              role="gridcell"
              className="group relative"
              onMouseEnter={() => {}}
              onFocus={() => {}}
            >
              {/* Checkbox - appears on hover/focus */}
              <div className="absolute top-2 left-2 z-10 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => handleSelectOne(collateral.id)}
                  onClick={(e) => e.stopPropagation()}
                  aria-label={`Select ${collateral.animal_type}`}
                  className="w-5 h-5 rounded cursor-pointer"
                />
              </div>

              <button
                ref={(el) => {
                  cardRefs.current[i] = el;
                }}
                tabIndex={focusedIndex === i ? 0 : -1}
                onClick={() => {
                  setFocusedIndex(i);
                  if (!isSelected) onCardClick(collateral.id);
                }}
                className={`w-full text-left hover:scale-105 transition-transform duration-200 focus:outline-none focus:ring-2 focus:ring-brown-600 focus:ring-offset-2 rounded-2xl ${
                  isSelected ? 'ring-2 ring-blue-500' : ''
                }`}
              >
                <Card
                  variant="default"
                  header={
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-3xl">{icon}</span>
                        {showHealthIndicator && (() => {
                          const tier = healthTier(healthFactorBps);
                          const tierLabel = HEALTH_TIER_LABEL[tier];
                          const tierIcon = HEALTH_TIER_ICON[tier];
                          return (
                            <div
                              className="relative group"
                              role="img"
                              aria-label={`Loan health: ${(healthFactorBps / 10000).toFixed(2)} (${tierLabel})`}
                            >
                              <div className="flex items-center gap-0.5">
                                <div
                                  className="w-3 h-3 rounded-full"
                                  style={{ backgroundColor: healthColorHex }}
                                  aria-hidden="true"
                                />
                                <span
                                  className="text-xs font-bold leading-none"
                                  style={{ color: healthColorHex }}
                                  aria-hidden="true"
                                >
                                  {tierIcon}
                                </span>
                              </div>
                              <div className="absolute left-1/2 -translate-x-1/2 top-full mt-2 px-3 py-2 bg-brown-900 text-cream-50 text-xs rounded-lg opacity-0 group-hover:opacity-100 group-focus:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10 shadow-lg">
                                Loan health: {(healthFactorBps / 10000).toFixed(2)} ({tierLabel})
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                      <span className="bg-brown-100 dark:bg-brown-700 text-brown-700 dark:text-brown-200 text-xs font-semibold px-3 py-1 rounded-full">
                        {collateral.count}x
                      </span>
                    </div>
                  }
                  footer={
                    <p className="text-xs text-brown-500 font-mono">
                      ID: {collateral.id.slice(0, 8)}…
                    </p>
                  }
                >
                  <h3 className="text-lg font-semibold text-brown-700 dark:text-cream-50 mb-3 capitalize">
                    {collateral.animal_type}
                  </h3>
                  <div className="space-y-2">
                    <div>
                      <p className="text-xs text-brown-500 mb-0.5">Appraised Value</p>
                      <p className="font-semibold text-brown-700 dark:text-cream-50">
                        <MoneyAmount
                          value={collateral.appraised_value}
                          fromStroops
                          interactive={false}
                        />
                      </p>
                      <p className="text-xs text-brown-500 dark:text-brown-300">
                        {formatFiat(usdValue, 'USD')}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-brown-500 mb-0.5">Registered</p>
                      <p className="text-xs text-brown-600 dark:text-brown-300">
                        {new Date(collateral.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                </Card>
              </button>
            </div>
          );
        })}
      </div>

      {/* Pagination controls */}
      {showPagination && (
        <div className="mt-6 flex flex-col items-center gap-4 sm:flex-row sm:justify-between">
          {/* Page navigation */}
          <nav aria-label="Pagination" className="flex items-center gap-1">
            <button
              onClick={() => setPage(currentPage - 1)}
              disabled={currentPage === 1}
              aria-label="Previous page"
              className="rounded-lg px-3 py-2 text-sm font-medium text-brown-700 dark:text-cream-50 hover:bg-brown-100 dark:hover:bg-brown-700 focus:outline-none focus:ring-2 focus:ring-brown-600 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40 transition"
            >
              ← Prev
            </button>

            {Array.from({ length: totalPages }, (_, idx) => {
              const pageNum = idx + 1;
              const isCurrent = pageNum === currentPage;
              // Show first, last, current, and pages adjacent to current
              const isVisible =
                pageNum === 1 ||
                pageNum === totalPages ||
                Math.abs(pageNum - currentPage) <= 1;

              if (!isVisible) {
                // Show ellipsis once per gap
                if (pageNum === 2 || pageNum === totalPages - 1) {
                  return (
                    <span
                      key={`ellipsis-${pageNum}`}
                      className="px-2 py-2 text-sm text-brown-400"
                      aria-hidden="true"
                    >
                      …
                    </span>
                  );
                }
                return null;
              }

              return (
                <button
                  key={pageNum}
                  onClick={() => setPage(pageNum)}
                  aria-label={`Page ${pageNum}`}
                  aria-current={isCurrent ? 'page' : undefined}
                  className={`min-w-[2.25rem] rounded-lg px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brown-600 focus:ring-offset-2 transition ${
                    isCurrent
                      ? 'bg-brown-600 text-white dark:bg-brown-500'
                      : 'text-brown-700 dark:text-cream-50 hover:bg-brown-100 dark:hover:bg-brown-700'
                  }`}
                >
                  {pageNum}
                </button>
              );
            })}

            <button
              onClick={() => setPage(currentPage + 1)}
              disabled={currentPage === totalPages}
              aria-label="Next page"
              className="rounded-lg px-3 py-2 text-sm font-medium text-brown-700 dark:text-cream-50 hover:bg-brown-100 dark:hover:bg-brown-700 focus:outline-none focus:ring-2 focus:ring-brown-600 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40 transition"
            >
              Next →
            </button>
          </nav>

          {/* Page size selector */}
          <div className="flex items-center gap-2">
            <label
              htmlFor="collateral-page-size"
              className="text-sm text-brown-600 dark:text-brown-300"
            >
              Per page:
            </label>
            <select
              id="collateral-page-size"
              value={pageSize}
              onChange={(e) =>
                handlePageSizeChange(Number(e.target.value) as CollateralPageSize)
              }
              className="rounded-lg border border-brown-300 dark:border-brown-600 bg-white dark:bg-brown-800 px-2 py-1.5 text-sm text-brown-700 dark:text-cream-50 focus:outline-none focus:ring-2 focus:ring-brown-600 focus:ring-offset-2"
            >
              {COLLATERAL_PAGE_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
    </div>
  );
}

'use client';
import { useState, Suspense, useMemo, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import WalletConnect from '@/components/WalletConnect';
import CollateralSummary from '@/components/CollateralSummary';
import CollateralGrid from '@/components/CollateralGrid';
import ErrorState from '@/components/ErrorState';
import Pagination from '@/components/Pagination';
import { usePagination } from '@/hooks/usePagination';
import { useOwnerCollateral } from '@/hooks/useCollateral';
import { Button } from '@/components/ui';

// ── Types ──────────────────────────────────────────────────────────────────────

interface Collateral {
  id: string;
  animal_type: string;
  count: number;
  appraised_value: number;
  createdAt: string;
  health_factor_bps?: number | null;
}

type CollateralSortKey = 'animal_type' | 'count' | 'appraised_value' | 'createdAt';
type SortDir = 'asc' | 'desc';

const SORT_OPTIONS: { key: CollateralSortKey; label: string }[] = [
  { key: 'animal_type', label: 'Animal Type' },
  { key: 'count', label: 'Count' },
  { key: 'appraised_value', label: 'Appraised Value' },
  { key: 'createdAt', label: 'Date Registered' },
];

// ── Helpers ────────────────────────────────────────────────────────────────────

function sortCollateral(items: Collateral[], key: CollateralSortKey, dir: SortDir): Collateral[] {
  return [...items].sort((a, b) => {
    let cmp = 0;
    if (key === 'count' || key === 'appraised_value') {
      cmp = (a[key] as number) - (b[key] as number);
    } else if (key === 'createdAt') {
      cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    } else {
      cmp = String(a[key]).localeCompare(String(b[key]));
    }
    return dir === 'asc' ? cmp : -cmp;
  });
}

// ── Collateral controls (search + sort + live region) ─────────────────────────

function CollateralControls({
  collaterals,
  onFiltered,
}: {
  collaterals: Collateral[];
  onFiltered: (result: Collateral[], announcement: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<CollateralSortKey>('createdAt');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  // Announce changes to screen readers via a live region (#1430)
  const [announcement, setAnnouncement] = useState('');
  const isMounted = useRef(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = q
      ? collaterals.filter(
          (c) =>
            c.animal_type.toLowerCase().includes(q) ||
            c.id.toLowerCase().includes(q)
        )
      : collaterals;
    return sortCollateral(matches, sortKey, sortDir);
  }, [collaterals, query, sortKey, sortDir]);

  useEffect(() => {
    onFiltered(filtered, announcement);
  }, [filtered, announcement, onFiltered]);

  // Announce sort changes
  useEffect(() => {
    if (!isMounted.current) return;
    const label = SORT_OPTIONS.find((o) => o.key === sortKey)?.label ?? sortKey;
    const dir = sortDir === 'asc' ? 'ascending' : 'descending';
    setAnnouncement(`Sorted by ${label}, ${dir}`);
  }, [sortKey, sortDir]); // eslint-disable-line react-hooks/exhaustive-deps

  // Announce filter changes (debounce via 300 ms timeout)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevQuery = useRef(query);
  useEffect(() => {
    if (!isMounted.current) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (prevQuery.current !== query) {
        prevQuery.current = query;
        setAnnouncement(
          query ? `Filtered by "${query}": ${filtered.length} result${filtered.length !== 1 ? 's' : ''}` : 'Filter cleared'
        );
      }
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    isMounted.current = true;
  }, []);

  return (
    <>
      {/* Screen-reader live region (#1430) */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
        data-testid="collateral-sr-announcement"
      >
        {announcement}
      </div>

      <div className="flex flex-wrap gap-3 mb-4 items-end">
        {/* Search input */}
        <div className="flex-1 min-w-[200px]">
          <label htmlFor="collateral-search" className="sr-only">
            Search collateral
          </label>
          <input
            id="collateral-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by animal type or ID…"
            aria-label="Search collateral"
            className="w-full border border-brown/30 rounded-lg px-3 py-2 text-sm bg-white dark:bg-brown-900 dark:border-brown-600 focus:outline-none focus:ring-2 focus:ring-gold"
          />
        </div>

        {/* Sort key */}
        <div className="flex items-center gap-2">
          <label htmlFor="collateral-sort-by" className="text-sm text-brown/70 dark:text-cream/70 whitespace-nowrap">
            Sort by
          </label>
          <select
            id="collateral-sort-by"
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as CollateralSortKey)}
            aria-label="Sort collateral by"
            className="border border-brown/30 rounded-lg px-2 py-2 text-sm bg-white dark:bg-brown-900 dark:border-brown-600 focus:outline-none focus:ring-2 focus:ring-gold"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        {/* Sort direction toggle */}
        <button
          type="button"
          onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
          aria-label={`Sort direction: ${sortDir === 'asc' ? 'ascending' : 'descending'}. Click to toggle.`}
          aria-pressed={sortDir === 'desc'}
          className="flex items-center gap-1 border border-brown/30 rounded-lg px-3 py-2 text-sm bg-white dark:bg-brown-900 dark:border-brown-600 hover:border-brown/60 focus:outline-none focus:ring-2 focus:ring-gold transition"
        >
          {sortDir === 'asc' ? '↑ Asc' : '↓ Desc'}
        </button>
      </div>
    </>
  );
}

// ── Main page content ──────────────────────────────────────────────────────────

function CollateralContent() {
  const router = useRouter();
  const [wallet, setWallet] = useState<string | null>(null);
  const {
    collaterals: rawCollaterals,
    isLoading: loading,
    error,
    refresh: fetchCollaterals,
  } = useOwnerCollateral(wallet);

  // Filtered + sorted collateral produced by CollateralControls
  const [displayCollaterals, setDisplayCollaterals] = useState<Collateral[]>([]);
  const [srAnnouncement, setSrAnnouncement] = useState('');

  // Keep display list in sync when raw data loads
  useEffect(() => {
    setDisplayCollaterals(rawCollaterals as Collateral[]);
  }, [rawCollaterals]);

  function handleCardClick(collateralId: string) {
    router.push(`/dashboard/collateral/${collateralId}`);
  }

  const handleFiltered = (result: Collateral[], msg: string) => {
    setDisplayCollaterals(result);
    if (msg) setSrAnnouncement(msg);
  };

  const { page, limit, totalPages, setPage, setLimit, slice } = usePagination(displayCollaterals.length);
  const paginated = slice(displayCollaterals);

  return (
    <main className="max-w-6xl mx-auto px-4 py-10">
      <h1 className="text-2xl sm:text-3xl font-bold text-brown mb-6">My Collateral</h1>
      <WalletConnect onConnect={setWallet} />

      {wallet && (
        <>
          {error ? (
            <ErrorState message={error} onRetry={fetchCollaterals} />
          ) : loading ? (
            <CollateralGrid collaterals={[]} loading={true} onCardClick={handleCardClick} />
          ) : rawCollaterals.length > 0 ? (
            <>
              <CollateralSummary collaterals={rawCollaterals} />

              <CollateralControls
                collaterals={rawCollaterals as Collateral[]}
                onFiltered={handleFiltered}
              />

              {displayCollaterals.length === 0 ? (
                <p
                  role="status"
                  aria-live="polite"
                  className="text-brown/60 text-sm py-4"
                >
                  No collateral matches your search.
                </p>
              ) : (
                <>
                  {/* Result count announcement for screen readers */}
                  <p className="sr-only" role="status" aria-live="polite">
                    {srAnnouncement}
                  </p>

                  <CollateralGrid
                    collaterals={paginated}
                    loading={false}
                    onCardClick={handleCardClick}
                  />
                  <Pagination
                    page={page}
                    totalPages={totalPages}
                    limit={limit}
                    onPageChange={setPage}
                    onLimitChange={setLimit}
                  />
                </>
              )}
            </>
          ) : (
            <div className="bg-white rounded-2xl p-8 sm:p-12 shadow text-center">
              <h2 className="text-2xl font-semibold text-brown-700 mb-3">
                No Collateral Registered
              </h2>
              <p className="text-brown-400 mb-6">
                Register livestock as collateral to start borrowing
              </p>
              <Button onClick={() => router.push('/borrow')}>Register Collateral</Button>
            </div>
          )}
        </>
      )}
    </main>
  );
}

export default function CollateralPage() {
  return (
    <Suspense fallback={<main className="max-w-6xl mx-auto px-4 py-10"><div className="text-brown/60">Loading collateral...</div></main>}>
      <CollateralContent />
    </Suspense>
  );
}


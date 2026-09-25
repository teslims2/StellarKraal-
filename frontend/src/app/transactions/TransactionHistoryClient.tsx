'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import PageTransition from '@/components/PageTransition';
import TransactionHistory from '@/components/TransactionHistory';
import SkeletonTransactionHistory from '@/components/SkeletonTransactionHistory';
import ScrollToTopButton from '@/components/ScrollToTopButton';
import { useScrollPosition } from '@/hooks/useScrollPosition';

export default function TransactionHistoryClient() {
  useScrollPosition();

  return (
    <PageTransition>
      <main className="max-w-4xl mx-auto px-4 py-10" id="main-content">
        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb" className="mb-6">
          <ol className="flex flex-wrap items-center gap-1 text-sm" style={{ color: 'var(--token-text-muted)' }}>
            <li>
              <Link href="/dashboard" className="hover:underline transition" style={{ color: 'var(--token-text-muted)' }}>
                Dashboard
              </Link>
            </li>
            <li aria-hidden="true" className="select-none px-1">/</li>
            <li>
              <span aria-current="page" className="font-medium" style={{ color: 'var(--token-text)' }}>
                Transactions
              </span>
            </li>
          </ol>
        </nav>

        <h1 className="text-3xl font-bold mb-2" style={{ color: 'var(--token-text)' }}>
          Transaction History
        </h1>
        <p className="text-sm mb-8" style={{ color: 'var(--token-text-muted)' }}>
          Complete record of your on-chain loan transactions. Filter by type or date range and
          export to CSV.
        </p>

        <Suspense fallback={<SkeletonTransactionHistory />}>
          <TransactionHistory showFilters />
        </Suspense>
      </main>
      <ScrollToTopButton />
    </PageTransition>
  );
}

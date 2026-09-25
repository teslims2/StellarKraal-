"use client";

import Skeleton from "./Skeleton";

/**
 * SkeletonTransactionHistory — loading placeholder for the Transaction History page (#1065).
 *
 * Mirrors the page layout: page heading, filter bar, and a table/card list
 * of transaction rows.
 */
export default function SkeletonTransactionHistory() {
  return (
    <main
      className="max-w-4xl mx-auto px-4 py-10"
      aria-busy="true"
      aria-label="Loading transactions"
    >
      {/* ── Page heading + export button ── */}
      <div className="mb-6 flex items-center justify-between gap-4">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-10 w-32 rounded-lg" />
      </div>

      {/* ── Filter bar ── */}
      <div className="flex flex-wrap gap-3 mb-6">
        <Skeleton className="h-10 w-40 rounded-lg" />
        <Skeleton className="h-10 w-36 rounded-lg" />
        <Skeleton className="h-10 w-36 rounded-lg" />
        <Skeleton className="h-10 flex-1 min-w-[120px] rounded-lg" />
      </div>

      {/* ── Transaction rows — mobile card list ── */}
      <ul className="flex flex-col gap-3 sm:hidden" aria-label="Loading transaction list">
        {[...Array(5)].map((_, i) => (
          <li
            key={i}
            className="rounded-xl border border-brown-100 bg-cream-100 p-4 shadow-sm
                       dark:bg-brown-800 dark:border-brown-700"
            aria-hidden="true"
          >
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
          </li>
        ))}
      </ul>

      {/* ── Transaction rows — desktop table ── */}
      <div className="hidden sm:block overflow-auto rounded-xl border border-brown-100 dark:border-brown-700">
        {/* Header row */}
        <div
          className="grid grid-cols-5 gap-4 px-4 py-3 border-b border-brown-100
                     dark:border-brown-700 bg-white dark:bg-stone-800"
        >
          <Skeleton className="h-3 w-10" />
          <Skeleton className="h-3 w-14" />
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-3 w-12" />
          <Skeleton className="h-3 w-12" />
        </div>
        {/* Data rows */}
        {[...Array(7)].map((_, i) => (
          <div
            key={i}
            className="grid grid-cols-5 gap-4 px-4 py-3 border-b border-brown-50
                       dark:border-brown-700/50 last:border-0"
            aria-hidden="true"
          >
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-24 font-mono" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
        ))}
      </div>

      {/* ── Pagination bar ── */}
      <div className="mt-4 flex items-center justify-between">
        <Skeleton className="h-4 w-32" />
        <div className="flex gap-2">
          <Skeleton className="h-8 w-8 rounded-lg" />
          <Skeleton className="h-8 w-8 rounded-lg" />
          <Skeleton className="h-8 w-8 rounded-lg" />
        </div>
      </div>
    </main>
  );
}

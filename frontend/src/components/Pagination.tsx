import { PAGE_SIZE_OPTIONS, PageSize } from '@/hooks/usePagination';

interface Props {
  page: number;
  totalPages: number;
  limit: PageSize;
  onPageChange: (page: number) => void;
  onLimitChange: (limit: PageSize) => void;
  /** True while the next page is being fetched. Disables every control. */
  loading?: boolean;
}

type PageToken = number | 'ellipsis-start' | 'ellipsis-end';

/**
 * Page numbers to show: always the first and last page, the current page and
 * its neighbours, with ellipses for gaps. Short lists show every page.
 */
export function pageTokens(page: number, totalPages: number): PageToken[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const tokens: PageToken[] = [1];
  const start = Math.max(2, page - 1);
  const end = Math.min(totalPages - 1, page + 1);
  if (start > 2) tokens.push('ellipsis-start');
  for (let p = start; p <= end; p++) tokens.push(p);
  if (end < totalPages - 1) tokens.push('ellipsis-end');
  tokens.push(totalPages);
  return tokens;
}

const navButtonClass =
  'px-3 py-1 rounded-md border border-brown-200 text-sm text-brown-600 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-brown-50 dark:border-brown-600 dark:text-cream-50 dark:hover:bg-brown-700 transition-colors';

export default function Pagination({
  page,
  totalPages,
  limit,
  onPageChange,
  onLimitChange,
  loading = false,
}: Props) {
  return (
    <nav
      aria-label="Pagination"
      aria-busy={loading}
      className="flex flex-wrap items-center justify-between gap-3 mt-6"
    >
      <div className="flex items-center gap-2 text-sm text-brown-600">
        <label htmlFor="page-size" className="sr-only">
          Items per page
        </label>
        <span>Show</span>
        <select
          id="page-size"
          value={limit}
          disabled={loading}
          onChange={(e) => onLimitChange(Number(e.target.value) as PageSize)}
          className="border border-brown-200 rounded-md px-2 py-1 text-sm bg-white dark:bg-brown-800 dark:border-brown-600 dark:text-cream-50 focus:outline-none focus:ring-2 focus:ring-brown-500 disabled:opacity-40"
        >
          {PAGE_SIZE_OPTIONS.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <span>per page</span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={loading || page <= 1}
          aria-label="Previous page"
          className={navButtonClass}
        >
          ← Prev
        </button>

        <ul className="flex items-center gap-1" aria-label="Page numbers">
          {pageTokens(page, totalPages).map((token) =>
            typeof token === 'number' ? (
              <li key={token}>
                <button
                  type="button"
                  onClick={() => onPageChange(token)}
                  disabled={loading}
                  aria-label={`Page ${token}`}
                  aria-current={token === page ? 'page' : undefined}
                  className={[
                    'min-w-[2rem] px-2 py-1 rounded-md border text-sm transition-colors disabled:cursor-not-allowed',
                    token === page
                      ? 'bg-brown-600 border-brown-600 text-white dark:bg-cream-50 dark:text-brown-900'
                      : 'border-brown-200 text-brown-600 hover:bg-brown-50 dark:border-brown-600 dark:text-cream-50 dark:hover:bg-brown-700',
                  ].join(' ')}
                >
                  {token}
                </button>
              </li>
            ) : (
              <li key={token} aria-hidden="true" className="px-1 text-sm text-brown-600">
                …
              </li>
            )
          )}
        </ul>

        <span className="text-sm text-brown-600 dark:text-cream-200">
          Page {page} of {totalPages}
        </span>

        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={loading || page >= totalPages}
          aria-label="Next page"
          className={navButtonClass}
        >
          Next →
        </button>
      </div>

      {loading && (
        <span role="status" aria-live="polite" className="sr-only">
          Loading page
        </span>
      )}
    </nav>
  );
}

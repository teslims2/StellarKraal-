'use client';
/**
 * DataTable — reusable, sortable table for loan and collateral lists (#1447).
 *
 * Built on the responsive table shell from #1101/#1415 and standardises four
 * things that used to be re-implemented on every list page:
 *
 *  1. Typed `columns` / `data` props (works with interfaces as well as plain
 *     object types — no `Record<string, unknown>` constraint).
 *  2. Clickable column headers that toggle ascending / descending sort.
 *     Sorting is local by default, but can be controlled by a parent (e.g. the
 *     loans page keeps its sort state in the URL) and can optionally be synced
 *     back to query params for backwards compatibility with #1101.
 *  3. An `emptyState` slot for a custom message **and CTA** when there are no
 *     rows. `emptyMessage` remains as a simple text fallback.
 *  4. An actions column configured via `actions` (column config) or the
 *     `actions` shorthand prop — any row action such as View, Repay or
 *     Liquidate can be rendered as a button or a link.
 *
 * @example
 * ```tsx
 * <DataTable
 *   columns={[
 *     { key: 'amount', label: 'Amount', render: (v) => `${v} XLM` },
 *     { key: 'status', label: 'Status' },
 *   ]}
 *   data={loans}
 *   rowKey={(loan) => loan.id}
 *   actions={[
 *     { label: 'View', href: (loan) => `/loans/${loan.id}` },
 *     { label: 'Repay', onClick: repay, variant: 'primary' },
 *     { label: 'Liquidate', onClick: liquidate, variant: 'danger' },
 *   ]}
 *   emptyState={<><p>No loans yet.</p><Link href="/borrow">Borrow now</Link></>}
 * />
 * ```
 */
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';
import ScrollableTable from './ScrollableTable';

/* ─── Types ─────────────────────────────────────────────────── */

export type SortDirection = 'asc' | 'desc';
export type SortKey<T> = Extract<keyof T, string>;

/** Values understood by the built-in comparator. */
export type SortableValue = string | number | boolean | Date | null | undefined;

export interface SortState<T> {
  key: SortKey<T> | null;
  direction: SortDirection;
}

/** Visual treatment for a row action. */
export type RowActionVariant = 'default' | 'primary' | 'danger';

/**
 * One action in the actions column. `label` is used as the accessible name
 * unless `ariaLabel` is provided. Provide `href` for a link or `onClick` for a
 * button; `disabled` and `hidden` may depend on the row.
 */
export interface RowAction<T> {
  label: string;
  onClick?: (row: T) => void;
  href?: string | ((row: T) => string);
  disabled?: boolean | ((row: T) => boolean);
  hidden?: boolean | ((row: T) => boolean);
  variant?: RowActionVariant;
  ariaLabel?: string | ((row: T) => string);
  className?: string;
}

/** A regular, optionally sortable data column. */
export interface DataColumn<T> {
  type?: 'data';
  /** Field name on the row. */
  key: SortKey<T>;
  /** Header label. */
  label: string;
  /** Set to `false` to make the header non-sortable. Defaults to `true`. */
  sortable?: boolean;
  /** Custom cell renderer. */
  render?: (value: T[SortKey<T>], row: T) => ReactNode;
  /** Override the value used for sorting (e.g. parse a date string). */
  sortValue?: (row: T) => SortableValue;
  /** Extra classes applied to both the header and its cells. */
  className?: string;
}

/** A non-sortable column whose cells render one or more {@link RowAction}s. */
export interface ActionsColumn<T> {
  type: 'actions';
  /** Defaults to `actions`; only used as a React key. */
  key?: string;
  /** Defaults to `Actions`. */
  label?: string;
  actions: RowAction<T>[];
  className?: string;
}

export type ColumnDef<T> = DataColumn<T> | ActionsColumn<T>;

export interface DataTableProps<T extends object> {
  /** Column configuration (data columns and, optionally, an actions column). */
  columns: ColumnDef<T>[];
  /** Rows to display. */
  data: T[];
  /** Stable key extractor for rows. */
  rowKey: (row: T) => string;
  /** Accessible name for the table / scroll region. */
  caption?: string;
  /** Extra classes for the outer scroll container. */
  className?: string;
  /**
   * Row actions shorthand. Appended as an "Actions" column when `columns`
   * does not already contain an actions column.
   */
  actions?: RowAction<T>[];
  /**
   * Empty-state slot. Rendered in place of the rows when `data` is empty,
   * so callers can supply both a message and a CTA.
   */
  emptyState?: ReactNode;
  /** Plain-text fallback used when no `emptyState` slot is provided. */
  emptyMessage?: string;

  /** Initial sort column for the uncontrolled (default) mode. */
  defaultSortBy?: SortKey<T>;
  /** Initial sort direction. Defaults to `asc`. */
  defaultSortDir?: SortDirection;
  /** Controlled sort column. Pair with `onSortChange`. */
  sortBy?: SortKey<T> | null;
  /** Controlled sort direction. */
  sortDir?: SortDirection;
  /** Called whenever a sortable header is clicked. */
  onSortChange?: (state: SortState<T>) => void;

  /** Mirror sort state to URL query params (opt-in; #1101 compatibility). */
  syncSortToUrl?: boolean;
  /** Query param used for the sort column when `syncSortToUrl` is set. */
  sortByParam?: string;
  /** Query param used for the sort direction when `syncSortToUrl` is set. */
  sortDirParam?: string;
}

/* ─── Helpers ───────────────────────────────────────────────── */

function isActionsColumn<T>(column: ColumnDef<T>): column is ActionsColumn<T> {
  return (
    (column as ActionsColumn<T>).type === 'actions' ||
    Array.isArray((column as ActionsColumn<T>).actions)
  );
}

function compareValues(a: SortableValue, b: SortableValue): number {
  // Nullish values always sort last (in ascending order).
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;

  if (a instanceof Date || b instanceof Date) {
    const aTime = a instanceof Date ? a.getTime() : new Date(String(a)).getTime();
    const bTime = b instanceof Date ? b.getTime() : new Date(String(b)).getTime();
    return (Number.isNaN(aTime) ? 0 : aTime) - (Number.isNaN(bTime) ? 0 : bTime);
  }
  if (typeof a === 'number' && typeof b === 'number') {
    const aNum = Number.isNaN(a) ? 0 : a;
    const bNum = Number.isNaN(b) ? 0 : b;
    return aNum - bNum;
  }
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b);

  // `numeric: true` keeps "loan-2" before "loan-10".
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

function actionClasses(variant: RowActionVariant | undefined, disabled: boolean): string {
  return cn(
    'inline-flex min-h-[36px] items-center justify-center rounded-md px-3 py-1.5 text-xs font-semibold transition-colors',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-1',
    'disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50',
    variant === 'primary' && 'bg-gold text-brown hover:bg-gold/80',
    variant === 'danger' &&
      'text-error-dark hover:bg-error-light dark:text-error-light dark:hover:bg-error-light/10',
    (variant === 'default' || !variant) &&
      'text-brown hover:bg-brown/5 dark:text-cream dark:hover:bg-cream/10',
    disabled && 'pointer-events-none'
  );
}

/* ─── Sort icon ─────────────────────────────────────────────── */
function SortIcon({ direction }: { direction: SortDirection | null }) {
  if (!direction) {
    return (
      <span
        aria-hidden="true"
        className="ml-1 text-brown/40 dark:text-cream/40 text-xs select-none"
      >
        ↕
      </span>
    );
  }
  return (
    <span aria-hidden="true" className="ml-1 text-gold text-xs select-none">
      {direction === 'asc' ? '▲' : '▼'}
    </span>
  );
}

/**
 * Writes the active sort to the URL. Rendered only when `syncSortToUrl` is
 * enabled so the common case does not need a router / Suspense boundary.
 */
function SortUrlSync<T>({
  state,
  sortByParam,
  sortDirParam,
}: {
  state: SortState<T>;
  sortByParam: string;
  sortDirParam: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!state.key) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set(sortByParam, state.key);
    params.set(sortDirParam, state.direction);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    // Intentionally keyed on the sort state only: reacting to searchParams
    // would loop because router.replace changes them again.
  }, [state.key, state.direction, router, pathname, sortByParam, sortDirParam]);

  return null;
}

/* ─── Component ─────────────────────────────────────────────── */
export default function DataTable<T extends object>({
  columns,
  data,
  rowKey,
  caption,
  className,
  actions,
  emptyState,
  emptyMessage = 'No records found.',
  defaultSortBy,
  defaultSortDir = 'asc',
  sortBy,
  sortDir,
  onSortChange,
  syncSortToUrl = false,
  sortByParam = 'sortBy',
  sortDirParam = 'sortDir',
}: DataTableProps<T>) {
  const [internalSort, setInternalSort] = useState<SortState<T>>({
    key: defaultSortBy ?? null,
    direction: defaultSortDir,
  });

  // `sortBy === undefined` means uncontrolled; `null` means explicitly unsorted.
  const activeSort: SortState<T> =
    sortBy === undefined ? internalSort : { key: sortBy, direction: sortDir ?? 'asc' };

  const handleSort = useCallback(
    (key: SortKey<T>) => {
      const direction: SortDirection =
        activeSort.key === key && activeSort.direction === 'asc' ? 'desc' : 'asc';
      const next: SortState<T> = { key, direction };
      if (sortBy === undefined) setInternalSort(next);
      onSortChange?.(next);
    },
    [activeSort.key, activeSort.direction, sortBy, onSortChange]
  );

  // Preserve column order; add the shorthand actions column only when needed.
  const allColumns = useMemo<ColumnDef<T>[]>(() => {
    if (columns.some(isActionsColumn) || !actions?.length) return columns;
    return [...columns, { type: 'actions', label: 'Actions', actions }];
  }, [columns, actions]);

  const sortedData = useMemo(() => {
    const key = activeSort.key;
    if (!key) return data;

    const column = columns.find(
      (col): col is DataColumn<T> => !isActionsColumn(col) && col.key === key
    );

    return [...data]
      .map((row, index) => ({ row, index }))
      .sort((a, b) => {
        const aValue: SortableValue = column?.sortValue
          ? column.sortValue(a.row)
          : (a.row[key] as SortableValue);
        const bValue: SortableValue = column?.sortValue
          ? column.sortValue(b.row)
          : (b.row[key] as SortableValue);
        const result = compareValues(aValue, bValue);
        // Stable sort: keep the original order for equal values.
        return (activeSort.direction === 'asc' ? result : -result) || a.index - b.index;
      })
      .map(({ row }) => row);
  }, [data, columns, activeSort.key, activeSort.direction]);

  const scrollLabel = caption ?? 'Data table';

  return (
    <>
      {syncSortToUrl && (
        <SortUrlSync state={activeSort} sortByParam={sortByParam} sortDirParam={sortDirParam} />
      )}
      <ScrollableTable
        label={scrollLabel}
        className={cn(
          'rounded-xl border border-brown/10 shadow-sm dark:border-brown-700',
          className
        )}
      >
        <table className="w-full text-sm" role="grid" aria-label={caption}>
          {caption && <caption className="sr-only">{caption}</caption>}

          <thead className="bg-brown/5 dark:bg-brown-800/50">
            <tr>
              {allColumns.map((column) => {
                if (isActionsColumn(column)) {
                  return (
                    <th
                      key={column.key ?? 'actions'}
                      scope="col"
                      className={cn(
                        'whitespace-nowrap px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-brown-600 dark:text-cream-200',
                        column.className
                      )}
                    >
                      {column.label ?? 'Actions'}
                    </th>
                  );
                }

                const sortable = column.sortable !== false;
                const isSorted = activeSort.key === column.key;
                const ariaSort: 'ascending' | 'descending' | 'none' | undefined = sortable
                  ? isSorted
                    ? activeSort.direction === 'asc'
                      ? 'ascending'
                      : 'descending'
                    : 'none'
                  : undefined;

                return (
                  <th
                    key={column.key}
                    scope="col"
                    aria-sort={ariaSort}
                    className={cn(
                      'whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-brown-600 dark:text-cream-200',
                      sortable && 'cursor-pointer hover:bg-brown/5 dark:hover:bg-cream/5',
                      column.className
                    )}
                    onClick={sortable ? () => handleSort(column.key) : undefined}
                    onKeyDown={
                      sortable
                        ? (event) => {
                            if (
                              event.target === event.currentTarget &&
                              (event.key === 'Enter' || event.key === ' ')
                            ) {
                              event.preventDefault();
                              handleSort(column.key);
                            }
                          }
                        : undefined
                    }
                    tabIndex={sortable ? 0 : undefined}
                  >
                    {sortable ? (
                      <button
                        type="button"
                        className="inline-flex items-center rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
                        aria-label={`Sort by ${column.label}${isSorted ? `, currently ${activeSort.direction === 'asc' ? 'ascending' : 'descending'}` : ''}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          handleSort(column.key);
                        }}
                      >
                        {column.label}
                        <SortIcon direction={isSorted ? activeSort.direction : null} />
                      </button>
                    ) : (
                      column.label
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody className="divide-y divide-brown/10 dark:divide-brown-700">
            {sortedData.length === 0 ? (
              <tr>
                <td colSpan={allColumns.length} className="px-4 py-8">
                  <div
                    role="status"
                    aria-live="polite"
                    className="flex flex-col items-center justify-center gap-3 text-center text-brown/60 dark:text-cream/60"
                  >
                    {emptyState ?? <p>{emptyMessage}</p>}
                  </div>
                </td>
              </tr>
            ) : (
              sortedData.map((row, rowIndex) => (
                <tr
                  key={rowKey(row)}
                  className={cn(
                    'transition-colors',
                    rowIndex % 2 === 0
                      ? 'bg-white hover:bg-brown/5 dark:bg-brown-900 dark:hover:bg-brown-800'
                      : 'bg-cream/40 hover:bg-cream/70 dark:bg-brown-900/60 dark:hover:bg-brown-800'
                  )}
                >
                  {allColumns.map((column) => {
                    if (isActionsColumn(column)) {
                      return (
                        <td key={column.key ?? 'actions'} className="px-4 py-3 text-right">
                          <div className="flex flex-wrap items-center justify-end gap-2">
                            {column.actions.map((action, actionIndex) => {
                              const disabled =
                                typeof action.disabled === 'function'
                                  ? action.disabled(row)
                                  : !!action.disabled;
                              const hidden =
                                typeof action.hidden === 'function'
                                  ? action.hidden(row)
                                  : !!action.hidden;
                              if (hidden) return null;

                              const label =
                                typeof action.ariaLabel === 'function'
                                  ? action.ariaLabel(row)
                                  : (action.ariaLabel ?? action.label);
                              const href =
                                typeof action.href === 'function' ? action.href(row) : action.href;
                              const classes = cn(
                                actionClasses(action.variant, disabled),
                                action.className
                              );
                              const key = `${action.label}-${actionIndex}`;

                              if (href) {
                                return (
                                  <Link
                                    key={key}
                                    href={href}
                                    aria-label={label}
                                    aria-disabled={disabled || undefined}
                                    className={classes}
                                  >
                                    {action.label}
                                  </Link>
                                );
                              }

                              return (
                                <button
                                  key={key}
                                  type="button"
                                  onClick={() => action.onClick?.(row)}
                                  disabled={disabled}
                                  aria-label={label}
                                  className={classes}
                                >
                                  {action.label}
                                </button>
                              );
                            })}
                          </div>
                        </td>
                      );
                    }

                    const value = row[column.key];
                    return (
                      <td
                        key={column.key}
                        className={cn('px-4 py-3 text-brown dark:text-cream', column.className)}
                      >
                        {column.render ? column.render(value, row) : ((value as ReactNode) ?? '—')}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </ScrollableTable>
    </>
  );
}

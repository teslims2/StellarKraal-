import { useCallback } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';

/** Page sizes offered in the page-size selector (#1467). */
export const PAGE_SIZE_OPTIONS = [10, 25, 50] as const;
export type PageSize = (typeof PAGE_SIZE_OPTIONS)[number];

export const DEFAULT_PAGE_SIZE: PageSize = 10;

export interface PaginationParams {
  /** 1-based current page, read from the `page` URL param. */
  page: number;
  /** Rows per page, read from the `pageSize` URL param (`limit` is accepted for old links). */
  pageSize: PageSize;
  setPage: (page: number) => void;
  setPageSize: (pageSize: PageSize) => void;
}

export interface PaginationState {
  page: number;
  limit: PageSize;
  totalPages: number;
  setPage: (page: number) => void;
  setLimit: (limit: PageSize) => void;
  slice: <T>(items: T[]) => T[];
}

/** Parse a page number. Anything that is not a positive integer becomes 1. */
export function parsePage(raw: string | null): number {
  const n = parseInt(raw ?? '1', 10);
  return Number.isInteger(n) && n >= 1 ? n : 1;
}

/** Parse a page size. Anything outside PAGE_SIZE_OPTIONS becomes the fallback. */
export function parsePageSize(
  raw: string | null,
  fallback: PageSize = DEFAULT_PAGE_SIZE
): PageSize {
  const n = parseInt(raw ?? '', 10);
  return (PAGE_SIZE_OPTIONS as readonly number[]).includes(n) ? (n as PageSize) : fallback;
}

/**
 * URL-backed pagination state. Used by both server-driven lists (fetch the
 * current page from the API) and client-side lists (see `usePagination`).
 * Changing the page size resets to page 1. Legacy `limit` params are dropped
 * when the size changes so the URL has one canonical key.
 */
export function usePaginationParams(
  defaultPageSize: PageSize = DEFAULT_PAGE_SIZE
): PaginationParams {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const pageSize = parsePageSize(
    searchParams.get('pageSize') ?? searchParams.get('limit'),
    defaultPageSize
  );
  const page = parsePage(searchParams.get('page'));

  const navigate = useCallback(
    (update: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParams.toString());
      update(params);
      router.push(`${pathname}?${params.toString()}`);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [router, pathname, searchParams]
  );

  const setPage = useCallback(
    (p: number) =>
      navigate((params) => {
        params.set('page', String(p));
      }),
    [navigate]
  );

  const setPageSize = useCallback(
    (size: PageSize) =>
      navigate((params) => {
        params.set('pageSize', String(size));
        params.delete('limit');
        params.set('page', '1');
      }),
    [navigate]
  );

  return { page, pageSize, setPage, setPageSize };
}

/**
 * Client-side pagination over an in-memory list. Kept for pages that already
 * hold the whole list (dashboard collateral, admin users). Server-driven lists
 * should use `usePaginationParams` and fetch only the requested page.
 */
export function usePagination(
  totalItems: number,
  defaultLimit: PageSize = DEFAULT_PAGE_SIZE
): PaginationState {
  const {
    page: rawPage,
    pageSize: limit,
    setPage,
    setPageSize,
  } = usePaginationParams(defaultLimit);

  const totalPages = Math.max(1, Math.ceil(totalItems / limit));
  const page = Math.min(rawPage, totalPages);

  const slice = useCallback(
    <T>(items: T[]): T[] => {
      const start = (page - 1) * limit;
      return items.slice(start, start + limit);
    },
    [page, limit]
  );

  return { page, limit, totalPages, setPage, setLimit: setPageSize, slice };
}

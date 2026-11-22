/**
 * Tests for the Pagination component and usePagination hook.
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { renderHook, act } from '@testing-library/react';
import Pagination, { pageTokens } from '../components/Pagination';
import {
  usePagination,
  usePaginationParams,
  PAGE_SIZE_OPTIONS,
  parsePage,
  parsePageSize,
} from '../hooks/usePagination';

// ─── next/navigation mock ────────────────────────────────────────────────────
const mockPush = jest.fn();
let mockSearchParams = new URLSearchParams();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => '/test',
  useSearchParams: () => mockSearchParams,
}));

// ─── window.scrollTo mock ────────────────────────────────────────────────────
Object.defineProperty(window, 'scrollTo', { value: jest.fn(), writable: true });

// ─── Helpers ─────────────────────────────────────────────────────────────────
function setParams(params: Record<string, string>) {
  mockSearchParams = new URLSearchParams(params);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSearchParams = new URLSearchParams();
});

// ─── Pagination component ─────────────────────────────────────────────────────
describe('Pagination component', () => {
  const defaultProps = {
    page: 1,
    totalPages: 5,
    limit: 10 as const,
    onPageChange: jest.fn(),
    onLimitChange: jest.fn(),
  };

  it('renders page info', () => {
    render(<Pagination {...defaultProps} />);
    expect(screen.getByText('Page 1 of 5')).toBeTruthy();
  });

  it('disables Prev button on first page', () => {
    render(<Pagination {...defaultProps} page={1} />);
    expect(screen.getByRole('button', { name: /previous page/i })).toBeDisabled();
  });

  it('disables Next button on last page', () => {
    render(<Pagination {...defaultProps} page={5} totalPages={5} />);
    expect(screen.getByRole('button', { name: /next page/i })).toBeDisabled();
  });

  it('enables both buttons on a middle page', () => {
    render(<Pagination {...defaultProps} page={3} totalPages={5} />);
    expect(screen.getByRole('button', { name: /previous page/i })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: /next page/i })).not.toBeDisabled();
  });

  it('calls onPageChange with page-1 when Prev is clicked', () => {
    const onPageChange = jest.fn();
    render(<Pagination {...defaultProps} page={3} onPageChange={onPageChange} />);
    fireEvent.click(screen.getByRole('button', { name: /previous page/i }));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it('calls onPageChange with page+1 when Next is clicked', () => {
    const onPageChange = jest.fn();
    render(<Pagination {...defaultProps} page={3} onPageChange={onPageChange} />);
    fireEvent.click(screen.getByRole('button', { name: /next page/i }));
    expect(onPageChange).toHaveBeenCalledWith(4);
  });

  it('renders all page size options', () => {
    render(<Pagination {...defaultProps} />);
    const select = screen.getByRole('combobox');
    PAGE_SIZE_OPTIONS.forEach((n) => {
      expect(select.querySelector(`option[value="${n}"]`)).toBeTruthy();
    });
  });

  it('calls onLimitChange when page size is changed', () => {
    const onLimitChange = jest.fn();
    render(<Pagination {...defaultProps} onLimitChange={onLimitChange} />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '25' } });
    expect(onLimitChange).toHaveBeenCalledWith(25);
  });

  it('offers exactly 10, 25 and 50 rows per page', () => {
    expect([...PAGE_SIZE_OPTIONS]).toEqual([10, 25, 50]);
  });

  it('renders a numbered button for each page of a short list', () => {
    render(<Pagination {...defaultProps} page={2} totalPages={4} />);
    for (const n of [1, 2, 3, 4]) {
      expect(screen.getByRole('button', { name: `Page ${n}` })).toBeTruthy();
    }
  });

  it('marks the current page with aria-current', () => {
    render(<Pagination {...defaultProps} page={3} totalPages={5} />);
    expect(screen.getByRole('button', { name: 'Page 3' }).getAttribute('aria-current')).toBe(
      'page'
    );
    expect(screen.getByRole('button', { name: 'Page 2' }).getAttribute('aria-current')).toBeNull();
  });

  it('calls onPageChange with the number of the clicked page button', () => {
    const onPageChange = jest.fn();
    render(<Pagination {...defaultProps} page={1} totalPages={5} onPageChange={onPageChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Page 4' }));
    expect(onPageChange).toHaveBeenCalledWith(4);
  });

  it('disables every control while loading', () => {
    render(<Pagination {...defaultProps} page={3} totalPages={5} loading />);
    expect(screen.getByRole('button', { name: /previous page/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /next page/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Page 2' })).toBeDisabled();
    expect(screen.getByRole('combobox')).toBeDisabled();
    expect(screen.getByRole('navigation', { name: /pagination/i }).getAttribute('aria-busy')).toBe(
      'true'
    );
    expect(screen.getByText('Loading page')).toBeTruthy();
  });

  it('has accessible nav landmark', () => {
    render(<Pagination {...defaultProps} />);
    expect(screen.getByRole('navigation', { name: /pagination/i })).toBeTruthy();
  });
});

// ─── usePagination hook ───────────────────────────────────────────────────────
describe('pageTokens', () => {
  it('shows every page when there are seven or fewer', () => {
    expect(pageTokens(3, 5)).toEqual([1, 2, 3, 4, 5]);
  });

  it('collapses the middle of a long list around the current page', () => {
    expect(pageTokens(5, 10)).toEqual([1, 'ellipsis-start', 4, 5, 6, 'ellipsis-end', 10]);
  });

  it('shows the start of the list without a leading ellipsis', () => {
    expect(pageTokens(1, 10)).toEqual([1, 2, 'ellipsis-end', 10]);
  });

  it('shows the end of the list without a trailing ellipsis', () => {
    expect(pageTokens(10, 10)).toEqual([1, 'ellipsis-start', 9, 10]);
  });
});

describe('URL parsing helpers', () => {
  it('parsePage accepts positive integers and falls back to 1', () => {
    expect(parsePage('4')).toBe(4);
    expect(parsePage('0')).toBe(1);
    expect(parsePage('abc')).toBe(1);
    expect(parsePage(null)).toBe(1);
  });

  it('parsePageSize only accepts configured sizes', () => {
    expect(parsePageSize('25')).toBe(25);
    expect(parsePageSize('20')).toBe(10);
    expect(parsePageSize(null, 50)).toBe(50);
  });
});

describe('usePaginationParams hook', () => {
  it('reads pageSize from the URL', () => {
    setParams({ page: '2', pageSize: '50' });
    const { result } = renderHook(() => usePaginationParams(10));
    expect(result.current.page).toBe(2);
    expect(result.current.pageSize).toBe(50);
  });

  it('still reads the legacy limit param', () => {
    setParams({ limit: '25' });
    const { result } = renderHook(() => usePaginationParams(10));
    expect(result.current.pageSize).toBe(25);
  });

  it('setPageSize writes pageSize, drops limit and resets to page 1', () => {
    setParams({ page: '4', limit: '10' });
    const { result } = renderHook(() => usePaginationParams(10));
    act(() => {
      result.current.setPageSize(50);
    });
    const url = mockPush.mock.calls[0][0] as string;
    expect(url).toContain('pageSize=50');
    expect(url).toContain('page=1');
    expect(url).not.toContain('limit=');
  });
});

describe('usePagination hook', () => {
  it('defaults to page 1 and page size 10', () => {
    const { result } = renderHook(() => usePagination(100));
    expect(result.current.page).toBe(1);
    expect(result.current.limit).toBe(10);
  });

  it('reads page and page size from URL params', () => {
    setParams({ page: '3', pageSize: '25' });
    const { result } = renderHook(() => usePagination(100));
    expect(result.current.page).toBe(3);
    expect(result.current.limit).toBe(25);
  });

  it('clamps page to totalPages when URL page exceeds total', () => {
    setParams({ page: '99' });
    const { result } = renderHook(() => usePagination(15)); // 15 items / 10 per page = 2 pages
    expect(result.current.page).toBe(2);
  });

  it('clamps page to 1 when URL page is 0 or negative', () => {
    setParams({ page: '0' });
    const { result } = renderHook(() => usePagination(50));
    expect(result.current.page).toBe(1);
  });

  it('falls back to limit 10 for invalid limit values', () => {
    setParams({ limit: '99' });
    const { result } = renderHook(() => usePagination(100));
    expect(result.current.limit).toBe(10);
  });

  it('computes totalPages correctly', () => {
    const { result } = renderHook(() => usePagination(25));
    expect(result.current.totalPages).toBe(3); // ceil(25/10)
  });

  it('totalPages is at least 1 for empty list', () => {
    const { result } = renderHook(() => usePagination(0));
    expect(result.current.totalPages).toBe(1);
  });

  it('slice returns the correct window of items', () => {
    setParams({ page: '2', limit: '10' });
    const { result } = renderHook(() => usePagination(30));
    const items = Array.from({ length: 30 }, (_, i) => i);
    expect(result.current.slice(items)).toEqual(items.slice(10, 20));
  });

  it('setPage navigates to the new page URL', () => {
    const { result } = renderHook(() => usePagination(100));
    act(() => {
      result.current.setPage(3);
    });
    expect(mockPush).toHaveBeenCalledWith(expect.stringContaining('page=3'));
  });

  it('setLimit navigates with new pageSize and resets to page 1', () => {
    setParams({ page: '4' });
    const { result } = renderHook(() => usePagination(100));
    act(() => {
      result.current.setLimit(25);
    });
    const url = mockPush.mock.calls[0][0] as string;
    expect(url).toContain('pageSize=25');
    expect(url).toContain('page=1');
  });

  it('setPage calls window.scrollTo', () => {
    const { result } = renderHook(() => usePagination(100));
    act(() => {
      result.current.setPage(2);
    });
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
  });
});

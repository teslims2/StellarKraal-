/**
 * Server-driven pagination on the loans list (#1467).
 *
 * The list requests only the current page from the API, reads page and
 * pageSize from the URL, and derives the page count from the server total.
 */
import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import LoansListClient from '../app/loans/LoansListClient';

let mockParams: Record<string, string> = {};
const mockPush = jest.fn();
const mockReplace = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  usePathname: () => '/loans',
  useSearchParams: () => ({
    get: (key: string) => mockParams[key] ?? null,
    getAll: () => [],
    toString: () => new URLSearchParams(mockParams).toString(),
  }),
}));

jest.mock('framer-motion', () => ({
  motion: {
    span: ({ children, ...props }: React.PropsWithChildren<object>) => (
      <span {...props}>{children}</span>
    ),
    div: ({ children, ...props }: React.PropsWithChildren<object>) => (
      <div {...props}>{children}</div>
    ),
  },
  AnimatePresence: ({ children }: React.PropsWithChildren<object>) => <>{children}</>,
  useReducedMotion: () => false,
}));

Object.defineProperty(window, 'scrollTo', { value: jest.fn(), writable: true });

function makeLoans(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: `loan-${i + 1}`,
    borrower: `GBORROWER${i + 1}`,
    amount: 1000 + i,
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
  }));
}

function mockPagedFetch(total: number, pageItems: unknown[]) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ data: pageItems, total, page: 1, limit: 10, pageSize: 10 }),
  } as Response);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = {};
});

describe('LoansListClient — server-driven pagination (#1467)', () => {
  it('requests only the current page and page size from the API', async () => {
    mockParams = { page: '2', pageSize: '25' };
    mockPagedFetch(60, makeLoans(3));
    render(<LoansListClient />);

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const url = (global.fetch as jest.Mock).mock.calls[0][0] as string;
    expect(url).toContain('/api/loans?page=2&pageSize=25');
  });

  it('defaults to page 1 with 10 rows per page', async () => {
    mockPagedFetch(5, makeLoans(5));
    render(<LoansListClient />);

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const url = (global.fetch as jest.Mock).mock.calls[0][0] as string;
    expect(url).toContain('page=1&pageSize=10');
  });

  it('derives the page count from the server total', async () => {
    mockPagedFetch(60, makeLoans(10));
    render(<LoansListClient />);

    expect(await screen.findByText('Page 1 of 6')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Page 6' })).toBeTruthy();
  });

  it('requests the next page when Next is clicked', async () => {
    mockPagedFetch(60, makeLoans(10));
    render(<LoansListClient />);

    await screen.findByText('Page 1 of 6');
    fireEvent.click(screen.getByRole('button', { name: /next page/i }));
    expect(mockPush).toHaveBeenCalledWith(expect.stringContaining('page=2'));
  });

  it('hides pagination when there are no results', async () => {
    mockPagedFetch(0, []);
    render(<LoansListClient />);

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.queryByRole('navigation', { name: /pagination/i })).toBeNull()
    );
  });
});

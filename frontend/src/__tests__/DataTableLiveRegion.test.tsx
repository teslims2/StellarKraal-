/**
 * #1430 — ARIA live-region announcements for sort, filter, and pagination.
 *
 * Tests the sr-only live regions added to LoansListClient and Pagination so
 * screen readers hear when the table state changes.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import Pagination from '@/components/Pagination';

// ── Minimal next/navigation mock ─────────────────────────────────────────────
let mockParams: Record<string, string> = {};
const mockReplace = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: mockReplace }),
  usePathname: () => '/loans',
  useSearchParams: () => ({
    get: (key: string) => mockParams[key] ?? null,
    getAll: () => [],
    toString: () => new URLSearchParams(mockParams).toString(),
  }),
}));
jest.mock('framer-motion', () => ({
  motion: {
    span: ({ children, ...p }: React.PropsWithChildren<object>) => <span {...p}>{children}</span>,
    div:  ({ children, ...p }: React.PropsWithChildren<object>) => <div  {...p}>{children}</div>,
  },
  AnimatePresence: ({ children }: React.PropsWithChildren<object>) => <>{children}</>,
  useReducedMotion: () => false,
}));
Object.defineProperty(window, 'scrollTo', { value: jest.fn(), writable: true });

beforeEach(() => { jest.clearAllMocks(); mockParams = {}; });

// ── Pagination live region ───────────────────────────────────────────────────

describe('Pagination — page-change live region (#1430)', () => {
  it('renders a polite live region in the DOM', () => {
    render(
      <Pagination
        page={1}
        totalPages={5}
        limit={10}
        onPageChange={jest.fn()}
        onLimitChange={jest.fn()}
      />
    );
    // The region is sr-only but must exist so AT can read it
    const region = screen.getByRole('status');
    expect(region).toBeInTheDocument();
    expect(region).toHaveAttribute('aria-live', 'polite');
    expect(region).toHaveAttribute('aria-atomic', 'true');
  });

  it('announces the new page number when page prop changes', () => {
    const { rerender } = render(
      <Pagination
        page={1}
        totalPages={5}
        limit={10}
        onPageChange={jest.fn()}
        onLimitChange={jest.fn()}
      />
    );

    act(() => {
      rerender(
        <Pagination
          page={3}
          totalPages={5}
          limit={10}
          onPageChange={jest.fn()}
          onLimitChange={jest.fn()}
        />
      );
    });

    expect(screen.getByRole('status')).toHaveTextContent('Page 3 of 5');
  });

  it('does not announce on initial render', () => {
    render(
      <Pagination
        page={2}
        totalPages={5}
        limit={10}
        onPageChange={jest.fn()}
        onLimitChange={jest.fn()}
      />
    );
    // Initial render: region should be empty (no announcement yet)
    expect(screen.getByRole('status')).toHaveTextContent('');
  });

  it('renders first-page and last-page buttons for keyboard navigation', () => {
    render(
      <Pagination
        page={3}
        totalPages={5}
        limit={10}
        onPageChange={jest.fn()}
        onLimitChange={jest.fn()}
      />
    );
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next page' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Page 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Page 5' })).toBeInTheDocument();
  });

  it('shows current page and total in visible text', () => {
    render(
      <Pagination
        page={2}
        totalPages={4}
        limit={10}
        onPageChange={jest.fn()}
        onLimitChange={jest.fn()}
      />
    );
    expect(screen.getByText('Page 2 of 4')).toBeInTheDocument();
  });

  it('marks the current page button with aria-current="page"', () => {
    render(
      <Pagination
        page={2}
        totalPages={4}
        limit={10}
        onPageChange={jest.fn()}
        onLimitChange={jest.fn()}
      />
    );
    expect(screen.getByRole('button', { name: 'Page 2' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: 'Page 1' })).not.toHaveAttribute('aria-current');
  });
});

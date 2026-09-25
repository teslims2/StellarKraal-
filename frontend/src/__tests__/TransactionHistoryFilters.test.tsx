import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TransactionHistory from '../components/TransactionHistory';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  usePathname: () => '/transactions',
}));

jest.mock('@/hooks/usePagination', () => ({
  ...jest.requireActual('@/hooks/usePagination'),
  usePagination: () => ({
    page: 1,
    limit: 10,
    totalPages: 1,
    setPage: jest.fn(),
    setLimit: jest.fn(),
    slice: (arr: unknown[]) => arr,
  }),
}));

const mockTransactions = [
  {
    id: 1,
    loan_id: 101,
    type: 'loan',
    amount: 5000,
    status: 'completed',
    created_at: '2026-01-15T00:00:00Z',
  },
  {
    id: 2,
    loan_id: 102,
    type: 'repay',
    amount: 10000,
    status: 'pending',
    created_at: '2026-02-20T00:00:00Z',
  },
  {
    id: 3,
    loan_id: 103,
    type: 'liquidate',
    amount: 3000,
    status: 'failed',
    created_at: '2026-03-10T00:00:00Z',
  },
];

function setupFetch(data: unknown) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ data }),
  } as Response);
}

// ─── Basic rendering (backward-compatible) ────────────────────────────────────

describe('TransactionHistory — basic rendering', () => {
  afterEach(() => jest.resetAllMocks());

  it('renders the card list for mobile', async () => {
    setupFetch(mockTransactions);
    const { container } = render(<TransactionHistory walletAddress="GTEST" />);
    await waitFor(() => {
      expect(screen.getAllByText('loan').length).toBeGreaterThan(0);
    });
    const mobileList = container.querySelector('ul[aria-label="Transaction list"]');
    expect(mobileList).not.toBeNull();
  });

  it('renders the desktop table', async () => {
    setupFetch(mockTransactions);
    const { container } = render(<TransactionHistory walletAddress="GTEST" />);
    await waitFor(() => screen.getAllByText('loan'));
    expect(container.querySelector('table')).not.toBeNull();
  });

  it('shows empty state when no transactions', async () => {
    setupFetch([]);
    render(<TransactionHistory walletAddress="GTEST" />);
    await waitFor(() => {
      expect(screen.getByText('No transactions yet')).toBeTruthy();
    });
  });

  it('shows error state on fetch failure', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 } as Response);
    render(<TransactionHistory walletAddress="GTEST" />);
    await waitFor(() => {
      expect(screen.getByText(/server error/i)).toBeTruthy();
    });
  });

  it('passes collateralId to the API when the prop is set', async () => {
    setupFetch(mockTransactions);
    render(<TransactionHistory collateralId="col-1" />);
    await waitFor(() => screen.getAllByText('loan'));
    const url = (global.fetch as jest.Mock).mock.calls[0][0] as string;
    expect(url).toContain('collateralId=col-1');
  });

  it('uses the v1 API endpoint', async () => {
    setupFetch(mockTransactions);
    render(<TransactionHistory walletAddress="GTEST" />);
    await waitFor(() => screen.getAllByText('loan'));
    const url = (global.fetch as jest.Mock).mock.calls[0][0] as string;
    expect(url).toContain('/api/v1/transactions');
  });
});

// ─── Filter bar (#1063) ───────────────────────────────────────────────────────

describe('TransactionHistory — filters (#1063)', () => {
  afterEach(() => jest.resetAllMocks());

  it('does NOT render the filter bar when showFilters is false (default)', async () => {
    setupFetch(mockTransactions);
    render(<TransactionHistory walletAddress="GTEST" />);
    await waitFor(() => screen.getAllByText('loan'));
    expect(screen.queryByLabelText('Type')).toBeNull();
  });

  it('renders the filter bar when showFilters is true', async () => {
    setupFetch(mockTransactions);
    render(<TransactionHistory walletAddress="GTEST" showFilters />);
    await waitFor(() => screen.getAllByText('loan'));
    expect(screen.getByLabelText('Type')).toBeTruthy();
    expect(screen.getByLabelText('From')).toBeTruthy();
    expect(screen.getByLabelText('To')).toBeTruthy();
  });

  it('filters displayed transactions by type', async () => {
    setupFetch(mockTransactions);
    const { container } = render(<TransactionHistory walletAddress="GTEST" showFilters />);
    await waitFor(() => screen.getAllByText('loan'));

    const typeSelect = screen.getByLabelText('Type') as HTMLSelectElement;
    await userEvent.selectOptions(typeSelect, 'repay');

    // After filtering to 'repay', wait for repay to show in the transaction list
    await waitFor(() => {
      const typeCells = screen.getAllByText('repay');
      expect(typeCells.length).toBeGreaterThan(0);
    });

    // Confirm 'loan' and 'liquidate' don't appear in the transaction list rows
    // (they may still appear as select options, so check the list directly)
    const mobileList = container.querySelector('ul[aria-label="Transaction list"]');
    if (mobileList) {
      expect(mobileList.textContent).not.toContain('loan');
      expect(mobileList.textContent).not.toContain('liquidate');
    }
    const tableBody = container.querySelector('tbody');
    if (tableBody) {
      expect(tableBody.textContent).not.toContain('loan');
      expect(tableBody.textContent).not.toContain('liquidate');
    }
  });

  it('shows a no-results message when filters match nothing', async () => {
    setupFetch(mockTransactions);
    render(<TransactionHistory walletAddress="GTEST" showFilters />);
    await waitFor(() => screen.getAllByText('loan'));

    const typeSelect = screen.getByLabelText('Type') as HTMLSelectElement;
    await userEvent.selectOptions(typeSelect, 'liquidate');

    // Override with a date that excludes the liquidate tx
    const dateFrom = screen.getByLabelText('From') as HTMLInputElement;
    fireEvent.change(dateFrom, { target: { value: '2026-12-01' } });

    await waitFor(() => {
      expect(screen.getByText(/no transactions match/i)).toBeTruthy();
    });
  });
});

// ─── CSV export (#1063) ───────────────────────────────────────────────────────

describe('TransactionHistory — CSV export (#1063)', () => {
  afterEach(() => jest.resetAllMocks());

  it('renders an Export CSV button when showFilters is true', async () => {
    setupFetch(mockTransactions);
    render(<TransactionHistory walletAddress="GTEST" showFilters />);
    await waitFor(() => screen.getAllByText('loan'));
    // The button appears in the card header and the filter bar
    const exportBtns = screen.getAllByRole('button', { name: /export.*csv/i });
    expect(exportBtns.length).toBeGreaterThan(0);
  });

  it('export button triggers a download (createElement + click)', async () => {
    setupFetch(mockTransactions);

    // Spy on DOM operations used by exportToCsv
    const createObjectURL = jest.fn(() => 'blob:mock');
    const revokeObjectURL = jest.fn();
    global.URL.createObjectURL = createObjectURL;
    global.URL.revokeObjectURL = revokeObjectURL;

    const originalCreate = document.createElement.bind(document);
    const mockClick = jest.fn();
    jest.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'a') {
        const el = originalCreate('a');
        el.click = mockClick;
        return el;
      }
      return originalCreate(tag);
    });

    render(<TransactionHistory walletAddress="GTEST" showFilters />);
    await waitFor(() => screen.getAllByText('loan'));

    const exportBtns = screen.getAllByRole('button', { name: /export.*csv/i });
    await userEvent.click(exportBtns[0]);

    expect(createObjectURL).toHaveBeenCalled();
    expect(mockClick).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalled();

    jest.restoreAllMocks();
  });

  it('export button is disabled when there are no transactions', async () => {
    setupFetch([]);
    render(<TransactionHistory walletAddress="GTEST" showFilters />);
    // With empty data the empty-state heading renders
    await waitFor(() => {
      expect(screen.getByText('No transactions yet')).toBeTruthy();
    });
    // The export button inside the FilterBar is disabled since hasData=false
    const exportBtns = screen.queryAllByRole('button', { name: /export.*csv/i });
    exportBtns.forEach((btn) => {
      expect(btn).toHaveAttribute('disabled');
    });
  });
});

// ─── Accessibility / table structure ─────────────────────────────────────────

describe('TransactionHistory — accessibility', () => {
  afterEach(() => jest.resetAllMocks());

  it('table wrapper is scrollable (overflow-auto)', async () => {
    setupFetch(mockTransactions);
    const { container } = render(<TransactionHistory walletAddress="GTEST" />);
    await waitFor(() => screen.getAllByText('loan'));
    expect(container.querySelector('.overflow-auto')).not.toBeNull();
  });

  it('thead has sticky positioning', async () => {
    setupFetch(mockTransactions);
    const { container } = render(<TransactionHistory walletAddress="GTEST" />);
    await waitFor(() => screen.getAllByText('loan'));
    const thead = container.querySelector('thead');
    expect(thead?.className).toContain('sticky');
    expect(thead?.className).toContain('top-0');
    expect(thead?.className).toContain('z-10');
  });

  it('th elements have scope="col"', async () => {
    setupFetch(mockTransactions);
    const { container } = render(<TransactionHistory walletAddress="GTEST" />);
    await waitFor(() => screen.getAllByText('loan'));
    container.querySelectorAll('thead th').forEach((th) => {
      expect(th).toHaveAttribute('scope', 'col');
    });
  });

  it('table scroll region has an accessible aria-label', async () => {
    setupFetch(mockTransactions);
    const { container } = render(<TransactionHistory walletAddress="GTEST" />);
    await waitFor(() => screen.getAllByText('loan'));
    const region = container.querySelector('[role="region"]');
    expect(region?.getAttribute('aria-label')).toMatch(/transaction table/i);
  });
});

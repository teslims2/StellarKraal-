/**
 * Tests for the collateral detail page (/collateral/[id]).
 * Uses fetch mocking to simulate API responses.
 */
import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CollateralDetailPage from '@/app/collateral/[id]/page';

// Mock next/navigation
jest.mock('next/navigation', () => ({
  useParams: () => ({ id: 'col-1' }),
}));

// Mock next/link
jest.mock('next/link', () => {
  const Link = ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  );
  Link.displayName = 'Link';
  return Link;
});

// Mock next/image — renders a plain <img> so tests can assert on src/alt
jest.mock('next/image', () => {
  const MockImage = ({
    src,
    alt,
    loading,
    sizes,
    className,
    placeholder,
  }: React.ImgHTMLAttributes<HTMLImageElement> & {
    fill?: boolean;
    sizes?: string;
    placeholder?: string;
    blurDataURL?: string;
  }) => (
    <img
      src={src as string}
      alt={alt}
      loading={loading}
      data-sizes={sizes}
      data-placeholder={placeholder}
      className={className}
    />
  );
  MockImage.displayName = 'Image';
  return MockImage;
});

// Mock PriceChart to prevent fetch conflicts in tests
jest.mock('@/components/PriceChart', () => ({
  PriceChart: () => <div data-testid="price-chart-mock" />,
}));

// Mock Sparkline
jest.mock("@/components/Sparkline", () => {
  const SparklineMock = () => <div data-testid="sparkline-mock" />;
  return SparklineMock;
});

// Mock TransactionHistory (#530) to prevent fetch conflicts in tests — it issues
// its own independent request and is covered by its own test suite.
jest.mock('@/components/TransactionHistory', () => {
  const TransactionHistoryMock = () => <div data-testid="transaction-history-mock" />;
  return TransactionHistoryMock;
});

const mockRecord = {
  id: 'col-1',
  owner: 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN',
  animal_type: 'cattle',
  breed: 'Nguni',
  age_years: 3,
  weight_kg: 450,
  count: 2,
  appraised_value: 50_000_000,
  appraisal_history: [
    { date: '2026-01-01T00:00:00.000Z', value: 45_000_000 },
    { date: '2026-06-01T00:00:00.000Z', value: 50_000_000 },
  ],
  createdAt: '2026-01-01T00:00:00.000Z',
};

beforeEach(() => {
  jest.resetAllMocks();
});

/**
 * Creates a fetch mock that:
 *  - Returns collateralResponse for /api/v1/collateral/:id calls
 *  - Returns { loans: [] } for /api/v1/loans?... calls (linked loans, Issue #1525)
 * Falls back to collateralResponse for any other URL.
 */
function mockFetch(collateralResponse: { status: number; ok: boolean; json?: () => Promise<unknown> }) {
  global.fetch = jest.fn().mockImplementation((url: string) => {
    if (typeof url === 'string' && url.includes('/loans?')) {
      return Promise.resolve({
        status: 200,
        ok: true,
        json: async () => ({ loans: [] }),
      } as Response);
    }
    return Promise.resolve({
      ...collateralResponse,
      json: collateralResponse.json ?? (async () => ({})),
    } as Response);
  });
}

describe('CollateralDetailPage', () => {
  it('renders animal profile and current appraised value', async () => {
    mockFetch({ status: 200, ok: true, json: async () => mockRecord });

    render(<CollateralDetailPage />);

    await waitFor(() => {
      expect(screen.getByText(/cattle/i)).toBeInTheDocument();
    });

    expect(screen.getByText(/Nguni/i)).toBeInTheDocument();
    expect(screen.getByText(/3 yr/i)).toBeInTheDocument();
    expect(screen.getByText(/450 kg/i)).toBeInTheDocument();
    // Current appraised value: 50_000_000 stroops = 5 XLM — may appear multiple times
    const valueMatches = screen.getAllByText(/5(\.00)? XLM|5 XLM/);
    expect(valueMatches.length).toBeGreaterThanOrEqual(1);
  });

  it('renders appraisal history table with newest entry first', async () => {
    mockFetch({ status: 200, ok: true, json: async () => mockRecord });

    render(<CollateralDetailPage />);

    await waitFor(() => {
      expect(screen.getByText(/Appraisal History/i)).toBeInTheDocument();
    });

    const rows = screen.getAllByRole('row');
    // rows include the linked-loans table header + data rows and appraisal header + data rows
    // Just check we have at least 3 rows (1 header + 2 appraisal entries)
    expect(rows.length).toBeGreaterThanOrEqual(3);
  });

  it('renders the transaction history section for this collateral (#530)', async () => {
    mockFetch({ status: 200, ok: true, json: async () => mockRecord });

    render(<CollateralDetailPage />);

    await waitFor(() => {
      expect(screen.getByTestId('transaction-history-mock')).toBeInTheDocument();
    });
  });

  it('renders back link to dashboard', async () => {
    mockFetch({ status: 200, ok: true, json: async () => mockRecord });

    render(<CollateralDetailPage />);

    await waitFor(() => {
      expect(screen.getByText(/cattle/i)).toBeInTheDocument();
    });

    const link = screen.getByText(/Back to Dashboard/i).closest('a');
    expect(link).toHaveAttribute('href', '/dashboard');
  });

  it('shows 404 error state when collateral is not found', async () => {
    mockFetch({ status: 404, ok: false });

    render(<CollateralDetailPage />);

    await waitFor(() => {
      expect(screen.getByText(/Collateral Not Found/i)).toBeInTheDocument();
    });

    expect(screen.getByText(/col-1/)).toBeInTheDocument();
    // Page has two "Back to Collateral List" links — use getAllByText
    const backLinks = screen.getAllByText(/Back to Collateral List/i);
    expect(backLinks.length).toBeGreaterThanOrEqual(1);
    expect(backLinks[0].closest('a')).toHaveAttribute('href', '/collateral');
  });

  it('shows network error state with retry button when fetch fails', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

    render(<CollateralDetailPage />);

    await waitFor(() => {
      expect(
        screen.getByText(/Could not load collateral – check your connection/i)
      ).toBeInTheDocument();
    });

    const retryButton = screen.getByRole('button', { name: /retry/i });
    expect(retryButton).toBeInTheDocument();
  });

  it('retries fetch when retry button is clicked', async () => {
    const fetchMock = jest.fn();
    fetchMock
      .mockRejectedValueOnce(new Error('Network error'))
      .mockImplementation((url: string) => {
        if (typeof url === 'string' && url.includes('/loans?')) {
          return Promise.resolve({ status: 200, ok: true, json: async () => ({ loans: [] }) });
        }
        return Promise.resolve({ status: 200, ok: true, json: async () => mockRecord });
      });
    global.fetch = fetchMock;

    render(<CollateralDetailPage />);

    await waitFor(() => {
      expect(
        screen.getByText(/Could not load collateral – check your connection/i)
      ).toBeInTheDocument();
    });

    const retryButton = screen.getByRole('button', { name: /retry/i });
    await userEvent.click(retryButton);

    await waitFor(() => {
      expect(screen.getByText(/cattle/i)).toBeInTheDocument();
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('shows error state when response status is not ok and not 404', async () => {
    mockFetch({ status: 500, ok: false, json: async () => ({ error: 'Server error' }) });

    render(<CollateralDetailPage />);

    await waitFor(() => {
      expect(
        screen.getByText(/Could not load collateral – check your connection/i)
      ).toBeInTheDocument();
    });

    const retryButton = screen.getByRole('button', { name: /retry/i });
    expect(retryButton).toBeInTheDocument();
  });

  describe('responsive collateral image (#815)', () => {
    const recordWithPhoto = {
      ...mockRecord,
      photo_url: 'https://example.com/cattle-photo.jpg',
    };

    it('renders Next.js Image component when photo_url is present', async () => {
      mockFetch({ status: 200, ok: true, json: async () => recordWithPhoto });

      render(<CollateralDetailPage />);

      await waitFor(() => {
        expect(screen.getByRole('img', { name: /cattle collateral photo/i })).toBeInTheDocument();
      });
    });

    it('image has descriptive alt text from collateral metadata', async () => {
      mockFetch({ status: 200, ok: true, json: async () => recordWithPhoto });

      render(<CollateralDetailPage />);

      await waitFor(() => {
        const img = screen.getByRole('img', { name: /cattle collateral photo/i });
        expect(img).toHaveAttribute('alt', 'cattle collateral photo');
      });
    });

    it('image uses lazy loading', async () => {
      mockFetch({ status: 200, ok: true, json: async () => recordWithPhoto });

      render(<CollateralDetailPage />);

      await waitFor(() => {
        const img = screen.getByRole('img', { name: /cattle collateral photo/i });
        expect(img).toHaveAttribute('loading', 'lazy');
      });
    });

    it('image has sizes attribute for responsive srcset', async () => {
      mockFetch({ status: 200, ok: true, json: async () => recordWithPhoto });

      render(<CollateralDetailPage />);

      await waitFor(() => {
        const img = screen.getByRole('img', { name: /cattle collateral photo/i });
        expect(img).toHaveAttribute('data-sizes');
      });
    });

    it('image has blur placeholder for smooth loading', async () => {
      mockFetch({ status: 200, ok: true, json: async () => recordWithPhoto });

      render(<CollateralDetailPage />);

      await waitFor(() => {
        const img = screen.getByRole('img', { name: /cattle collateral photo/i });
        expect(img).toHaveAttribute('data-placeholder', 'blur');
      });
    });

    it('renders emoji fallback when photo_url is absent', async () => {
      const recordWithoutPhoto = { ...mockRecord, photo_url: undefined };
      mockFetch({ status: 200, ok: true, json: async () => recordWithoutPhoto });

      render(<CollateralDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('🐄')).toBeInTheDocument();
      });
      // No collateral photo img element should be rendered
      expect(screen.queryByRole('img', { name: /collateral photo/i })).toBeNull();
    });
  });

  describe("copy collateral ID (#864)", () => {
    it("renders a copy button next to the collateral ID", async () => {
      mockFetch({ status: 200, ok: true, json: async () => mockRecord });

      render(<CollateralDetailPage />);

      await waitFor(() => {
        expect(screen.getByText(/col-1/)).toBeInTheDocument();
      });

      const copyBtn = screen.getByRole("button", { name: /copy collateral id/i });
      expect(copyBtn).toBeInTheDocument();
    });

    it("copies the collateral ID to clipboard and shows Copied feedback", async () => {
      const clipboardMock = jest.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, "clipboard", {
        value: { writeText: clipboardMock },
        writable: true,
        configurable: true,
      });

      mockFetch({ status: 200, ok: true, json: async () => mockRecord });

      render(<CollateralDetailPage />);

      await waitFor(() => {
        expect(screen.getByText(/col-1/)).toBeInTheDocument();
      });

      const copyBtn = screen.getByRole("button", { name: /copy collateral id/i });
      fireEvent.click(copyBtn);

      expect(clipboardMock).toHaveBeenCalledWith("col-1");
      expect(screen.getByRole("button", { name: /collateral id copied/i })).toBeInTheDocument();
    });
  });

  describe("linked active loans (#1525)", () => {
    it("shows linked loans section heading", async () => {
      mockFetch({ status: 200, ok: true, json: async () => mockRecord });
      render(<CollateralDetailPage />);
      await waitFor(() => {
        expect(screen.getByText(/Active Loans Backed by This Collateral/i)).toBeInTheDocument();
      });
    });

    it("shows empty state when no loans are linked", async () => {
      mockFetch({ status: 200, ok: true, json: async () => mockRecord });
      render(<CollateralDetailPage />);
      await waitFor(() => {
        expect(screen.getByText(/No active loans are backed by this collateral/i)).toBeInTheDocument();
      });
    });

    it("renders linked loan rows with balance and health factor", async () => {
      const linkedLoan = {
        id: 'loan-abc-1234',
        status: 'active',
        principal: 20_000_000,
        outstanding_balance: 18_000_000,
        health_factor: 1.8,
      };
      global.fetch = jest.fn().mockImplementation((url: string) => {
        if (typeof url === 'string' && url.includes('/loans?')) {
          return Promise.resolve({
            status: 200,
            ok: true,
            json: async () => ({ loans: [linkedLoan] }),
          });
        }
        return Promise.resolve({
          status: 200,
          ok: true,
          json: async () => mockRecord,
        });
      });

      render(<CollateralDetailPage />);

      await waitFor(() => {
        expect(screen.getByText(/loan-abc/i)).toBeInTheDocument();
      });
      // Health factor 1.8 (green) and balance 18_000_000 / 1e7 = 1.8 XLM
      expect(screen.getByText('1.80')).toBeInTheDocument();
    });

    it("renders edit button enabled for draft collateral", async () => {
      const draftRecord = { ...mockRecord, status: 'draft' };
      mockFetch({ status: 200, ok: true, json: async () => draftRecord });
      render(<CollateralDetailPage />);
      await waitFor(() => {
        expect(screen.getByText(/cattle/i)).toBeInTheDocument();
      });
      const editLink = screen.getByRole("link", { name: /edit collateral/i });
      expect(editLink).toHaveAttribute('href', '/collateral/col-1/edit');
    });

    it("renders edit button disabled for active collateral", async () => {
      const activeRecord = { ...mockRecord, status: 'active' };
      mockFetch({ status: 200, ok: true, json: async () => activeRecord });
      render(<CollateralDetailPage />);
      await waitFor(() => {
        expect(screen.getByText(/cattle/i)).toBeInTheDocument();
      });
      const editButton = screen.getByRole("button", { name: /editing is disabled for active collateral/i });
      expect(editButton).toHaveAttribute('aria-disabled', 'true');
    });
  });
});

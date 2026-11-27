import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CollateralListClient from '../app/collateral/CollateralListClient';

const mockPush = jest.fn();
const mockReplace = jest.fn();
let mockSearchParams = new URLSearchParams();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  usePathname: () => '/collateral',
  useSearchParams: () => mockSearchParams,
  redirect: jest.fn(),
  notFound: jest.fn(),
  useParams: () => ({}),
}));

jest.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.PropsWithChildren<object>) => (
      <div {...props}>{children}</div>
    ),
    span: ({ children, ...props }: React.PropsWithChildren<object>) => (
      <span {...props}>{children}</span>
    ),
  },
  AnimatePresence: ({ children }: React.PropsWithChildren<object>) => <>{children}</>,
  useReducedMotion: () => false,
}));

function mockFetch(items: unknown[] = []) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ items }),
  } as Response);
}

describe('CollateralListClient — empty state (#1505)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParams = new URLSearchParams();
    mockFetch();
  });

  it('shows an accessible empty state with a Register Collateral CTA', async () => {
    render(<CollateralListClient />);

    await waitFor(() => {
      expect(screen.getByText('No Collateral Registered')).toBeTruthy();
    });

    expect(screen.getByRole('img', { name: 'No collateral registered' })).toBeTruthy();

    const cta = screen.getByRole('button', { name: 'Register Collateral' });
    await userEvent.click(cta);
    expect(mockPush).toHaveBeenCalledWith('/collateral/new');
  });

  it('shows a filtered empty state with a clear-filters action', async () => {
    mockSearchParams = new URLSearchParams('q=cattle');
    render(<CollateralListClient />);

    await waitFor(() => {
      expect(screen.getByText('No collateral matches your filters.')).toBeTruthy();
    });

    expect(screen.queryByRole('button', { name: 'Register Collateral' })).toBeNull();
    const clear = screen.getByRole('button', { name: 'Clear filters' });
    await userEvent.click(clear);
    expect(mockPush).toHaveBeenCalledWith('/collateral');
  });
});

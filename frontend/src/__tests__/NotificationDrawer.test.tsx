import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NotificationBell, NotificationDrawer } from '../components/NotificationDrawer';
import type { LoanNotification } from '../hooks/useNotifications';

// Framer Motion runs animations — skip them in tests
jest.mock('framer-motion', () => {
  const actual = jest.requireActual<typeof import('framer-motion')>('framer-motion');
  return {
    ...actual,
    motion: {
      div: ({ children, layout: _layout, ...props }: React.HTMLAttributes<HTMLDivElement> & { layout?: unknown }) => (
        <div {...props}>{children}</div>
      ),
      li: ({ children, layout: _layout, ...props }: React.HTMLAttributes<HTMLLIElement> & { layout?: unknown }) => (
        <li {...props}>{children}</li>
      ),
    },
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  };
});

// focus-trap-react needs DOM event support; simplify to just render children
jest.mock('focus-trap-react', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const mockNotifications: LoanNotification[] = [
  {
    id: 'n1',
    event: 'loan_approved',
    loanId: '101',
    message: 'Loan #101 has been approved and is now active.',
    timestamp: new Date('2026-01-15T10:30:00Z').getTime(),
    read: false,
  },
  {
    id: 'n2',
    event: 'loan_at_risk',
    loanId: '102',
    message: 'Loan #102 is at risk — health factor is below threshold.',
    timestamp: new Date('2026-01-16T09:00:00Z').getTime(),
    read: true,
  },
];

// ─── NotificationBell ─────────────────────────────────────────────────────────

describe('NotificationBell', () => {
  it('renders a button with correct aria-label when there are unread notifications', () => {
    render(<NotificationBell unreadCount={3} onClick={jest.fn()} isOpen={false} />);
    const btn = screen.getByRole('button');
    expect(btn.getAttribute('aria-label')).toMatch(/3 unread/i);
  });

  it('renders a button with generic label when there are no unread notifications', () => {
    render(<NotificationBell unreadCount={0} onClick={jest.fn()} isOpen={false} />);
    const btn = screen.getByRole('button');
    expect(btn.getAttribute('aria-label')).toMatch(/open notifications/i);
  });

  it('shows a badge when unread count > 0', () => {
    const { container } = render(
      <NotificationBell unreadCount={5} onClick={jest.fn()} isOpen={false} />,
    );
    // The badge is the span with aria-hidden="true" that contains digits
    const ariaHiddenEls = container.querySelectorAll('[aria-hidden="true"]');
    const badge = Array.from(ariaHiddenEls).find((el) => /\d/.test(el.textContent ?? ''));
    expect(badge?.textContent).toBe('5');
  });

  it('does not show a badge when unread count is 0', () => {
    const { container } = render(
      <NotificationBell unreadCount={0} onClick={jest.fn()} isOpen={false} />,
    );
    // No aria-hidden element should contain a digit count
    const ariaHiddenEls = container.querySelectorAll('[aria-hidden="true"]');
    const hasBadge = Array.from(ariaHiddenEls).some((el) => /^\d+\+?$/.test(el.textContent?.trim() ?? ''));
    expect(hasBadge).toBe(false);
  });

  it('caps the displayed count at 99+', () => {
    const { container } = render(
      <NotificationBell unreadCount={120} onClick={jest.fn()} isOpen={false} />,
    );
    const ariaHiddenEls = container.querySelectorAll('[aria-hidden="true"]');
    const badge = Array.from(ariaHiddenEls).find((el) => /\d/.test(el.textContent ?? ''));
    expect(badge?.textContent).toBe('99+');
  });

  it('calls onClick when the button is clicked', async () => {
    const handler = jest.fn();
    render(<NotificationBell unreadCount={1} onClick={handler} isOpen={false} />);
    await userEvent.click(screen.getByRole('button'));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('sets aria-expanded to true when isOpen is true', () => {
    render(<NotificationBell unreadCount={0} onClick={jest.fn()} isOpen={true} />);
    expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'true');
  });
});

// ─── NotificationDrawer ───────────────────────────────────────────────────────

const defaultDrawerProps = {
  open: true,
  onClose: jest.fn(),
  notifications: mockNotifications,
  unreadCount: 1,
  onMarkRead: jest.fn(),
  onMarkAllRead: jest.fn(),
  onDismiss: jest.fn(),
  onDismissAll: jest.fn(),
};

describe('NotificationDrawer', () => {
  afterEach(() => jest.clearAllMocks());

  it('renders a dialog with role="dialog" and aria-label="Notifications"', () => {
    render(<NotificationDrawer {...defaultDrawerProps} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeTruthy();
    expect(dialog.getAttribute('aria-label')).toBe('Notifications');
  });

  it('renders all notification messages', () => {
    render(<NotificationDrawer {...defaultDrawerProps} />);
    expect(screen.getByText(/Loan #101 has been approved/i)).toBeTruthy();
    expect(screen.getByText(/Loan #102 is at risk/i)).toBeTruthy();
  });

  it('shows the unread count badge in the header', () => {
    render(<NotificationDrawer {...defaultDrawerProps} unreadCount={2} />);
    const badge = screen.getByLabelText('2 unread');
    expect(badge).toBeTruthy();
  });

  it('calls onMarkAllRead when "mark all read" button is clicked', async () => {
    const onMarkAllRead = jest.fn();
    render(<NotificationDrawer {...defaultDrawerProps} onMarkAllRead={onMarkAllRead} />);
    const btn = screen.getByRole('button', { name: /mark all.*read/i });
    await userEvent.click(btn);
    expect(onMarkAllRead).toHaveBeenCalledTimes(1);
  });

  it('calls onDismissAll when "clear all" button is clicked', async () => {
    const onDismissAll = jest.fn();
    render(<NotificationDrawer {...defaultDrawerProps} onDismissAll={onDismissAll} />);
    const btn = screen.getByRole('button', { name: /dismiss all/i });
    await userEvent.click(btn);
    expect(onDismissAll).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when the close button is clicked', async () => {
    const onClose = jest.fn();
    render(<NotificationDrawer {...defaultDrawerProps} onClose={onClose} />);
    const btn = screen.getByRole('button', { name: /close notifications/i });
    await userEvent.click(btn);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onMarkRead when a notification item is clicked', async () => {
    const onMarkRead = jest.fn();
    render(<NotificationDrawer {...defaultDrawerProps} onMarkRead={onMarkRead} />);
    const articles = screen.getAllByRole('article');
    await userEvent.click(articles[0]);
    expect(onMarkRead).toHaveBeenCalledWith('n1');
  });

  it('calls onDismiss when a dismiss button is clicked', async () => {
    const onDismiss = jest.fn();
    render(<NotificationDrawer {...defaultDrawerProps} onDismiss={onDismiss} />);
    // Hover to reveal dismiss button by setting opacity
    const dismissBtns = screen.getAllByRole('button', { name: /dismiss notification/i });
    fireEvent.click(dismissBtns[0]);
    expect(onDismiss).toHaveBeenCalledWith('n1');
  });

  it('shows empty state when there are no notifications', () => {
    render(
      <NotificationDrawer
        {...defaultDrawerProps}
        notifications={[]}
        unreadCount={0}
      />,
    );
    expect(screen.getByText(/you're all caught up/i)).toBeTruthy();
  });

  it('calls onClose when Escape key is pressed', async () => {
    const onClose = jest.fn();
    render(<NotificationDrawer {...defaultDrawerProps} onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it('does not render the drawer when open is false', () => {
    render(<NotificationDrawer {...defaultDrawerProps} open={false} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

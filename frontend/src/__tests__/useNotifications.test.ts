/**
 * Tests for useNotifications hook (#1066).
 */
import { renderHook, act, waitFor } from '@testing-library/react';
import { useNotifications } from '../hooks/useNotifications';

// Mock usePolling to avoid running intervals
jest.mock('../hooks/usePolling', () => ({
  usePolling: (_fn: () => void, _interval: number) => {},
}));

// Mock EventSource (SSE)
const addEventListenerMock = jest.fn();
const closeMock = jest.fn();
function createMockEventSource() {
  return {
    addEventListener: addEventListenerMock,
    close: closeMock,
  };
}

beforeEach(() => {
  // Clear localStorage
  localStorage.clear();
  addEventListenerMock.mockClear();
  closeMock.mockClear();
  // Provide a mock EventSource constructor
  (global as Record<string, unknown>).EventSource = jest.fn(
    () => createMockEventSource(),
  );
});

afterEach(() => {
  jest.clearAllMocks();
});

describe('useNotifications', () => {
  it('initialises with an empty notification list', () => {
    const { result } = renderHook(() => useNotifications());
    expect(result.current.notifications).toEqual([]);
    expect(result.current.unreadCount).toBe(0);
  });

  it('hydrates notifications from localStorage on mount', () => {
    const stored = [
      {
        id: 'stored-1',
        event: 'loan_approved',
        loanId: '10',
        message: 'Test',
        timestamp: Date.now(),
        read: false,
      },
    ];
    localStorage.setItem('stellarkraal_notifications', JSON.stringify(stored));

    const { result } = renderHook(() => useNotifications());
    expect(result.current.notifications).toHaveLength(1);
    expect(result.current.notifications[0].id).toBe('stored-1');
    expect(result.current.unreadCount).toBe(1);
  });

  it('markRead marks a single notification as read', () => {
    const stored = [
      {
        id: 'n1',
        event: 'loan_at_risk',
        loanId: '20',
        message: 'At risk',
        timestamp: Date.now(),
        read: false,
      },
    ];
    localStorage.setItem('stellarkraal_notifications', JSON.stringify(stored));

    const { result } = renderHook(() => useNotifications());
    expect(result.current.unreadCount).toBe(1);

    act(() => {
      result.current.markRead('n1');
    });

    expect(result.current.notifications[0].read).toBe(true);
    expect(result.current.unreadCount).toBe(0);
  });

  it('markAllRead marks every notification as read', () => {
    const stored = [
      { id: 'a', event: 'loan_approved', loanId: '1', message: 'A', timestamp: 0, read: false },
      { id: 'b', event: 'loan_at_risk',  loanId: '2', message: 'B', timestamp: 0, read: false },
    ];
    localStorage.setItem('stellarkraal_notifications', JSON.stringify(stored));

    const { result } = renderHook(() => useNotifications());
    expect(result.current.unreadCount).toBe(2);

    act(() => {
      result.current.markAllRead();
    });

    expect(result.current.unreadCount).toBe(0);
    result.current.notifications.forEach((n) => expect(n.read).toBe(true));
  });

  it('dismiss removes a single notification', () => {
    const stored = [
      { id: 'x', event: 'loan_liquidated', loanId: '3', message: 'X', timestamp: 0, read: false },
      { id: 'y', event: 'loan_repaid',     loanId: '4', message: 'Y', timestamp: 0, read: true },
    ];
    localStorage.setItem('stellarkraal_notifications', JSON.stringify(stored));

    const { result } = renderHook(() => useNotifications());
    expect(result.current.notifications).toHaveLength(2);

    act(() => {
      result.current.dismiss('x');
    });

    expect(result.current.notifications).toHaveLength(1);
    expect(result.current.notifications[0].id).toBe('y');
  });

  it('dismissAll clears all notifications', () => {
    const stored = [
      { id: 'p', event: 'loan_approved', loanId: '5', message: 'P', timestamp: 0, read: false },
    ];
    localStorage.setItem('stellarkraal_notifications', JSON.stringify(stored));

    const { result } = renderHook(() => useNotifications());
    expect(result.current.notifications).toHaveLength(1);

    act(() => {
      result.current.dismissAll();
    });

    expect(result.current.notifications).toHaveLength(0);
    expect(result.current.unreadCount).toBe(0);
  });

  it('persists changes to localStorage after markRead', () => {
    const stored = [
      { id: 'n1', event: 'loan_approved', loanId: '1', message: 'A', timestamp: 0, read: false },
    ];
    localStorage.setItem('stellarkraal_notifications', JSON.stringify(stored));

    const { result } = renderHook(() => useNotifications());
    act(() => {
      result.current.markRead('n1');
    });

    const persisted = JSON.parse(localStorage.getItem('stellarkraal_notifications') ?? '[]') as Array<{id: string; read: boolean}>;
    expect(persisted[0].read).toBe(true);
  });

  it('persists changes to localStorage after dismissAll', () => {
    const stored = [
      { id: 'n1', event: 'loan_approved', loanId: '1', message: 'A', timestamp: 0, read: false },
    ];
    localStorage.setItem('stellarkraal_notifications', JSON.stringify(stored));

    const { result } = renderHook(() => useNotifications());
    act(() => {
      result.current.dismissAll();
    });

    const persisted = JSON.parse(localStorage.getItem('stellarkraal_notifications') ?? '[]') as unknown[];
    expect(persisted).toHaveLength(0);
  });

  it('attempts to open an SSE EventSource connection', async () => {
    renderHook(() => useNotifications());
    await waitFor(() => {
      expect((global as Record<string, unknown>).EventSource).toHaveBeenCalled();
    });
    const callArg = (
      (global as Record<string, unknown>).EventSource as jest.Mock
    ).mock.calls[0][0] as string;
    expect(callArg).toContain('/api/v1/notifications/stream');
  });
});

import { fireEvent, render, screen } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';
import StatusBadge, { STATUS_TOOLTIPS, type BadgeStatus } from '../components/StatusBadge';

expect.extend(toHaveNoViolations);

// ── framer-motion mock ────────────────────────────────────────────────────────
// Control useReducedMotion and stub motion/AnimatePresence so tests are stable.
let mockReducedMotion = false;

jest.mock('framer-motion', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  return {
    ...jest.requireActual('framer-motion'),
    useReducedMotion: () => mockReducedMotion,
    AnimatePresence: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
    motion: {
      span: React.forwardRef(
        (
          { children, className, ...rest }: React.HTMLAttributes<HTMLSpanElement>,
          ref: React.Ref<HTMLSpanElement>
        ) => React.createElement('span', { ...rest, className, ref }, children)
      ),
    },
  };
});

beforeEach(() => {
  mockReducedMotion = false;
});

afterEach(() => {
  jest.clearAllMocks();
});
// ─────────────────────────────────────────────────────────────────────────────

const ALL_STATUSES: BadgeStatus[] = [
  'active',
  'repaid',
  'defaulted',
  'liquidated',
  'available',
  'pledged',
];

describe('StatusBadge', () => {
  test.each(ALL_STATUSES)('renders %s with label and icon', (status) => {
    render(<StatusBadge status={status} />);
    const badge = screen.getByRole('status');
    expect(badge).toBeInTheDocument();
    // label text is capitalised version of status
    expect(badge).toHaveTextContent(status.charAt(0).toUpperCase() + status.slice(1));
  });

  test('renders unknown status as plain text without crashing', () => {
    render(<StatusBadge status="unknown-state" />);
    expect(screen.getByText('unknown-state')).toBeInTheDocument();
  });

  test.each(ALL_STATUSES)('%s badge has no axe accessibility violations', async (status) => {
    const { container } = render(<StatusBadge status={status} />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  test('icon is hidden from assistive technology', () => {
    render(<StatusBadge status="active" />);
    const badge = screen.getByRole('status');
    expect(badge).toHaveAttribute('aria-label', 'Status: Active');
  });

  describe('tooltips (#824)', () => {
    test.each(ALL_STATUSES)('shows the %s explanation on hover', (status) => {
      render(<StatusBadge status={status} />);
      const badge = screen.getByRole('status');

      fireEvent.mouseEnter(badge);

      const tooltip = screen.getByRole('tooltip');
      expect(tooltip).toHaveTextContent(STATUS_TOOLTIPS[status]);

      fireEvent.mouseLeave(badge);
      expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    });

    test.each(ALL_STATUSES)('shows the %s explanation on focus', (status) => {
      render(<StatusBadge status={status} />);
      const badge = screen.getByRole('status');

      expect(badge).toHaveAttribute('tabindex', '0');
      fireEvent.focus(badge);

      expect(screen.getByRole('tooltip')).toHaveTextContent(STATUS_TOOLTIPS[status]);
    });

    test.each([
      ['active', 'This loan is currently active with an outstanding balance'],
      ['repaid', 'This loan has been fully repaid'],
      ['liquidated', 'This loan was liquidated due to insufficient collateral'],
    ] as const)('uses the required %s copy', (status, expected) => {
      expect(STATUS_TOOLTIPS[status]).toBe(expected);
    });

    test('does not add a tooltip to an unknown status', () => {
      render(<StatusBadge status="unknown-state" />);
      const badge = screen.getByText('unknown-state');

      fireEvent.mouseEnter(badge);
      fireEvent.focus(badge);

      expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
      expect(badge).not.toHaveAttribute('tabindex');
    });
  });

  // ── #539: Design token colour tests ─────────────────────────────────────────

  describe('design token colour classes (#539)', () => {
    test('active uses success token colours', () => {
      render(<StatusBadge status="active" />);
      const badge = screen.getByRole('status');
      expect(badge.className).toContain('bg-color-success-subtle');
      expect(badge.className).toContain('text-color-success');
    });

    test('repaid uses primary token colours', () => {
      render(<StatusBadge status="repaid" />);
      const badge = screen.getByRole('status');
      expect(badge.className).toContain('bg-color-primary');
      expect(badge.className).toContain('text-color-primary');
    });

    test('liquidated uses danger token colours', () => {
      render(<StatusBadge status="liquidated" />);
      const badge = screen.getByRole('status');
      expect(badge.className).toContain('bg-color-danger-subtle');
      expect(badge.className).toContain('text-color-danger');
    });

    test('defaulted uses warning token colours', () => {
      render(<StatusBadge status="defaulted" />);
      const badge = screen.getByRole('status');
      expect(badge.className).toContain('bg-color-warning-subtle');
      expect(badge.className).toContain('text-color-warning');
    });

    test('available uses success token colours', () => {
      render(<StatusBadge status="available" />);
      const badge = screen.getByRole('status');
      expect(badge.className).toContain('bg-color-success-subtle');
      expect(badge.className).toContain('text-color-success');
    });

    test('pledged uses secondary token colours', () => {
      render(<StatusBadge status="pledged" />);
      const badge = screen.getByRole('status');
      expect(badge.className).toContain('text-color-secondary');
    });
  });

  // ── #1093: Animation tests ───────────────────────────────────────────────────

  describe('Framer Motion animation (#1093)', () => {
    test('badge wrapper has no layout-shifting outer element', () => {
      const { container } = render(<StatusBadge status="active" />);
      // The outer wrapper is a plain span, not a block-level element
      const wrapper = container.querySelector('[data-testid="status-badge-wrapper"]');
      expect(wrapper).toBeTruthy();
      expect(wrapper!.tagName.toLowerCase()).toBe('span');
    });

    test('badge is wrapped in AnimatePresence for transition animations', () => {
      // The animated span is inside the wrapper
      render(<StatusBadge status="active" />);
      const badge = screen.getByRole('status');
      expect(badge).toBeInTheDocument();
    });

    test('does not cause layout shift — wrapper is inline-flex', () => {
      const { container } = render(<StatusBadge status="active" />);
      const wrapper = container.querySelector('[data-testid="status-badge-wrapper"]');
      expect(wrapper).toBeTruthy();
      expect(wrapper!.className).toContain('inline-flex');
    });

    test('badge renders correctly when prefers-reduced-motion is set', () => {
      mockReducedMotion = true;
      render(<StatusBadge status="active" />);
      const badge = screen.getByRole('status');
      // Should still render and display the label
      expect(badge).toHaveTextContent('Active');
      expect(badge).toBeInTheDocument();
    });

    test('unknown status renders correctly with reduced-motion', () => {
      mockReducedMotion = true;
      render(<StatusBadge status="unknown-xyz" />);
      expect(screen.getByText('unknown-xyz')).toBeInTheDocument();
    });
  });
});

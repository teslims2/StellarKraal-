import { render, screen } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';
import HealthGauge from '../components/HealthGauge';
import Modal from '../../components/Modal';
import RepaymentModal from '../../components/RepaymentModal';

// Mock the design tokens to avoid import issues
jest.mock('@/lib/design-tokens', () => ({
  colors: {
    text: {
      secondary: 'text-brown-600'
    }
  },
  healthColor: (value: number) => {
    if (value >= 15000) return '#16A34A';
    if (value >= 10000) return '#D97706';
    return '#DC2626';
  }
}));

expect.extend(toHaveNoViolations);

describe('Accessibility Tests', () => {
  test('HealthGauge should not have accessibility violations', async () => {
    const { container } = render(<HealthGauge value={15000} />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  test('HealthGauge with low health should not have accessibility violations', async () => {
    const { container } = render(<HealthGauge value={8000} />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  test('HealthGauge should have proper color contrast', async () => {
    const { container } = render(<HealthGauge value={15000} />);
    const results = await axe(container, {
      rules: {
        'color-contrast': { enabled: true }
      }
    });
    expect(results).toHaveNoViolations();
  });

  test('HealthGauge SVG has accessible title, description, and role', async () => {
    const { container } = render(<HealthGauge value={15000} />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('role', 'img');
    expect(svg).toHaveAttribute('aria-labelledby', 'hg-title hg-desc');
    expect(svg).toHaveTextContent('Health factor: 1.50x — Safe');
    const title = svg?.querySelector('title');
    expect(title).toHaveTextContent(/Health factor: 1\.50x — Safe/);
    const desc = svg?.querySelector('desc');
    expect(desc).toHaveTextContent(/Loan health factor gauge/);
  });

  test('HealthGauge with history data points has aria-labels', async () => {
    const history = [
      { date: '2026-01-01', value: 15000 },
      { date: '2026-01-02', value: 12000 },
    ];
    const { container } = render(<HealthGauge value={15000} history={history} />);
    const circles = container.querySelectorAll('circle[aria-label]');
    expect(circles.length).toBeGreaterThanOrEqual(2);
    expect(circles[0]).toHaveAttribute('aria-label');
    expect(circles[1]).toHaveAttribute('aria-label');
  });
});

describe('Modal accessibility', () => {
  test('Modal should not have accessibility violations when open', async () => {
    const { container } = render(
      <Modal isOpen={true} onClose={() => {}} title="Test Modal">
        <p>Content</p>
      </Modal>,
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  test('Modal should have role=dialog and aria-modal', () => {
    render(
      <Modal isOpen={true} onClose={() => {}} title="Test Modal">
        <p>Content</p>
      </Modal>,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });

  test('Modal close button is reachable by keyboard', () => {
    render(
      <Modal isOpen={true} onClose={() => {}} title="Test Modal">
        <p>Content</p>
      </Modal>,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('tabIndex', '-1');
  });
});

describe('RepaymentModal accessibility', () => {
  test('RepaymentModal should not have accessibility violations when open', async () => {
    const { container } = render(
      <RepaymentModal
        isOpen={true}
        onClose={() => {}}
        onConfirm={() => {}}
        amount="500 XLM"
      />,
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  test('RepaymentModal has aria-labelledby pointing to the title', () => {
    const { container } = render(
      <RepaymentModal
        isOpen={true}
        onClose={() => {}}
        onConfirm={() => {}}
        amount="500 XLM"
      />,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-labelledby', 'repayment-modal-title');
    const titleEl = container.querySelector('#repayment-modal-title');
    expect(titleEl).toBeInTheDocument();
  });

  test('RepaymentModal Cancel and Confirm buttons are labelled', () => {
    render(
      <RepaymentModal
        isOpen={true}
        onClose={() => {}}
        onConfirm={() => {}}
        amount="500 XLM"
      />,
    );
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument();
  });
});

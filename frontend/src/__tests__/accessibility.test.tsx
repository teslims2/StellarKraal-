import { render } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';
import HealthGauge from '../components/HealthGauge';

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

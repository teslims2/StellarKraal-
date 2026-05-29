import React from 'react';
import { render, screen } from '@testing-library/react';
import HealthGauge from '../components/HealthGauge';

// requestAnimationFrame is not available in jsdom
beforeAll(() => {
  global.requestAnimationFrame = (cb) => {
    cb(0);
    return 0;
  };
  global.cancelAnimationFrame = () => {};
});

describe('HealthGauge', () => {
  it('displays numeric value', () => {
    render(<HealthGauge value={13333} />);
    expect(screen.getByTestId('gauge-value').textContent).toBe('1.33x');
  });

  it('shows Safe label when hf >= 15_000', () => {
    render(<HealthGauge value={15000} />);
    expect(screen.getByTestId('gauge-label').textContent).toBe('Safe');
  });

  it('shows Warning label when 10_000 <= hf < 15_000', () => {
    render(<HealthGauge value={12000} />);
    expect(screen.getByTestId('gauge-label').textContent).toBe('Warning');
  });

  it('shows Danger label when hf < 10_000', () => {
    render(<HealthGauge value={8000} />);
    expect(screen.getByTestId('gauge-label').textContent).toBe('Danger');
  });

  it('renders three zone arcs', () => {
    const { container } = render(<HealthGauge value={13333} />);
    // 3 zone paths + 1 background + 1 active fill = 5 paths total
    const paths = container.querySelectorAll('path');
    expect(paths.length).toBeGreaterThanOrEqual(3);
  });

  it('has role=meter with aria attributes', () => {
    render(<HealthGauge value={13333} />);
    const meter = screen.getByRole('meter');
    expect(meter).toBeTruthy();
    expect(meter.getAttribute('aria-valuenow')).toBe('13333');
    expect(meter.getAttribute('aria-valuemin')).toBe('0');
    expect(meter.getAttribute('aria-valuemax')).toBe('20000');
  });

  it('renders an SVG element', () => {
    const { container } = render(<HealthGauge value={13333} />);
    expect(container.querySelector('svg')).toBeTruthy();
  });
});

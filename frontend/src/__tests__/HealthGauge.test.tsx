import React from 'react';
import { render, screen } from '@testing-library/react';
import HealthGauge from '../components/HealthGauge';

jest.mock('../lib/design-tokens', () => ({
  healthColor: (bps: number) => (bps >= 15_000 ? '#16A34A' : bps >= 10_000 ? '#D97706' : '#DC2626'),
  colors: { text: { secondary: 'text-brown-600' } },
}));

describe('HealthGauge', () => {
  it('shows Safe when hf >= 15_000', () => {
    render(<HealthGauge value={16_000} />);
    expect(screen.getAllByText('Safe').length).toBeGreaterThan(0);
  });

  it('shows Warning when 10_000 <= hf < 15_000', () => {
    render(<HealthGauge value={13_333} />);
    expect(screen.getAllByText('Warning').length).toBeGreaterThan(0);
  });

  it('shows Danger when hf < 10_000', () => {
    render(<HealthGauge value={8_000} />);
    expect(screen.getAllByText('Danger').length).toBeGreaterThan(0);
  });

  it('displays ratio value in gauge', () => {
    render(<HealthGauge value={10_000} />);
    expect(screen.getByText('1.00x')).toBeTruthy();
  });

  it('has accessible aria-label with value and status', () => {
    render(<HealthGauge value={13_333} />);
    expect(screen.getByRole('img', { name: /health factor 1\.33x — warning/i })).toBeTruthy();
  });
});

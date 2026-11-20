/**
 * Unit tests for HealthFactorGauge — the health-factor display component
 * (#1532). Covers the three risk zones, the accessible meter role, the
 * non-finite fallback, and the tooltip toggle.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import HealthFactorGauge from '@/components/HealthFactorGauge';

// The gauge animates the marker via requestAnimationFrame; stub it so the
// component renders deterministically without pending frame callbacks.
beforeEach(() => {
  jest.spyOn(globalThis, 'requestAnimationFrame').mockImplementation(() => 0);
  jest.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(() => undefined);
});
afterEach(() => {
  jest.restoreAllMocks();
});

describe('HealthFactorGauge', () => {
  it('renders the numeric health factor and an accessible meter', () => {
    render(<HealthFactorGauge healthFactor={1.23} />);
    expect(screen.getByText('1.23')).toBeInTheDocument();
    const meter = screen.getByRole('meter');
    expect(meter).toHaveAttribute('aria-valuemin', '0');
    expect(meter).toHaveAttribute('aria-valuemax', '2');
    expect(meter.getAttribute('aria-valuenow')).toBe('1.23');
  });

  it('marks the Safe zone when health factor is >= 1.5', () => {
    render(<HealthFactorGauge healthFactor={2} />);
    const safeLabel = screen.getByText('Safe');
    expect(safeLabel).toBeInTheDocument();
    // The active zone label is bolded via inline fontWeight 700.
    expect(safeLabel.getAttribute('style')).toContain('700');
  });

  it('marks the At Risk zone when 1.0 <= health factor < 1.5', () => {
    render(<HealthFactorGauge healthFactor={1.2} />);
    const atRisk = screen.getByText('At Risk');
    expect(atRisk).toBeInTheDocument();
    expect(atRisk.getAttribute('style')).toContain('700');
  });

  it('marks the Liquidation zone when health factor < 1.0', () => {
    render(<HealthFactorGauge healthFactor={0.85} />);
    const liquidation = screen.getByText('Liquidation');
    expect(liquidation).toBeInTheDocument();
    expect(liquidation.getAttribute('style')).toContain('700');
  });

  it('shows an em dash and reports 0 when the health factor is not finite', () => {
    render(<HealthFactorGauge healthFactor={Number.NaN} />);
    expect(screen.getByText('—')).toBeInTheDocument();
    const meter = screen.getByRole('meter');
    expect(meter.getAttribute('aria-valuenow')).toBe('0');
  });

  it('toggles the explanatory tooltip when the info button is clicked', () => {
    render(<HealthFactorGauge healthFactor={1.5} />);
    const info = screen.getByRole('button', {
      name: /how is the health factor calculated/i,
    });
    // Tooltip is hidden initially.
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    fireEvent.click(info);
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
    fireEvent.click(info);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('renders each zone label as a legend row', () => {
    render(<HealthFactorGauge healthFactor={1} />);
    expect(screen.getByText('Liquidation')).toBeInTheDocument();
    expect(screen.getByText('At Risk')).toBeInTheDocument();
    expect(screen.getByText('Safe')).toBeInTheDocument();
  });
});

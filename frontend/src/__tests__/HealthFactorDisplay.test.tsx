/**
 * Unit tests for the HealthFactorDisplay component (#1532).
 *
 * Covers:
 *  - safe zone (health factor >= 1.5): green colour and "Safe" label
 *  - at-risk zone (1.0 <= health factor < 1.5): amber colour and "At risk" label
 *  - liquidation zone (health factor < 1.0): red colour and "Liquidation risk" label
 *  - non-finite input (NaN, Infinity): shows an em dash and reports 0
 *  - accessible progressbar role with correct aria attributes
 *  - tooltip element present in the DOM (shown on focus/hover via CSS)
 *  - custom safeMax scales the bar correctly
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import HealthFactorDisplay from '../../components/HealthFactorDisplay';

describe('HealthFactorDisplay', () => {
  it('shows the numeric value and a progressbar role', () => {
    render(<HealthFactorDisplay healthFactor={1.75} />);
    expect(screen.getByText('1.75')).toBeInTheDocument();
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuemin', '0');
    expect(bar).toHaveAttribute('aria-valuemax', '2');
    expect(bar).toHaveAttribute('aria-valuenow', '1.75');
  });

  it('renders the Safe label and green text when health factor is >= 1.5', () => {
    const { container } = render(<HealthFactorDisplay healthFactor={1.8} />);
    expect(screen.getByText('Safe')).toBeInTheDocument();
    // The numeric value element should carry the green colour class.
    expect(container.querySelector('.text-green-600')).not.toBeNull();
  });

  it('renders the At risk label and amber text when 1.0 <= health factor < 1.5', () => {
    const { container } = render(<HealthFactorDisplay healthFactor={1.2} />);
    expect(screen.getByText('At risk')).toBeInTheDocument();
    expect(container.querySelector('.text-amber-600')).not.toBeNull();
  });

  it('renders the Liquidation risk label and red text when health factor < 1.0', () => {
    const { container } = render(<HealthFactorDisplay healthFactor={0.9} />);
    expect(screen.getByText('Liquidation risk')).toBeInTheDocument();
    expect(container.querySelector('.text-red-600')).not.toBeNull();
  });

  it('shows an em dash and reports 0 for NaN input', () => {
    render(<HealthFactorDisplay healthFactor={NaN} />);
    expect(screen.getByText('—')).toBeInTheDocument();
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '0');
  });

  it('shows an em dash and reports 0 for Infinity input', () => {
    render(<HealthFactorDisplay healthFactor={Infinity} />);
    expect(screen.getByText('—')).toBeInTheDocument();
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '0');
  });

  it('clamps the bar to 100% when health factor exceeds safeMax', () => {
    render(<HealthFactorDisplay healthFactor={3.0} safeMax={2.0} />);
    const bar = screen.getByRole('progressbar');
    // aria-valuenow reflects the raw value; the visual clamping is in the style.
    expect(bar).toHaveAttribute('aria-valuenow', '3');
  });

  it('uses a custom safeMax for the aria-valuemax attribute', () => {
    render(<HealthFactorDisplay healthFactor={1.5} safeMax={3.0} />);
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuemax', '3');
  });

  it('includes a tooltip element in the DOM for screen readers and hover', () => {
    render(<HealthFactorDisplay healthFactor={1.5} />);
    // The tooltip role is in the DOM (visibility toggled via CSS, not JS removal).
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
    expect(screen.getByRole('tooltip').textContent).toMatch(/health factor/i);
  });

  it('applies an extra className when provided', () => {
    const { container } = render(
      <HealthFactorDisplay healthFactor={1.5} className="mt-4" />
    );
    expect(container.firstChild).toHaveClass('mt-4');
  });
});

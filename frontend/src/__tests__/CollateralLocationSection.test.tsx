/**
 * Tests for CollateralLocationSection — Issues #568 / #1253
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import CollateralLocationSection from '@/components/CollateralLocationSection';

// Mock the dynamic CollateralMap import so tests don't require Leaflet
jest.mock('next/dynamic', () => {
  return function dynamic(importFn: () => Promise<{ default: React.ComponentType<unknown> }>, options: { loading?: () => React.ReactElement }) {
    // Return the loading placeholder during tests (Leaflet not available in jsdom)
    const Loading = options?.loading;
    const MockMap = () =>
      Loading ? Loading() : <div data-testid="collateral-map-mock">Map</div>;
    MockMap.displayName = 'MockCollateralMap';
    return MockMap;
  };
});

describe('CollateralLocationSection (#568 / #1253)', () => {
  // -- Hidden when no location data --

  it('renders nothing when all location props are absent', () => {
    const { container } = render(<CollateralLocationSection />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when location is null and no GPS coords', () => {
    const { container } = render(<CollateralLocationSection location={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when location is undefined and no GPS coords', () => {
    const { container } = render(<CollateralLocationSection location={undefined} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when only latitude is provided (no longitude)', () => {
    const { container } = render(<CollateralLocationSection latitude={1.0} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when only longitude is provided (no latitude)', () => {
    const { container } = render(<CollateralLocationSection longitude={36.0} />);
    expect(container.firstChild).toBeNull();
  });

  // -- Renders with text location (no GPS) --

  it('renders section with "Location" heading when location text is provided', () => {
    render(<CollateralLocationSection location="Nairobi, Kenya" />);
    expect(screen.getByRole('region', { name: /location/i })).toBeInTheDocument();
  });

  it('renders the heading at h2 level', () => {
    render(<CollateralLocationSection location="Nairobi, Kenya" />);
    const heading = screen.getByRole('heading', { level: 2, name: /location/i });
    expect(heading).toBeInTheDocument();
  });

  it('renders the placeholder img when only text location is provided', () => {
    render(<CollateralLocationSection location="Nairobi, Kenya" />);
    expect(
      screen.getByRole('img', { name: /GPS coordinates not available/i }),
    ).toBeInTheDocument();
  });

  it('displays the location text when provided', () => {
    render(<CollateralLocationSection location="Nairobi, Kenya" />);
    expect(screen.getByText('Nairobi, Kenya')).toBeInTheDocument();
  });

  it('does not display a location paragraph when location is empty string', () => {
    render(<CollateralLocationSection location="" />);
    expect(screen.queryByText('Nairobi, Kenya')).not.toBeInTheDocument();
  });

  it('section is accessible via aria-labelledby', () => {
    render(<CollateralLocationSection location="Mombasa" />);
    const section = screen.getByRole('region', { name: /location/i });
    expect(section).toHaveAttribute('aria-labelledby', 'location-section-heading');
  });

  // -- Renders with GPS coordinates (map shown) --

  it('renders section when GPS coords are provided (no text location)', () => {
    render(<CollateralLocationSection latitude={-1.286} longitude={36.817} />);
    expect(screen.getByRole('region', { name: /location/i })).toBeInTheDocument();
  });

  it('does NOT render the placeholder when GPS coords are provided', () => {
    render(<CollateralLocationSection latitude={-1.286} longitude={36.817} />);
    expect(screen.queryByRole('img', { name: /GPS coordinates not available/i })).toBeNull();
  });

  it('renders section when both GPS coords and text location are provided', () => {
    render(
      <CollateralLocationSection latitude={-1.286} longitude={36.817} location="Nairobi" />,
    );
    expect(screen.getByRole('region', { name: /location/i })).toBeInTheDocument();
    // text location should still be displayed
    expect(screen.getByText('Nairobi')).toBeInTheDocument();
  });
});

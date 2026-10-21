/**
 * CollateralLocationSection — Issues #568 / #1253
 *
 * Renders the location section on the Collateral Detail page.
 *
 * Behaviour:
 *  - Hidden entirely when no location data exists.
 *  - Shows an interactive Leaflet map when both latitude and longitude are
 *    present (Issue #1253).
 *  - Falls back to the text location string when GPS coords are missing but
 *    a location string exists.
 *
 * Acceptance criteria:
 *  ✓ Leaflet map rendered when latitude and longitude are present
 *  ✓ Map marker uses the animal type icon
 *  ✓ Map hidden when coordinates are absent
 *  ✓ Map tiles loaded via OpenStreetMap (no API key required)
 *  ✓ Map is keyboard accessible
 */
'use client';

import dynamic from 'next/dynamic';

// Leaflet requires a browser environment — load the map lazily with no SSR.
const CollateralMap = dynamic(() => import('@/components/CollateralMap'), {
  ssr: false,
  loading: () => (
    <div
      role="status"
      aria-label="Loading map…"
      className="w-full h-64 rounded-xl animate-pulse"
      style={{ backgroundColor: 'var(--color-skeleton-base, #e8ddd0)' }}
    />
  ),
});

interface Props {
  /** Optional text location. Section is hidden when both this and GPS coords are absent. */
  location?: string | null;
  /** Optional GPS latitude. */
  latitude?: number | null;
  /** Optional GPS longitude. */
  longitude?: number | null;
  /** Optional animal type — used to pick the marker icon. */
  animalType?: string;
}

export default function CollateralLocationSection({
  location,
  latitude,
  longitude,
  animalType,
}: Props) {
  const hasGps = latitude != null && longitude != null;
  const hasLocation = hasGps || location != null;

  // Hidden when there is no location data at all
  if (!hasLocation) return null;

  return (
    <section
      aria-labelledby="location-section-heading"
      className="mt-6 bg-white dark:bg-[var(--color-bg-card)] rounded-2xl p-6 shadow"
    >
      <h2
        id="location-section-heading"
        className="text-lg font-semibold text-brown dark:text-[var(--color-text)] mb-4 flex items-center gap-2"
      >
        <span aria-hidden="true">📍</span>
        Location
      </h2>

      {hasGps ? (
        /* Interactive Leaflet map — shown when GPS coordinates are available */
        <CollateralMap
          latitude={latitude as number}
          longitude={longitude as number}
          animalType={animalType}
        />
      ) : (
        /* Placeholder skeleton — shown when only a text location exists */
        <div
          role="img"
          aria-label="Map placeholder — GPS coordinates not available"
          className="relative w-full h-40 rounded-xl overflow-hidden"
          style={{ backgroundColor: 'var(--color-skeleton-base, #e8ddd0)' }}
        >
          <div
            className="absolute inset-0 animate-pulse opacity-50"
            style={{
              background:
                'linear-gradient(90deg, transparent 0%, var(--color-skeleton-shine, #f5ede0) 50%, transparent 100%)',
            }}
            aria-hidden="true"
          />
          <div
            className="absolute inset-0 flex flex-col items-center justify-center gap-1"
            aria-hidden="true"
          >
            <span className="text-4xl">🗺️</span>
            <span
              className="text-sm font-medium"
              style={{ color: 'var(--color-text-muted, #8B5A1F)' }}
            >
              GPS coordinates not available
            </span>
          </div>
        </div>
      )}

      {/* Display the raw location string when one is provided */}
      {location && (
        <p className="mt-3 text-sm" style={{ color: 'var(--color-text-muted, #8B5A1F)' }}>
          {location}
        </p>
      )}
    </section>
  );
}

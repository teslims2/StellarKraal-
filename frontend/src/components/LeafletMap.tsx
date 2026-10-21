'use client';

/**
 * LeafletMap — Issue #1253
 *
 * Renders an interactive OpenStreetMap tile map (via Leaflet) when GPS
 * coordinates are available on a collateral record.
 *
 * Acceptance criteria:
 *  ✓ Rendered when latitude and longitude are present
 *  ✓ Hidden when coordinates are absent (handled by CollateralLocationSection)
 *  ✓ Map tiles loaded via OpenStreetMap (no API key required)
 *  ✓ Map marker uses the animal type icon (emoji-based DivIcon)
 *  ✓ Keyboard accessible: focusable container + descriptive aria-label
 */

import { useEffect, useRef } from 'react';

interface Props {
  latitude: number;
  longitude: number;
  /** Animal type string used to choose the marker icon emoji. */
  animalType?: string;
}

/** Returns an emoji that matches the animal type (best-effort). */
function animalEmoji(animalType?: string): string {
  const lower = (animalType ?? '').toLowerCase();
  if (lower.includes('goat')) return '🐐';
  if (lower.includes('sheep')) return '🐑';
  if (lower.includes('pig') || lower.includes('hog')) return '🐷';
  if (lower.includes('chicken') || lower.includes('poultry')) return '🐔';
  if (lower.includes('horse') || lower.includes('donkey')) return '🐴';
  return '🐄'; // default: cow
}

/** Injects Leaflet's CSS into the document <head> once (idempotent). */
function ensureLeafletCSS() {
  const LEAFLET_CSS_ID = 'leaflet-css';
  if (document.getElementById(LEAFLET_CSS_ID)) return;
  const link = document.createElement('link');
  link.id = LEAFLET_CSS_ID;
  link.rel = 'stylesheet';
  link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
  link.crossOrigin = '';
  document.head.appendChild(link);
}

export default function LeafletMap({ latitude, longitude, animalType }: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  // Store the Leaflet map instance so we can clean it up on unmount.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapInstanceRef = useRef<any>(null);

  useEffect(() => {
    // Leaflet is SSR-incompatible — guard against server-side execution.
    if (typeof window === 'undefined') return;
    if (!mapRef.current) return;

    // Avoid double-initialisation (e.g. React Strict Mode double-effect).
    if (mapInstanceRef.current) return;

    // Inject Leaflet CSS before creating the map.
    ensureLeafletCSS();

    // Dynamically import Leaflet so it never runs during SSR/build.
    import('leaflet').then((L) => {
      // Guard: the component might have unmounted while awaiting the import.
      if (!mapRef.current || mapInstanceRef.current) return;

      // Fix Leaflet's default icon path issue with webpack/bundlers.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });

      const map = L.map(mapRef.current!, {
        // Keyboard navigation is enabled by default in Leaflet.
        keyboard: true,
        scrollWheelZoom: false, // prevent accidental zoom during page scroll
        zoomControl: true,
      }).setView([latitude, longitude], 13);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright" ' +
          'target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }).addTo(map);

      // Custom emoji marker using a DivIcon so no external asset is needed.
      const emoji = animalEmoji(animalType);
      const icon = L.divIcon({
        html: `<span role="img" aria-label="${animalType ?? 'animal'} location" style="font-size:2rem;line-height:1;display:block">${emoji}</span>`,
        className: '', // remove Leaflet's default white box
        iconSize: [36, 36],
        iconAnchor: [18, 36],
        popupAnchor: [0, -36],
      });

      L.marker([latitude, longitude], { icon })
        .addTo(map)
        .bindPopup(
          `<strong>${animalType ?? 'Collateral'}</strong><br/>` +
            `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`
        );

      mapInstanceRef.current = map;
    });

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
    // Only re-run when coordinates or animal type change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latitude, longitude, animalType]);

  return (
    <div
      ref={mapRef}
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
      tabIndex={0}
      role="application"
      aria-label={`Map showing collateral location at ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`}
      className="w-full h-64 rounded-xl overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-brown"
    />
  );
}

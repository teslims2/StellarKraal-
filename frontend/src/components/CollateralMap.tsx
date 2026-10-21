'use client';
/**
 * CollateralMap — Issue #1253
 *
 * Renders an interactive Leaflet map on the collateral detail page showing
 * the animal's registered GPS location.
 *
 * Acceptance criteria:
 *  ✓ Leaflet map rendered when latitude and longitude are present
 *  ✓ Map marker uses the animal type emoji as icon
 *  ✓ Map hidden when coordinates are absent
 *  ✓ Map tiles loaded via OpenStreetMap (no API key required)
 *  ✓ Map is keyboard accessible (Leaflet's built-in keyboard nav enabled)
 */

import { useEffect, useRef } from 'react';

interface Props {
  /** Latitude in decimal degrees. */
  latitude: number;
  /** Longitude in decimal degrees. */
  longitude: number;
  /** Optional animal type used to pick a representative emoji for the marker. */
  animalType?: string;
}

/** Pick an emoji based on animal type. Falls back to 📍. */
function getAnimalEmoji(animalType?: string): string {
  const lower = (animalType ?? '').toLowerCase();
  if (lower.includes('goat')) return '🐐';
  if (lower.includes('sheep')) return '🐑';
  if (lower.includes('pig') || lower.includes('swine')) return '🐷';
  if (lower.includes('horse') || lower.includes('equine')) return '🐴';
  if (lower.includes('chicken') || lower.includes('poultry') || lower.includes('hen')) return '🐔';
  if (lower.includes('camel')) return '🐫';
  if (lower.includes('donkey')) return '🫏';
  // Default: cow/bull for generic "cattle" or unknown
  return '🐄';
}

export default function CollateralMap({ latitude, longitude, animalType }: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  // Keep a reference to the leaflet map instance so we can clean it up on
  // unmount without creating a second map on re-render.
  const leafletMapRef = useRef<import('leaflet').Map | null>(null);

  useEffect(() => {
    if (!mapRef.current || leafletMapRef.current) return;

    let L: typeof import('leaflet');

    const initMap = async () => {
      // Dynamically import Leaflet so it only runs on the client (no SSR).
      L = await import('leaflet');

      // Leaflet CSS must be injected manually when bundled — Next.js does not
      // auto-inject third-party stylesheets.
      if (!document.getElementById('leaflet-css')) {
        const link = document.createElement('link');
        link.id = 'leaflet-css';
        link.rel = 'stylesheet';
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        link.integrity = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=';
        link.crossOrigin = '';
        document.head.appendChild(link);
      }

      const emoji = getAnimalEmoji(animalType);

      // Create a custom DivIcon using the animal emoji so no external image
      // is needed and the marker is screen-reader friendly.
      const markerIcon = L.divIcon({
        html: `<span role="img" aria-label="${animalType ?? 'animal'} location marker" style="font-size:2rem;line-height:1;">${emoji}</span>`,
        className: 'leaflet-emoji-icon',
        iconSize: [36, 36],
        iconAnchor: [18, 36],
        popupAnchor: [0, -36],
      });

      const map = L.map(mapRef.current!, {
        // Keyboard navigation is ON by default in Leaflet — keep it enabled.
        keyboard: true,
        scrollWheelZoom: false, // prevent accidental scroll-hijack on detail page
      }).setView([latitude, longitude], 13);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }).addTo(map);

      L.marker([latitude, longitude], { icon: markerIcon })
        .addTo(map)
        .bindPopup(
          `<strong>${animalType ?? 'Collateral'}</strong><br/>${latitude.toFixed(6)}, ${longitude.toFixed(6)}`
        )
        .openPopup();

      leafletMapRef.current = map;
    };

    initMap().catch(console.error);

    return () => {
      if (leafletMapRef.current) {
        leafletMapRef.current.remove();
        leafletMapRef.current = null;
      }
    };
  }, [latitude, longitude, animalType]);

  return (
    <div
      ref={mapRef}
      className="w-full h-64 rounded-xl overflow-hidden ring-1 ring-brown/20"
      // Allow focus so keyboard users can interact with the Leaflet map via Tab.
      tabIndex={0}
      aria-label={`Map showing location of ${animalType ?? 'collateral'} at ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`}
      data-testid="collateral-map"
    />
  );
}

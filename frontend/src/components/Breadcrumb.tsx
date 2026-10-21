'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * Human-readable label overrides for known path segments.
 * Dynamic segments (e.g. IDs) fall back to the capitalised raw segment value.
 */
const SEGMENT_LABELS: Record<string, string> = {
  dashboard: 'Dashboard',
  collateral: 'Collateral',
  loans: 'Loans',
  admin: 'Admin',
  users: 'Users',
  reports: 'Reports',
  statistics: 'Statistics',
  moderation: 'Moderation',
  liquidators: 'Liquidators',
  borrow: 'Borrow',
  settings: 'Settings',
  profile: 'Profile',
  help: 'Help',
  transactions: 'Transactions',
};

interface Crumb {
  label: string;
  href: string;
}

/**
 * Builds a crumb list from a pathname string, always starting with Home.
 * e.g. "/loans/abc-123" →
 *   [{ label: 'Home', href: '/' },
 *    { label: 'Loans', href: '/loans' },
 *    { label: 'abc-123', href: '/loans/abc-123' }]
 */
export function buildCrumbs(pathname: string): Crumb[] {
  const segments = pathname.split('/').filter(Boolean);

  const home: Crumb = { label: 'Home', href: '/' };

  const rest = segments.map((segment, index) => {
    const href = '/' + segments.slice(0, index + 1).join('/');
    // Use the label map, then fall back to capitalising the raw segment.
    const label =
      SEGMENT_LABELS[segment] ??
      segment.charAt(0).toUpperCase() + segment.slice(1);
    return { label, href };
  });

  return [home, ...rest];
}

/**
 * Builds a JSON-LD BreadcrumbList structured data object for SEO.
 */
function buildJsonLd(crumbs: Crumb[]): string {
  const baseUrl =
    typeof window !== 'undefined' ? window.location.origin : 'https://stellarkraal.example.com';
  const itemListElement = crumbs.map((crumb, index) => ({
    '@type': 'ListItem',
    position: index + 1,
    name: crumb.label,
    item: `${baseUrl}${crumb.href}`,
  }));
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement,
  });
}

/**
 * Renders a breadcrumb trail for the current route.
 * Returns null when the path is not nested (≤1 segment deep),
 * so it is invisible on top-level pages like /dashboard.
 *
 * Includes:
 *  - Home crumb as the first item
 *  - JSON-LD BreadcrumbList structured data for SEO
 *  - aria-label="breadcrumb" nav landmark
 *  - Last crumb is not a link (current page)
 *  - Home > Loans > Loan #123 format
 */
export default function Breadcrumb() {
  const pathname = usePathname();
  const crumbs = buildCrumbs(pathname);

  // Hide on top-level pages — Home alone or just one segment (e.g. /dashboard itself)
  if (crumbs.length <= 2) return null;

  return (
    <>
      {/* JSON-LD structured data for SEO */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: buildJsonLd(crumbs) }}
      />

      <nav aria-label="breadcrumb" className="mb-4">
        <ol className="flex flex-wrap items-center gap-1 text-sm text-brown/70">
          {crumbs.map((crumb, index) => {
            const isLast = index === crumbs.length - 1;
            return (
              <li key={crumb.href} className="flex items-center gap-1">
                {index > 0 && (
                  <span aria-hidden="true" className="text-brown/40 select-none">
                    /
                  </span>
                )}
                {isLast ? (
                  <span aria-current="page" className="font-medium text-brown">
                    {crumb.label}
                  </span>
                ) : (
                  <Link href={crumb.href} className="hover:text-brown hover:underline transition">
                    {crumb.label}
                  </Link>
                )}
              </li>
            );
          })}
        </ol>
      </nav>
    </>
  );
}

/**
 * Profile page — server wrapper.
 *
 * Exports static metadata. The interactive UI is rendered by ProfileClient.
 *
 * Closes #1520 (metadata API).
 */
import type { Metadata } from 'next';
import ProfileClient from './ProfileClient';

export const metadata: Metadata = {
  title: 'Profile',
  description:
    'View your wallet address, registered collateral, active loans, and account activity on StellarKraal.',
  alternates: { canonical: 'https://stellarkraal.io/profile' },
  openGraph: {
    title: 'Profile — StellarKraal',
    description:
      'View your wallet address, registered collateral, active loans, and account activity on StellarKraal.',
    url: 'https://stellarkraal.io/profile',
    images: [
      {
        url: '/og-banner.png',
        width: 1200,
        height: 630,
        alt: 'StellarKraal profile page',
      },
    ],
  },
};

export default function ProfilePage() {
  return <ProfileClient />;
}

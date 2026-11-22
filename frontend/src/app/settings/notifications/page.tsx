import type { Metadata } from "next";
import Link from "next/link";
import WebhookNotificationSettings from "@/components/WebhookNotificationSettings";

/**
 * /settings/notifications — Issue #1528
 *
 * Notification preferences page: event-type toggles, webhook URL registration,
 * and a one-click test to verify delivery.
 */
export const metadata: Metadata = {
  title: "Notification Preferences — StellarKraal",
  description:
    "Configure which loan lifecycle events you receive webhook alerts for and manage your notification endpoint.",
  alternates: { canonical: "https://stellarkraal.io/settings/notifications" },
  openGraph: {
    title: "Notification Preferences — StellarKraal",
    description:
      "Configure which loan lifecycle events you receive webhook alerts for and manage your notification endpoint.",
    url: "https://stellarkraal.io/settings/notifications",
    images: [{ url: "https://stellarkraal.io/og-banner.png" }],
  },
};

export default function NotificationsSettingsPage() {
  return (
    <main className="max-w-lg mx-auto px-4 py-10">
      <div className="flex items-center gap-3 mb-6">
        <Link
          href="/settings"
          className="text-brown/60 hover:text-brown text-sm"
        >
          ← Settings
        </Link>
        <h1 className="text-3xl font-bold text-brown">
          Notification Preferences
        </h1>
      </div>

      <WebhookNotificationSettings />
    </main>
  );
}

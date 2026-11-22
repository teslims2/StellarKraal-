"use client";

/**
 * WebhookNotificationSettings — Issue #1528
 *
 * Allows users to:
 *   - Toggle per-event-type notification preferences.
 *   - Register or update a webhook URL that receives loan lifecycle events.
 *   - Fire a test webhook delivery and see success / failure feedback.
 *
 * Preferences are persisted via PATCH /api/v1/settings/notifications.
 */
import { useEffect, useState } from "react";
import { useToast } from "@/components/toast";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

interface NotifEvents {
  loanApproved: boolean;
  loanRepaid: boolean;
  liquidationWarning: boolean;
  collateralUpdated: boolean;
  healthFactorAlert: boolean;
}

interface NotificationPreferences {
  webhookUrl: string | null;
  events: NotifEvents;
}

const DEFAULT_PREFS: NotificationPreferences = {
  webhookUrl: null,
  events: {
    loanApproved: true,
    loanRepaid: true,
    liquidationWarning: true,
    collateralUpdated: false,
    healthFactorAlert: true,
  },
};

const EVENT_LABELS: { key: keyof NotifEvents; label: string; description: string }[] = [
  {
    key: "loanApproved",
    label: "Loan approved",
    description: "Triggered when a new loan request is approved on-chain.",
  },
  {
    key: "loanRepaid",
    label: "Loan repaid",
    description: "Triggered when a loan is fully or partially repaid.",
  },
  {
    key: "liquidationWarning",
    label: "Liquidation warning",
    description: "Triggered when a loan's health factor approaches the liquidation threshold.",
  },
  {
    key: "collateralUpdated",
    label: "Collateral updated",
    description: "Triggered when collateral appraisal or status changes.",
  },
  {
    key: "healthFactorAlert",
    label: "Health factor alert",
    description: "Triggered when the health factor drops below the warning level.",
  },
];

export default function WebhookNotificationSettings({
  wallet = "anonymous",
}: {
  wallet?: string;
}) {
  const { success, error: toastError } = useToast();

  const [prefs, setPrefs] = useState<NotificationPreferences>(DEFAULT_PREFS);
  const [webhookInput, setWebhookInput] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  // ── Load current preferences ───────────────────────────────────────────────

  useEffect(() => {
    fetch(
      `${API}/api/v1/settings/notifications?wallet=${encodeURIComponent(wallet)}`
    )
      .then((r) => r.json())
      .then((data: NotificationPreferences) => {
        setPrefs(data);
        setWebhookInput(data.webhookUrl ?? "");
      })
      .catch(() => {
        /* keep defaults */
      })
      .finally(() => setLoading(false));
  }, [wallet]);

  // ── Persist to backend ─────────────────────────────────────────────────────

  async function patchPrefs(patch: Partial<NotificationPreferences>): Promise<void> {
    const res = await fetch(
      `${API}/api/v1/settings/notifications?wallet=${encodeURIComponent(wallet)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      }
    );
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(
        (body as { error?: string }).error ?? `HTTP ${res.status}`
      );
    }
    return res.json();
  }

  // ── Toggle an event type ───────────────────────────────────────────────────

  async function toggleEvent(key: keyof NotifEvents): Promise<void> {
    const prev = prefs;
    const next: NotificationPreferences = {
      ...prefs,
      events: { ...prefs.events, [key]: !prefs.events[key] },
    };
    setPrefs(next);
    try {
      await patchPrefs({ events: { [key]: next.events[key] } });
    } catch {
      setPrefs(prev);
      toastError("Failed to save preference. Please try again.");
    }
  }

  // ── Save webhook URL ───────────────────────────────────────────────────────

  async function saveWebhookUrl(): Promise<void> {
    const url = webhookInput.trim() || null;
    if (url) {
      try {
        new URL(url);
      } catch {
        toastError("Please enter a valid URL.");
        return;
      }
    }

    setSaving(true);
    try {
      await patchPrefs({ webhookUrl: url });
      setPrefs((p) => ({ ...p, webhookUrl: url }));
      success("Webhook URL saved.");
    } catch {
      toastError("Failed to save webhook URL. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  // ── Test webhook ───────────────────────────────────────────────────────────

  async function testWebhook(): Promise<void> {
    setTesting(true);
    try {
      const res = await fetch(
        `${API}/api/v1/settings/notifications/test-webhook?wallet=${encodeURIComponent(
          wallet
        )}`,
        { method: "POST" }
      );
      const body: { success: boolean; message: string } = await res.json();
      if (body.success) {
        success(body.message);
      } else {
        toastError(body.message);
      }
    } catch {
      toastError("Test request failed. Check your connection and try again.");
    } finally {
      setTesting(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div aria-busy="true" className="space-y-3">
        {EVENT_LABELS.map((e) => (
          <div key={e.key} className="h-16 rounded-xl bg-brown/5 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <section aria-labelledby="webhook-notif-heading" className="space-y-6">
      <h2
        id="webhook-notif-heading"
        className="text-lg font-semibold text-brown dark:text-cream-50"
      >
        Webhook Notification Preferences
      </h2>

      {/* Event type toggles */}
      <div>
        <p className="text-sm text-brown/60 dark:text-cream-50/60 mb-3">
          Choose which loan lifecycle events trigger a notification to your webhook endpoint.
        </p>
        <ul className="space-y-3" aria-label="Notification event toggles">
          {EVENT_LABELS.map(({ key, label, description }) => {
            const checked = prefs.events[key];
            const toggleId = `webhook-toggle-${key}`;
            return (
              <li
                key={key}
                className="flex items-start justify-between gap-4 rounded-xl border border-brown/10 dark:border-cream-50/10 bg-white dark:bg-brown-900/40 px-4 py-3"
              >
                <div className="flex-1">
                  <label
                    htmlFor={toggleId}
                    className="block text-sm font-medium text-brown-700 dark:text-cream-50 cursor-pointer"
                  >
                    {label}
                  </label>
                  <p className="text-xs text-brown/50 dark:text-cream-50/50 mt-0.5">
                    {description}
                  </p>
                </div>

                <button
                  id={toggleId}
                  role="switch"
                  aria-checked={checked}
                  aria-label={label}
                  onClick={() => toggleEvent(key)}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-gold focus:ring-offset-2 ${
                    checked ? "bg-gold-600" : "bg-brown/20"
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      checked ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Webhook URL registration */}
      <div className="rounded-xl border border-brown/10 dark:border-cream-50/10 bg-white dark:bg-brown-900/40 px-4 py-4 space-y-3">
        <label
          htmlFor="webhook-url-input"
          className="block text-sm font-medium text-brown-700 dark:text-cream-50"
        >
          Webhook URL
        </label>
        <p className="text-xs text-brown/50 dark:text-cream-50/50">
          StellarKraal will POST a JSON payload to this URL for each enabled event.
        </p>

        <div className="flex gap-2">
          <input
            id="webhook-url-input"
            type="url"
            value={webhookInput}
            onChange={(e) => setWebhookInput(e.target.value)}
            placeholder="https://your-service.example/webhook"
            className="flex-1 rounded-lg border border-brown/20 dark:border-cream-50/20 bg-transparent px-3 py-2 text-sm text-brown dark:text-cream-50 placeholder-brown/30 focus:outline-none focus:ring-2 focus:ring-gold"
          />
          <button
            onClick={saveWebhookUrl}
            disabled={saving}
            className="rounded-lg bg-gold-600 px-4 py-2 text-sm font-medium text-white hover:bg-gold-700 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-gold focus:ring-offset-2 transition-colors"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>

        {prefs.webhookUrl && (
          <div className="flex items-center justify-between pt-1">
            <p className="text-xs text-brown/50 dark:text-cream-50/50 truncate max-w-xs">
              Registered: <span className="font-mono">{prefs.webhookUrl}</span>
            </p>
            <button
              onClick={testWebhook}
              disabled={testing}
              className="ml-3 shrink-0 rounded-lg border border-brown/20 dark:border-cream-50/20 px-3 py-1 text-xs font-medium text-brown dark:text-cream-50 hover:bg-brown/5 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-gold focus:ring-offset-2 transition-colors"
            >
              {testing ? "Sending…" : "Test webhook"}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

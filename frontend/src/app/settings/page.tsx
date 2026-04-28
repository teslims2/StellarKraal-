"use client";
import { useState, useEffect, useCallback } from "react";
import WalletConnect from "@/components/WalletConnect";
import Link from "next/link";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api/v1";

const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "fr", label: "Français" },
  { code: "sw", label: "Kiswahili" },
  { code: "ha", label: "Hausa" },
  { code: "yo", label: "Yorùbá" },
];

const CURRENCIES = ["USD", "KES", "NGN", "GHS", "ZAR", "XLM"];

interface Settings {
  walletAddress: string;
  joinDate: string;
  notifications: {
    loanApproved: boolean;
    loanRepaid: boolean;
    liquidationWarning: boolean;
  };
  language: string;
  currency: string;
}

export default function SettingsPage() {
  const [wallet, setWallet] = useState<string | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const fetchSettings = useCallback(async (address: string) => {
    const res = await fetch(`${API}/settings/${address}`);
    if (res.ok) setSettings(await res.json());
  }, []);

  useEffect(() => {
    if (wallet) fetchSettings(wallet);
  }, [wallet, fetchSettings]);

  async function save(patch: Partial<Settings>) {
    if (!wallet || !settings) return;
    setSaving(true);
    const updated = { ...settings, ...patch };
    setSettings(updated);
    try {
      await fetch(`${API}/settings/${wallet}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  function toggleNotification(key: keyof Settings["notifications"]) {
    if (!settings) return;
    save({ notifications: { ...settings.notifications, [key]: !settings.notifications[key] } });
  }

  return (
    <main className="max-w-2xl mx-auto px-4 py-10">
      <div className="flex items-center gap-3 mb-8">
        <Link href="/dashboard" className="text-brown/60 hover:text-brown text-sm">← Dashboard</Link>
        <h1 className="text-3xl font-bold text-brown">Settings</h1>
        {saving && <span className="text-sm text-brown/50 ml-auto">Saving…</span>}
        {saved && <span className="text-sm text-green-600 ml-auto">Saved ✓</span>}
      </div>

      <WalletConnect onConnect={setWallet} />

      {!wallet && (
        <p className="text-brown/60 mt-6">Connect your wallet to view and edit settings.</p>
      )}

      {wallet && settings && (
        <div className="space-y-6 mt-6">

          {/* Profile */}
          <section className="bg-white rounded-2xl p-6 shadow">
            <h2 className="text-lg font-semibold text-brown mb-4">Profile</h2>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-brown/60">Wallet address</dt>
                <dd className="font-mono text-xs break-all max-w-xs text-right">{settings.walletAddress}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-brown/60">Member since</dt>
                <dd>{new Date(settings.joinDate).toLocaleDateString()}</dd>
              </div>
            </dl>
          </section>

          {/* Notifications */}
          <section className="bg-white rounded-2xl p-6 shadow">
            <h2 className="text-lg font-semibold text-brown mb-4">Notifications</h2>
            <div className="space-y-3">
              {(
                [
                  ["loanApproved", "Loan approved"],
                  ["loanRepaid", "Loan repaid"],
                  ["liquidationWarning", "Liquidation warning"],
                ] as [keyof Settings["notifications"], string][]
              ).map(([key, label]) => (
                <label key={key} className="flex items-center justify-between cursor-pointer">
                  <span className="text-sm text-brown">{label}</span>
                  <button
                    role="switch"
                    aria-checked={settings.notifications[key]}
                    onClick={() => toggleNotification(key)}
                    className={`relative w-11 h-6 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-gold ${
                      settings.notifications[key] ? "bg-gold" : "bg-brown/20"
                    }`}
                  >
                    <span
                      className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                        settings.notifications[key] ? "translate-x-5" : "translate-x-0"
                      }`}
                    />
                  </button>
                </label>
              ))}
            </div>
          </section>

          {/* Language */}
          <section className="bg-white rounded-2xl p-6 shadow">
            <h2 className="text-lg font-semibold text-brown mb-4">Language</h2>
            <select
              value={settings.language}
              onChange={(e) => save({ language: e.target.value })}
              className="w-full border border-brown/30 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold"
              aria-label="Language"
            >
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>{l.label}</option>
              ))}
            </select>
          </section>

          {/* Currency */}
          <section className="bg-white rounded-2xl p-6 shadow">
            <h2 className="text-lg font-semibold text-brown mb-4">Currency Display</h2>
            <div className="flex flex-wrap gap-2">
              {CURRENCIES.map((c) => (
                <button
                  key={c}
                  onClick={() => save({ currency: c })}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-gold ${
                    settings.currency === c
                      ? "bg-gold text-brown"
                      : "bg-brown/10 text-brown hover:bg-brown/20"
                  }`}
                  aria-pressed={settings.currency === c}
                >
                  {c}
                </button>
              ))}
            </div>
          </section>

        </div>
      )}
    </main>
  );
}

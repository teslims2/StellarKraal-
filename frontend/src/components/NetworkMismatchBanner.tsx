"use client";
import { useWallet } from "@/hooks/useWallet";
import { useNetworkMismatch } from "@/hooks/useNetworkMismatch";

export default function NetworkMismatchBanner() {
  const { address } = useWallet();
  const mismatch = useNetworkMismatch(address);

  if (!mismatch) return null;

  const appNetwork = (process.env.NEXT_PUBLIC_NETWORK ?? "testnet").toLowerCase();
  const appNetworkLabel = appNetwork === "mainnet" ? "Mainnet" : "Testnet";

  return (
    <div
      role="alert"
      aria-live="assertive"
      aria-atomic="true"
      className="w-full px-4 py-3 text-sm font-medium flex flex-col sm:flex-row items-start sm:items-center justify-center gap-1 sm:gap-3"
      style={{
        backgroundColor: "var(--token-warning-subtle)",
        color: "var(--token-text)",
        borderBottom: "1px solid var(--token-warning)",
      }}
    >
      <span>
        ⚠️{" "}
        <strong>Network mismatch</strong> — Freighter is on the wrong network. This app requires{" "}
        <strong>{appNetworkLabel}</strong>.
      </span>
      <span className="flex items-center gap-2 shrink-0">
        <span>To fix:</span>
        <ol className="list-decimal list-inside flex flex-col gap-0.5 text-xs">
          <li>Open the Freighter extension.</li>
          <li>
            Click the network name at the top and select{" "}
            <strong>{appNetworkLabel}</strong>.
          </li>
        </ol>
        <a
          href="https://freighter.app"
          target="_blank"
          rel="noopener noreferrer"
          className="underline font-semibold shrink-0"
          style={{ color: "var(--token-secondary)" }}
        >
          Open Freighter
        </a>
      </span>
      <span className="text-xs opacity-75">All transactions are blocked until resolved.</span>
    </div>
  );
}

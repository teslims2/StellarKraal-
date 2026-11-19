"use client";
import { useEffect } from "react";
import Script from "next/script";

export default function ServiceWorkerRegistration() {
  useEffect(() => {
    // Fallback registration for browsers where next/script's worker
    // strategy is unavailable. Runs after hydration so it never blocks
    // the main thread during initial render.
    if (
      typeof window !== "undefined" &&
      "serviceWorker" in navigator &&
      !window.__swRegistered
    ) {
      window.__swRegistered = true;
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .catch(() => {
          // SW registration failure is non-fatal
        });
    }
  }, []);

  return (
    <Script
      id="sw-registration"
      strategy="afterInteractive"
      dangerouslySetInnerHTML={{
        __html: `
          (function () {
            if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
            if (window.__swRegistered) return;
            window.__swRegistered = true;
            navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(function () {});
          })();
        `,
      }}
    />
  );
}
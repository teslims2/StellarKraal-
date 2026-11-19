"use client";
import Script from "next/script";

/**
 * PrintDateScript — #811, #1472
 *
 * Sets `data-print-date` on `<body>` to the current locale date string.
 * The print CSS uses `attr(data-print-date)` in the `body::after` footer
 * to show the date a loan summary was printed without any server round-trip.
 *
 * Converted from a useEffect-based client component to a `next/script`
 * with `afterInteractive` strategy. The inline script runs after hydration
 * without shipping a React component into the client bundle, reducing
 * main-thread work (issue #1472).
 */
export default function PrintDateScript() {
  return (
    <Script id="print-date-script" strategy="afterInteractive">
      {`document.body.dataset.printDate = new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });`}
    </Script>
  );
}
</｜｜DSML｜｜ parameter>
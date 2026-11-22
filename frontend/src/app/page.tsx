import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import dynamic from "next/dynamic";
import Tooltip from "@/components/Tooltip";

import PageTransition from "@/components/PageTransition";

const BelowTheFold = dynamic(() => import("@/components/BelowTheFold"), {
  loading: () => null,
});

export const metadata: Metadata = {
  title: "StellarKraal — Livestock Micro-Lending",
  description: "Register livestock as collateral and access instant micro-loans on Stellar. Built for African emerging markets.",
  alternates: { canonical: "https://stellarkraal.io/" },
  openGraph: {
    title: "StellarKraal — Livestock Micro-Lending",
    description: "Register livestock as collateral and access instant micro-loans on Stellar. Built for African emerging markets.",
    url: "https://stellarkraal.io/",
    images: [{ url: "https://stellarkraal.io/og-banner.png" }],
  },
};
export default function Home() {
  return (
    <PageTransition>
    <main className="flex flex-col items-center justify-center min-h-screen px-6 text-center">
      <h1 className="text-4xl md:text-5xl font-bold mb-4" style={{ color: "var(--color-text)" }}>🐄 StellarKraal</h1>
      <Image
        src="/og-banner.png"
        alt="StellarKraal — livestock-backed micro-lending on Stellar"
        width={1200}
        height={630}
        sizes="(max-width: 768px) 100vw, 768px"
        priority
        className="w-full max-w-md md:max-w-2xl h-auto mb-6 rounded-xl"
      />
      <p className="text-xl mb-2 font-semibold text-gold">Livestock-Backed Micro-Lending on Stellar</p>
      <p className="max-w-sm md:max-w-md mb-10" style={{ color: "var(--color-text-muted)" }}>
        Register your cattle, goats, or sheep as on-chain collateral and access instant micro-loans — built for African emerging markets.
      </p>
      <div className="flex gap-4 flex-wrap justify-center">
        <Tooltip hint="B — Borrow">
          <Link href="/borrow" className="bg-brown text-cream px-6 py-3 rounded-xl font-semibold hover:bg-brown/80 transition min-h-[44px] flex items-center justify-center dark:bg-gold dark:text-brown">
            Get a Loan
          </Link>
        </Tooltip>
        <Tooltip hint="D — Dashboard">
          <Link href="/dashboard" className="border-2 border-brown text-brown px-6 py-3 rounded-xl font-semibold hover:bg-brown/10 transition min-h-[44px] flex items-center justify-center" style={{ border: "2px solid var(--color-text)", color: "var(--color-text)" }}>
            Dashboard
          </Link>
        </Tooltip>
        <Tooltip hint="S — Settings">
          <Link href="/settings" className="px-6 py-3 rounded-xl font-semibold transition min-h-[44px] flex items-center justify-center" style={{ border: "2px solid var(--color-text)", color: "var(--color-text)" }}>
            Settings
          </Link>
        </Tooltip>
      </div>

      <BelowTheFold />
    </main>
    </PageTransition>
  );
}

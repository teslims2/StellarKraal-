import Link from "next/link";
import ThemeToggle from "@/components/ThemeToggle";

export default function Home() {
  return (
    <main className="flex flex-col items-center justify-center min-h-screen px-6 text-center relative">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <h1 className="text-5xl font-bold text-brown dark:text-cream mb-4">🐄 StellarKraal</h1>
      <p className="text-xl text-gold mb-2 font-semibold">Livestock-Backed Micro-Lending on Stellar</p>
      <p className="text-brown/70 dark:text-cream/70 max-w-md mb-10">
        Register your cattle, goats, or sheep as on-chain collateral and access instant micro-loans — built for African emerging markets.
      </p>
      <div className="flex gap-4 flex-wrap justify-center">
        <Link
          href="/borrow"
          className="bg-brown dark:bg-gold text-cream dark:text-brown px-6 py-3 rounded-xl font-semibold hover:opacity-90 transition"
        >
          Get a Loan
        </Link>
        <Link
          href="/dashboard"
          className="border-2 border-brown dark:border-gold text-brown dark:text-gold px-6 py-3 rounded-xl font-semibold hover:bg-brown/10 dark:hover:bg-gold/10 transition"
        >
          Dashboard
        </Link>
      </div>
    </main>
  );
}

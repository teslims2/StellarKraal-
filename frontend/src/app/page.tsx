import Link from "next/link";

export default function Home() {
  return (
    <main className="flex flex-col items-center justify-center min-h-screen px-token-lg text-center">
      <h1 className="text-token-4xl font-bold text-brand-brown mb-token-md">🐄 StellarKraal</h1>
      <p className="text-token-xl text-brand-gold mb-2 font-semibold">Livestock-Backed Micro-Lending on Stellar</p>
      <p className="text-brand-brown/70 max-w-md mb-token-xl">
        Register your cattle, goats, or sheep as on-chain collateral and access instant micro-loans — built for African emerging markets.
      </p>
      <div className="flex gap-token-md flex-wrap justify-center">
        <Link href="/borrow" className="bg-brand-brown text-brand-cream px-token-lg py-token-sm rounded-token-xl font-semibold hover:bg-brand-brown/80 transition">
          Get a Loan
        </Link>
        <Link href="/dashboard" className="border-2 border-brand-brown text-brand-brown px-token-lg py-token-sm rounded-token-xl font-semibold hover:bg-brand-brown/10 transition">
          Dashboard
        </Link>
      </div>
    </main>
  );
}

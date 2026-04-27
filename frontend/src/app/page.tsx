import Link from "next/link";

export default function Home() {
  return (
    <main className="flex flex-col items-center justify-center min-h-screen px-6 text-center">
      <h1 className="text-4xl md:text-5xl font-bold text-brown mb-4">🐄 StellarKraal</h1>
      <p className="text-xl text-gold mb-2 font-semibold">Livestock-Backed Micro-Lending on Stellar</p>
      <p className="text-brown/70 max-w-sm md:max-w-md mb-10">
        Register your cattle, goats, or sheep as on-chain collateral and access instant micro-loans — built for African emerging markets.
      </p>
      <div className="flex flex-col md:flex-row gap-4 items-center">
        <Link href="/borrow" className="bg-brown text-cream px-6 py-3 rounded-xl font-semibold hover:bg-brown/80 transition min-h-[44px] flex items-center justify-center">
          Get a Loan
        </Link>
        <Link href="/dashboard" className="border-2 border-brown text-brown px-6 py-3 rounded-xl font-semibold hover:bg-brown/10 transition min-h-[44px] flex items-center justify-center">
          Dashboard
        </Link>
      </div>
    </main>
  );
}

import Link from "next/link";

export default function Home() {
  return (
    <main className="flex flex-col items-center justify-center min-h-screen px-6 text-center">
      <h1 className="text-5xl font-bold text-brown mb-4">🐄 StellarKraal</h1>
      <p className="text-xl text-gold mb-2 font-semibold">Livestock-Backed Micro-Lending on Stellar</p>
      <p className="text-brown/70 max-w-md mb-10">
        Register your cattle, goats, or sheep as on-chain collateral and access instant micro-loans — built for African emerging markets.
      </p>
      <div className="flex gap-4 flex-wrap justify-center">
        <Link href="/borrow" className="bg-brown text-cream px-6 py-3 rounded-xl font-semibold hover:bg-brown/80 transition">
          Get a Loan
        </Link>
        <Link href="/dashboard" className="border-2 border-brown text-brown px-6 py-3 rounded-xl font-semibold hover:bg-brown/10 transition">
          Dashboard
        </Link>
      </div>
    </main>
  );
}

'use client';
import { useState } from 'react';
import dynamic from 'next/dynamic';
import LoanWizard from '@/components/wizard/LoanWizard';
import PageTransition from '@/components/PageTransition';
import { Hero } from '@/components/Hero';
import Spinner from '@/components/Spinner';

// Heavy components loaded lazily to reduce initial JS bundle (#1070)
const WalletConnect = dynamic(() => import('@/components/WalletConnect'), {
  ssr: false,
  loading: () => <Spinner />,
});

export default function BorrowClient() {
  const [wallet, setWallet] = useState<string | null>(null);

  return (
    <PageTransition>
      <Hero className="py-10">
        <main className="max-w-lg mx-auto px-4">
          <h1 className="text-3xl font-bold text-brown mb-6">Borrow</h1>
          <WalletConnect onConnect={setWallet} />
          {wallet && <LoanWizard walletAddress={wallet} />}
        </main>
      </Hero>
    </PageTransition>
  );
}

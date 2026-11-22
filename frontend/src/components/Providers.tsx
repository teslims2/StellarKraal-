'use client';

import React from 'react';
import { Provider } from 'react-redux';
import { SWRConfig } from 'swr';
import { store } from '@/store/store';
import { ToastProvider, ToastContainer } from '@/components/toast';
import OfflineBanner from '@/components/OfflineBanner';
import { WalletProvider } from '@/context/WalletContext';

interface ProvidersProps {
  children: React.ReactNode;
}

export function Providers({ children }: ProvidersProps) {
  return (
    <Provider store={store}>
      <SWRConfig
        value={{
          // Serve cached data instantly on navigation and dedupe identical
          // requests for 30s so page transitions don't re-fetch the same data.
          dedupingInterval: 30_000,
          keepPreviousData: true,
          revalidateOnFocus: true,
        }}
      >
        <WalletProvider>
          <ToastProvider>
            <OfflineBanner />
            {children}
            <ToastContainer />
          </ToastProvider>
        </WalletProvider>
      </SWRConfig>
    </Provider>
  );
}
import type { Metadata } from "next";
import "./globals.css";
import WalletHeader from "@/components/WalletHeader";

export const metadata: Metadata = {
  title: "StellarKraal — Livestock Micro-Lending",
  description: "Livestock-backed micro-lending on Stellar/Soroban",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-cream text-brown min-h-screen">
        <WalletHeader />
        {children}
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import "./globals.css";
import { ToastProvider, ToastContainer } from "@/components/toast";

export const metadata: Metadata = {
  title: "StellarKraal — Livestock Micro-Lending",
  description: "Livestock-backed micro-lending on Stellar/Soroban",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-cream text-brown min-h-screen">
        <ToastProvider>
          {children}
          <ToastContainer />
        </ToastProvider>
      </body>
    </html>
  );
}

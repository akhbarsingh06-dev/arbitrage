import "./globals.css";
import type { Metadata } from "next";
import dynamic from "next/dynamic";
import AppShell from "@/components/AppShell";

export const metadata: Metadata = {
  title: "Base Arbitrage Protocol",
  description: "Hybrid-execution arbitrage infrastructure on Base.",
};

const Providers = dynamic(() => import("./providers"), { ssr: false });

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full bg-bg text-slate-100 antialiased">
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}

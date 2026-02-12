"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { cx } from "@/lib/cx";

function NavLink({ href, label }: { href: string; label: string }) {
  const pathname = usePathname();
  const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(`${href}/`));
  return (
    <Link
      href={href}
      className={cx(
        "rounded-full border px-3 py-1 text-xs transition",
        active
          ? "border-[rgba(110,231,255,0.35)] bg-[rgba(110,231,255,0.10)] text-slate-100"
          : "border-border bg-white/5 text-slate-200 hover:bg-white/10"
      )}
    >
      {label}
    </Link>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="sticky top-0 z-30 border-b border-border bg-bg/60 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="text-sm font-extrabold tracking-wide">
              BaseArb
            </Link>
            <span className="pill">Base Mainnet</span>
          </div>

          <nav className="flex flex-wrap items-center gap-2">
            <NavLink href="/dashboard" label="Dashboard" />
            <NavLink href="/execute" label="Execute" />
            <NavLink href="/analytics" label="Analytics" />
            <NavLink href="/history" label="History" />
          </nav>

          <div className="flex items-center gap-2">
            <ConnectButton chainStatus="icon" showBalance={false} />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 py-6">{children}</main>
    </>
  );
}

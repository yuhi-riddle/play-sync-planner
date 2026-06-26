import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, Home, ListChecks, Settings } from "lucide-react";

import { AuthNav } from "@/components/auth-nav";
import { brand } from "@/lib/brand";

import "./globals.css";

export const metadata: Metadata = {
  title: brand.name,
  description: brand.description
};

const navItems = [
  { href: "/", label: "ホーム", icon: Home },
  { href: "/events", label: "イベント", icon: CalendarDays },
  { href: "/plans", label: "調整中", icon: ListChecks },
  { href: "/settings", label: "設定", icon: Settings }
];

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <body>
        <div className="app-shell min-h-screen pb-20">
          <header className="border-b border-white/80 bg-cream/80 backdrop-blur-md">
            <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
              <Link href="/" className="group flex items-center gap-3 text-lg font-bold tracking-normal text-ink">
                <span className="relative inline-flex h-10 w-12 items-end justify-center rounded-lg border border-white/70 bg-skywash/70 shadow-soft">
                  <span className="absolute right-2 top-2 h-3 w-3 rounded-full bg-honey" />
                  <span className="absolute bottom-2 left-2 h-4 w-5 bg-pine [clip-path:polygon(50%_0,100%_100%,0_100%)]" />
                  <span className="absolute bottom-2 right-2 h-6 w-6 bg-moss [clip-path:polygon(50%_0,100%_100%,0_100%)]" />
                  <span className="absolute bottom-2 right-3 h-3 w-3 bg-cream [clip-path:polygon(50%_0,100%_100%,0_100%)]" />
                  <span className="absolute bottom-2 left-1.5 h-1.5 w-9 rounded-full bg-cream/80" />
                </span>
                <span>{brand.name}</span>
              </Link>
              <AuthNav />
            </div>
          </header>
          <main className="mx-auto max-w-6xl px-4 py-8 sm:py-10">{children}</main>
        </div>
        <nav className="fixed inset-x-0 bottom-0 border-t border-white/80 bg-cream/92 shadow-lift backdrop-blur-md sm:hidden">
          <ul className="grid grid-cols-4">
            {navItems.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="flex min-h-16 flex-col items-center justify-center gap-1 text-xs font-bold text-ink/68 hover:text-pine focus:outline-none focus:ring-2 focus:ring-clay"
                >
                  <item.icon aria-hidden="true" className="h-5 w-5" />
                  <span>{item.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </body>
    </html>
  );
}

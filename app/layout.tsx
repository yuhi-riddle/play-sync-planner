import type { Metadata } from "next";
import Link from "next/link";

import { AuthNav } from "@/components/auth-nav";
import { MobileEventFab } from "@/components/mobile-event-fab";
import { PrimaryNav } from "@/components/primary-nav";
import { brand } from "@/lib/brand";

import "./globals.css";

export const metadata: Metadata = {
  title: brand.name,
  description: brand.description,
  icons: {
    icon: "/icon.svg"
  }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <body>
        <a
          href="#main-content"
          className="fixed left-4 top-4 z-[60] -translate-y-24 rounded-full bg-ink px-4 py-2 text-body font-bold text-white shadow-lift transition-transform focus:translate-y-0 focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2"
        >
          本文へ移動
        </a>
        <div className="app-shell min-h-screen">
          <header className="sticky top-0 z-50 border-b border-line bg-surface/85 backdrop-blur-md">
            <div className="mx-auto flex max-w-[1440px] flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-4 lg:px-8 xl:px-10">
              <Link href="/" className="group flex items-center gap-3 self-start text-lg font-bold tracking-normal text-ink">
                <span className="relative inline-flex h-10 w-12 items-end justify-center rounded-control border border-line bg-skywash/70 shadow-raise">
                  <span className="absolute right-2 top-2 h-3 w-3 rounded-full bg-honey" />
                  <span className="absolute bottom-2 left-2 h-4 w-5 bg-pine [clip-path:polygon(50%_0,100%_100%,0_100%)]" />
                  <span className="absolute bottom-2 right-2 h-6 w-6 bg-moss [clip-path:polygon(50%_0,100%_100%,0_100%)]" />
                  <span className="absolute bottom-2 right-3 h-3 w-3 bg-cream [clip-path:polygon(50%_0,100%_100%,0_100%)]" />
                  <span className="absolute bottom-2 left-1.5 h-1.5 w-9 rounded-full bg-surface" />
                </span>
                <span>{brand.name}</span>
              </Link>
              <AuthNav />
            </div>
          </header>
          <div className="mx-auto max-w-[1440px] px-4 pb-28 pt-8 sm:px-6 sm:pb-10 sm:pt-10 lg:px-8 xl:px-10">
            <PrimaryNav />
            <main id="main-content" tabIndex={-1}>
              {children}
            </main>
          </div>
          <footer className="mx-auto max-w-[1440px] px-4 pb-28 text-body text-muted sm:px-6 sm:pb-8 lg:px-8 xl:px-10">
            <div className="flex flex-wrap gap-4 border-t border-line pt-5">
              <Link href="/terms" className="font-semibold hover:text-pine focus:outline-none focus:ring-2 focus:ring-clay">
                利用規約
              </Link>
              <Link href="/privacy" className="font-semibold hover:text-pine focus:outline-none focus:ring-2 focus:ring-clay">
                プライバシーポリシー
              </Link>
            </div>
          </footer>
          <MobileEventFab />
        </div>
      </body>
    </html>
  );
}

import React from "react";
import type { Metadata, Viewport } from "next";
import { Zen_Maru_Gothic } from "next/font/google";
import type { User } from "@supabase/supabase-js";
import Link from "next/link";

import { AuthNav } from "@/components/layout/auth-nav";
import { Logo } from "@/components/layout/logo";
import { MobileEventFab } from "@/components/layout/mobile-event-fab";
import { PrimaryNav } from "@/components/layout/primary-nav";
import { WebVitalsReporter } from "@/components/ui/web-vitals-reporter";
import { brand } from "@/lib/shared/brand";
import { getCurrentUser, hasSupabaseEnv } from "@/lib/supabase/server";

import "./globals.css";

export const metadata: Metadata = {
  title: brand.name,
  description: brand.description,
  icons: {
    icon: "/icon.svg",
    apple: "/icons/icon-192.png"
  }
};

// ホーム画面から開いたときにブラウザのUI色を揃える（pine）。
export const viewport: Viewport = {
  themeColor: "#344f43"
};

const zenMaruGothic = Zen_Maru_Gothic({
  subsets: ["japanese"],
  weight: ["400", "700"],
  display: "swap",
  variable: "--font-zen-maru-gothic"
});

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  let user: User | null = null;

  if (hasSupabaseEnv()) {
    user = await getCurrentUser();
  }
  const isSignedIn = Boolean(user);

  return (
    <html lang="ja" className={zenMaruGothic.variable}>
      <body>
        <a
          href="#main-content"
          className="fixed left-4 top-4 z-[60] -translate-y-24 rounded-full bg-ink px-4 py-2 text-body font-bold text-white shadow-lift transition-transform focus:translate-y-0 focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2"
        >
          本文へ移動
        </a>
        <div className="app-shell min-h-screen">
          <header className="sticky top-0 z-50 border-b border-line bg-surface/85 backdrop-blur-md">
            <div className="mx-auto flex max-w-[1440px] flex-row items-center justify-between gap-3 px-4 py-2 sm:px-6 sm:py-4 lg:px-8 xl:px-10">
              <Link href="/" className="group flex items-center gap-3 text-lg font-bold tracking-normal text-ink">
                <Logo className="h-8 w-8 sm:h-10 sm:w-10" />
                <span>{brand.name}</span>
              </Link>
              <AuthNav user={user} />
            </div>
          </header>
          <div className="mx-auto max-w-[1440px] px-4 pb-36 pt-8 sm:px-6 sm:pb-10 sm:pt-10 lg:px-8 xl:px-10">
            <PrimaryNav isSignedIn={isSignedIn} />
            <main id="main-content" tabIndex={-1} className="min-h-[calc(100vh-10rem)]">
              {children}
            </main>
          </div>
          <footer className="mx-auto max-w-[1440px] px-4 pb-36 text-body text-muted sm:px-6 sm:pb-8 lg:px-8 xl:px-10">
            <div className="flex flex-wrap gap-4 border-t border-line pt-5">
              <Link href="/terms" className="font-semibold hover:text-pine focus:outline-none focus:ring-2 focus:ring-clay">
                利用規約
              </Link>
              <Link href="/privacy" className="font-semibold hover:text-pine focus:outline-none focus:ring-2 focus:ring-clay">
                プライバシーポリシー
              </Link>
            </div>
          </footer>
          <MobileEventFab isSignedIn={isSignedIn} />
        </div>
        <WebVitalsReporter />
      </body>
    </html>
  );
}

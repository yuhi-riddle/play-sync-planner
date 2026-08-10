import React from "react";

import { ButtonLink, SecondaryLink } from "@/components/ui";

/**
 * 未ログインで最初に出る画面。
 *
 * 認証は Google だけなので、ボタンは1つにしてある。「はじめる」と「ログイン」に
 * 割っても行き先は同じ /login で、押し分けを迷わせるだけになる。
 *
 * 規約の同意はここでは取らない。/login にチェックボックスがあり、本文を開くまで
 * チェックできない作りになっている。ここで「続けると同意したことになります」と
 * 書くと、その証跡より弱い形を先に見せることになる。
 */
export function WelcomeHero() {
  return (
    <section className="relative overflow-hidden rounded-card border border-line bg-surface px-6 py-14 shadow-raise sm:px-10 sm:py-20">
      {/* 装飾。読み上げにも乗せない */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-honey/16 sm:h-72 sm:w-72"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-24 -left-20 h-64 w-64 rounded-full bg-skywash/60 sm:h-80 sm:w-80"
      />

      <div className="relative mx-auto flex max-w-md flex-col items-center text-center">
        <svg
          aria-hidden="true"
          viewBox="0 0 64 64"
          className="h-20 w-20 sm:h-24 sm:w-24"
        >
          <rect width="64" height="64" rx="14" fill="#edf4f1" />
          <circle cx="46" cy="18" r="7" fill="#e7bd63" />
          <path d="M11 48 29 16l18 32H11Z" fill="#486c5b" />
          <path d="M27 48 42 24l15 24H27Z" fill="#7d927c" />
          <path d="M38 48 45 36l7 12H38Z" fill="#f8f2e6" />
          <path d="M10 51h44" stroke="#f8f2e6" strokeWidth="5" strokeLinecap="round" />
        </svg>

        <h1 className="mt-6 text-display text-ink">Madoi</h1>
        <p className="mt-4 text-title text-ink">予定を合わせるところから、集まりは始まる。</p>
        <p className="mt-3 text-body leading-7 text-muted">
          空いている日を出し合って、決まったらカレンダーに入るまで。
          <br className="hidden sm:inline" />
          誘う側も誘われる側も、やることは同じ画面にまとまっています。
        </p>

        <div className="mt-9 w-full">
          <ButtonLink href="/login">Google ではじめる</ButtonLink>
          <p className="mt-3 text-caption leading-5 text-muted">
            次の画面で利用規約とプライバシーポリシーを確認します。
          </p>
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
          <SecondaryLink href="/terms">利用規約</SecondaryLink>
          <SecondaryLink href="/privacy">プライバシーポリシー</SecondaryLink>
        </div>
      </div>
    </section>
  );
}

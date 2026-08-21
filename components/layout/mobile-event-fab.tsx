"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { usePathname } from "next/navigation";
import React from "react";

import { shouldShowPrimaryNavigation } from "@/lib/domain/account/navigation-visibility";

/**
 * 一覧系の画面だけに出す。
 * 日程調整の詳細では主要アクションが「リンクを配る」「日程を確定」であり、
 * FAB がそれらのボタンに重なって邪魔をする。
 * ホームは常時見えるCTAカードが同じ役割を持つので出さない。
 *
 * ヘッダーが sticky でないため、/events・/plans を下までスクロールすると
 * 作成ボタンごと画面外に消える。デスクトップでも同じ固定位置に常設し、
 * 見た目だけサイトの縁取りカードの作法（白背景+線+影）に寄せている。
 */
function isFabVisiblePath(pathname: string) {
  return pathname === "/events" || pathname === "/plans";
}

export function MobileEventFab({ isSignedIn }: { isSignedIn: boolean }) {
  const pathname = usePathname();

  if (!isSignedIn || !isFabVisiblePath(pathname) || !shouldShowPrimaryNavigation(pathname)) return null;

  return (
    <Link
      href="/events/new"
      aria-label="イベント作成"
      className="fixed right-4 z-40 inline-flex min-h-12 items-center gap-2 rounded-full bg-gradient-to-br from-pine to-pine-deep px-4 py-3 text-sm font-bold text-white shadow-soft transition-colors hover:from-pine-deep hover:to-pine-deep focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] sm:bottom-6 sm:right-6 sm:rounded-control sm:border sm:border-line-strong sm:bg-none sm:bg-surface sm:text-pine sm:shadow-raise sm:hover:border-moss sm:hover:text-pine-deep"
    >
      <Plus aria-hidden="true" className="h-5 w-5 sm:h-4 sm:w-4" />
      <span>イベント作成</span>
    </Link>
  );
}

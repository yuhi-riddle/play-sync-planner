"use client";

import { usePathname } from "next/navigation";
import React from "react";

import { getNavigationChrome } from "@/lib/domain/account/navigation-visibility";

/**
 * スマホの固定ナビとFABにフッターが隠されないための空き。
 * ナビが出ない画面や、作成・編集などの集中画面では余分な空白を置かない。
 */
export function BottomNavSpacer({ isSignedIn }: { isSignedIn: boolean }) {
  const pathname = usePathname();

  if (!getNavigationChrome(pathname, isSignedIn).bottomInset) return null;

  return <div aria-hidden="true" data-testid="bottom-nav-spacer" className="h-36 sm:hidden" />;
}

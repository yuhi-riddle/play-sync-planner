import React from "react";

import { PrimaryNav } from "@/components/layout/primary-nav";

/**
 * 未読件数を待ってから主要ナビを描く。
 * レイアウトでは件数を待たずに Promise のまま渡すので、ヘッダーのプロフィール取得と同時に進む。
 */
export async function PrimaryNavWithUnread({
  isSignedIn,
  unreadCount
}: {
  isSignedIn: boolean;
  unreadCount: Promise<number | null>;
}) {
  const count = await unreadCount;
  return <PrimaryNav isSignedIn={isSignedIn} unreadCount={count ?? 0} />;
}

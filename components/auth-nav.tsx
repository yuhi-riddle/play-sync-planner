import Link from "next/link";
import type { User } from "@supabase/supabase-js";
import { Bell, LogOut, UserRound } from "lucide-react";
import React from "react";

import { signOutAction } from "@/lib/actions/auth";
import { getAuthNavState } from "@/lib/domain/auth-nav";
import { getGoogleProfileDefaults, getProfileAvatarUrl } from "@/lib/domain/profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function AuthNav({ user }: { user: User | null }) {
  const state = getAuthNavState(user?.email);

  if (!state.isSignedIn) {
    return <AuthLink href={state.primaryHref} label={state.primaryLabel} />;
  }

  const supabase = await createSupabaseServerClient();
  const [{ data: profile }, { count: unreadCount }] = await Promise.all([
    supabase
      .from("profiles")
      .select("nickname, avatar_path, onboarding_completed_at")
      .eq("user_id", user!.id)
      .maybeSingle(),
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user!.id)
      .is("read_at", null)
  ]);
  const googleDefaults = getGoogleProfileDefaults(user!);
  const nickname = profile?.nickname ?? googleDefaults.nickname ?? state.accountLabel;
  const profileCompleted =
    Boolean(profile?.onboarding_completed_at) ||
    typeof user!.user_metadata?.profile_onboarding_completed_at === "string";
  const profileHref = profileCompleted ? "/settings#profile" : "/onboarding/profile";
  const profileLabel = profileCompleted ? nickname : "プロフィール設定";
  const avatarUrl = getProfileAvatarUrl(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    profile?.avatar_path,
    googleDefaults.avatarUrl
  );

  return (
    <div className="flex w-full items-center justify-end gap-1 text-sm sm:w-auto sm:gap-2">
      <Link
        href={profileHref}
        className="flex h-11 w-11 min-w-0 items-center justify-center gap-2 rounded-full border border-line bg-surface text-muted shadow-soft transition-colors hover:border-moss hover:text-pine focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2 sm:h-auto sm:w-auto sm:justify-start sm:px-3 sm:py-1.5"
        aria-label={profileCompleted ? `プロフィールを開く（${nickname}）` : "プロフィールを設定"}
        title={profileCompleted ? "プロフィールを開く" : "プロフィールを設定"}
      >
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatarUrl}
            alt={`${nickname}のプロフィール画像`}
            className="h-7 w-7 shrink-0 rounded-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <UserRound aria-hidden="true" className="h-5 w-5 text-pine" />
        )}
        <span className="hidden min-w-0 truncate font-bold sm:inline sm:max-w-32" title={profileLabel ?? undefined}>
          {profileLabel}
        </span>
      </Link>
      <Link
        href="/notifications"
        className="relative inline-flex h-11 w-11 items-center justify-center rounded-full border border-line bg-surface font-bold text-muted transition-colors hover:border-moss hover:text-pine focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2"
        aria-label={`通知${unreadCount ? ` 未読${unreadCount}件` : ""}`}
        title="通知"
      >
        <Bell aria-hidden="true" className="h-4 w-4" />
        {unreadCount ? (
          <span className="absolute -right-1 -top-1 inline-flex min-w-5 items-center justify-center rounded-full bg-clay px-1.5 py-0.5 text-[11px] font-bold leading-none text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        ) : null}
      </Link>
      <form action={signOutAction} className="h-11 w-11">
        <button
          type="submit"
          className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-line bg-surface font-bold text-muted transition-colors hover:border-clay hover:text-clay-ink focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2"
          aria-label="ログアウト"
          title="ログアウト"
        >
          <LogOut aria-hidden="true" className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}

function AuthLink({ href, label }: { href: "/login"; label: "ログイン" }) {
  return (
    <Link
      href={href}
      className="inline-flex min-h-11 items-center justify-center rounded-full border border-line bg-surface px-4 py-2 text-sm font-bold text-pine transition-colors hover:border-moss hover:bg-skywash/60 focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2"
      aria-label={label}
      title={label}
    >
      {label}
    </Link>
  );
}

import Link from "next/link";
import { Bell, LogOut, Settings, UserRound } from "lucide-react";

import { signOutAction } from "@/lib/actions/auth";
import { getAuthNavState } from "@/lib/domain/auth-nav";
import { createSupabaseServerClient, hasSupabaseEnv } from "@/lib/supabase/server";

export async function AuthNav() {
  if (!hasSupabaseEnv()) {
    return <AuthLink href="/login" label="ログイン" />;
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  const state = getAuthNavState(user?.email);

  if (!state.isSignedIn) {
    return <AuthLink href={state.primaryHref} label={state.primaryLabel} />;
  }

  const { count: unreadCount } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user!.id)
    .is("read_at", null);

  return (
    <div className="flex items-center gap-2 text-sm">
      <div className="hidden items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-muted shadow-soft sm:flex">
        <UserRound aria-hidden="true" className="h-4 w-4 text-pine" />
        <span className="max-w-32 truncate font-bold" title={state.displayEmail ?? undefined}>
          {state.accountLabel}
        </span>
      </div>
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
      <Link
        href={state.settingsHref}
        className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line bg-surface px-3 py-2 text-sm font-bold text-muted transition-colors hover:border-moss hover:text-pine focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2"
        aria-label="設定"
        title="設定"
      >
        <Settings aria-hidden="true" className="h-4 w-4" />
        <span className="hidden sm:inline">設定</span>
      </Link>
      <form action={signOutAction}>
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

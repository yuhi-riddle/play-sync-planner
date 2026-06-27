import Link from "next/link";
import { LogOut, Settings, UserRound } from "lucide-react";

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

  return (
    <div className="flex items-center gap-2 text-sm">
      <div className="hidden items-center gap-2 rounded-full border border-white/75 bg-white/58 px-3 py-1.5 text-ink/70 shadow-soft sm:flex">
        <UserRound aria-hidden="true" className="h-4 w-4 text-pine" />
        <span className="max-w-32 truncate font-bold" title={state.displayEmail ?? undefined}>
          {state.accountLabel}
        </span>
      </div>
      <Link
        href={state.settingsHref}
        className="inline-flex min-h-10 items-center gap-2 rounded-full border border-ink/10 bg-white/64 px-3 py-2 text-sm font-bold text-ink/70 transition-colors hover:border-moss hover:text-pine focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2"
        aria-label="設定"
        title="設定"
      >
        <Settings aria-hidden="true" className="h-4 w-4" />
        <span className="hidden sm:inline">設定</span>
      </Link>
      <form action={signOutAction}>
        <button
          type="submit"
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-ink/10 bg-white/64 font-bold text-ink/70 transition-colors hover:border-clay hover:text-clay focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2"
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
      className="inline-flex min-h-10 items-center justify-center rounded-full border border-ink/10 bg-white/64 px-4 py-2 text-sm font-bold text-pine transition-colors hover:border-moss hover:bg-skywash/60 focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2"
      aria-label={label}
      title={label}
    >
      {label}
    </Link>
  );
}

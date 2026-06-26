import Link from "next/link";

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
    <div className="flex items-center gap-3 text-sm">
      <span className="hidden max-w-52 truncate text-ink/65 sm:inline" title={state.displayEmail ?? undefined}>
        {state.displayEmail}
      </span>
      <AuthLink href={state.primaryHref} label={state.primaryLabel} />
      <form action={signOutAction}>
        <button
          type="submit"
          className="rounded-full border border-ink/10 bg-white/64 px-3 py-1.5 font-bold text-ink/70 transition-colors hover:border-clay hover:text-clay focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2"
        >
          ログアウト
        </button>
      </form>
    </div>
  );
}

function AuthLink({ href, label }: { href: "/login" | "/settings"; label: "ログイン" | "設定" }) {
  return (
    <Link
      href={href}
      className="rounded-full px-3 py-1.5 text-sm font-bold text-pine transition-colors hover:bg-skywash/60 focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2"
    >
      {label}
    </Link>
  );
}

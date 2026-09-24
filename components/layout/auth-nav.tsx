import Link from "next/link";
import type { User } from "@supabase/supabase-js";
import { UserRound } from "lucide-react";
import React from "react";

import { SignedOutLoginLink } from "@/components/layout/signed-out-login-link";
import { getAuthNavState } from "@/lib/domain/account/auth-nav";
import { getGoogleProfileDefaults, getProfileAvatarUrl } from "@/lib/domain/account/profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function AuthNav({ user }: { user: User | null }) {
  const state = getAuthNavState(user?.email);

  if (!state.isSignedIn) {
    return <SignedOutLoginLink />;
  }

  const supabase = await createSupabaseServerClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("nickname, avatar_path, onboarding_completed_at")
    .eq("user_id", user!.id)
    .maybeSingle();
  const googleDefaults = getGoogleProfileDefaults(user!);
  const nickname = profile?.nickname ?? googleDefaults.nickname ?? state.accountLabel;
  const profileCompleted =
    Boolean(profile?.onboarding_completed_at) ||
    typeof user!.user_metadata?.profile_onboarding_completed_at === "string";
  const profileHref = profileCompleted ? "/settings" : "/onboarding/profile";
  const profileLabel = profileCompleted ? "設定" : "プロフィール設定";
  const avatarUrl = getProfileAvatarUrl(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    profile?.avatar_path,
    googleDefaults.avatarUrl
  );

  return (
    <div className="flex w-full items-center justify-end gap-1 text-sm sm:w-auto sm:gap-2">
      <Link
        href={profileHref}
        className={
          profileCompleted
            ? "flex h-11 min-w-0 items-center gap-2 rounded-full border border-line bg-surface py-1.5 pl-1.5 pr-3.5 font-bold text-pine shadow-soft transition-colors hover:border-moss hover:text-pine-deep focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2"
            : "flex h-11 min-w-0 items-center justify-start gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-muted shadow-soft transition-colors hover:border-moss hover:text-pine focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2"
        }
        aria-label={profileCompleted ? `設定（${nickname}）` : "プロフィールを設定"}
        title={profileCompleted ? "設定" : "プロフィールを設定"}
      >
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatarUrl}
            alt={`${nickname}のプロフィール画像`}
            className="h-8 w-8 shrink-0 rounded-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <UserRound aria-hidden="true" className="h-6 w-6 text-pine" />
        )}
        <span
          className="min-w-0 truncate font-bold sm:max-w-32"
          title={profileLabel ?? undefined}
        >
          {profileLabel}
        </span>
      </Link>
    </div>
  );
}

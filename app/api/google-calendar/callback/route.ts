import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import { safeNextPath } from "@/lib/auth/safe-next-path";
import { emailFromIdToken, exchangeGoogleCalendarCode } from "@/lib/google-calendar/oauth";
import { encryptToken } from "@/lib/google-calendar/token-crypto";
import { isWithdrawn } from "@/lib/domain/account/withdrawal";
import { createSupabaseServerClient, getCurrentUser } from "@/lib/supabase/server";

function callbackUrl(request: NextRequest, nextPath: string, status: "connected" | "error") {
  const url = new URL(nextPath, request.url);
  if (nextPath === "/settings") {
    url.searchParams.set("calendar", status);
  }
  return url;
}

export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  const nextPath = safeNextPath(cookieStore.get("madoi_calendar_next")?.value) || "/settings";
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(`/api/google-calendar/connect?next=${encodeURIComponent(nextPath)}`)}`, request.url));
  }

  // /api/* は middleware を通らないので、退会済みはここで止める。
  if (isWithdrawn(user.app_metadata)) {
    return NextResponse.redirect(new URL("/login?withdrawn=1", request.url));
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const expectedState = cookieStore.get("madoi_calendar_oauth_state")?.value;
  cookieStore.delete("madoi_calendar_oauth_state");
  cookieStore.delete("madoi_calendar_next");

  if (!code || !state || !expectedState || state !== expectedState) {
    return NextResponse.redirect(callbackUrl(request, nextPath, "error"));
  }

  try {
    const token = await exchangeGoogleCalendarCode({ code });
    if (!token.refresh_token) {
      return NextResponse.redirect(callbackUrl(request, nextPath, "error"));
    }

    const supabase = await createSupabaseServerClient();
    const expiresAt = token.expires_in ? new Date(Date.now() + token.expires_in * 1000).toISOString() : null;
    // 連携したのは Calendar OAuth で選んだ Google アカウント。アプリのログイン用アドレスとは
    // 別のことがある。id_token から実際に連携したアカウントのメールを取り、無ければログイン用にフォールバック。
    const accountEmail = emailFromIdToken(token.id_token) ?? user.email;
    const { error } = await supabase.from("calendar_integrations").upsert(
      {
        user_id: user.id,
        provider: "google",
        calendar_id: "primary",
        account_email: accountEmail,
        encrypted_access_token: encryptToken(token.access_token),
        encrypted_refresh_token: encryptToken(token.refresh_token),
        token_expires_at: expiresAt,
        scope: token.scope
      },
      { onConflict: "user_id,provider" }
    );

    if (error) {
      return NextResponse.redirect(callbackUrl(request, nextPath, "error"));
    }

    return NextResponse.redirect(callbackUrl(request, nextPath, "connected"));
  } catch {
    return NextResponse.redirect(callbackUrl(request, nextPath, "error"));
  }
}

import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import { exchangeGoogleCalendarCode } from "@/lib/google-calendar/oauth";
import { encryptToken } from "@/lib/google-calendar/token-crypto";
import { createSupabaseServerClient, getCurrentUser } from "@/lib/supabase/server";

function settingsUrl(request: NextRequest, status: string) {
  return new URL(`/settings?calendar=${status}`, request.url);
}

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieStore = await cookies();
  const expectedState = cookieStore.get("madoi_calendar_oauth_state")?.value;
  cookieStore.delete("madoi_calendar_oauth_state");

  if (!code || !state || !expectedState || state !== expectedState) {
    return NextResponse.redirect(settingsUrl(request, "error"));
  }

  try {
    const token = await exchangeGoogleCalendarCode({ code });
    if (!token.refresh_token) {
      return NextResponse.redirect(settingsUrl(request, "error"));
    }

    const supabase = await createSupabaseServerClient();
    const expiresAt = token.expires_in ? new Date(Date.now() + token.expires_in * 1000).toISOString() : null;
    const { error } = await supabase.from("calendar_integrations").upsert(
      {
        user_id: user.id,
        provider: "google",
        calendar_id: "primary",
        account_email: user.email,
        encrypted_access_token: encryptToken(token.access_token),
        encrypted_refresh_token: encryptToken(token.refresh_token),
        token_expires_at: expiresAt,
        scope: token.scope
      },
      { onConflict: "user_id,provider" }
    );

    if (error) {
      return NextResponse.redirect(settingsUrl(request, "error"));
    }

    return NextResponse.redirect(settingsUrl(request, "connected"));
  } catch {
    return NextResponse.redirect(settingsUrl(request, "error"));
  }
}

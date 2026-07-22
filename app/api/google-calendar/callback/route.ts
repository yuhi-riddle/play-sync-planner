import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import { safeNextPath } from "@/lib/auth/safe-next-path";
import { exchangeGoogleCalendarCode } from "@/lib/google-calendar/oauth";
import { encryptToken } from "@/lib/google-calendar/token-crypto";
import {
  recordGoogleCalendarConnectAudit,
  storeGoogleCalendarIntegration
} from "@/lib/server/admin/google-token-store";
import { consumeAuthenticatedLimit } from "@/lib/server/rate-limit";
import { getCurrentUser } from "@/lib/supabase/server";

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
    await consumeAuthenticatedLimit("google_calendar_update");
    const token = await exchangeGoogleCalendarCode({ code });
    if (!token.refresh_token) {
      return NextResponse.redirect(callbackUrl(request, nextPath, "error"));
    }

    const expiresAt = token.expires_in ? new Date(Date.now() + token.expires_in * 1000).toISOString() : null;
    await storeGoogleCalendarIntegration({
      userId: user.id,
      accountEmail: user.email ?? null,
      encryptedAccessToken: encryptToken(token.access_token),
      encryptedRefreshToken: encryptToken(token.refresh_token),
      tokenExpiresAt: expiresAt,
      scope: token.scope ?? null
    });
    await recordGoogleCalendarConnectAudit(user.id);

    return NextResponse.redirect(callbackUrl(request, nextPath, "connected"));
  } catch {
    return NextResponse.redirect(callbackUrl(request, nextPath, "error"));
  }
}

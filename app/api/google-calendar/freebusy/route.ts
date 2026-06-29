import { NextRequest, NextResponse } from "next/server";

import { fetchFreeBusy } from "@/lib/google-calendar/freebusy";
import { refreshGoogleCalendarAccessToken } from "@/lib/google-calendar/oauth";
import { decryptToken, encryptToken } from "@/lib/google-calendar/token-crypto";
import { createSupabaseServerClient, getCurrentUser } from "@/lib/supabase/server";

function isExpired(value: string | null) {
  return !value || new Date(value).getTime() <= Date.now() + 60_000;
}

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ connected: false, busy: [] });
  }

  const month = request.nextUrl.searchParams.get("month") ?? "";
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ connected: true, busy: [] }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { data: integration } = await supabase
    .from("calendar_integrations")
    .select("calendar_id, encrypted_access_token, encrypted_refresh_token, token_expires_at")
    .eq("user_id", user.id)
    .eq("provider", "google")
    .maybeSingle();

  if (!integration) {
    return NextResponse.json({ connected: false, busy: [] });
  }

  try {
    let accessToken = integration.encrypted_access_token ? decryptToken(integration.encrypted_access_token) : "";

    if (!accessToken || isExpired(integration.token_expires_at)) {
      const refreshToken = decryptToken(integration.encrypted_refresh_token);
      const refreshed = await refreshGoogleCalendarAccessToken({ refreshToken });
      accessToken = refreshed.access_token;
      await supabase
        .from("calendar_integrations")
        .update({
          encrypted_access_token: encryptToken(refreshed.access_token),
          token_expires_at: refreshed.expires_in ? new Date(Date.now() + refreshed.expires_in * 1000).toISOString() : null,
          scope: refreshed.scope
        })
        .eq("user_id", user.id)
        .eq("provider", "google");
    }

    const busy = await fetchFreeBusy({
      accessToken,
      calendarId: integration.calendar_id ?? "primary",
      month
    });

    return NextResponse.json({ connected: true, busy });
  } catch {
    return NextResponse.json({ connected: true, busy: [] }, { status: 502 });
  }
}

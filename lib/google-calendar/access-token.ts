import { refreshGoogleCalendarAccessToken } from "@/lib/google-calendar/oauth";
import { decryptToken, encryptToken } from "@/lib/google-calendar/token-crypto";
import { createSupabaseAdminClient, createSupabaseServerClient } from "@/lib/supabase/server";

export type CalendarIntegrationRow = {
  calendar_id: string | null;
  encrypted_access_token: string | null;
  encrypted_refresh_token: string;
  token_expires_at: string | null;
};

type CalendarSupabaseClient = ReturnType<typeof createSupabaseAdminClient> | Awaited<ReturnType<typeof createSupabaseServerClient>>;

function isExpired(value: string | null) {
  return !value || new Date(value).getTime() <= Date.now() + 60_000;
}

export async function resolveGoogleCalendarAccessToken({
  supabase,
  userId,
  integration
}: {
  supabase: CalendarSupabaseClient;
  userId: string;
  integration: CalendarIntegrationRow;
}) {
  let accessToken = integration.encrypted_access_token ? decryptToken(integration.encrypted_access_token) : "";

  if (!accessToken || isExpired(integration.token_expires_at)) {
    const refreshToken = decryptToken(integration.encrypted_refresh_token);
    const refreshed = await refreshGoogleCalendarAccessToken({ refreshToken });
    accessToken = refreshed.access_token;
    const { error } = await supabase
      .from("calendar_integrations")
      .update({
        encrypted_access_token: encryptToken(refreshed.access_token),
        token_expires_at: refreshed.expires_in ? new Date(Date.now() + refreshed.expires_in * 1000).toISOString() : null,
        scope: refreshed.scope
      })
      .eq("user_id", userId)
      .eq("provider", "google");

    if (error) {
      throw new Error(error.message);
    }
  }

  return accessToken;
}

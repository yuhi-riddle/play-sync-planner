import { refreshGoogleCalendarAccessToken } from "@/lib/google-calendar/oauth";
import { decryptToken, encryptToken } from "@/lib/google-calendar/token-crypto";
import { storeRefreshedGoogleCalendarToken } from "@/lib/server/admin/google-token-store";

export type CalendarIntegrationRow = {
  calendar_id: string | null;
  encrypted_access_token: string | null;
  encrypted_refresh_token: string;
  token_expires_at: string | null;
};

function isExpired(value: string | null) {
  return !value || new Date(value).getTime() <= Date.now() + 60_000;
}

export async function resolveGoogleCalendarAccessToken({
  userId,
  integration,
  signal
}: {
  userId: string;
  integration: CalendarIntegrationRow;
  signal?: AbortSignal;
}) {
  let accessToken = integration.encrypted_access_token
    ? decryptToken(integration.encrypted_access_token)
    : "";

  if (!accessToken || isExpired(integration.token_expires_at)) {
    const refreshToken = decryptToken(integration.encrypted_refresh_token);
    const refreshed = await refreshGoogleCalendarAccessToken({ refreshToken, signal });
    accessToken = refreshed.access_token;
    await storeRefreshedGoogleCalendarToken({
      userId,
      encryptedAccessToken: encryptToken(refreshed.access_token),
      tokenExpiresAt: refreshed.expires_in
        ? new Date(Date.now() + refreshed.expires_in * 1000).toISOString()
        : null,
      scope: refreshed.scope ?? null
    });
  }

  return accessToken;
}

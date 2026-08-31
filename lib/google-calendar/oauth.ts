export const CALENDAR_EVENTS_SCOPE = "https://www.googleapis.com/auth/calendar.events";
export const CALENDAR_FREE_BUSY_SCOPE = "https://www.googleapis.com/auth/calendar.freebusy";
// email / openid は、どの Google アカウントで連携したか（account_email）を
// トークン交換のレスポンス（id_token）から取るために付ける。
export const CALENDAR_ACCOUNT_SCOPES = ["openid", "email"];
export const CALENDAR_SCOPES = [
  CALENDAR_EVENTS_SCOPE,
  CALENDAR_FREE_BUSY_SCOPE,
  ...CALENDAR_ACCOUNT_SCOPES
] as const;

export type GoogleTokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  id_token?: string;
};

/**
 * Google のトークンエンドポイントから直接受け取った id_token の email クレームを読む。
 * TLS で Google から直接届いた値なので、ここでは署名検証まではしない
 * （OAuth のトークン交換フローでの標準的な扱い）。
 */
export function emailFromIdToken(idToken: string | undefined): string | null {
  if (!idToken) {
    return null;
  }
  const payload = idToken.split(".")[1];
  if (!payload) {
    return null;
  }
  try {
    const json = Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    const claims = JSON.parse(json) as { email?: unknown; email_verified?: unknown };
    return typeof claims.email === "string" && claims.email.length > 0 ? claims.email : null;
  } catch {
    return null;
  }
}

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set`);
  }

  return value;
}

function redirectUri(fallback?: string) {
  return fallback ?? requireEnv("GOOGLE_CALENDAR_REDIRECT_URI");
}

export function buildGoogleCalendarAuthUrl({
  state,
  redirectUri: explicitRedirectUri
}: {
  state: string;
  redirectUri?: string;
}): string {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", requireEnv("GOOGLE_CALENDAR_CLIENT_ID"));
  url.searchParams.set("redirect_uri", redirectUri(explicitRedirectUri));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", CALENDAR_SCOPES.join(" "));
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", state);
  return url.toString();
}

async function postToken(body: URLSearchParams, fetchImpl: typeof fetch): Promise<GoogleTokenResponse> {
  const response = await fetchImpl("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });

  if (!response.ok) {
    throw new Error("Failed to fetch Google Calendar OAuth token");
  }

  return (await response.json()) as GoogleTokenResponse;
}

export async function exchangeGoogleCalendarCode({
  code,
  fetchImpl = fetch
}: {
  code: string;
  fetchImpl?: typeof fetch;
}): Promise<GoogleTokenResponse> {
  return postToken(
    new URLSearchParams({
      code,
      client_id: requireEnv("GOOGLE_CALENDAR_CLIENT_ID"),
      client_secret: requireEnv("GOOGLE_CALENDAR_CLIENT_SECRET"),
      redirect_uri: redirectUri(),
      grant_type: "authorization_code"
    }),
    fetchImpl
  );
}

export async function refreshGoogleCalendarAccessToken({
  refreshToken,
  fetchImpl = fetch
}: {
  refreshToken: string;
  fetchImpl?: typeof fetch;
}): Promise<GoogleTokenResponse> {
  return postToken(
    new URLSearchParams({
      refresh_token: refreshToken,
      client_id: requireEnv("GOOGLE_CALENDAR_CLIENT_ID"),
      client_secret: requireEnv("GOOGLE_CALENDAR_CLIENT_SECRET"),
      grant_type: "refresh_token"
    }),
    fetchImpl
  );
}

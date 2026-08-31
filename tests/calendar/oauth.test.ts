import { describe, expect, it, vi } from "vitest";

import {
  buildGoogleCalendarAuthUrl,
  CALENDAR_EVENTS_SCOPE,
  emailFromIdToken,
  exchangeGoogleCalendarCode,
  refreshGoogleCalendarAccessToken
} from "@/lib/google-calendar/oauth";
import { safeNextPath } from "@/lib/auth/safe-next-path";

describe("google calendar oauth", () => {
  it("keeps only an internal return path", () => {
    expect(safeNextPath("/invites/token-1")).toBe("/invites/token-1");
    expect(safeNextPath("https://example.com")).toBe("/");
    expect(safeNextPath("//example.com")).toBe("/");
  });

  it("builds an OAuth URL with offline access, calendar scopes, and openid/email for the account address", () => {
    process.env.GOOGLE_CALENDAR_CLIENT_ID = "client-id";
    process.env.GOOGLE_CALENDAR_REDIRECT_URI = "http://localhost:3000/api/google-calendar/callback";

    const url = new URL(buildGoogleCalendarAuthUrl({ state: "state-1" }));

    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("scope")).toBe(
      "https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.freebusy openid email"
    );
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toBe("consent");
  });

  it("exchanges an auth code", async () => {
    process.env.GOOGLE_CALENDAR_CLIENT_ID = "client-id";
    process.env.GOOGLE_CALENDAR_CLIENT_SECRET = "client-secret";
    process.env.GOOGLE_CALENDAR_REDIRECT_URI = "http://localhost:3000/api/google-calendar/callback";
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        access_token: "access",
        refresh_token: "refresh",
        expires_in: 3600,
        scope: CALENDAR_EVENTS_SCOPE
      })
    })) as unknown as typeof fetch;

    const result = await exchangeGoogleCalendarCode({ code: "code-1", fetchImpl });

    expect(result.refresh_token).toBe("refresh");
    expect(fetchImpl).toHaveBeenCalledWith("https://oauth2.googleapis.com/token", expect.objectContaining({ method: "POST" }));
  });

  it("refreshes an access token", async () => {
    process.env.GOOGLE_CALENDAR_CLIENT_ID = "client-id";
    process.env.GOOGLE_CALENDAR_CLIENT_SECRET = "client-secret";
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ access_token: "new-access", expires_in: 3600, scope: CALENDAR_EVENTS_SCOPE })
    })) as unknown as typeof fetch;

    const result = await refreshGoogleCalendarAccessToken({ refreshToken: "refresh", fetchImpl });

    expect(result.access_token).toBe("new-access");
  });

  it("reads the email claim from an id_token", () => {
    const payload = Buffer.from(JSON.stringify({ email: "calendar-owner@gmail.com", email_verified: true })).toString(
      "base64url"
    );
    expect(emailFromIdToken(`header.${payload}.sig`)).toBe("calendar-owner@gmail.com");
    expect(emailFromIdToken(undefined)).toBeNull();
    expect(emailFromIdToken("not-a-jwt")).toBeNull();
  });
});

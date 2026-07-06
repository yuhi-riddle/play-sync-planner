import { describe, expect, it, vi } from "vitest";

import {
  buildGoogleCalendarAuthUrl,
  CALENDAR_EVENTS_SCOPE,
  exchangeGoogleCalendarCode,
  refreshGoogleCalendarAccessToken
} from "@/lib/google-calendar/oauth";

describe("google calendar oauth", () => {
  it("builds an OAuth URL with offline access and Calendar events write scope", () => {
    process.env.GOOGLE_CALENDAR_CLIENT_ID = "client-id";
    process.env.GOOGLE_CALENDAR_REDIRECT_URI = "http://localhost:3000/api/google-calendar/callback";

    const url = new URL(buildGoogleCalendarAuthUrl({ state: "state-1" }));

    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("scope")).toBe("https://www.googleapis.com/auth/calendar.events");
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
});

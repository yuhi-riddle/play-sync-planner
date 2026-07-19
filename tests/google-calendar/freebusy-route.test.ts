import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { fetchCalendarEvents, createSupabaseServerClient, getCurrentUser, decryptToken } = vi.hoisted(() => ({
  fetchCalendarEvents: vi.fn(),
  createSupabaseServerClient: vi.fn(),
  getCurrentUser: vi.fn(),
  decryptToken: vi.fn()
}));

vi.mock("@/lib/google-calendar/calendar-events", () => ({ fetchCalendarEvents }));
vi.mock("@/lib/google-calendar/oauth", () => ({ refreshGoogleCalendarAccessToken: vi.fn() }));
vi.mock("@/lib/google-calendar/token-crypto", () => ({ decryptToken, encryptToken: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient, getCurrentUser }));

import { GET } from "@/app/api/google-calendar/freebusy/route";

describe("GET /api/google-calendar/freebusy", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    getCurrentUser.mockResolvedValue({ id: "user-1" });
    decryptToken.mockReturnValue("access-token");
    fetchCalendarEvents.mockResolvedValue([]);
    createSupabaseServerClient.mockResolvedValue({
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            calendar_id: "primary",
            encrypted_access_token: "encrypted-access",
            encrypted_refresh_token: "encrypted-refresh",
            token_expires_at: "2099-01-01T00:00:00.000Z"
          }
        })
      }))
    });
  });

  afterEach(() => vi.useRealTimers());

  it("passes a five-second abort signal to Google and clears its timeout", async () => {
    const response = await GET(new NextRequest("http://localhost/api/google-calendar/freebusy?month=2026-07"));

    expect(response.status).toBe(200);
    expect(fetchCalendarEvents).toHaveBeenCalledWith(expect.objectContaining({
      accessToken: "access-token",
      calendarId: "primary",
      month: "2026-07",
      signal: expect.any(AbortSignal)
    }));
    expect(vi.getTimerCount()).toBe(0);
  });

  it("aborts a slow Google request at five seconds and returns a generic 502", async () => {
    let receivedSignal: AbortSignal | undefined;
    fetchCalendarEvents.mockImplementation(({ signal }) => {
      receivedSignal = signal;
      return new Promise((_, reject) => signal.addEventListener("abort", () => reject(new Error("upstream failure"))));
    });

    const responsePromise = GET(new NextRequest("http://localhost/api/google-calendar/freebusy?month=2026-07"));
    await vi.advanceTimersByTimeAsync(5_000);
    const response = await responsePromise;

    expect(receivedSignal?.aborted).toBe(true);
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ connected: true, busy: [] });
    expect(vi.getTimerCount()).toBe(0);
  });
});

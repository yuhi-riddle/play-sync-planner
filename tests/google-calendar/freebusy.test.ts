import { describe, expect, it, vi } from "vitest";

import { CalendarFreeBusyError, fetchCalendarFreeBusy, normalizeFreeBusyResponse } from "@/lib/google-calendar/freebusy";

describe("Google Calendar free/busy", () => {
  it("normalizes busy ranges without event details", () => {
    expect(
      normalizeFreeBusyResponse({
        calendars: {
          primary: {
            busy: [{ start: "2026-07-15T01:00:00Z", end: "2026-07-15T02:00:00Z" }]
          }
        }
      })
    ).toEqual([{ start: "2026-07-15T01:00:00Z", end: "2026-07-15T02:00:00Z" }]);
  });

  it("queries only the selected calendar availability", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ calendars: { primary: { busy: [] } } })
    })) as unknown as typeof fetch;

    await fetchCalendarFreeBusy({
      accessToken: "access-token",
      timeMin: "2026-07-01T00:00:00+09:00",
      timeMax: "2026-08-01T00:00:00+09:00",
      fetchImpl
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://www.googleapis.com/calendar/v3/freeBusy",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer access-token" }),
        body: JSON.stringify({
          timeMin: "2026-07-01T00:00:00+09:00",
          timeMax: "2026-08-01T00:00:00+09:00",
          timeZone: "Asia/Tokyo",
          items: [{ id: "primary" }]
        })
      })
    );
  });

  it("keeps the Google response status when calendar re-authorization is needed", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 403 })) as unknown as typeof fetch;

    await expect(
      fetchCalendarFreeBusy({
        accessToken: "access-token",
        timeMin: "2026-07-01T00:00:00+09:00",
        timeMax: "2026-08-01T00:00:00+09:00",
        fetchImpl
      })
    ).rejects.toMatchObject({ status: 403 } satisfies Partial<CalendarFreeBusyError>);
  });
});

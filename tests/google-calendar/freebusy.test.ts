import { describe, expect, it, vi } from "vitest";

import { fetchFreeBusy, monthTimeRange, normalizeFreeBusyResponse } from "@/lib/google-calendar/freebusy";

describe("freebusy helpers", () => {
  it("normalizes Google FreeBusy responses", () => {
    const result = normalizeFreeBusyResponse({
      calendars: {
        primary: {
          busy: [{ start: "2026-07-01T10:00:00+09:00", end: "2026-07-01T11:00:00+09:00" }]
        }
      }
    });

    expect(result).toEqual([{ start: "2026-07-01T10:00:00+09:00", end: "2026-07-01T11:00:00+09:00" }]);
  });

  it("returns an empty array for empty responses", () => {
    expect(normalizeFreeBusyResponse({ calendars: { primary: {} } })).toEqual([]);
  });

  it("builds an inclusive month query range", () => {
    expect(monthTimeRange("2026-07")).toEqual({
      timeMin: "2026-07-01T00:00:00.000Z",
      timeMax: "2026-08-01T00:00:00.000Z"
    });
  });

  it("posts a FreeBusy request", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        calendars: {
          primary: {
            busy: [{ start: "2026-07-01T10:00:00Z", end: "2026-07-01T11:00:00Z" }]
          }
        }
      })
    })) as unknown as typeof fetch;

    const result = await fetchFreeBusy({ accessToken: "access-token", month: "2026-07", fetchImpl });

    expect(result).toEqual([{ start: "2026-07-01T10:00:00Z", end: "2026-07-01T11:00:00Z" }]);
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://www.googleapis.com/calendar/v3/freeBusy",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer access-token" })
      })
    );
  });
});

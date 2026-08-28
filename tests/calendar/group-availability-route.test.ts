import { describe, expect, it, vi, beforeEach } from "vitest";

const { createSupabaseAdminClient, getCurrentUser, resolveGoogleCalendarAccessToken, fetchCalendarFreeBusy } = vi.hoisted(
  () => ({
    createSupabaseAdminClient: vi.fn(),
    getCurrentUser: vi.fn(),
    resolveGoogleCalendarAccessToken: vi.fn(),
    fetchCalendarFreeBusy: vi.fn()
  })
);

vi.mock("@/lib/supabase/server", () => ({ createSupabaseAdminClient, getCurrentUser }));
vi.mock("@/lib/google-calendar/access-token", () => ({ resolveGoogleCalendarAccessToken }));
vi.mock("@/lib/google-calendar/freebusy", () => ({
  fetchCalendarFreeBusy,
  CalendarFreeBusyError: class extends Error {
    status = 500;
  }
}));

import { GET } from "@/app/api/events/[eventId]/availability/route";

const ownerId = "owner-1";

/** events / event_members / calendar_integrations を表ごとに返す admin クライアント。 */
function adminClient({ memberUserIds, connectedUserIds }: { memberUserIds: string[]; connectedUserIds: string[] }) {
  return {
    from: vi.fn((table: string) => {
      const builder: Record<string, unknown> = {};
      builder.select = vi.fn(() => builder);
      builder.eq = vi.fn(() => builder);
      builder.in = vi.fn(() => builder);
      // canReadGroupAvailability が通すのは interested / planning の主催者だけ。
      builder.maybeSingle = vi.fn(async () => ({
        data: { owner_user_id: ownerId, status: "planning" },
        error: null
      }));
      builder.then = (resolve: (value: { data: unknown; error: null }) => unknown) => {
        const data =
          table === "event_members"
            ? memberUserIds.map((userId) => ({ user_id: userId }))
            : connectedUserIds.map((userId) => ({
                user_id: userId,
                calendar_id: "primary",
                encrypted_access_token: "x",
                encrypted_refresh_token: "y",
                token_expires_at: null
              }));
        return Promise.resolve({ data, error: null }).then(resolve);
      };
      return builder;
    })
  };
}

function request(month = "2026-07") {
  return { nextUrl: { searchParams: new URLSearchParams({ month }) } } as never;
}

const params = { params: Promise.resolve({ eventId: "event-1" }) };

describe("参加者の空き状況API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUser.mockResolvedValue({ id: ownerId });
    resolveGoogleCalendarAccessToken.mockResolvedValue("token");
    fetchCalendarFreeBusy.mockResolvedValue([]);
  });

  /*
   * 以前は全員が連携していないと409で機能ごと止めていた。Googleカレンダーを
   * 使っていない人も参加できるようにしたので、揃っていなくても集計する。
   */
  it("全員が連携していなくても集計する", async () => {
    createSupabaseAdminClient.mockReturnValue(
      adminClient({ memberUserIds: ["u1", "u2", "u3", "u4", "u5"], connectedUserIds: ["u1", "u2"] })
    );

    const response = await GET(request(), params);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.connectedCount).toBe(2);
    expect(body.memberCount).toBe(5);
  });

  /*
   * ここが一番こわい。母数を参加者総数にすると、連携していない人は busy に現れないぶん
   * そのまま「空いている」として数えられ、実際より空いて見える。
   */
  it("空きの母数は連携している人数で、未連携の人を空き扱いしない", async () => {
    createSupabaseAdminClient.mockReturnValue(
      adminClient({ memberUserIds: ["u1", "u2", "u3", "u4", "u5"], connectedUserIds: ["u1", "u2"] })
    );

    const response = await GET(request(), params);
    const body = await response.json();

    const counts = new Set(body.slots.map((slot: { availableCount: number }) => slot.availableCount));
    expect(counts).toEqual(new Set([2]));
    expect(counts.has(5)).toBe(false);
  });

  it("日別の最大予定重複数と終日予定数を返す", async () => {
    createSupabaseAdminClient.mockReturnValue(
      adminClient({ memberUserIds: ["u1", "u2"], connectedUserIds: ["u1", "u2"] })
    );
    fetchCalendarFreeBusy
      .mockResolvedValueOnce([{ start: "2026-07-15T00:00:00+09:00", end: "2026-07-16T00:00:00+09:00" }])
      .mockResolvedValueOnce([{ start: "2026-07-15T10:00:00+09:00", end: "2026-07-15T11:00:00+09:00" }]);

    const response = await GET(request(), params);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toHaveProperty("dailyBusySummaries");
    expect(body.dailyBusySummaries["2026-07-15"]).toEqual({
      maxBusyCount: 2,
      allDayBusyCount: 1,
      segments: [1, 1, 2, 1, 1, 1]
    });
  });

  it("誰も連携していなければ、集計せず空で返す", async () => {
    createSupabaseAdminClient.mockReturnValue(
      adminClient({ memberUserIds: ["u1", "u2", "u3", "u4"], connectedUserIds: [] })
    );

    const response = await GET(request(), params);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.connectedCount).toBe(0);
    expect(body.memberCount).toBe(4);
    expect(body.slots).toEqual([]);
    expect(body.dailyBusySummaries).toEqual({});
    expect(fetchCalendarFreeBusy).not.toHaveBeenCalled();
  });

  it("主催者以外は集計できない", async () => {
    getCurrentUser.mockResolvedValue({ id: "someone-else" });
    createSupabaseAdminClient.mockReturnValue(adminClient({ memberUserIds: ["u1"], connectedUserIds: ["u1"] }));

    const response = await GET(request(), params);

    expect(response.status).toBe(403);
  });
});

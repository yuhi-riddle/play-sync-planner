import { describe, expect, it, vi, beforeEach } from "vitest";

const { createSupabaseAdminClient, getCurrentActiveUser, resolveGoogleCalendarAccessToken, fetchCalendarFreeBusy } = vi.hoisted(
  () => ({
    createSupabaseAdminClient: vi.fn(),
    getCurrentActiveUser: vi.fn(),
    resolveGoogleCalendarAccessToken: vi.fn(),
    fetchCalendarFreeBusy: vi.fn()
  })
);

vi.mock("@/lib/supabase/server", () => ({ createSupabaseAdminClient, getCurrentActiveUser }));
vi.mock("@/lib/google-calendar/access-token", () => ({ resolveGoogleCalendarAccessToken }));
vi.mock("@/lib/google-calendar/freebusy", () => ({
  fetchCalendarFreeBusy,
  CalendarFreeBusyError: class extends Error {
    constructor(public readonly status: number) {
      super(`CalendarFreeBusyError ${status}`);
    }
  }
}));

import { GET } from "@/app/api/events/[eventId]/availability/route";
import { CalendarFreeBusyError } from "@/lib/google-calendar/freebusy";

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
    getCurrentActiveUser.mockResolvedValue({ id: ownerId });
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
    expect(body.dailyBusySummaries).toEqual({});
    expect(fetchCalendarFreeBusy).not.toHaveBeenCalled();
  });

  it("主催者以外は集計できない", async () => {
    getCurrentActiveUser.mockResolvedValue({ id: "someone-else" });
    createSupabaseAdminClient.mockReturnValue(adminClient({ memberUserIds: ["u1"], connectedUserIds: ["u1"] }));

    const response = await GET(request(), params);

    expect(response.status).toBe(403);
  });

  it("退会済みとしてactive userがnullなら401を返す", async () => {
    getCurrentActiveUser.mockResolvedValue(null);

    const response = await GET(request(), params);

    expect(response.status).toBe(401);
    expect(createSupabaseAdminClient).not.toHaveBeenCalled();
  });

  it("1人の取得が失敗しても残りで集計し、failedCount を返す", async () => {
    createSupabaseAdminClient.mockReturnValue(
      adminClient({ memberUserIds: ["u1", "u2", "u3"], connectedUserIds: ["u1", "u2", "u3"] })
    );
    fetchCalendarFreeBusy
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce([]);

    const response = await GET(request(), params);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.failedCount).toBe(1);
    expect(body.succeededCount).toBe(2);
    expect(body.code).toBeUndefined();
  });

  it("閲覧者本人の連携が切れているときだけ再連携コードを返す", async () => {
    createSupabaseAdminClient.mockReturnValue(
      adminClient({ memberUserIds: [ownerId, "u2"], connectedUserIds: [ownerId, "u2"] })
    );
    fetchCalendarFreeBusy.mockRejectedValueOnce(new CalendarFreeBusyError(401)).mockResolvedValueOnce([]);

    const response = await GET(request(), params);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.failedCount).toBe(1);
    expect(body.code).toBe("calendar_reconnect_required");
  });

  it("全員分の取得に失敗したら 502 を返す", async () => {
    createSupabaseAdminClient.mockReturnValue(
      adminClient({ memberUserIds: ["u1", "u2"], connectedUserIds: ["u1", "u2"] })
    );
    fetchCalendarFreeBusy.mockRejectedValue(new Error("down"));

    const response = await GET(request(), params);

    expect(response.status).toBe(502);
  });
});

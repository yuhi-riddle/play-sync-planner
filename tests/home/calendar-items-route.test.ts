// @vitest-environment node
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { createSupabaseServerClient, getCurrentActiveUser, rpc } = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
  getCurrentActiveUser: vi.fn(),
  rpc: vi.fn()
}));

vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient, getCurrentActiveUser }));

import { GET } from "@/app/api/calendar-items/route";

const activeUser = { id: "11111111-1111-1111-1111-111111111111", app_metadata: {}, user_metadata: {} };

function request(query: string) {
  return new NextRequest(`https://example.com/api/calendar-items${query}`);
}

describe("GET /api/calendar-items", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentActiveUser.mockResolvedValue(activeUser);
    createSupabaseServerClient.mockResolvedValue({ rpc });
  });

  it("未ログイン・退会済みは401で、DBを読まない", async () => {
    getCurrentActiveUser.mockResolvedValue(null);

    const response = await GET(request("?month=2026-08"));

    expect(response.status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each(["", "?month=2026-8", "?month=2026-13", "?month=abcd-ef"])("month が不正(%s)なら400", async (query) => {
    const response = await GET(request(query));

    expect(response.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("その月の予定をホームと同じ形に変換して返す", async () => {
    rpc.mockResolvedValue({
      data: [
        {
          candidate_id: null,
          plan_id: "plan-1",
          event_title: "秋の合宿",
          plan_title: "日程",
          location_name: " 渋谷 ",
          start_at: "2026-08-02T10:00:00+09:00",
          end_at: "2026-08-02T11:00:00+09:00",
          is_all_day: false,
          status: "date_confirmed"
        },
        {
          candidate_id: "cand-1",
          plan_id: "plan-2",
          event_title: null,
          plan_title: null,
          location_name: null,
          start_at: "2026-08-03T10:00:00+09:00",
          end_at: null,
          is_all_day: null,
          status: "collecting"
        }
      ],
      error: null
    });

    const response = await GET(request("?month=2026-08"));

    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("list_calendar_items", { p_month: "2026-08-01" });
    expect(await response.json()).toEqual({
      items: [
        {
          id: "confirmed-plan-1",
          kind: "confirmed",
          title: "秋の合宿",
          subtitle: "日程",
          location: "渋谷",
          startAt: "2026-08-02T10:00:00+09:00",
          endAt: "2026-08-02T11:00:00+09:00",
          isAllDay: false,
          href: "/plans/plan-1"
        },
        {
          id: "candidate-cand-1",
          kind: "collecting",
          title: "イベント未設定",
          subtitle: "日程調整",
          location: null,
          startAt: "2026-08-03T10:00:00+09:00",
          endAt: null,
          isAllDay: null,
          href: "/plans/plan-2"
        }
      ]
    });
  });

  it("RPCが失敗したら500", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "boom" } });

    const response = await GET(request("?month=2026-08"));

    expect(response.status).toBe(500);
  });
});

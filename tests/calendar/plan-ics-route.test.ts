import { describe, expect, it, vi, beforeEach } from "vitest";

const { createSupabaseServerClient, hasSupabaseEnv } = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
  hasSupabaseEnv: vi.fn(() => true)
}));

vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient, hasSupabaseEnv }));

import { GET } from "@/app/api/plans/[planId]/calendar.ics/route";

const params = { params: Promise.resolve({ planId: "plan-1" }) };

const confirmedPlan = {
  id: "plan-1",
  title: "土曜チーム",
  confirmed_start_at: "2026-07-01T10:00:00+09:00",
  confirmed_end_at: "2026-07-01T12:00:00+09:00",
  is_all_day: false,
  events: { title: "謎解き公演", location_name: "新宿" }
};

/** plans を1行だけ返すクライアント。plan を null にすると RLS が弾いた状態になる。 */
function client({ user, plan }: { user: { id: string } | null; plan: unknown }) {
  return {
    auth: { getUser: vi.fn(async () => ({ data: { user }, error: null })) },
    from: vi.fn(() => {
      const builder: Record<string, unknown> = {};
      builder.select = vi.fn(() => builder);
      builder.eq = vi.fn(() => builder);
      builder.maybeSingle = vi.fn(async () => ({ data: plan, error: null }));
      return builder;
    })
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  hasSupabaseEnv.mockReturnValue(true);
});

describe("GET /api/plans/[planId]/calendar.ics", () => {
  it("参加者には .ics を返す", async () => {
    createSupabaseServerClient.mockResolvedValue(client({ user: { id: "user-1" }, plan: confirmedPlan }));

    const response = await GET(new Request("http://localhost/api/plans/plan-1/calendar.ics"), params);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/calendar; charset=utf-8");
    expect(response.headers.get("content-disposition")).toContain(".ics");
    expect(body).toContain("BEGIN:VCALENDAR");
    expect(body).toContain("SUMMARY:土曜チーム - 謎解き公演");
    expect(body).toContain("LOCATION:新宿");
  });

  /*
   * migration 030 の参加者RLSが弾くと data は null になる。ここで「参加者ではありません」と
   * 「そんな予定はありません」を区別すると、planId を当てずっぽうに叩いて存在する予定を
   * 探せてしまう。理由は返さない。
   */
  it("RLSが行を返さないときは、理由を出さずに404にする", async () => {
    createSupabaseServerClient.mockResolvedValue(client({ user: { id: "stranger" }, plan: null }));

    const response = await GET(new Request("http://localhost/api/plans/plan-1/calendar.ics"), params);

    expect(response.status).toBe(404);
    expect(await response.text()).not.toContain("参加者");
  });

  it("未ログインなら404にする", async () => {
    createSupabaseServerClient.mockResolvedValue(client({ user: null, plan: confirmedPlan }));

    const response = await GET(new Request("http://localhost/api/plans/plan-1/calendar.ics"), params);

    expect(response.status).toBe(404);
  });

  // 日程が決まっていない予定はカレンダーに入れようがない。
  it("日程が未確定なら404にする", async () => {
    createSupabaseServerClient.mockResolvedValue(
      client({ user: { id: "user-1" }, plan: { ...confirmedPlan, confirmed_start_at: null, confirmed_end_at: null } })
    );

    const response = await GET(new Request("http://localhost/api/plans/plan-1/calendar.ics"), params);

    expect(response.status).toBe(404);
  });

  it("終日の予定は日付だけで書き出す", async () => {
    createSupabaseServerClient.mockResolvedValue(
      client({
        user: { id: "user-1" },
        plan: {
          ...confirmedPlan,
          is_all_day: true,
          confirmed_start_at: "2026-07-01T00:00:00+09:00",
          confirmed_end_at: "2026-07-03T00:00:00+09:00"
        }
      })
    );

    const body = await (await GET(new Request("http://localhost/api/plans/plan-1/calendar.ics"), params)).text();

    expect(body).toContain("DTSTART;VALUE=DATE:20260701");
    expect(body).toContain("DTEND;VALUE=DATE:20260703");
  });
});

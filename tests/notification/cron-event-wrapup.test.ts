import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createSupabaseAdminClient } = vi.hoisted(() => ({ createSupabaseAdminClient: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseAdminClient,
  hasSupabaseAdminEnv: () => true
}));

import { GET } from "@/app/api/cron/notifications/route";

function request() {
  return new NextRequest("http://localhost/api/cron/notifications", {
    headers: { authorization: "Bearer test-secret" }
  });
}

const DAY = 24 * 60 * 60 * 1000;

/**
 * plans ページング（既存 cron 用、空を返す）と events 走査、notifications upsert、
 * events update を記録するモック。
 */
function client(events: Array<Record<string, unknown>>) {
  const upserts: unknown[][] = [];
  const eventUpdates: Array<{ values: Record<string, unknown>; id: unknown }> = [];

  const from = vi.fn((table: string) => {
    if (table === "notifications") {
      const readUpdate = () => {
        const link: Record<string, unknown> = {};
        link.eq = () => link;
        link.in = () => link;
        link.is = async () => ({ error: null });
        return link;
      };
      return {
        upsert: vi.fn(async (rows: unknown[]) => {
          upserts.push(rows);
          return { error: null };
        }),
        update: vi.fn(readUpdate)
      };
    }

    const builder: Record<string, unknown> = {};
    const chain = () => builder;
    builder.select = chain;
    builder.in = chain;
    builder.order = chain;
    builder.limit = chain;
    builder.gt = chain;
    if (table === "events") {
      // .update(values, { count }).eq("id", id).in("status", [...]) → { error, count }
      builder.update = vi.fn((values: Record<string, unknown>) => {
        const link: Record<string, unknown> = {};
        let matchedId: unknown;
        link.eq = (_c: string, id: unknown) => {
          matchedId = id;
          return link;
        };
        link.in = async () => {
          eventUpdates.push({ values, id: matchedId });
          return { error: null, count: 1 };
        };
        return link;
      });
      builder.then = (resolve: (v: { data: unknown; error: null }) => unknown) =>
        Promise.resolve({ data: events, error: null }).then(resolve);
    } else {
      // plans: 空
      builder.then = (resolve: (v: { data: unknown; error: null }) => unknown) =>
        Promise.resolve({ data: [], error: null }).then(resolve);
    }
    return builder;
  });

  return { client: { from }, upserts, eventUpdates };
}

function pastEvent(id: string, dayOffset: number, overrides: Record<string, unknown> = {}) {
  const at = new Date(Date.now() + dayOffset * DAY).toISOString();
  return {
    id,
    title: `イベント${id}`,
    owner_user_id: `owner-${id}`,
    status: "confirmed",
    start_date: null,
    end_date: null,
    wrapup_snoozed_until: null,
    plans: [
      { status: "date_confirmed", settlement_status: "not_needed", confirmed_start_at: at, confirmed_end_at: at, is_all_day: false }
    ],
    event_members: [{ status: "joined" }],
    ...overrides
  };
}

describe("GET /api/cron/notifications — event wrapup", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CRON_SECRET", "test-secret");
    vi.stubEnv("EVENT_WRAPUP_AUTO_DONE", "");
    vi.stubEnv("EVENT_WRAPUP_PROMPT_FLOOR", "2000-01-01");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("promptDue 超えのイベントに wrapup_prompt を upsert する", async () => {
    // -35日: promptDue(+30日)は過ぎ、autoDoneDue(+44日)はまだ先 → プロンプトのみ
    const { client: c, upserts } = client([pastEvent("a", -35)]);
    createSupabaseAdminClient.mockReturnValue(c);

    const res = await GET(request());
    const body = await res.json();

    expect(res.status).toBe(200);
    const allRows = upserts.flat() as Array<{ kind: string }>;
    expect(allRows.some((r) => r.kind === "wrapup_prompt")).toBe(true);
    expect(body.wrapup.notified).toBe(1);
  });

  it("autoDoneDue 超え・EVENT_WRAPUP_AUTO_DONE 未設定なら status を変えず wouldAutoComplete に載せる", async () => {
    const { client: c, eventUpdates } = client([pastEvent("b", -70)]);
    createSupabaseAdminClient.mockReturnValue(c);

    const res = await GET(request());
    const body = await res.json();

    expect(eventUpdates).toEqual([]);
    expect(body.wrapup.wouldAutoComplete).toBe(1);
    expect(body.wrapup.autoCompleted).toBe(0);
  });

  it("通知 upsert が失敗したら自動 done を見送る", async () => {
    vi.stubEnv("EVENT_WRAPUP_AUTO_DONE", "on");
    const upserts: unknown[][] = [];
    const eventUpdates: unknown[] = [];
    const from = vi.fn((table: string) => {
      if (table === "notifications") {
        return {
          upsert: vi.fn(async (rows: unknown[]) => {
            upserts.push(rows);
            return { error: { message: "boom" } };
          }),
          update: vi.fn(() => {
            const l: Record<string, unknown> = {};
            l.eq = () => l;
            l.in = () => l;
            l.is = async () => ({ error: null });
            return l;
          })
        };
      }
      const b: Record<string, unknown> = {};
      const chain = () => b;
      b.select = chain;
      b.in = chain;
      b.order = chain;
      b.limit = chain;
      b.gt = chain;
      if (table === "events") {
        b.update = vi.fn(() => {
          const l: Record<string, unknown> = {};
          l.eq = () => l;
          l.in = async () => {
            eventUpdates.push(true);
            return { error: null, count: 1 };
          };
          return l;
        });
        b.then = (resolve: (v: { data: unknown; error: null }) => unknown) =>
          Promise.resolve({ data: [pastEvent("x", -70)], error: null }).then(resolve);
      } else {
        b.then = (resolve: (v: { data: unknown; error: null }) => unknown) =>
          Promise.resolve({ data: [], error: null }).then(resolve);
      }
      return b;
    });
    createSupabaseAdminClient.mockReturnValue({ from });

    const res = await GET(request());
    const body = await res.json();

    expect(eventUpdates).toEqual([]);
    expect(body.wrapup.autoCompleted).toBe(0);
    expect(body.wrapup.errors.length).toBeGreaterThan(0);
  });

  it("autoDoneDue 超え・EVENT_WRAPUP_AUTO_DONE=on なら status=done に更新し wrapup_done を出す", async () => {
    vi.stubEnv("EVENT_WRAPUP_AUTO_DONE", "on");
    const { client: c, eventUpdates, upserts } = client([pastEvent("c", -70)]);
    createSupabaseAdminClient.mockReturnValue(c);

    const res = await GET(request());
    const body = await res.json();

    expect(eventUpdates).toHaveLength(1);
    expect(eventUpdates[0].values).toMatchObject({ status: "done", wrapup_auto_done: true });
    const allRows = upserts.flat() as Array<{ kind: string }>;
    expect(allRows.some((r) => r.kind === "wrapup_done")).toBe(true);
    expect(body.wrapup.autoCompleted).toBe(1);
  });
});

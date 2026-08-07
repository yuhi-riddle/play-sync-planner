import { beforeEach, describe, expect, it, vi } from "vitest";

const { createSupabaseServerClient, getCurrentUserId, redirect, revalidatePath } = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
  getCurrentUserId: vi.fn(),
  redirect: vi.fn(),
  revalidatePath: vi.fn()
}));

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseAdminClient: vi.fn(),
  createSupabaseServerClient,
  getCurrentUserId
}));

import { createPlanAction, updatePlanAction } from "@/lib/actions/plan/plans";

const userId = "11111111-1111-4111-8111-111111111111";
const eventId = "22222222-2222-4222-8222-222222222222";
const planId = "33333333-3333-4333-8333-333333333333";

function noopSupabaseClient() {
  const insertCalls: string[] = [];
  const from = vi.fn((table: string) => {
    const builder: Record<string, unknown> = {};
    builder.select = vi.fn(() => builder);
    builder.eq = vi.fn(() => builder);
    builder.insert = vi.fn(() => {
      insertCalls.push(table);
      return builder;
    });
    builder.update = vi.fn(() => builder);
    builder.single = vi.fn(async () => ({ data: null, error: null }));
    builder.then = (resolve: (value: { data: never[]; error: null }) => unknown) =>
      Promise.resolve({ data: [], error: null }).then(resolve);
    return builder;
  });

  return { client: { from }, insertCalls };
}

/**
 * insert された行を表ごとに拾える成功パス用のモック。
 * event_members には主催者を1人置いて canStartPlanFromMembers を通す。
 */
function recordingSupabaseClient() {
  const inserted: Record<string, unknown[]> = {};
  const from = vi.fn((table: string) => {
    const builder: Record<string, unknown> = {};
    builder.select = vi.fn(() => builder);
    builder.eq = vi.fn(() => builder);
    builder.update = vi.fn(() => builder);
    builder.insert = vi.fn((payload: unknown) => {
      inserted[table] = [...(inserted[table] ?? []), payload];
      return builder;
    });
    builder.single = vi.fn(async () => ({ data: { id: planId }, error: null }));
    builder.then = (resolve: (value: { data: unknown; error: null }) => unknown) => {
      const data =
        table === "event_members"
          ? [{ event_id: eventId, user_id: userId, display_name: "主催者", role: "organizer", status: "joined" }]
          : [];
      return Promise.resolve({ data, error: null }).then(resolve);
    };
    return builder;
  });

  return { client: { from }, inserted };
}

function planFormData(overrides: Record<string, string> = {}) {
  const formData = new FormData();
  formData.set("title", "夏の予定");
  formData.append("candidateDates", "2026-07-15T10:00");
  formData.append("candidateEndDates", "2026-07-15T12:00");
  formData.append("candidateAllDays", "false");
  formData.set("answer_deadline_at", "2026-07-10T23:00");
  for (const [key, value] of Object.entries(overrides)) {
    formData.set(key, value);
  }
  return formData;
}

describe("createPlanAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUserId.mockResolvedValue(userId);
  });

  it("不正な入力はDBに触れずエラーを返す(例外を投げない)", async () => {
    const { client, insertCalls } = noopSupabaseClient();
    createSupabaseServerClient.mockResolvedValue(client);

    const result = await createPlanAction(eventId, { status: "idle" }, new FormData());

    expect(result.status).toBe("error");
    expect(typeof result.message).toBe("string");
    expect(insertCalls).toEqual([]);
    expect(redirect).not.toHaveBeenCalled();
  });

  it("候補日時をサーバーのTZに関係なく JST として保存する", async () => {
    // フォームから届くのは datetime-local の生文字列（"2026-07-15T10:00"）で、
    // オフセットが付いていない。JS はこれを実行環境のローカル時刻として解釈するため、
    // Vercel(UTC)で new Date(値) すると 10:00Z＝JST 19:00 として保存され、
    // ユーザーが選んだ時刻から9時間ずれる。開発機(JST)では正しく動くので気づけない。
    //
    // process.env.TZ を UTC に差し替えて本番と同じ条件を作る。この差し替えが無いと、
    // JST の開発機ではズレようが無いのでこのテストは何も守らない（空振りになる）。
    const original = process.env.TZ;
    process.env.TZ = "UTC";

    try {
      const { client, inserted } = recordingSupabaseClient();
      createSupabaseServerClient.mockResolvedValue(client);

      // 成功時は redirect() で抜けるので戻り値は無い。insert された中身で確かめる。
      await createPlanAction(eventId, { status: "idle" }, planFormData());
      expect(redirect).toHaveBeenCalled();

      const candidates = inserted["candidate_dates"]?.[0] as { start_at: string; end_at: string | null }[];
      // JST 2026-07-15 10:00 = 2026-07-15T01:00:00.000Z
      expect(candidates[0].start_at).toBe("2026-07-15T01:00:00.000Z");
      expect(candidates[0].end_at).toBe("2026-07-15T03:00:00.000Z");

      const plans = inserted["plans"]?.[0] as { answer_deadline_at: string };
      // JST 2026-07-10 23:00 = 2026-07-10T14:00:00.000Z
      expect(plans.answer_deadline_at).toBe("2026-07-10T14:00:00.000Z");
    } finally {
      process.env.TZ = original;
    }
  });
});

describe("updatePlanAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUserId.mockResolvedValue(userId);
  });

  it("不正な入力はDBに触れずエラーを返す(例外を投げない)", async () => {
    const { client, insertCalls } = noopSupabaseClient();
    createSupabaseServerClient.mockResolvedValue(client);

    const result = await updatePlanAction(planId, { status: "idle" }, new FormData());

    expect(result.status).toBe("error");
    expect(typeof result.message).toBe("string");
    expect(insertCalls).toEqual([]);
    expect(redirect).not.toHaveBeenCalled();
  });
});

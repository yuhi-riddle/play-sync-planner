import { beforeEach, describe, expect, it, vi } from "vitest";

const { createSupabaseServerClient, getCurrentUser, redirect, revalidatePath } = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
  getCurrentUser: vi.fn(),
  redirect: vi.fn(),
  revalidatePath: vi.fn()
}));

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient, getCurrentUser }));

import {
  createPlanTimetableItemAction,
  deletePlanTimetableItemAction,
  updatePlanTimetableItemAction
} from "@/lib/actions/plan-timetable";

const userId = "11111111-1111-4111-8111-111111111111";
const planId = "22222222-2222-4222-8222-222222222222";
const eventId = "33333333-3333-4333-8333-333333333333";
const itemId = "44444444-4444-4444-8444-444444444444";

type Recorded = {
  inserts: { table: string; values: unknown }[];
  updates: { table: string; values: Record<string, unknown> }[];
  deletes: string[];
};

function createSupabaseMock({
  plan = { id: planId, event_id: eventId, status: "date_confirmed", confirmed_start_at: "2026-08-15T04:00:00+00:00" },
  membership = { id: "membership-1" }
}: {
  plan?: { id: string; event_id: string; status: string; confirmed_start_at: string | null } | null;
  membership?: { id: string } | null;
} = {}) {
  const recorded: Recorded = { inserts: [], updates: [], deletes: [] };

  const from = vi.fn((table: string) => {
    const builder: Record<string, unknown> = {};
    builder.select = vi.fn(() => builder);
    builder.eq = vi.fn(() => builder);
    builder.insert = vi.fn((values: unknown) => {
      recorded.inserts.push({ table, values });
      return builder;
    });
    builder.update = vi.fn((values: Record<string, unknown>) => {
      recorded.updates.push({ table, values });
      return builder;
    });
    builder.delete = vi.fn(() => {
      recorded.deletes.push(table);
      return builder;
    });
    builder.maybeSingle = vi.fn(async () => {
      if (table === "plans") return { data: plan, error: null };
      if (table === "event_members") return { data: membership, error: null };
      return { data: null, error: null };
    });
    builder.single = vi.fn(async () => {
      if (table === "plan_timetable_items") return { data: { id: itemId }, error: null };
      return { data: null, error: null };
    });
    builder.then = (resolve: (value: { error: null }) => unknown) => Promise.resolve({ error: null }).then(resolve);
    return builder;
  });

  return { client: { from }, recorded };
}

function timetableFormData(fields: Record<string, string>, participantIds: string[] = []) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    formData.set(key, value);
  }
  for (const participantId of participantIds) {
    formData.append("participant_ids", participantId);
  }
  return formData;
}

describe("createPlanTimetableItemAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUser.mockResolvedValue({ id: userId });
  });

  it("参加していないイベントの進行表には追加できない", async () => {
    const { client, recorded } = createSupabaseMock({ membership: null });
    createSupabaseServerClient.mockResolvedValue(client);

    await expect(
      createPlanTimetableItemAction(planId, timetableFormData({ title: "集合", start_time: "13:00" }))
    ).rejects.toThrow("この進行表を編集する権限がありません");
    expect(recorded.inserts).toEqual([]);
  });

  it("日程が確定していない日程調整には追加できない", async () => {
    const { client, recorded } = createSupabaseMock({
      plan: { id: planId, event_id: eventId, status: "adjusting", confirmed_start_at: null }
    });
    createSupabaseServerClient.mockResolvedValue(client);

    await expect(
      createPlanTimetableItemAction(planId, timetableFormData({ title: "集合", start_time: "13:00" }))
    ).rejects.toThrow("日程が確定していない");
    expect(recorded.inserts).toEqual([]);
  });

  it("日付が無ければ開催日のJST日付を使う", async () => {
    const { client, recorded } = createSupabaseMock();
    createSupabaseServerClient.mockResolvedValue(client);

    await createPlanTimetableItemAction(planId, timetableFormData({ title: "集合", start_time: "13:00" }));

    const insert = recorded.inserts.find((entry) => entry.table === "plan_timetable_items");
    const values = insert?.values as Record<string, unknown>;
    // 2026-08-15T04:00Z = JST 13:00 なので開催日は 2026-08-15。
    expect(new Date(values.start_at as string).toISOString()).toBe(
      new Date("2026-08-15T13:00:00+09:00").toISOString()
    );
    expect(values.end_at).toBeNull();
    expect(values.created_by_user_id).toBe(userId);
  });

  it("終了時刻が開始より前なら翌日として保存する", async () => {
    const { client, recorded } = createSupabaseMock();
    createSupabaseServerClient.mockResolvedValue(client);

    await createPlanTimetableItemAction(
      planId,
      timetableFormData({ title: "花火", start_time: "22:00", end_time: "02:00" })
    );

    const values = recorded.inserts.find((entry) => entry.table === "plan_timetable_items")
      ?.values as Record<string, unknown>;
    expect(new Date(values.end_at as string).toISOString()).toBe(
      new Date("2026-08-16T02:00:00+09:00").toISOString()
    );
  });

  it("担当を複数付けられる", async () => {
    const { client, recorded } = createSupabaseMock();
    createSupabaseServerClient.mockResolvedValue(client);

    await createPlanTimetableItemAction(
      planId,
      timetableFormData({ title: "海で泳ぐ", start_time: "13:00" }, ["p1", "p2"])
    );

    const assigneeInsert = recorded.inserts.find((entry) => entry.table === "plan_timetable_item_assignees");
    expect(assigneeInsert?.values).toEqual([
      { item_id: itemId, participant_id: "p1" },
      { item_id: itemId, participant_id: "p2" }
    ]);
  });

  it("同じ担当を二重に送っても1回だけ入れる", async () => {
    const { client, recorded } = createSupabaseMock();
    createSupabaseServerClient.mockResolvedValue(client);

    await createPlanTimetableItemAction(
      planId,
      timetableFormData({ title: "海で泳ぐ", start_time: "13:00" }, ["p1", "p1"])
    );

    const assigneeInsert = recorded.inserts.find((entry) => entry.table === "plan_timetable_item_assignees");
    expect(assigneeInsert?.values).toEqual([{ item_id: itemId, participant_id: "p1" }]);
  });

  it("担当が無ければ担当テーブルに書き込まない", async () => {
    const { client, recorded } = createSupabaseMock();
    createSupabaseServerClient.mockResolvedValue(client);

    await createPlanTimetableItemAction(planId, timetableFormData({ title: "集合", start_time: "13:00" }));

    expect(recorded.inserts.some((entry) => entry.table === "plan_timetable_item_assignees")).toBe(false);
  });

  it("空のタイトルは受け付けない", async () => {
    const { client, recorded } = createSupabaseMock();
    createSupabaseServerClient.mockResolvedValue(client);

    await expect(
      createPlanTimetableItemAction(planId, timetableFormData({ title: "   ", start_time: "13:00" }))
    ).rejects.toThrow("進行の名前を入力してください");
    expect(recorded.inserts).toEqual([]);
  });

  it("開始時刻が無ければ受け付けない", async () => {
    const { client, recorded } = createSupabaseMock();
    createSupabaseServerClient.mockResolvedValue(client);

    await expect(
      createPlanTimetableItemAction(planId, timetableFormData({ title: "集合", start_time: "" }))
    ).rejects.toThrow("開始時刻を入力してください");
    expect(recorded.inserts).toEqual([]);
  });
});

describe("updatePlanTimetableItemAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUser.mockResolvedValue({ id: userId });
  });

  it("担当を入れ替える（いったん全部消してから入れ直す）", async () => {
    const { client, recorded } = createSupabaseMock();
    createSupabaseServerClient.mockResolvedValue(client);

    await updatePlanTimetableItemAction(
      planId,
      itemId,
      timetableFormData({ title: "集合", start_time: "13:00" }, ["p2"])
    );

    expect(recorded.updates[0]).toMatchObject({ table: "plan_timetable_items" });
    expect(recorded.deletes).toContain("plan_timetable_item_assignees");
    expect(
      recorded.inserts.find((entry) => entry.table === "plan_timetable_item_assignees")?.values
    ).toEqual([{ item_id: itemId, participant_id: "p2" }]);
  });

  it("参加していないイベントの進行表は更新できない", async () => {
    const { client, recorded } = createSupabaseMock({ membership: null });
    createSupabaseServerClient.mockResolvedValue(client);

    await expect(
      updatePlanTimetableItemAction(planId, itemId, timetableFormData({ title: "集合", start_time: "13:00" }))
    ).rejects.toThrow("この進行表を編集する権限がありません");
    expect(recorded.updates).toEqual([]);
  });
});

describe("deletePlanTimetableItemAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUser.mockResolvedValue({ id: userId });
  });

  it("メンバーなら削除できる", async () => {
    const { client, recorded } = createSupabaseMock();
    createSupabaseServerClient.mockResolvedValue(client);

    await deletePlanTimetableItemAction(planId, itemId);

    expect(recorded.deletes).toContain("plan_timetable_items");
  });

  it("参加していないイベントの進行表は削除できない", async () => {
    const { client, recorded } = createSupabaseMock({ membership: null });
    createSupabaseServerClient.mockResolvedValue(client);

    await expect(deletePlanTimetableItemAction(planId, itemId)).rejects.toThrow(
      "この進行表を編集する権限がありません"
    );
    expect(recorded.deletes).toEqual([]);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const { createSupabaseAdminClient, createSupabaseServerClient, getCurrentUser, redirect, revalidatePath } =
  vi.hoisted(() => ({
    createSupabaseAdminClient: vi.fn(),
    createSupabaseServerClient: vi.fn(),
    getCurrentUser: vi.fn(),
    redirect: vi.fn(),
    revalidatePath: vi.fn()
  }));

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseAdminClient, createSupabaseServerClient, getCurrentUser }));

import {
  createPlanTimetableItemAction,
  deletePlanTimetableItemAction,
  updatePlanTimetableItemAction
} from "@/lib/actions/plan/plan-timetable";

const userId = "11111111-1111-4111-8111-111111111111";
const planId = "22222222-2222-4222-8222-222222222222";
const eventId = "33333333-3333-4333-8333-333333333333";
const itemId = "44444444-4444-4444-8444-444444444444";

type SupabaseError = { message: string };

type Recorded = {
  inserts: { table: string; values: unknown }[];
  updates: { table: string; values: Record<string, unknown> }[];
  deletes: string[];
  /**
   * どのクライアント（admin/user）が、どのテーブルをどの列で絞ったか。
   * plans は admin 専用ポリシー(001)しか無いため admin クライアントで読む必要があり、
   * event_members は誰でもよいわけではなく「操作しているユーザー本人」で読む必要がある。
   * client を記録しないと、admin/user を取り違えても（=読めるべき人が読めない、または
   * 認可チェックが素通りする）テストが検出できない。
   */
  filters: { client: "admin" | "user"; table: string; column: string; value: unknown }[];
};

/**
 * plans の読み取りは admin クライアント、event_members・plan_timetable_items・
 * plan_timetable_item_assignees はユーザーのクライアントで行われる想定。
 * 2つの独立したクライアントを用意して、取り違え（本番なら「非オーナーの書き込みが
 * 全部『日程調整が見つかりません』で落ちる」バグ）を検出できるようにする。
 * 想定外のテーブルを引かれたら、そのクライアント名ごと分かるように投げる。
 */
function createSupabaseMock({
  plan = { id: planId, event_id: eventId, status: "date_confirmed", confirmed_start_at: "2026-08-15T04:00:00+00:00" },
  membership = { id: "membership-1" },
  planParticipantIds = ["p1", "p2", "p3"],
  updatedRow = { id: itemId } as { id: string } | null,
  planError = null as SupabaseError | null,
  membershipError = null as SupabaseError | null,
  writeError = null as SupabaseError | null
}: {
  plan?: { id: string; event_id: string; status: string; confirmed_start_at: string | null } | null;
  membership?: { id: string } | null;
  /** この plan にぶら下がっている participants。ここに無い id を担当にはできない。 */
  planParticipantIds?: string[];
  /** update が何件に当たったか。null は「別 plan の item を指された」状態。 */
  updatedRow?: { id: string } | null;
  planError?: SupabaseError | null;
  membershipError?: SupabaseError | null;
  writeError?: SupabaseError | null;
} = {}) {
  const recorded: Recorded = { inserts: [], updates: [], deletes: [], filters: [] };

  function makeFrom(clientName: "admin" | "user", allowedTables: string[]) {
    return vi.fn((table: string) => {
      if (!allowedTables.includes(table)) {
        throw new Error(`unexpected table "${table}" queried on the ${clientName} client`);
      }

      const builder: Record<string, unknown> = {};
      // participants の存在確認は .in("id", ids) で絞るので、何を聞かれたかを覚えておく。
      let requestedIds: string[] = [];

      builder.select = vi.fn(() => builder);
      builder.eq = vi.fn((column: string, value: unknown) => {
        recorded.filters.push({ client: clientName, table, column, value });
        return builder;
      });
      builder.in = vi.fn((column: string, values: string[]) => {
        requestedIds = values;
        recorded.filters.push({ client: clientName, table, column, value: values });
        return builder;
      });
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
        if (table === "plans") return { data: planError ? null : plan, error: planError };
        if (table === "event_members") return { data: membershipError ? null : membership, error: membershipError };
        // update 後の .select("id").maybeSingle()。
        if (table === "plan_timetable_items") return { data: writeError ? null : updatedRow, error: writeError };
        return { data: null, error: null };
      });
      builder.single = vi.fn(async () => {
        if (table === "plan_timetable_items") return { data: writeError ? null : { id: itemId }, error: writeError };
        return { data: null, error: null };
      });
      builder.then = (resolve: (value: unknown) => unknown) => {
        if (table === "participants") {
          const rows = requestedIds.filter((id) => planParticipantIds.includes(id)).map((id) => ({ id }));
          return Promise.resolve({ data: rows, error: null }).then(resolve);
        }
        return Promise.resolve({ error: writeError }).then(resolve);
      };
      return builder;
    });
  }

  // admin: plans（001のポリシーがowner限定なので必須）と participants（担当の存在確認）。
  const adminClient = { from: makeFrom("admin", ["plans", "participants"]) };
  // user: event_members（本人の参加状況）と書き込み対象のテーブル。
  const userClient = {
    from: makeFrom("user", ["event_members", "plan_timetable_items", "plan_timetable_item_assignees"])
  };

  return { adminClient, userClient, recorded };
}

function mockClients(mock: ReturnType<typeof createSupabaseMock>) {
  createSupabaseServerClient.mockResolvedValue(mock.userClient);
  createSupabaseAdminClient.mockReturnValue(mock.adminClient);
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
    const mock = createSupabaseMock({ membership: null });
    mockClients(mock);

    await expect(
      createPlanTimetableItemAction(planId, timetableFormData({ title: "集合", start_time: "13:00" }))
    ).rejects.toThrow("この進行表を編集する権限がありません");
    expect(mock.recorded.inserts).toEqual([]);
  });

  it("日程が確定していない日程調整には追加できない", async () => {
    const mock = createSupabaseMock({
      plan: { id: planId, event_id: eventId, status: "adjusting", confirmed_start_at: null }
    });
    mockClients(mock);

    await expect(
      createPlanTimetableItemAction(planId, timetableFormData({ title: "集合", start_time: "13:00" }))
    ).rejects.toThrow("日程が確定していない");
    expect(mock.recorded.inserts).toEqual([]);
  });

  it("中止された日程調整の進行表は編集できない", async () => {
    // イベント中止(lib/actions/events.ts)は plans の status だけ cancelled にして
    // confirmed_start_at を残す。つまり status ガードだけが効いている状態が実際に起きる。
    const mock = createSupabaseMock({
      plan: { id: planId, event_id: eventId, status: "cancelled", confirmed_start_at: "2026-08-15T04:00:00+00:00" }
    });
    mockClients(mock);

    await expect(
      createPlanTimetableItemAction(planId, timetableFormData({ title: "集合", start_time: "13:00" }))
    ).rejects.toThrow("日程が確定していない");
    await expect(deletePlanTimetableItemAction(planId, itemId)).rejects.toThrow("日程が確定していない");
    expect(mock.recorded.inserts).toEqual([]);
    expect(mock.recorded.deletes).toEqual([]);
  });

  it("plan の読み取りは admin クライアント、参加状況はユーザーのクライアントで、それぞれ絞って引く", async () => {
    // これが崩れる（例: plan の読み取りをユーザークライアントに戻す）と、
    // plans の select ポリシー(001)がowner限定のせいで非オーナーは0件を返され、
    // event_members のチェックに届く前に「日程調整が見つかりません」で落ちる。
    const mock = createSupabaseMock();
    mockClients(mock);

    await createPlanTimetableItemAction(planId, timetableFormData({ title: "集合", start_time: "13:00" }));

    expect(mock.recorded.filters).toContainEqual({ client: "admin", table: "plans", column: "id", value: planId });
    expect(mock.recorded.filters).toContainEqual({
      client: "user",
      table: "event_members",
      column: "event_id",
      value: eventId
    });
    expect(mock.recorded.filters).toContainEqual({
      client: "user",
      table: "event_members",
      column: "user_id",
      value: userId
    });
    expect(mock.recorded.filters).toContainEqual({
      client: "user",
      table: "event_members",
      column: "status",
      value: "joined"
    });
  });

  it("日程調整の取得に失敗したら握り潰さずに伝える", async () => {
    const mock = createSupabaseMock({ planError: { message: "column does not exist" } });
    mockClients(mock);

    await expect(
      createPlanTimetableItemAction(planId, timetableFormData({ title: "集合", start_time: "13:00" }))
    ).rejects.toThrow("日程調整の取得に失敗しました");
    expect(mock.recorded.inserts).toEqual([]);
  });

  it("参加状況の確認に失敗したら握り潰さずに伝える", async () => {
    const mock = createSupabaseMock({ membershipError: { message: "timeout" } });
    mockClients(mock);

    await expect(
      createPlanTimetableItemAction(planId, timetableFormData({ title: "集合", start_time: "13:00" }))
    ).rejects.toThrow("参加状況の確認に失敗しました");
    expect(mock.recorded.inserts).toEqual([]);
  });

  it("書き込みに失敗したら握り潰さずに伝える", async () => {
    const mock = createSupabaseMock({ writeError: { message: "insert failed" } });
    mockClients(mock);

    await expect(
      createPlanTimetableItemAction(planId, timetableFormData({ title: "集合", start_time: "13:00" }))
    ).rejects.toThrow("insert failed");
  });

  it("この日程調整の参加者でない人は担当にできない", async () => {
    // participants は plan ごとの行だが、担当テーブルのRLSは item のイベントしか見ない。
    // 同じイベント内の別 plan の参加者を指定しても通ってしまわないこと。
    const mock = createSupabaseMock({ planParticipantIds: ["p1"] });
    mockClients(mock);

    await expect(
      createPlanTimetableItemAction(planId, timetableFormData({ title: "海で泳ぐ", start_time: "13:00" }, ["p1", "other"]))
    ).rejects.toThrow("この日程調整の参加者ではない人は担当にできません");
    // 担当が不正なら、進行の行そのものを作る前に止める。あとで検証すると担当なしの行が残る。
    expect(mock.recorded.inserts).toEqual([]);
  });

  it("担当の確認は plan_id と id の両方で絞る", async () => {
    // plan_id で絞らないと「DBのどこかに存在する participant」を通してしまい、
    // 別 plan・別イベントの参加者が素通りする。
    const mock = createSupabaseMock();
    mockClients(mock);

    await createPlanTimetableItemAction(
      planId,
      timetableFormData({ title: "海で泳ぐ", start_time: "13:00" }, ["p1", "p2"])
    );

    expect(mock.recorded.filters).toContainEqual({
      client: "admin",
      table: "participants",
      column: "plan_id",
      value: planId
    });
    expect(mock.recorded.filters).toContainEqual({
      client: "admin",
      table: "participants",
      column: "id",
      value: ["p1", "p2"]
    });
  });

  it("担当の確認には admin クライアントを使う", async () => {
    // participants の select ポリシー(001)は plan の owner 限定なので、
    // ユーザーのクライアントで引くと owner 以外は担当を1人も付けられなくなる。
    const mock = createSupabaseMock();
    mockClients(mock);

    await createPlanTimetableItemAction(
      planId,
      timetableFormData({ title: "海で泳ぐ", start_time: "13:00" }, ["p1"])
    );

    expect(createSupabaseAdminClient).toHaveBeenCalled();
  });

  it("日付が無ければ開催日のJST日付を使う", async () => {
    const mock = createSupabaseMock();
    mockClients(mock);

    await createPlanTimetableItemAction(planId, timetableFormData({ title: "集合", start_time: "13:00" }));

    const insert = mock.recorded.inserts.find((entry) => entry.table === "plan_timetable_items");
    const values = insert?.values as Record<string, unknown>;
    // 2026-08-15T04:00Z = JST 13:00 なので開催日は 2026-08-15。
    expect(new Date(values.start_at as string).toISOString()).toBe(
      new Date("2026-08-15T13:00:00+09:00").toISOString()
    );
    expect(values.end_at).toBeNull();
    expect(values.created_by_user_id).toBe(userId);
  });

  it("終了時刻が開始より前なら翌日として保存する", async () => {
    const mock = createSupabaseMock();
    mockClients(mock);

    await createPlanTimetableItemAction(
      planId,
      timetableFormData({ title: "花火", start_time: "22:00", end_time: "02:00" })
    );

    const values = mock.recorded.inserts.find((entry) => entry.table === "plan_timetable_items")
      ?.values as Record<string, unknown>;
    expect(new Date(values.end_at as string).toISOString()).toBe(
      new Date("2026-08-16T02:00:00+09:00").toISOString()
    );
  });

  it("終了時刻が開始より後ならその日のまま保存する", async () => {
    const mock = createSupabaseMock();
    mockClients(mock);

    await createPlanTimetableItemAction(
      planId,
      timetableFormData({ title: "昼食", start_time: "13:00", end_time: "15:00" })
    );

    const values = mock.recorded.inserts.find((entry) => entry.table === "plan_timetable_items")
      ?.values as Record<string, unknown>;
    expect(new Date(values.end_at as string).toISOString()).toBe(
      new Date("2026-08-15T15:00:00+09:00").toISOString()
    );
  });

  it("担当を複数付けられる", async () => {
    const mock = createSupabaseMock();
    mockClients(mock);

    await createPlanTimetableItemAction(
      planId,
      timetableFormData({ title: "海で泳ぐ", start_time: "13:00" }, ["p1", "p2"])
    );

    const assigneeInsert = mock.recorded.inserts.find((entry) => entry.table === "plan_timetable_item_assignees");
    expect(assigneeInsert?.values).toEqual([
      { item_id: itemId, participant_id: "p1" },
      { item_id: itemId, participant_id: "p2" }
    ]);
  });

  it("同じ担当を二重に送っても1回だけ入れる", async () => {
    const mock = createSupabaseMock();
    mockClients(mock);

    await createPlanTimetableItemAction(
      planId,
      timetableFormData({ title: "海で泳ぐ", start_time: "13:00" }, ["p1", "p1"])
    );

    const assigneeInsert = mock.recorded.inserts.find((entry) => entry.table === "plan_timetable_item_assignees");
    expect(assigneeInsert?.values).toEqual([{ item_id: itemId, participant_id: "p1" }]);
  });

  it("担当が無ければ担当テーブルに書き込まない", async () => {
    const mock = createSupabaseMock();
    mockClients(mock);

    await createPlanTimetableItemAction(planId, timetableFormData({ title: "集合", start_time: "13:00" }));

    expect(mock.recorded.inserts.some((entry) => entry.table === "plan_timetable_item_assignees")).toBe(false);
  });

  it("空のタイトルは受け付けない", async () => {
    const mock = createSupabaseMock();
    mockClients(mock);

    await expect(
      createPlanTimetableItemAction(planId, timetableFormData({ title: "   ", start_time: "13:00" }))
    ).rejects.toThrow("進行の名前を入力してください");
    expect(mock.recorded.inserts).toEqual([]);
  });

  it("開始時刻が無ければ受け付けない", async () => {
    const mock = createSupabaseMock();
    mockClients(mock);

    await expect(
      createPlanTimetableItemAction(planId, timetableFormData({ title: "集合", start_time: "" }))
    ).rejects.toThrow("開始時刻を入力してください");
    expect(mock.recorded.inserts).toEqual([]);
  });
});

describe("updatePlanTimetableItemAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUser.mockResolvedValue({ id: userId });
  });

  it("担当を入れ替える（いったん全部消してから入れ直す）", async () => {
    const mock = createSupabaseMock();
    mockClients(mock);

    await updatePlanTimetableItemAction(
      planId,
      itemId,
      timetableFormData({ title: "集合", start_time: "13:00" }, ["p2"])
    );

    expect(mock.recorded.updates[0]).toMatchObject({ table: "plan_timetable_items" });
    expect(mock.recorded.deletes).toContain("plan_timetable_item_assignees");
    expect(
      mock.recorded.inserts.find((entry) => entry.table === "plan_timetable_item_assignees")?.values
    ).toEqual([{ item_id: itemId, participant_id: "p2" }]);
  });

  it("参加していないイベントの進行表は更新できない", async () => {
    const mock = createSupabaseMock({ membership: null });
    mockClients(mock);

    await expect(
      updatePlanTimetableItemAction(planId, itemId, timetableFormData({ title: "集合", start_time: "13:00" }))
    ).rejects.toThrow("この進行表を編集する権限がありません");
    expect(mock.recorded.updates).toEqual([]);
  });

  it("別の日程調整の項目を指されたら、担当を消す前に止める", async () => {
    // PostgREST は0件更新でも成功を返す。止めないと clearAssignees が item_id だけで
    // 引くので、同じイベント内の別 plan の担当を全部消してしまう。
    const mock = createSupabaseMock({ updatedRow: null });
    mockClients(mock);

    await expect(
      updatePlanTimetableItemAction(planId, itemId, timetableFormData({ title: "集合", start_time: "13:00" }, ["p1"]))
    ).rejects.toThrow("この進行はこの日程調整のものではありません");
    expect(mock.recorded.deletes).toEqual([]);
    expect(mock.recorded.inserts).toEqual([]);
  });

  it("担当が不正なら、更新も担当の削除もしない", async () => {
    // 検証が後ろにあると、行を更新して既存の担当を全消ししてから throw する。
    // create 側より壊れ方がひどいので、更新側でも順序を固定する。
    const mock = createSupabaseMock({ planParticipantIds: ["p1"] });
    mockClients(mock);

    await expect(
      updatePlanTimetableItemAction(planId, itemId, timetableFormData({ title: "集合", start_time: "13:00" }, ["other"]))
    ).rejects.toThrow("この日程調整の参加者ではない人は担当にできません");
    expect(mock.recorded.updates).toEqual([]);
    expect(mock.recorded.deletes).toEqual([]);
  });

  it("更新は id と plan_id の両方で絞る", async () => {
    const mock = createSupabaseMock();
    mockClients(mock);

    await updatePlanTimetableItemAction(planId, itemId, timetableFormData({ title: "集合", start_time: "13:00" }));

    expect(mock.recorded.filters).toContainEqual({
      client: "user",
      table: "plan_timetable_items",
      column: "id",
      value: itemId
    });
    expect(mock.recorded.filters).toContainEqual({
      client: "user",
      table: "plan_timetable_items",
      column: "plan_id",
      value: planId
    });
  });
});

describe("deletePlanTimetableItemAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUser.mockResolvedValue({ id: userId });
  });

  it("メンバーなら削除できる", async () => {
    const mock = createSupabaseMock();
    mockClients(mock);

    await deletePlanTimetableItemAction(planId, itemId);

    expect(mock.recorded.deletes).toContain("plan_timetable_items");
  });

  it("削除は id と plan_id の両方で絞る", async () => {
    const mock = createSupabaseMock();
    mockClients(mock);

    await deletePlanTimetableItemAction(planId, itemId);

    expect(mock.recorded.filters).toContainEqual({
      client: "user",
      table: "plan_timetable_items",
      column: "id",
      value: itemId
    });
    expect(mock.recorded.filters).toContainEqual({
      client: "user",
      table: "plan_timetable_items",
      column: "plan_id",
      value: planId
    });
  });

  it("参加していないイベントの進行表は削除できない", async () => {
    const mock = createSupabaseMock({ membership: null });
    mockClients(mock);

    await expect(deletePlanTimetableItemAction(planId, itemId)).rejects.toThrow(
      "この進行表を編集する権限がありません"
    );
    expect(mock.recorded.deletes).toEqual([]);
  });
});

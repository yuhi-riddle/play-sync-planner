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
  createEventTaskAction,
  deleteEventTaskAction,
  toggleEventTaskDoneAction,
  updateEventTaskAssigneeAction
} from "@/lib/actions/event/event-tasks";

const userId = "11111111-1111-4111-8111-111111111111";
const eventId = "22222222-2222-4222-8222-222222222222";
const taskId = "33333333-3333-4333-8333-333333333333";

type Recorded = {
  inserts: { table: string; values: Record<string, unknown> }[];
  updates: { table: string; values: Record<string, unknown> }[];
  deletes: string[];
};

function createSupabaseMock({
  membership = { id: "membership-1" },
  lastSortOrder = 2,
  existingTask = { id: taskId, event_id: eventId, done_at: null }
}: {
  membership?: { id: string } | null;
  lastSortOrder?: number | null;
  existingTask?: { id: string; event_id: string; done_at: string | null } | null;
} = {}) {
  const recorded: Recorded = { inserts: [], updates: [], deletes: [] };

  const from = vi.fn((table: string) => {
    const builder: Record<string, unknown> = {};
    builder.select = vi.fn(() => builder);
    builder.eq = vi.fn(() => builder);
    builder.order = vi.fn(() => builder);
    builder.limit = vi.fn(() => builder);
    builder.insert = vi.fn((values: Record<string, unknown>) => {
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
      if (table === "event_members") return { data: membership, error: null };
      if (table === "event_tasks") {
        return recorded.inserts.length === 0 && recorded.updates.length === 0 && recorded.deletes.length === 0
          ? { data: existingTask ? { ...existingTask, sort_order: lastSortOrder } : null, error: null }
          : { data: existingTask, error: null };
      }
      return { data: null, error: null };
    });
    builder.then = (resolve: (value: { error: null }) => unknown) => Promise.resolve({ error: null }).then(resolve);
    return builder;
  });

  return { client: { from }, recorded };
}

function taskFormData(fields: Record<string, string>) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    formData.set(key, value);
  }
  return formData;
}

describe("createEventTaskAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUser.mockResolvedValue({ id: userId });
  });

  it("参加していないイベントには追加できない", async () => {
    const { client, recorded } = createSupabaseMock({ membership: null });
    createSupabaseServerClient.mockResolvedValue(client);

    await expect(createEventTaskAction(eventId, taskFormData({ title: "浮き輪" }))).rejects.toThrow(
      "このイベントの分担を編集する権限がありません"
    );
    expect(recorded.inserts).toEqual([]);
  });

  it("担当者なしでも追加できる", async () => {
    const { client, recorded } = createSupabaseMock();
    createSupabaseServerClient.mockResolvedValue(client);

    await createEventTaskAction(eventId, taskFormData({ title: "浮き輪", assignee_user_id: "" }));

    expect(recorded.inserts[0]).toMatchObject({
      table: "event_tasks",
      values: expect.objectContaining({
        event_id: eventId,
        title: "浮き輪",
        assignee_user_id: null,
        created_by_user_id: userId
      })
    });
  });

  it("空のタイトルは受け付けない", async () => {
    const { client, recorded } = createSupabaseMock();
    createSupabaseServerClient.mockResolvedValue(client);

    await expect(createEventTaskAction(eventId, taskFormData({ title: "   " }))).rejects.toThrow(
      "持ち物や役割の名前を入力してください"
    );
    expect(recorded.inserts).toEqual([]);
  });

  it("既存の最後の次に並ぶようにする", async () => {
    const { client, recorded } = createSupabaseMock({ lastSortOrder: 4 });
    createSupabaseServerClient.mockResolvedValue(client);

    await createEventTaskAction(eventId, taskFormData({ title: "浮き輪" }));

    expect(recorded.inserts[0].values.sort_order).toBe(5);
  });
});

describe("toggleEventTaskDoneAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUser.mockResolvedValue({ id: userId });
  });

  it("未完了なら完了日時を入れる", async () => {
    const { client, recorded } = createSupabaseMock({ existingTask: { id: taskId, event_id: eventId, done_at: null } });
    createSupabaseServerClient.mockResolvedValue(client);

    await toggleEventTaskDoneAction(eventId, taskId);

    expect(recorded.updates[0]).toMatchObject({
      table: "event_tasks",
      values: { done_at: expect.any(String) }
    });
  });

  it("完了済みなら未完了に戻す", async () => {
    const { client, recorded } = createSupabaseMock({
      existingTask: { id: taskId, event_id: eventId, done_at: "2026-07-27T00:00:00.000Z" }
    });
    createSupabaseServerClient.mockResolvedValue(client);

    await toggleEventTaskDoneAction(eventId, taskId);

    expect(recorded.updates[0]).toMatchObject({ table: "event_tasks", values: { done_at: null } });
  });
});

describe("updateEventTaskAssigneeAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUser.mockResolvedValue({ id: userId });
  });

  it("担当者を外せる", async () => {
    const { client, recorded } = createSupabaseMock();
    createSupabaseServerClient.mockResolvedValue(client);

    await updateEventTaskAssigneeAction(eventId, taskId, taskFormData({ assignee_user_id: "" }));

    expect(recorded.updates[0]).toMatchObject({ table: "event_tasks", values: { assignee_user_id: null } });
  });
});

describe("deleteEventTaskAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUser.mockResolvedValue({ id: userId });
  });

  it("参加していないイベントからは削除できない", async () => {
    const { client, recorded } = createSupabaseMock({ membership: null });
    createSupabaseServerClient.mockResolvedValue(client);

    await expect(deleteEventTaskAction(eventId, taskId)).rejects.toThrow(
      "このイベントの分担を編集する権限がありません"
    );
    expect(recorded.deletes).toEqual([]);
  });

  it("メンバーなら削除できる", async () => {
    const { client, recorded } = createSupabaseMock();
    createSupabaseServerClient.mockResolvedValue(client);

    await deleteEventTaskAction(eventId, taskId);

    expect(recorded.deletes).toContain("event_tasks");
  });
});

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

import { duplicateEventAction } from "@/lib/actions/events";

const userId = "11111111-1111-4111-8111-111111111111";
const sourceEventId = "22222222-2222-4222-8222-222222222222";
const newEventId = "33333333-3333-4333-8333-333333333333";

const sourceEvent = {
  category: "outdoor",
  title: "川遊び",
  url: null,
  location_name: "多摩川",
  address: null,
  memo: null,
  start_date: "2026-08-01",
  end_date: null,
  status: "confirmed",
  price: 3000,
  capacity: 8
};

type Recorded = { table: string; values: unknown }[];

function createSupabaseMock({
  membership,
  members
}: {
  membership: { id: string } | null;
  members: { user_id: string; display_name: string; role: string }[];
}) {
  const inserts: Recorded = [];

  const from = vi.fn((table: string) => {
    const insertFn = vi.fn((values: unknown) => {
      inserts.push({ table, values });
      return builder;
    });
    const builder: Record<string, unknown> = {};
    builder.select = vi.fn(() => builder);
    builder.eq = vi.fn(() => builder);
    builder.insert = insertFn;
    builder.single = vi.fn(async () => {
      if (table === "events") {
        // 参照時はコピー元、insert 後は新しいIDを返す。
        return insertFn.mock.calls.length > 0
          ? { data: { id: newEventId }, error: null }
          : { data: sourceEvent, error: null };
      }
      return { data: null, error: null };
    });
    builder.maybeSingle = vi.fn(async () => ({
      data: table === "event_members" ? membership : null,
      error: null
    }));
    builder.then = (resolve: (value: { data: unknown; error: null }) => unknown) =>
      Promise.resolve({ data: table === "event_members" ? members : [], error: null }).then(resolve);
    return builder;
  });

  return { client: { from }, inserts };
}

describe("duplicateEventAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUser.mockResolvedValue({ id: userId, user_metadata: { nickname: "あかり" } });
  });

  it("参加していないイベントは複製できない", async () => {
    const { client, inserts } = createSupabaseMock({ membership: null, members: [] });
    createSupabaseServerClient.mockResolvedValue(client);

    await expect(duplicateEventAction(sourceEventId)).rejects.toThrow("このイベントを複製する権限がありません");
    expect(inserts).toEqual([]);
  });

  it("参加済みのメンバーだけを引き継ぎ、複製した人が主催者になる", async () => {
    const { client, inserts } = createSupabaseMock({
      membership: { id: "membership-1" },
      members: [
        { user_id: userId, display_name: "あかり", role: "member" },
        { user_id: "friend-1", display_name: "ゆうき", role: "organizer" }
      ]
    });
    createSupabaseServerClient.mockResolvedValue(client);

    await duplicateEventAction(sourceEventId);

    const memberInsert = inserts.find((entry) => entry.table === "event_members");
    expect(memberInsert?.values).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ event_id: newEventId, user_id: userId, role: "organizer", status: "joined" }),
        expect.objectContaining({ event_id: newEventId, user_id: "friend-1", role: "member", status: "joined" })
      ])
    );
  });

  it("日程・立替・清算は引き継がない", async () => {
    const { client, inserts } = createSupabaseMock({ membership: { id: "membership-1" }, members: [] });
    createSupabaseServerClient.mockResolvedValue(client);

    await duplicateEventAction(sourceEventId);

    for (const table of ["plans", "candidate_dates", "participants", "expenses", "settlements"]) {
      expect(inserts.some((entry) => entry.table === table)).toBe(false);
    }
  });

  it("新しい招待リンクを発行して、詳細の編集画面へ送る", async () => {
    const { client, inserts } = createSupabaseMock({ membership: { id: "membership-1" }, members: [] });
    createSupabaseServerClient.mockResolvedValue(client);

    await duplicateEventAction(sourceEventId);

    expect(inserts.some((entry) => entry.table === "event_invite_links")).toBe(true);
    expect(redirect).toHaveBeenCalledWith(`/events/${newEventId}/edit`);
  });
});

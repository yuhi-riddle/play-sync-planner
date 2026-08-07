import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createSupabaseServerClient,
  createSupabaseAdminClient,
  getCurrentUserId,
  redirect,
  revalidatePath
} = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
  createSupabaseAdminClient: vi.fn(),
  getCurrentUserId: vi.fn(),
  redirect: vi.fn(),
  revalidatePath: vi.fn()
}));

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient,
  createSupabaseAdminClient,
  getCurrentUserId
}));

import { deletePlanParticipantAction } from "@/lib/actions/participants";

const ownerUserId = "11111111-1111-4111-8111-111111111111";
const planId = "22222222-2222-4222-8222-222222222222";
const eventId = "33333333-3333-4333-8333-333333333333";
const participantId = "44444444-4444-4444-8444-444444444444";

/**
 * useActionState 向けの引数を埋めて呼ぶ。
 * 断る理由は throw ではなく ActionState で返す（本番だと throw のメッセージが
 * 汎用文言に差し替わり、なぜ消せないのかが主催者に届かないため）。
 */
function runDelete(planId: string, participantId: string) {
  return deletePlanParticipantAction(planId, participantId);
}

function createOwnerClient(plan: { id: string; event_id: string } | null) {
  const eq = vi.fn();
  const from = vi.fn(() => {
    const builder: Record<string, unknown> = {};
    builder.select = vi.fn(() => builder);
    builder.eq = vi.fn((...args: unknown[]) => {
      eq(...args);
      return builder;
    });
    builder.maybeSingle = vi.fn(async () => ({ data: plan, error: null }));
    return builder;
  });
  return { from, eq };
}

/**
 * admin クライアントのモック。テーブルごとに呼ばれたメソッドを記録する。
 * participants は maybeSingle（本人取得）と delete の両方で使われるので、
 * delete が呼ばれたかを別に持つ。
 */
function createAdminClient({
  participant,
  paidExpenses = [],
  splits = []
}: {
  participant: { id: string; display_name: string } | null;
  paidExpenses?: Array<{ title: string | null }>;
  splits?: Array<{ expenses: { title: string | null } | null }>;
}) {
  const calls = {
    deleted: vi.fn(),
    participantEq: vi.fn(),
    deleteEq: vi.fn()
  };

  const from = vi.fn((table: string) => {
    const builder: Record<string, unknown> = {};
    let isDelete = false;

    builder.select = vi.fn(() => builder);
    builder.delete = vi.fn(() => {
      isDelete = true;
      calls.deleted(table);
      return builder;
    });
    builder.eq = vi.fn((...args: unknown[]) => {
      if (table === "participants") {
        (isDelete ? calls.deleteEq : calls.participantEq)(...args);
      }
      return builder;
    });
    builder.maybeSingle = vi.fn(async () => ({ data: participant, error: null }));
    builder.then = (resolve: (value: { data: unknown; error: null }) => unknown) => {
      const data = table === "expenses" ? paidExpenses : table === "expense_splits" ? splits : null;
      return Promise.resolve({ data, error: null }).then(resolve);
    };

    return builder;
  });

  return { client: { from }, calls };
}

describe("deletePlanParticipantAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUserId.mockResolvedValue(ownerUserId);
  });

  it("お金が絡んでいない参加者は消せる", async () => {
    createSupabaseServerClient.mockResolvedValue(createOwnerClient({ id: planId, event_id: eventId }));
    const { client, calls } = createAdminClient({ participant: { id: participantId, display_name: "たろう" } });
    createSupabaseAdminClient.mockReturnValue(client);

    const state = await runDelete(planId, participantId);

    expect(state.status).toBe("success");
    expect(calls.deleted).toHaveBeenCalledWith("participants");
    expect(revalidatePath).toHaveBeenCalledWith(`/plans/${planId}`);
    expect(revalidatePath).toHaveBeenCalledWith(`/plans/${planId}/settlement`);
  });

  it("立て替えた記録がある参加者は消さない", async () => {
    createSupabaseServerClient.mockResolvedValue(createOwnerClient({ id: planId, event_id: eventId }));
    const { client, calls } = createAdminClient({
      participant: { id: participantId, display_name: "たろう" },
      paidExpenses: [{ title: "レンタカー" }]
    });
    createSupabaseAdminClient.mockReturnValue(client);

    const state = await runDelete(planId, participantId);

    expect(state.status).toBe("error");
    expect(state.message).toContain("レンタカー");
    expect(calls.deleted).not.toHaveBeenCalled();
  });

  it("負担者に入っている参加者は消さない", async () => {
    // expense_splits は削除連鎖するので、消すと立替の金額と負担額の合計がズレる
    createSupabaseServerClient.mockResolvedValue(createOwnerClient({ id: planId, event_id: eventId }));
    const { client, calls } = createAdminClient({
      participant: { id: participantId, display_name: "たろう" },
      splits: [{ expenses: { title: "宿代" } }]
    });
    createSupabaseAdminClient.mockReturnValue(client);

    const state = await runDelete(planId, participantId);

    expect(state.status).toBe("error");
    expect(state.message).toContain("宿代");
    expect(calls.deleted).not.toHaveBeenCalled();
  });

  it("プランは所有者で絞って取り出す", async () => {
    const owner = createOwnerClient({ id: planId, event_id: eventId });
    createSupabaseServerClient.mockResolvedValue(owner);
    const { client } = createAdminClient({ participant: { id: participantId, display_name: "たろう" } });
    createSupabaseAdminClient.mockReturnValue(client);

    await runDelete(planId, participantId);

    // ここが抜けると、planId さえ知っていれば誰でも他人の参加者を消せる
    expect(owner.eq).toHaveBeenCalledWith("owner_user_id", ownerUserId);
  });

  it("他人のプランには触らない", async () => {
    createSupabaseServerClient.mockResolvedValue(createOwnerClient(null));
    const { client, calls } = createAdminClient({ participant: { id: participantId, display_name: "たろう" } });
    createSupabaseAdminClient.mockReturnValue(client);

    const state = await runDelete(planId, participantId);

    expect(state.status).toBe("error");
    expect(state.message).toContain("この日程調整を管理する権限がありません");
    expect(calls.deleted).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("参加者は plan_id でも絞って取り出す", async () => {
    createSupabaseServerClient.mockResolvedValue(createOwnerClient({ id: planId, event_id: eventId }));
    const { client, calls } = createAdminClient({ participant: { id: participantId, display_name: "たろう" } });
    createSupabaseAdminClient.mockReturnValue(client);

    await runDelete(planId, participantId);

    // 自分のプランIDと、他人のプランの参加者IDを組み合わせて消せないようにする
    expect(calls.participantEq).toHaveBeenCalledWith("plan_id", planId);
    expect(calls.deleteEq).toHaveBeenCalledWith("plan_id", planId);
  });

  it("他のプランの参加者IDを渡されたら消さない", async () => {
    createSupabaseServerClient.mockResolvedValue(createOwnerClient({ id: planId, event_id: eventId }));
    const { client, calls } = createAdminClient({ participant: null });
    createSupabaseAdminClient.mockReturnValue(client);

    const state = await runDelete(planId, participantId);

    expect(state.status).toBe("error");
    expect(state.message).toContain("この参加者は見つかりませんでした");
    expect(calls.deleted).not.toHaveBeenCalled();
  });
});

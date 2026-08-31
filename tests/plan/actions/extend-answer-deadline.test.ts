import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createSupabaseServerClient,
  createSupabaseAdminClient,
  getCurrentActiveUserId,
  redirect,
  revalidatePath
} = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
  createSupabaseAdminClient: vi.fn(),
  getCurrentActiveUserId: vi.fn(),
  redirect: vi.fn(),
  revalidatePath: vi.fn()
}));

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient,
  createSupabaseAdminClient,
  getCurrentActiveUserId
}));

import { extendPlanAnswerDeadlineAction } from "@/lib/actions/plan/plans";

const ownerUserId = "11111111-1111-4111-8111-111111111111";
const planId = "22222222-2222-4222-8222-222222222222";
const eventId = "33333333-3333-4333-8333-333333333333";

type TableCalls = { update: ReturnType<typeof vi.fn>; eq: ReturnType<typeof vi.fn> };

function createOwnerClient(plan: { id: string; event_id: string; answer_deadline_at: string | null } | null) {
  // 絞り込み条件を記録する。plan を null で返すだけのモックだと、
  // owner_user_id で絞るのをやめても「権限がありません」で落ちるので、
  // 所有者チェックが外れたことに気づけない。
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

function createAdminClient() {
  const calls: Record<string, TableCalls> = {};
  const from = vi.fn((table: string) => {
    if (!calls[table]) {
      calls[table] = { update: vi.fn(), eq: vi.fn() };
    }
    const tableCalls = calls[table];
    const builder: Record<string, unknown> = {};
    builder.update = vi.fn((...args: unknown[]) => {
      tableCalls.update(...args);
      return builder;
    });
    builder.eq = vi.fn((...args: unknown[]) => {
      tableCalls.eq(...args);
      return builder;
    });
    builder.then = (resolve: (value: { error: null }) => unknown) => Promise.resolve({ error: null }).then(resolve);
    return builder;
  });
  return { client: { from }, calls };
}

function formOf(days: string) {
  const formData = new FormData();
  formData.set("days", days);
  return formData;
}

describe("extendPlanAnswerDeadlineAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentActiveUserId.mockResolvedValue(ownerUserId);
  });

  it("プランと共有リンクの両方の期限を、同じ値まで延ばす", async () => {
    // 共有リンクは作成時点の期限を expires_at に写して持っている。
    // plans だけ延ばすと、回答は「共有リンクの有効期限を過ぎています」で弾かれる。
    createSupabaseServerClient.mockResolvedValue(
      createOwnerClient({ id: planId, event_id: eventId, answer_deadline_at: "2026-08-01T00:00:00.000Z" })
    );
    const { client, calls } = createAdminClient();
    createSupabaseAdminClient.mockReturnValue(client);

    await extendPlanAnswerDeadlineAction(planId, formOf("3"));

    const planDeadline = (calls.plans.update.mock.calls[0][0] as { answer_deadline_at: string }).answer_deadline_at;
    const linkDeadline = (calls.share_links.update.mock.calls[0][0] as { expires_at: string }).expires_at;

    expect(linkDeadline).toBe(planDeadline);
    expect(new Date(planDeadline).getTime()).toBeGreaterThan(Date.now());
  });

  it("延ばすのは、まだ有効な回答用リンクだけ", async () => {
    createSupabaseServerClient.mockResolvedValue(
      createOwnerClient({ id: planId, event_id: eventId, answer_deadline_at: null })
    );
    const { client, calls } = createAdminClient();
    createSupabaseAdminClient.mockReturnValue(client);

    await extendPlanAnswerDeadlineAction(planId, formOf("1"));

    // 無効化済みのリンクまで生き返らせない
    expect(calls.share_links.eq).toHaveBeenCalledWith("plan_id", planId);
    expect(calls.share_links.eq).toHaveBeenCalledWith("purpose", "answer");
    expect(calls.share_links.eq).toHaveBeenCalledWith("status", "open");
  });

  it("プランは所有者で絞って取り出す", async () => {
    const owner = createOwnerClient({ id: planId, event_id: eventId, answer_deadline_at: null });
    createSupabaseServerClient.mockResolvedValue(owner);
    const { client } = createAdminClient();
    createSupabaseAdminClient.mockReturnValue(client);

    await extendPlanAnswerDeadlineAction(planId, formOf("3"));

    // ここが抜けると、planId さえ知っていれば誰でも他人の回答期限を動かせる
    expect(owner.eq).toHaveBeenCalledWith("owner_user_id", ownerUserId);
    expect(owner.eq).toHaveBeenCalledWith("id", planId);
  });

  it("他人のプランには触らない", async () => {
    createSupabaseServerClient.mockResolvedValue(createOwnerClient(null));
    const { client, calls } = createAdminClient();
    createSupabaseAdminClient.mockReturnValue(client);

    await expect(extendPlanAnswerDeadlineAction(planId, formOf("3"))).rejects.toThrow(
      "この日程調整を管理する権限がありません"
    );
    expect(calls.plans).toBeUndefined();
    expect(calls.share_links).toBeUndefined();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("選択肢にない日数は、DBに触る前に弾く", async () => {
    createSupabaseServerClient.mockResolvedValue(
      createOwnerClient({ id: planId, event_id: eventId, answer_deadline_at: null })
    );
    const { client, calls } = createAdminClient();
    createSupabaseAdminClient.mockReturnValue(client);

    // フォームの値は書き換えられる。365 を通すと回答期限が実質無くなる
    await expect(extendPlanAnswerDeadlineAction(planId, formOf("365"))).rejects.toThrow(
      "延ばす日数が正しくありません"
    );
    expect(calls.plans).toBeUndefined();
    expect(createSupabaseServerClient).not.toHaveBeenCalled();
  });

  it("延ばしたらイベントとプランの画面を作り直す", async () => {
    createSupabaseServerClient.mockResolvedValue(
      createOwnerClient({ id: planId, event_id: eventId, answer_deadline_at: null })
    );
    const { client } = createAdminClient();
    createSupabaseAdminClient.mockReturnValue(client);

    await extendPlanAnswerDeadlineAction(planId, formOf("7"));

    expect(revalidatePath).toHaveBeenCalledWith(`/plans/${planId}`);
    expect(revalidatePath).toHaveBeenCalledWith(`/events/${eventId}`);
    // ホームの「対応が必要なこと」も期限を見ている
    expect(revalidatePath).toHaveBeenCalledWith("/");
  });
});

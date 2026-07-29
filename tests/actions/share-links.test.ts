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

import { reissueShareLinkAction, revokeShareLinkAction } from "@/lib/actions/share-links";

const ownerUserId = "11111111-1111-4111-8111-111111111111";
const planId = "22222222-2222-4222-8222-222222222222";

type TableCalls = {
  update: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
};

/**
 * Supabase のクエリビルダーは全メソッドが自身を返すので、
 * 最終的に await されたときだけ結果を返すチェーンを作る。
 */
function createSupabaseMock({ plan }: { plan: { id: string; answer_deadline_at: string | null } | null }) {
  const calls: Record<string, TableCalls> = {};

  const from = vi.fn((table: string) => {
    if (!calls[table]) {
      calls[table] = { update: vi.fn(), insert: vi.fn(), eq: vi.fn() };
    }
    const tableCalls = calls[table];

    const builder: Record<string, unknown> = {};
    const chain = (name: string, record?: ReturnType<typeof vi.fn>) => {
      builder[name] = vi.fn((...args: unknown[]) => {
        record?.(...args);
        return builder;
      });
    };

    chain("select");
    chain("update", tableCalls.update);
    chain("insert", tableCalls.insert);
    chain("eq", tableCalls.eq);
    builder.maybeSingle = vi.fn(async () => ({ data: table === "plans" ? plan : null, error: null }));
    builder.then = (resolve: (value: { error: null }) => unknown) => Promise.resolve({ error: null }).then(resolve);

    return builder;
  });

  return { client: { from }, calls };
}

describe("revokeShareLinkAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUser.mockResolvedValue({ id: ownerUserId });
  });

  it("marks the open link as revoked", async () => {
    const { client, calls } = createSupabaseMock({ plan: { id: planId, answer_deadline_at: null } });
    createSupabaseServerClient.mockResolvedValue(client);

    await revokeShareLinkAction(planId);

    expect(calls.share_links.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: "revoked", revoked_at: expect.any(String) })
    );
    expect(calls.share_links.eq).toHaveBeenCalledWith("plan_id", planId);
    expect(calls.share_links.eq).toHaveBeenCalledWith("status", "open");
    expect(revalidatePath).toHaveBeenCalledWith(`/plans/${planId}`);
  });

  it("refuses to touch a plan the current user does not own", async () => {
    const { client, calls } = createSupabaseMock({ plan: null });
    createSupabaseServerClient.mockResolvedValue(client);

    await expect(revokeShareLinkAction(planId)).rejects.toThrow("この日程調整を管理する権限がありません");
    expect(calls.share_links).toBeUndefined();
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("reissueShareLinkAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUser.mockResolvedValue({ id: ownerUserId });
  });

  it("revokes the current link before issuing a new one", async () => {
    const { client, calls } = createSupabaseMock({
      plan: { id: planId, answer_deadline_at: "2026-08-01T10:00:00.000Z" }
    });
    createSupabaseServerClient.mockResolvedValue(client);

    await reissueShareLinkAction(planId);

    expect(calls.share_links.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: "revoked", revoked_at: expect.any(String) })
    );
    expect(calls.share_links.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        plan_id: planId,
        purpose: "answer",
        status: "open",
        expires_at: "2026-08-01T10:00:00.000Z",
        token: expect.any(String)
      })
    );
  });

  it("issues a token that is not reused from the plan id", async () => {
    const { client, calls } = createSupabaseMock({ plan: { id: planId, answer_deadline_at: null } });
    createSupabaseServerClient.mockResolvedValue(client);

    await reissueShareLinkAction(planId);

    const inserted = calls.share_links.insert.mock.calls[0][0] as { token: string };
    expect(inserted.token).not.toBe(planId);
    expect(inserted.token.length).toBeGreaterThan(20);
  });
});

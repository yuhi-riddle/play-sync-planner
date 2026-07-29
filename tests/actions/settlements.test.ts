import { beforeEach, describe, expect, it, vi } from "vitest";

const { createSupabaseAdminClient, createSupabaseServerClient, getCurrentUserId, redirect, revalidatePath } = vi.hoisted(() => ({
  createSupabaseAdminClient: vi.fn(),
  createSupabaseServerClient: vi.fn(),
  getCurrentUserId: vi.fn(),
  redirect: vi.fn(),
  revalidatePath: vi.fn()
}));

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("next/navigation", () => ({
  redirect,
  unstable_rethrow: (cause: unknown) => {
    if (cause instanceof Error && cause.message.startsWith("NEXT_REDIRECT")) {
      throw cause;
    }
  }
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseAdminClient,
  createSupabaseServerClient,
  getCurrentUserId
}));

import { createExpenseAction, deleteExpenseAction, recordPublicSettlementPaymentAction, updateExpenseAction } from "@/lib/actions/settlements";

type MockResult = { data?: unknown; error?: unknown };
type RecordedCall = { method: string; args: unknown[] };

/** thenable + どのメソッドも呼び出しを記録しつつ同じ結果に解決する、テーブル横断で使うクエリビルダーモック。 */
function chainable(result: MockResult, calls?: RecordedCall[]) {
  const proxy: unknown = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === "then") {
          return (resolve: (value: unknown) => void) => resolve(result);
        }
        if (prop === "single" || prop === "maybeSingle") {
          return () => Promise.resolve(result);
        }
        return (...args: unknown[]) => {
          calls?.push({ method: String(prop), args });
          return proxy;
        };
      }
    }
  );
  return proxy;
}

/** テーブルごとに呼び出し順で結果(と任意で呼び出し記録)を返すクライアントのモック。 */
function tableSequenceClient(responses: Record<string, Array<{ result: MockResult; calls?: RecordedCall[] }>>) {
  const callIndex: Record<string, number> = {};
  const from = vi.fn((table: string) => {
    const index = callIndex[table] ?? 0;
    callIndex[table] = index + 1;
    const entry = responses[table]?.[index] ?? { result: { data: null, error: null } };
    return chainable(entry.result, entry.calls);
  });
  return { from };
}

const userId = "11111111-1111-4111-8111-111111111111";
const planId = "22222222-2222-4222-8222-222222222222";
const expenseId = "33333333-3333-4333-8333-333333333333";
const otherParticipantId = "44444444-4444-4444-8444-444444444444";

function planOwnerClient() {
  const insertCalls: string[] = [];
  const updateCalls: string[] = [];

  const from = vi.fn((table: string) => {
    const builder: Record<string, unknown> = {};
    builder.select = vi.fn(() => builder);
    builder.eq = vi.fn(() => builder);
    builder.in = vi.fn(() => builder);
    builder.limit = vi.fn(() => builder);
    builder.insert = vi.fn(() => {
      insertCalls.push(table);
      return builder;
    });
    builder.update = vi.fn(() => {
      updateCalls.push(table);
      return builder;
    });
    builder.delete = vi.fn(() => builder);
    builder.single = vi.fn(async () => {
      if (table === "plans") {
        return {
          data: {
            id: planId,
            owner_user_id: userId,
            participants: [{ id: otherParticipantId, display_name: "参加者A" }]
          },
          error: null
        };
      }
      if (table === "expenses") {
        return {
          data: {
            id: expenseId,
            plan_id: planId,
            plans: { owner_user_id: userId, participants: [{ id: otherParticipantId, display_name: "参加者A" }] }
          },
          error: null
        };
      }
      return { data: null, error: null };
    });
    builder.then = (resolve: (value: { data: never[]; error: null }) => unknown) =>
      Promise.resolve({ data: [], error: null }).then(resolve);
    return builder;
  });

  return { client: { from }, insertCalls, updateCalls };
}

function expenseFormData(overrides: Record<string, string> = {}) {
  const formData = new FormData();
  formData.set("title", "チケット代");
  formData.set("payer_participant_id", otherParticipantId);
  formData.set("amount", "1000");
  formData.set("split_mode", "equal");
  formData.set("split_participant_ids", otherParticipantId);
  for (const [key, value] of Object.entries(overrides)) {
    formData.set(key, value);
  }
  return formData;
}

describe("createExpenseAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUserId.mockResolvedValue(userId);
  });

  it("不正な入力はDBに触れずエラーを返す(例外を投げない)", async () => {
    const { client, insertCalls } = planOwnerClient();
    createSupabaseServerClient.mockResolvedValue(client);

    const result = await createExpenseAction(planId, { status: "idle" }, new FormData());

    expect(result.status).toBe("error");
    expect(typeof result.message).toBe("string");
    expect(insertCalls).toEqual([]);
    expect(redirect).not.toHaveBeenCalled();
  });

  it("参加者以外を支払った人に指定すると、例外を投げずにエラーを返す", async () => {
    const { client, insertCalls } = planOwnerClient();
    createSupabaseServerClient.mockResolvedValue(client);

    const result = await createExpenseAction(
      planId,
      { status: "idle" },
      expenseFormData({ payer_participant_id: "not-a-participant" })
    );

    expect(result).toEqual({ status: "error", message: "支払った人はこのイベントの参加者から選んでください" });
    expect(insertCalls).toEqual([]);
  });
});

describe("updateExpenseAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUserId.mockResolvedValue(userId);
  });

  it("不正な入力はDBに触れずエラーを返す(例外を投げない)", async () => {
    const { client, updateCalls } = planOwnerClient();
    createSupabaseServerClient.mockResolvedValue(client);

    const result = await updateExpenseAction(expenseId, { status: "idle" }, new FormData());

    expect(result.status).toBe("error");
    expect(typeof result.message).toBe("string");
    expect(updateCalls).toEqual([]);
    expect(redirect).not.toHaveBeenCalled();
  });
});

describe("recomputeSettlements(deleteExpenseAction経由)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUserId.mockResolvedValue(userId);
  });

  it("支払い済み・確認済みのsettlementsは消さず、未払い分だけをdeleteの対象にする", async () => {
    const settlementsDeleteCalls: RecordedCall[] = [];
    const client = tableSequenceClient({
      expenses: [
        {
          result: {
            data: {
              id: expenseId,
              plan_id: planId,
              plans: { owner_user_id: userId, participants: [{ id: otherParticipantId, display_name: "参加者A" }] }
            },
            error: null
          }
        },
        { result: { error: null } },
        { result: { data: [], error: null } }
      ],
      settlement_payments: [{ result: { data: [], error: null } }],
      settlements: [{ result: { data: [], error: null } }, { result: { data: null, error: null }, calls: settlementsDeleteCalls }],
      plans: [{ result: { data: null, error: null } }]
    });
    createSupabaseServerClient.mockResolvedValue(client);

    await deleteExpenseAction(expenseId);

    expect(settlementsDeleteCalls).toContainEqual({ method: "delete", args: [] });
    expect(settlementsDeleteCalls).toContainEqual({ method: "eq", args: ["plan_id", planId] });
    expect(settlementsDeleteCalls).toContainEqual({ method: "eq", args: ["status", "unpaid"] });
  });
});

describe("assertExpenseCanChange(deleteExpenseAction経由)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUserId.mockResolvedValue(userId);
  });

  it("清算支払いが始まっている場合は立替の削除を拒否する", async () => {
    const client = tableSequenceClient({
      expenses: [
        {
          result: {
            data: { id: expenseId, plan_id: planId, plans: { owner_user_id: userId, participants: [] } },
            error: null
          }
        }
      ],
      settlement_payments: [{ result: { data: [{ id: "payment-1" }], error: null } }]
    });
    createSupabaseServerClient.mockResolvedValue(client);

    await expect(deleteExpenseAction(expenseId)).rejects.toThrow(
      "清算支払いが始まっているため、立替支払いは変更できません"
    );
  });
});

describe("recordPublicSettlementPaymentAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("トークンの計画に属さないsettlementIdを拒否する(唯一の未認証書き込み経路)", async () => {
    const admin = tableSequenceClient({
      share_links: [{ result: { data: { plan_id: planId, status: "open" }, error: null } }],
      settlements: [{ result: { data: null, error: { message: "not found" } } }]
    });
    createSupabaseAdminClient.mockReturnValue(admin);

    const formData = new FormData();
    formData.set("amount", "1000");

    await expect(
      recordPublicSettlementPaymentAction("token-1", "settlement-not-in-this-plan", formData)
    ).rejects.toThrow("清算内容が見つかりません");
  });
});

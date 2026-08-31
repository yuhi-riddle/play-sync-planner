import { beforeEach, describe, expect, it, vi } from "vitest";

const { createSupabaseAdminClient, createSupabaseServerClient, getCurrentActiveUserId, redirect, revalidatePath } = vi.hoisted(() => ({
  createSupabaseAdminClient: vi.fn(),
  createSupabaseServerClient: vi.fn(),
  getCurrentActiveUserId: vi.fn(),
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
  getCurrentActiveUserId
}));

import {
  confirmSettlementPaymentAction,
  createExpenseAction,
  deleteExpenseAction,
  recordPublicSettlementPaymentAction,
  recordSettlementPaymentAction,
  updateExpenseAction,
  updateParticipantSettlementPaymentMethodAction,
  updatePublicParticipantSettlementPaymentMethodAction
} from "@/lib/actions/settlement/settlements";

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
  // consume_authenticated_rate_limit は既定で許可（{ok:true}）を返す。個別のテストで
  // レート制限そのものを検証したいときは、返り値のrpcモックを上書きする。
  // mark_plan_settling / record_authenticated_security_audit は結果を読んでいないので null のままでよい。
  const rpc = vi.fn((functionName: string): Promise<{ data: unknown; error: unknown }> => {
    if (functionName === "consume_authenticated_rate_limit") {
      return Promise.resolve({ data: { ok: true }, error: null });
    }
    return Promise.resolve({ data: null, error: null });
  });
  return { from, rpc };
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
    getCurrentActiveUserId.mockResolvedValue(userId);
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
    getCurrentActiveUserId.mockResolvedValue(userId);
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
    getCurrentActiveUserId.mockResolvedValue(userId);
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
    getCurrentActiveUserId.mockResolvedValue(userId);
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
    getCurrentActiveUserId.mockResolvedValue(userId);
  });

  function paymentFormData() {
    const formData = new FormData();
    formData.set("amount", "1000");
    return formData;
  }

  /** 共有リンクと清算は正常。呼び出し者の参加者行だけ差し替える。 */
  function publicPaymentClient(callerParticipant: Record<string, unknown> | null) {
    return tableSequenceClient({
      share_links: [{ result: { data: { plan_id: planId, status: "open" }, error: null } }],
      settlements: [
        {
          result: {
            data: {
              id: "settlement-1",
              plan_id: planId,
              from_participant_id: otherParticipantId,
              amount: 1000,
              settlement_payments: []
            },
            error: null
          }
        }
      ],
      participants: [{ result: { data: callerParticipant, error: null } }]
    });
  }

  it("トークンの計画に属さないsettlementIdを拒否する(トークンのみで書き込める経路の一つ)", async () => {
    const admin = tableSequenceClient({
      share_links: [{ result: { data: { plan_id: planId, status: "open" }, error: null } }],
      settlements: [{ result: { data: null, error: { message: "not found" } } }]
    });
    createSupabaseServerClient.mockResolvedValue(admin);

    await expect(
      recordPublicSettlementPaymentAction("token-1", "settlement-not-in-this-plan", paymentFormData())
    ).rejects.toThrow("清算内容が見つかりません");
  });

  // トークンは対象を探すためだけ。持っているだけで支払い記録を作れてはいけない。
  it("未ログインならDBに触れずに拒否する", async () => {
    getCurrentActiveUserId.mockResolvedValue(null);
    const admin = publicPaymentClient({ id: otherParticipantId });
    createSupabaseServerClient.mockResolvedValue(admin);

    await expect(recordPublicSettlementPaymentAction("token-1", "settlement-1", paymentFormData())).rejects.toThrow(
      "ログインが必要です"
    );
    expect(admin.from).not.toHaveBeenCalled();
  });

  /*
   * 払ったのは from_participant。別人が記録できると、払っていない清算が
   * 支払い済みになり、受け取る側は督促の手がかりを失う。
   */
  it("支払う本人でなければ記録させない", async () => {
    createSupabaseServerClient.mockResolvedValue(publicPaymentClient({ id: "participant-someone-else" }));

    await expect(recordPublicSettlementPaymentAction("token-1", "settlement-1", paymentFormData())).rejects.toThrow(
      "支払う本人だけが記録できます"
    );
  });

  it("参加者ですらなければ記録させない", async () => {
    createSupabaseServerClient.mockResolvedValue(publicPaymentClient(null));

    await expect(recordPublicSettlementPaymentAction("token-1", "settlement-1", paymentFormData())).rejects.toThrow(
      "この清算の参加者ではありません"
    );
  });
});

describe("updateParticipantSettlementPaymentMethodAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentActiveUserId.mockResolvedValue(userId);
  });

  it("呼び出し者本人ではない参加者への設定を拒否する", async () => {
    const admin = tableSequenceClient({
      participants: [
        { result: { data: { id: otherParticipantId, plan_id: planId, user_id: "another-user" }, error: null } }
      ]
    });
    createSupabaseAdminClient.mockReturnValue(admin);

    const formData = new FormData();
    formData.set("settlement_payment_method", "PayPay");

    await expect(
      updateParticipantSettlementPaymentMethodAction(otherParticipantId, formData)
    ).rejects.toThrow("本人だけが支払い方法を設定できます");
  });
});

describe("confirmSettlementPaymentAction", () => {
  const paymentId = "payment-1";

  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentActiveUserId.mockResolvedValue(userId);
  });

  function confirmableAdminClient() {
    return tableSequenceClient({
      settlement_payments: [
        {
          result: {
            data: {
              id: paymentId,
              settlement_id: "settlement-1",
              settlements: {
                id: "settlement-1",
                plan_id: planId,
                amount: 1000,
                to_participant: { user_id: userId },
                settlement_payments: [{ id: paymentId, amount: 1000, confirmed_at: null }],
                plans: { owner_user_id: otherParticipantId }
              }
            },
            error: null
          }
        }
      ]
    });
  }

  it("consumes the rate limit via the session client before touching the admin client", async () => {
    const sessionClient = tableSequenceClient({});
    createSupabaseServerClient.mockResolvedValue(sessionClient);
    const admin = confirmableAdminClient();
    createSupabaseAdminClient.mockReturnValue(admin);

    await confirmSettlementPaymentAction(paymentId);

    expect(sessionClient.rpc).toHaveBeenCalledWith("consume_authenticated_rate_limit", {
      p_operation: "settlement_update"
    });
    expect(admin.from).toHaveBeenCalledWith("settlement_payments");
  });

  it("rejects when the current user is not the receiving participant", async () => {
    createSupabaseServerClient.mockResolvedValue(tableSequenceClient({}));
    createSupabaseAdminClient.mockReturnValue(
      tableSequenceClient({
        settlement_payments: [
          {
            result: {
              data: {
                id: paymentId,
                settlement_id: "settlement-1",
                settlements: {
                  id: "settlement-1",
                  plan_id: planId,
                  amount: 1000,
                  to_participant: { user_id: "someone-else" },
                  settlement_payments: [{ id: paymentId, amount: 1000, confirmed_at: null }],
                  plans: { owner_user_id: otherParticipantId }
                }
              },
              error: null
            }
          }
        ]
      })
    );

    await expect(confirmSettlementPaymentAction(paymentId)).rejects.toThrow("主催者だけが受け取り確認できます");
  });

  it("stops before the admin client when the rate limit is exceeded", async () => {
    const sessionClient = tableSequenceClient({});
    sessionClient.rpc.mockResolvedValue({ data: { ok: false, error: "rate_limited", retry_after_seconds: 12 }, error: null });
    createSupabaseServerClient.mockResolvedValue(sessionClient);
    const admin = confirmableAdminClient();
    createSupabaseAdminClient.mockReturnValue(admin);

    await expect(confirmSettlementPaymentAction(paymentId)).rejects.toThrow(
      "操作が多すぎます。しばらく待ってから再度お試しください。"
    );
    expect(admin.from).not.toHaveBeenCalled();
  });

  it("records a success audit entry via the session client after confirming", async () => {
    const sessionClient = tableSequenceClient({});
    createSupabaseServerClient.mockResolvedValue(sessionClient);
    createSupabaseAdminClient.mockReturnValue(confirmableAdminClient());

    await confirmSettlementPaymentAction(paymentId);

    expect(sessionClient.rpc).toHaveBeenCalledWith("record_authenticated_security_audit", {
      p_operation: "settlement_payment_confirm",
      p_target_type: "payment",
      p_target_id: paymentId,
      p_outcome: "success"
    });
  });
});

describe("updatePublicParticipantSettlementPaymentMethodAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentActiveUserId.mockResolvedValue(userId);
  });

  /*
   * 支払い先は、その人の PayPay 等の受け取り先。他人が書き換えられると、
   * 攻撃者の口座へ振り込ませられる。本人以外は触らせない。
   */
  it("自分以外の参加者の支払い先は設定させない", async () => {
    const admin = tableSequenceClient({
      share_links: [{ result: { data: { plan_id: planId, status: "open" }, error: null } }],
      participants: [
        { result: { data: { id: otherParticipantId, plan_id: planId, user_id: "another-user" }, error: null } }
      ]
    });
    createSupabaseServerClient.mockResolvedValue(admin);

    const formData = new FormData();
    formData.set("settlement_payment_method", "PayPay");

    await expect(
      updatePublicParticipantSettlementPaymentMethodAction("token-1", otherParticipantId, formData)
    ).rejects.toThrow("本人だけが支払い方法を設定できます");
  });

  it("未ログインならDBに触れずに拒否する", async () => {
    getCurrentActiveUserId.mockResolvedValue(null);
    const admin = tableSequenceClient({
      share_links: [{ result: { data: { plan_id: planId, status: "open" }, error: null } }]
    });
    createSupabaseServerClient.mockResolvedValue(admin);

    const formData = new FormData();
    formData.set("settlement_payment_method", "PayPay");

    await expect(
      updatePublicParticipantSettlementPaymentMethodAction("token-1", otherParticipantId, formData)
    ).rejects.toThrow("ログインが必要です");
    expect(admin.from).not.toHaveBeenCalled();
  });

  it("無効化された共有リンクからの設定を拒否する", async () => {
    const admin = tableSequenceClient({
      share_links: [{ result: { data: { plan_id: planId, status: "revoked" }, error: null } }]
    });
    createSupabaseServerClient.mockResolvedValue(admin);

    const formData = new FormData();
    formData.set("settlement_payment_method", "PayPay");

    await expect(
      updatePublicParticipantSettlementPaymentMethodAction("token-1", otherParticipantId, formData)
    ).rejects.toThrow("この共有リンクは無効化されています。主催者に新しいリンクを確認してください");
  });

  it("別の計画に属するparticipantIdを拒否する", async () => {
    const admin = tableSequenceClient({
      share_links: [{ result: { data: { plan_id: planId, status: "open" }, error: null } }],
      participants: [{ result: { data: null, error: { message: "not found" } } }]
    });
    createSupabaseServerClient.mockResolvedValue(admin);

    const formData = new FormData();
    formData.set("settlement_payment_method", "PayPay");

    await expect(
      updatePublicParticipantSettlementPaymentMethodAction("token-1", "participant-in-other-plan", formData)
    ).rejects.toThrow("参加者が見つかりません");
  });
});

describe("recordSettlementPaymentAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentActiveUserId.mockResolvedValue(userId);
  });

  it("支払った人(from_participant)のsettlement_payment_methodをsettlement_paymentsに複写する", async () => {
    const settlementPaymentsInsertCalls: RecordedCall[] = [];
    const server = tableSequenceClient({
      settlements: [
        {
          result: {
            data: {
              id: "settlement-1",
              plan_id: planId,
              from_participant_id: otherParticipantId,
              amount: 1000,
              settlement_payments: [],
              plans: { owner_user_id: userId }
            },
            error: null
          }
        },
        { result: { data: null, error: null } }
      ],
      participants: [{ result: { data: { settlement_payment_method: "PayPay" }, error: null } }],
      settlement_payments: [{ result: { data: { id: "payment-1" }, error: null }, calls: settlementPaymentsInsertCalls }]
    });
    createSupabaseServerClient.mockResolvedValue(server);
    createSupabaseAdminClient.mockReturnValue(tableSequenceClient({}));

    const formData = new FormData();
    formData.set("amount", "1000");

    await recordSettlementPaymentAction("settlement-1", formData);

    const insertCall = settlementPaymentsInsertCalls.find((call) => call.method === "insert");
    expect(insertCall?.args[0]).toMatchObject({ payment_method: "PayPay" });
  });
});

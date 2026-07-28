import { beforeEach, describe, expect, it, vi } from "vitest";

const { createSupabaseServerClient, getCurrentUserId, redirect, revalidatePath } = vi.hoisted(() => ({
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
  createSupabaseAdminClient: vi.fn(),
  createSupabaseServerClient,
  getCurrentUserId
}));

import { createExpenseAction, updateExpenseAction } from "@/lib/actions/settlements";

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

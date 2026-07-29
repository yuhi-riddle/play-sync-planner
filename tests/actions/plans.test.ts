import { beforeEach, describe, expect, it, vi } from "vitest";

const { createSupabaseServerClient, getCurrentUserId, redirect, revalidatePath } = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
  getCurrentUserId: vi.fn(),
  redirect: vi.fn(),
  revalidatePath: vi.fn()
}));

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseAdminClient: vi.fn(),
  createSupabaseServerClient,
  getCurrentUserId
}));

import { createPlanAction, updatePlanAction } from "@/lib/actions/plans";

const userId = "11111111-1111-4111-8111-111111111111";
const eventId = "22222222-2222-4222-8222-222222222222";
const planId = "33333333-3333-4333-8333-333333333333";

function noopSupabaseClient() {
  const insertCalls: string[] = [];
  const from = vi.fn((table: string) => {
    const builder: Record<string, unknown> = {};
    builder.select = vi.fn(() => builder);
    builder.eq = vi.fn(() => builder);
    builder.insert = vi.fn(() => {
      insertCalls.push(table);
      return builder;
    });
    builder.update = vi.fn(() => builder);
    builder.single = vi.fn(async () => ({ data: null, error: null }));
    builder.then = (resolve: (value: { data: never[]; error: null }) => unknown) =>
      Promise.resolve({ data: [], error: null }).then(resolve);
    return builder;
  });

  return { client: { from }, insertCalls };
}

describe("createPlanAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUserId.mockResolvedValue(userId);
  });

  it("不正な入力はDBに触れずエラーを返す(例外を投げない)", async () => {
    const { client, insertCalls } = noopSupabaseClient();
    createSupabaseServerClient.mockResolvedValue(client);

    const result = await createPlanAction(eventId, { status: "idle" }, new FormData());

    expect(result.status).toBe("error");
    expect(typeof result.message).toBe("string");
    expect(insertCalls).toEqual([]);
    expect(redirect).not.toHaveBeenCalled();
  });
});

describe("updatePlanAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUserId.mockResolvedValue(userId);
  });

  it("不正な入力はDBに触れずエラーを返す(例外を投げない)", async () => {
    const { client, insertCalls } = noopSupabaseClient();
    createSupabaseServerClient.mockResolvedValue(client);

    const result = await updatePlanAction(planId, { status: "idle" }, new FormData());

    expect(result.status).toBe("error");
    expect(typeof result.message).toBe("string");
    expect(insertCalls).toEqual([]);
    expect(redirect).not.toHaveBeenCalled();
  });
});

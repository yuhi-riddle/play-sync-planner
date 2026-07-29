import { beforeEach, describe, expect, it, vi } from "vitest";

const { createSupabaseAdminClient, createSupabaseServerClient, revalidatePath, redirect } = vi.hoisted(() => ({
  createSupabaseAdminClient: vi.fn(),
  createSupabaseServerClient: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn()
}));

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseAdminClient,
  createSupabaseServerClient
}));

import { submitAvailabilityAnswersAction } from "@/lib/actions/answers";

/** thenable + どのメソッドチェーンでも同じ最終結果を返す最小のクエリビルダーモック。 */
function chainable(result: { data?: unknown; error?: unknown }) {
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
        return () => proxy;
      }
    }
  );
  return proxy;
}

/** テーブルごとに呼び出し順で結果を返す admin クライアントのモック。 */
function adminClient(responses: Record<string, Array<{ data?: unknown; error?: unknown }>>) {
  const callIndex: Record<string, number> = {};
  const from = vi.fn((table: string) => {
    const index = callIndex[table] ?? 0;
    callIndex[table] = index + 1;
    const result = responses[table]?.[index] ?? { data: null, error: null };
    return chainable(result);
  });
  return { from };
}

function answerFormData(candidateId: string) {
  const formData = new FormData();
  formData.set("displayName", "ゆうやん");
  formData.set(`answer:${candidateId}`, "yes");
  return formData;
}

describe("submitAvailabilityAnswersAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createSupabaseServerClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) }
    });
  });

  it("回答送信後、主催者の日程調整ページとホームを再検証する", async () => {
    createSupabaseAdminClient.mockReturnValue(
      adminClient({
        share_links: [
          {
            data: {
              plan_id: "plan-1",
              expires_at: null,
              status: "open",
              plans: {
                id: "plan-1",
                title: "夏の集まり",
                owner_user_id: "owner-1",
                answer_deadline_at: null,
                events: { title: "夏祭り" }
              }
            },
            error: null
          }
        ],
        candidate_dates: [{ data: [{ id: "candidate-1", plan_id: "plan-1" }], error: null }],
        participants: [
          { data: [], error: null },
          { data: { id: "participant-1" }, error: null },
          { data: null, error: null }
        ],
        availability_answers: [{ data: null, error: null }],
        notifications: [{ data: null, error: null }]
      })
    );

    await submitAvailabilityAnswersAction("token-1", answerFormData("candidate-1"));

    expect(revalidatePath).toHaveBeenCalledWith("/");
    expect(revalidatePath).toHaveBeenCalledWith("/plans/plan-1");
    expect(redirect).toHaveBeenCalledWith("/s/token-1/answer/complete");
  });
});

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

import { submitAvailabilityAnswersAction } from "@/lib/actions/plan/answers";

/** thenable + どのメソッドチェーンでも同じ最終結果を返す最小のクエリビルダーモック。 */
function chainable(result: { data?: unknown; error?: unknown }, onEq: (args: unknown[]) => void) {
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
        if (prop === "eq") {
          return (...args: unknown[]) => {
            onEq(args);
            return proxy;
          };
        }
        return () => proxy;
      }
    }
  );
  return proxy;
}

/** テーブルごとに呼び出し順で結果を返す admin クライアントのモック。何で絞ったかも記録する。 */
function adminClient(responses: Record<string, Array<{ data?: unknown; error?: unknown }>>) {
  const callIndex: Record<string, number> = {};
  const eqCalls: Record<string, unknown[][]> = {};
  const from = vi.fn((table: string) => {
    const index = callIndex[table] ?? 0;
    callIndex[table] = index + 1;
    const result = responses[table]?.[index] ?? { data: null, error: null };
    return chainable(result, (args) => {
      (eqCalls[table] ??= []).push(args);
    });
  });
  return Object.assign({ from }, { eqCalls });
}

function answerFormData(candidateId: string) {
  const formData = new FormData();
  formData.set(`answer:${candidateId}`, "yes");
  return formData;
}

const viewerId = "user-viewer";
const viewerParticipant = { id: "participant-1", display_name: "ゆうやん", user_id: viewerId };

function answerAdminClient(participants: Array<Record<string, unknown>>) {
  return adminClient({
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
    participants: [{ data: participants, error: null }, { data: null, error: null }],
    availability_answers: [{ data: null, error: null }],
    notifications: [{ data: null, error: null }]
  });
}

describe("submitAvailabilityAnswersAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createSupabaseServerClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: viewerId } } }) }
    });
  });

  it("回答送信後、主催者の日程調整ページとホームを再検証する", async () => {
    createSupabaseAdminClient.mockReturnValue(answerAdminClient([viewerParticipant]));

    await submitAvailabilityAnswersAction("token-1", answerFormData("candidate-1"));

    expect(revalidatePath).toHaveBeenCalledWith("/");
    expect(revalidatePath).toHaveBeenCalledWith("/plans/plan-1");
    expect(redirect).toHaveBeenCalledWith("/s/token-1/answer/complete");
  });

  it("参加者を探す範囲を、このリンクの日程調整に絞る", async () => {
    // 絞らないと、同じ人が別の日程調整で持っている参加者行が選ばれて、そちらを上書きする
    const admin = answerAdminClient([viewerParticipant]);
    createSupabaseAdminClient.mockReturnValue(admin);

    await submitAvailabilityAnswersAction("token-1", answerFormData("candidate-1"));

    expect(admin.eqCalls.participants).toContainEqual(["plan_id", "plan-1"]);
  });

  // トークンは対象を探すためだけ。持っているだけで書き込めてはいけない。
  it("未ログインならDBに触れずログインへ送る", async () => {
    createSupabaseServerClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) }
    });
    redirect.mockImplementationOnce(() => {
      throw new Error("NEXT_REDIRECT");
    });
    const admin = answerAdminClient([viewerParticipant]);
    createSupabaseAdminClient.mockReturnValue(admin);

    await expect(submitAvailabilityAnswersAction("token-1", answerFormData("candidate-1"))).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/login?next=/s/token-1/answer");
    expect(admin.from).not.toHaveBeenCalled();
  });

  it("この日程調整の参加者でなければ書き込ませない", async () => {
    const admin = answerAdminClient([{ id: "participant-9", display_name: "ほかの人", user_id: "user-other" }]);
    createSupabaseAdminClient.mockReturnValue(admin);

    await expect(submitAvailabilityAnswersAction("token-1", answerFormData("candidate-1"))).rejects.toThrow(
      "この日程調整の参加者ではありません"
    );
    expect(admin.from).not.toHaveBeenCalledWith("availability_answers");
  });

  it("user_id の無い参加者は、名前が同じでも本人扱いしない", async () => {
    const admin = answerAdminClient([{ id: "participant-2", display_name: "ゆうやん", user_id: null }]);
    createSupabaseAdminClient.mockReturnValue(admin);

    await expect(submitAvailabilityAnswersAction("token-1", answerFormData("candidate-1"))).rejects.toThrow(
      "この日程調整の参加者ではありません"
    );
  });
});

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

/** テーブルごとに呼び出し順で結果を返すクライアントのモック。何で絞ったかも記録する。 */
function tableClient(responses: Record<string, Array<{ data?: unknown; error?: unknown }>>) {
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

/*
 * service role をやめたので、アクションはログイン中の本人のクライアント1つで読み書きする。
 * auth と from を同じ入れ物に持たせる（通知の書き込みだけは別の admin クライアント）。
 */
function answerClient(participants: Array<Record<string, unknown>>, userId: string | null = viewerId) {
  const client = tableClient({
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
    availability_answers: [{ data: null, error: null }]
  });

  return Object.assign(client, {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: userId ? { id: userId } : null } }) }
  });
}

function mockClient(participants: Array<Record<string, unknown>>, userId: string | null = viewerId) {
  const client = answerClient(participants, userId);
  createSupabaseServerClient.mockResolvedValue(client);
  return client;
}

describe("submitAvailabilityAnswersAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 通知は主催者宛なので回答者の権限では書けない。そこだけ service role。
    createSupabaseAdminClient.mockReturnValue(tableClient({ notifications: [{ data: null, error: null }] }));
  });

  it("回答送信後、主催者の日程調整ページとホームを再検証する", async () => {
    mockClient([viewerParticipant]);

    await submitAvailabilityAnswersAction("token-1", answerFormData("candidate-1"));

    expect(revalidatePath).toHaveBeenCalledWith("/");
    expect(revalidatePath).toHaveBeenCalledWith("/plans/plan-1");
    expect(redirect).toHaveBeenCalledWith("/s/token-1/answer/complete");
  });

  it("参加者を探す範囲を、このリンクの日程調整に絞る", async () => {
    // 絞らないと、同じ人が別の日程調整で持っている参加者行が選ばれて、そちらを上書きする
    const client = mockClient([viewerParticipant]);

    await submitAvailabilityAnswersAction("token-1", answerFormData("candidate-1"));

    expect(client.eqCalls.participants).toContainEqual(["plan_id", "plan-1"]);
  });

  /*
   * 回答者本人のクライアントで読み書きする。service role のままだと、
   * アプリ側の判定を1つ間違えただけでRLSの守りが効かない。
   */
  it("本人のクライアントで読み書きし、通知だけ service role を使う", async () => {
    const client = mockClient([viewerParticipant]);

    await submitAvailabilityAnswersAction("token-1", answerFormData("candidate-1"));

    expect(client.from).toHaveBeenCalledWith("share_links");
    expect(client.from).toHaveBeenCalledWith("availability_answers");
    const admin = createSupabaseAdminClient.mock.results[0]?.value as ReturnType<typeof tableClient>;
    expect(admin.from).toHaveBeenCalledWith("notifications");
    expect(admin.from).not.toHaveBeenCalledWith("availability_answers");
  });

  // トークンは対象を探すためだけ。持っているだけで書き込めてはいけない。
  it("未ログインならDBに触れずログインへ送る", async () => {
    redirect.mockImplementationOnce(() => {
      throw new Error("NEXT_REDIRECT");
    });
    const client = mockClient([viewerParticipant], null);

    await expect(submitAvailabilityAnswersAction("token-1", answerFormData("candidate-1"))).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/login?next=/s/token-1/answer");
    expect(client.from).not.toHaveBeenCalled();
  });

  it("この日程調整の参加者でなければ書き込ませない", async () => {
    const client = mockClient([{ id: "participant-9", display_name: "ほかの人", user_id: "user-other" }]);

    await expect(submitAvailabilityAnswersAction("token-1", answerFormData("candidate-1"))).rejects.toThrow(
      "この日程調整の参加者ではありません"
    );
    expect(client.from).not.toHaveBeenCalledWith("availability_answers");
  });

  it("user_id の無い参加者は、名前が同じでも本人扱いしない", async () => {
    mockClient([{ id: "participant-2", display_name: "ゆうやん", user_id: null }]);

    await expect(submitAvailabilityAnswersAction("token-1", answerFormData("candidate-1"))).rejects.toThrow(
      "この日程調整の参加者ではありません"
    );
  });
});

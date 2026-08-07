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

import { loadPreviousAnswersAction } from "@/lib/actions/plan/answers";

type QueryResult = { data?: unknown; error?: unknown };

/**
 * テーブルごとに呼び出し順で結果を返す admin クライアントのモック。
 * どのテーブルに何で絞ったかを見たいので eq だけ記録する。
 */
function adminClient(responses: Record<string, QueryResult[]>) {
  const eqCalls: Record<string, unknown[][]> = {};
  const callIndex: Record<string, number> = {};

  const from = vi.fn((table: string) => {
    const index = callIndex[table] ?? 0;
    callIndex[table] = index + 1;
    const result = responses[table]?.[index] ?? { data: null, error: null };

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
              (eqCalls[table] ??= []).push(args);
              return proxy;
            };
          }
          return () => proxy;
        }
      }
    );

    return proxy;
  });

  return { client: { from }, from, eqCalls };
}

const openLink = {
  data: { plan_id: "plan-1", expires_at: null, status: "open", plans: { answer_deadline_at: null } },
  error: null
};

const guestParticipant = { id: "participant-1", display_name: "たろう", user_id: null };

function signedOut() {
  createSupabaseServerClient.mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) }
  });
}

function signedInAs(userId: string) {
  createSupabaseServerClient.mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: userId } } }) }
  });
}

describe("loadPreviousAnswersAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    signedOut();
  });

  it("同じ名前で回答済みなら、前回の内容を返す", async () => {
    createSupabaseAdminClient.mockReturnValue(
      adminClient({
        share_links: [openLink],
        participants: [{ data: [guestParticipant], error: null }],
        availability_answers: [
          {
            data: [
              { candidate_date_id: "date-1", answer: "yes", comment: "昼からなら" },
              { candidate_date_id: "date-2", answer: "unanswered", comment: "" }
            ],
            error: null
          }
        ]
      }).client
    );

    const result = await loadPreviousAnswersAction("token-1", "たろう");

    expect(result).toEqual({
      found: true,
      participantName: "たろう",
      answers: { "date-1": { answer: "yes", comment: "昼からなら" } }
    });
  });

  it("参加者は plan_id で、回答は participant_id で絞る", async () => {
    const admin = adminClient({
      share_links: [openLink],
      participants: [{ data: [guestParticipant], error: null }],
      availability_answers: [{ data: [{ candidate_date_id: "date-1", answer: "yes", comment: "" }], error: null }]
    });
    createSupabaseAdminClient.mockReturnValue(admin.client);

    await loadPreviousAnswersAction("token-1", "たろう");

    expect(admin.eqCalls.share_links).toContainEqual(["token", "token-1"]);
    expect(admin.eqCalls.share_links).toContainEqual(["purpose", "answer"]);
    // ここが抜けると、別の日程調整の同名参加者の回答が出る
    expect(admin.eqCalls.participants).toContainEqual(["plan_id", "plan-1"]);
    expect(admin.eqCalls.availability_answers).toContainEqual(["participant_id", "participant-1"]);
  });

  it("ログインしていれば、名前が違ってもアカウントで引く", async () => {
    // 送信側も user_id を名前より優先する。ここがずれると、
    // 画面に出ている回答と上書きされる回答が別人になる
    signedInAs("user-1");
    createSupabaseAdminClient.mockReturnValue(
      adminClient({
        share_links: [openLink],
        participants: [{ data: [{ id: "participant-9", display_name: "たろう", user_id: "user-1" }], error: null }],
        availability_answers: [{ data: [{ candidate_date_id: "date-1", answer: "maybe", comment: "" }], error: null }]
      }).client
    );

    const result = await loadPreviousAnswersAction("token-1", "べつのなまえ");

    expect(result).toEqual({
      found: true,
      participantName: "たろう",
      answers: { "date-1": { answer: "maybe", comment: "" } }
    });
  });

  it("初めての人には何も返さない", async () => {
    const admin = adminClient({
      share_links: [openLink],
      participants: [{ data: [guestParticipant], error: null }],
      // 誰にも紐づかない問い合わせで他人の回答が返ってこないことも見る
      availability_answers: [{ data: [{ candidate_date_id: "date-1", answer: "yes", comment: "" }], error: null }]
    });
    createSupabaseAdminClient.mockReturnValue(admin.client);

    expect(await loadPreviousAnswersAction("token-1", "はなこ")).toEqual({ found: false });
    expect(admin.from).not.toHaveBeenCalledWith("availability_answers");
  });

  it("参加者はいても回答が無ければ返さない", async () => {
    createSupabaseAdminClient.mockReturnValue(
      adminClient({
        share_links: [openLink],
        participants: [{ data: [guestParticipant], error: null }],
        availability_answers: [{ data: [], error: null }]
      }).client
    );

    expect(await loadPreviousAnswersAction("token-1", "たろう")).toEqual({ found: false });
  });

  it("無効化されたリンクでは返さない", async () => {
    const admin = adminClient({
      share_links: [{ data: { ...openLink.data, status: "revoked" }, error: null }],
      participants: [{ data: [guestParticipant], error: null }],
      availability_answers: [{ data: [{ candidate_date_id: "date-1", answer: "yes", comment: "" }], error: null }]
    });
    createSupabaseAdminClient.mockReturnValue(admin.client);

    expect(await loadPreviousAnswersAction("token-1", "たろう")).toEqual({ found: false });
    expect(admin.from).not.toHaveBeenCalledWith("participants");
  });

  it("回答期限を過ぎていれば返さない", async () => {
    const admin = adminClient({
      share_links: [
        {
          data: { plan_id: "plan-1", expires_at: null, status: "open", plans: { answer_deadline_at: "2000-01-01T00:00:00Z" } },
          error: null
        }
      ],
      participants: [{ data: [guestParticipant], error: null }],
      availability_answers: [{ data: [{ candidate_date_id: "date-1", answer: "yes", comment: "" }], error: null }]
    });
    createSupabaseAdminClient.mockReturnValue(admin.client);

    expect(await loadPreviousAnswersAction("token-1", "たろう")).toEqual({ found: false });
    expect(admin.from).not.toHaveBeenCalledWith("participants");
  });

  it("共有リンクの有効期限を過ぎていれば返さない", async () => {
    // 期限延長は plans と share_links の両方を伸ばす。片方だけ見ると食い違う
    const admin = adminClient({
      share_links: [
        {
          data: { plan_id: "plan-1", expires_at: "2000-01-01T00:00:00Z", status: "open", plans: { answer_deadline_at: null } },
          error: null
        }
      ],
      participants: [{ data: [guestParticipant], error: null }],
      availability_answers: [{ data: [{ candidate_date_id: "date-1", answer: "yes", comment: "" }], error: null }]
    });
    createSupabaseAdminClient.mockReturnValue(admin.client);

    expect(await loadPreviousAnswersAction("token-1", "たろう")).toEqual({ found: false });
    expect(admin.from).not.toHaveBeenCalledWith("participants");
  });

  it("名前が空ならデータベースを見に行かない", async () => {
    const admin = adminClient({ share_links: [openLink] });
    createSupabaseAdminClient.mockReturnValue(admin.client);

    expect(await loadPreviousAnswersAction("token-1", "   ")).toEqual({ found: false });
    expect(createSupabaseAdminClient).not.toHaveBeenCalled();
  });

  it("リンクが見つからなければ返さない", async () => {
    createSupabaseAdminClient.mockReturnValue(
      adminClient({ share_links: [{ data: null, error: { message: "not found" } }] }).client
    );

    expect(await loadPreviousAnswersAction("token-1", "たろう")).toEqual({ found: false });
  });
});

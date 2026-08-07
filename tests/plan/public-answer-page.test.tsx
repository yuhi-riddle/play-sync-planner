import React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { createSupabaseServerClient, hasSupabaseEnv, redirect } = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
  hasSupabaseEnv: vi.fn().mockReturnValue(true),
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  })
}));

vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient,
  hasSupabaseEnv
}));
vi.mock("@/components/plan/answer-form", () => ({
  AnswerForm: (props: { participantName: string; initialAnswers?: Record<string, unknown> }) => (
    <form data-testid="answer-form" data-participant={props.participantName} data-previous={JSON.stringify(props.initialAnswers ?? {})} />
  )
}));

import PublicAnswerPage from "@/app/s/[token]/answer/page";

const viewerId = "user-viewer";

/*
 * ページは service role をやめ、ログイン中の本人のクライアント1つで読む。
 * だから auth と from を同じ入れ物に持たせる。share_links だけ .single() で取る。
 */
function loggedInClient({
  userId = viewerId,
  link,
  participants = [],
  previousAnswers = []
}: {
  userId?: string | null;
  link: Record<string, unknown> | null;
  participants?: Array<Record<string, unknown>>;
  previousAnswers?: Array<Record<string, unknown>>;
}) {
  const from = vi.fn((table: string) => {
    const builder: Record<string, unknown> = {};
    builder.select = vi.fn(() => builder);
    builder.eq = vi.fn(() => builder);
    builder.single = vi.fn(async () => ({ data: link, error: null }));
    builder.then = (resolve: (value: { data: unknown; error: null }) => unknown) => {
      const data = table === "participants" ? participants : table === "availability_answers" ? previousAnswers : [];
      return Promise.resolve({ data, error: null }).then(resolve);
    };
    return builder;
  });

  return {
    auth: { getUser: vi.fn(async () => ({ data: { user: userId ? { id: userId } : null } })) },
    from
  };
}

function mockClient(options: Parameters<typeof loggedInClient>[0]) {
  createSupabaseServerClient.mockResolvedValue(loggedInClient(options));
}

function linkRow(overrides: Record<string, unknown> = {}) {
  return {
    token: "token-1",
    expires_at: null,
    status: "open",
    plans: {
      id: "plan-1",
      title: "テスト調整",
      answer_deadline_at: "2099-01-01T00:00:00.000Z",
      events: { title: "テストイベント" },
      candidate_dates: [{ id: "candidate-1", start_at: "2099-01-05T10:00:00.000Z", end_at: null, is_all_day: false }]
    },
    ...overrides
  };
}

const viewerParticipant = { id: "participant-1", display_name: "たろう", user_id: viewerId };

function renderPage() {
  return PublicAnswerPage({ params: Promise.resolve({ token: "token-1" }) });
}

describe("公開回答ページ", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("React", React);
    hasSupabaseEnv.mockReturnValue(true);
  });

  it("参加者なら回答フォームを表示する", async () => {
    mockClient({ link: linkRow(), participants: [viewerParticipant] });

    render(await renderPage());

    expect(screen.getByTestId("answer-form")).toHaveAttribute("data-participant", "たろう");
  });

  it("無効化されたリンクなら回答フォームを出さず、無効化を伝える", async () => {
    mockClient({ link: linkRow({ status: "revoked" }), participants: [viewerParticipant] });

    render(await renderPage());

    expect(screen.queryByTestId("answer-form")).not.toBeInTheDocument();
    expect(screen.getByText(/無効化されています/)).toBeInTheDocument();
  });

  // 共有リンクは入口でしかない。トークンだけで中身を読めてはいけない。
  it("未ログインならログインへ送る", async () => {
    mockClient({ userId: null, link: linkRow(), participants: [viewerParticipant] });

    await expect(renderPage()).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/login?next=/s/token-1/answer");
  });

  it("参加者でないログインユーザーには候補日時も見せない", async () => {
    mockClient({
      link: linkRow(),
      participants: [{ id: "participant-9", display_name: "ほかの人", user_id: "user-other" }]
    });

    render(await renderPage());

    expect(screen.queryByTestId("answer-form")).not.toBeInTheDocument();
    expect(screen.getByText(/このリンクは開けません/)).toBeInTheDocument();
  });

  /*
   * RLSに切り替えたので、参加者でなければ share_links の行そのものが返らない。
   * トークンが実在するかどうかも答えないよう、同じ文言に寄せる。
   */
  it("RLSが行を返さないときも、リンクの有無を漏らさない", async () => {
    mockClient({ link: null });

    render(await renderPage());

    expect(screen.queryByTestId("answer-form")).not.toBeInTheDocument();
    expect(screen.getByText(/このリンクは開けません/)).toBeInTheDocument();
  });

  /*
   * 名前で照合していたころは、同じ名前の行を引き当てて他人の回答を読めた。
   * user_id が空の行は、名前が一致しても本人にしない。
   */
  it("user_id の無い参加者は、名前が同じでも本人扱いしない", async () => {
    mockClient({
      link: linkRow(),
      participants: [{ id: "participant-2", display_name: "たろう", user_id: null }]
    });

    render(await renderPage());

    expect(screen.queryByTestId("answer-form")).not.toBeInTheDocument();
    expect(screen.getByText(/このリンクは開けません/)).toBeInTheDocument();
  });

  it("前回の回答をフォームに渡す", async () => {
    mockClient({
      link: linkRow(),
      participants: [viewerParticipant],
      previousAnswers: [{ candidate_date_id: "candidate-1", answer: "yes", comment: "昼から" }]
    });

    render(await renderPage());

    expect(JSON.parse(screen.getByTestId("answer-form").getAttribute("data-previous") ?? "{}")).toEqual({
      "candidate-1": { answer: "yes", comment: "昼から" }
    });
  });
});

import React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { createSupabaseAdminClient, createSupabaseServerClient, hasSupabaseAdminEnv, notFound, redirect } = vi.hoisted(() => ({
  createSupabaseAdminClient: vi.fn(),
  createSupabaseServerClient: vi.fn(),
  hasSupabaseAdminEnv: vi.fn().mockReturnValue(true),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  })
}));

vi.mock("next/navigation", () => ({ notFound, redirect }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseAdminClient,
  createSupabaseServerClient,
  hasSupabaseAdminEnv
}));
vi.mock("@/components/plan/answer-form", () => ({
  AnswerForm: (props: { participantName: string; initialAnswers?: Record<string, unknown> }) => (
    <form data-testid="answer-form" data-participant={props.participantName} data-previous={JSON.stringify(props.initialAnswers ?? {})} />
  )
}));

import PublicAnswerPage from "@/app/s/[token]/answer/page";

const viewerId = "user-viewer";

/** 表ごとに違う結果を返す admin クライアント。share_links だけ .single() で取る。 */
function adminClient({
  link,
  participants = [],
  previousAnswers = []
}: {
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

  return { from };
}

function serverClient(userId: string | null) {
  return {
    auth: { getUser: vi.fn(async () => ({ data: { user: userId ? { id: userId } : null } })) }
  };
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
    hasSupabaseAdminEnv.mockReturnValue(true);
    createSupabaseServerClient.mockResolvedValue(serverClient(viewerId));
  });

  it("参加者なら回答フォームを表示する", async () => {
    createSupabaseAdminClient.mockReturnValue(adminClient({ link: linkRow(), participants: [viewerParticipant] }));

    render(await renderPage());

    expect(screen.getByTestId("answer-form")).toHaveAttribute("data-participant", "たろう");
  });

  it("無効化されたリンクなら回答フォームを出さず、無効化を伝える", async () => {
    createSupabaseAdminClient.mockReturnValue(
      adminClient({ link: linkRow({ status: "revoked" }), participants: [viewerParticipant] })
    );

    render(await renderPage());

    expect(screen.queryByTestId("answer-form")).not.toBeInTheDocument();
    expect(screen.getByText(/無効化されています/)).toBeInTheDocument();
  });

  // 共有リンクは入口でしかない。トークンだけで中身を読めてはいけない。
  it("未ログインならログインへ送る", async () => {
    createSupabaseServerClient.mockResolvedValue(serverClient(null));
    createSupabaseAdminClient.mockReturnValue(adminClient({ link: linkRow(), participants: [viewerParticipant] }));

    await expect(renderPage()).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/login?next=/s/token-1/answer");
  });

  it("参加者でないログインユーザーには候補日時も見せない", async () => {
    createSupabaseAdminClient.mockReturnValue(
      adminClient({
        link: linkRow(),
        participants: [{ id: "participant-9", display_name: "ほかの人", user_id: "user-other" }]
      })
    );

    render(await renderPage());

    expect(screen.queryByTestId("answer-form")).not.toBeInTheDocument();
    expect(screen.getByText(/参加者ではありません/)).toBeInTheDocument();
  });

  /*
   * 名前で照合していたころは、同じ名前の行を引き当てて他人の回答を読めた。
   * user_id が空の行は、名前が一致しても本人にしない。
   */
  it("user_id の無い参加者は、名前が同じでも本人扱いしない", async () => {
    createSupabaseAdminClient.mockReturnValue(
      adminClient({
        link: linkRow(),
        participants: [{ id: "participant-2", display_name: "たろう", user_id: null }]
      })
    );

    render(await renderPage());

    expect(screen.queryByTestId("answer-form")).not.toBeInTheDocument();
    expect(screen.getByText(/参加者ではありません/)).toBeInTheDocument();
  });

  it("前回の回答をフォームに渡す", async () => {
    createSupabaseAdminClient.mockReturnValue(
      adminClient({
        link: linkRow(),
        participants: [viewerParticipant],
        previousAnswers: [{ candidate_date_id: "candidate-1", answer: "yes", comment: "昼から" }]
      })
    );

    render(await renderPage());

    expect(JSON.parse(screen.getByTestId("answer-form").getAttribute("data-previous") ?? "{}")).toEqual({
      "candidate-1": { answer: "yes", comment: "昼から" }
    });
  });
});

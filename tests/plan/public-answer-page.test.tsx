import React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { createSupabaseAdminClient, hasSupabaseAdminEnv, notFound } = vi.hoisted(() => ({
  createSupabaseAdminClient: vi.fn(),
  hasSupabaseAdminEnv: vi.fn().mockReturnValue(true),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  })
}));

vi.mock("next/navigation", () => ({ notFound }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseAdminClient, hasSupabaseAdminEnv }));
vi.mock("@/components/plan/answer-form", () => ({
  AnswerForm: () => <form data-testid="answer-form" />
}));

import PublicAnswerPage from "@/app/s/[token]/answer/page";

function adminClientReturningLink(link: Record<string, unknown> | null) {
  const builder: Record<string, unknown> = {};
  const chain = (name: string) => {
    builder[name] = vi.fn(() => builder);
  };
  chain("select");
  chain("eq");
  builder.single = vi.fn(async () => ({ data: link, error: null }));

  return { from: vi.fn(() => builder) };
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

describe("公開回答ページ", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("React", React);
    hasSupabaseAdminEnv.mockReturnValue(true);
  });

  it("有効なリンクなら回答フォームを表示する", async () => {
    createSupabaseAdminClient.mockReturnValue(adminClientReturningLink(linkRow()));

    render(await PublicAnswerPage({ params: Promise.resolve({ token: "token-1" }) }));

    expect(screen.getByTestId("answer-form")).toBeInTheDocument();
  });

  it("無効化されたリンクなら回答フォームを出さず、無効化を伝える", async () => {
    createSupabaseAdminClient.mockReturnValue(adminClientReturningLink(linkRow({ status: "revoked" })));

    render(await PublicAnswerPage({ params: Promise.resolve({ token: "token-1" }) }));

    expect(screen.queryByTestId("answer-form")).not.toBeInTheDocument();
    expect(screen.getByText(/無効化されています/)).toBeInTheDocument();
  });
});

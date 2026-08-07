import React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import ShareLinkNotFound from "@/app/s/[token]/not-found";
import InviteLinkNotFound from "@/app/invites/[token]/not-found";

describe("トークン不在時の専用404", () => {
  beforeEach(() => {
    vi.stubGlobal("React", React);
  });

  it("公開共有リンクが存在しない場合、無効化済み表示とは異なる文言を出し、戻り先リンクは出さない", () => {
    render(<ShareLinkNotFound />);

    expect(screen.getByText(/このリンクは無効か、期限が切れています/)).toBeInTheDocument();
    expect(screen.queryByText(/無効化されています/)).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("イベント招待リンクが存在しない場合、無効化済み表示とは異なる文言を出し、戻り先リンクは出さない", () => {
    render(<InviteLinkNotFound />);

    expect(screen.getByText(/このリンクは無効か、期限が切れています/)).toBeInTheDocument();
    expect(screen.queryByText(/無効化されています/)).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});

import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ShareLinkCard } from "@/components/plan/share-link-card";

describe("ShareLinkCard", () => {
  it("shows a direct answer link for the organizer too", () => {
    render(<ShareLinkCard shareUrl="https://example.com/s/token/answer" />);

    expect(screen.getByRole("link", { name: "自分も回答する" })).toHaveAttribute(
      "href",
      "https://example.com/s/token/answer"
    );
  });

  it("有効なリンクには無効化と再発行の両方を出す", () => {
    render(
      <ShareLinkCard
        shareUrl="https://example.com/s/token/answer"
        revokeAction={vi.fn()}
        reissueAction={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: "リンクを無効化" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "新しいリンクを発行" })).toBeInTheDocument();
  });

  it("有効なリンクが無いときは再発行だけを出す", () => {
    render(<ShareLinkCard shareUrl={null} revokeAction={vi.fn()} reissueAction={vi.fn()} />);

    expect(screen.queryByRole("button", { name: "リンクを無効化" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "新しいリンクを発行" })).toBeInTheDocument();
  });
});

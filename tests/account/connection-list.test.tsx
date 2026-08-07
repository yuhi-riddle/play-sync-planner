import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { unblockUserAction, unfollowUserAction } = vi.hoisted(() => ({
  unblockUserAction: vi.fn().mockResolvedValue(undefined),
  unfollowUserAction: vi.fn()
}));

vi.mock("@/lib/actions/account/connections", () => ({
  blockUserAction: vi.fn(),
  followUserAction: vi.fn(),
  toggleFavoriteAction: vi.fn(),
  unfollowUserAction,
  unblockUserAction
}));

vi.mock("next/navigation", () => ({
  unstable_rethrow: vi.fn()
}));

import { unstable_rethrow } from "next/navigation";

import { ConnectionList } from "@/components/account/connection-list";

const favorite = {
  userId: "11111111-1111-4111-8111-111111111111",
  displayName: "あきらさん",
  sharedEventCount: 3,
  latestSharedAt: "2026-07-01T10:00:00.000Z",
  isFollowing: true,
  isFollowedBy: true,
  isFavorite: true
};

const following = {
  ...favorite,
  userId: "22222222-2222-4222-8222-222222222222",
  displayName: "はるかさん",
  isFollowing: true,
  isFollowedBy: false,
  isFavorite: false
};

const candidate = {
  ...favorite,
  userId: "33333333-3333-4333-8333-333333333333",
  displayName: "みなとさん",
  isFollowing: false,
  isFollowedBy: false,
  isFavorite: false
};

const blockedUser = {
  userId: "44444444-4444-4444-8444-444444444444",
  displayName: "なぎささん"
};

describe("ConnectionList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows filters with counts and only the selected group", () => {
    render(
      <ConnectionList
        favorites={[favorite]}
        mutualFollows={[]}
        following={[following]}
        candidates={[candidate]}
        blockedUsers={[blockedUser]}
      />
    );

    expect(screen.getByRole("tab", { name: "お気に入り 1件" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "相互フォロー 0件" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "フォロー中 1件" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "一緒に参加 1件" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "ブロック中 1件" })).toBeInTheDocument();
    expect(screen.getByText("あきらさん")).toBeInTheDocument();
    expect(screen.queryByText("はるかさん")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "フォロー中 1件" }));

    expect(screen.getByText("はるかさん")).toBeInTheDocument();
    expect(screen.queryByText("あきらさん")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ブロック" })).toBeInTheDocument();
  });

  it("switches the mobile connection group from one dropdown", () => {
    render(
      <ConnectionList
        favorites={[favorite]}
        mutualFollows={[]}
        following={[following]}
        candidates={[candidate]}
        blockedUsers={[blockedUser]}
      />
    );

    const select = screen.getByRole("combobox", { name: "表示するつながり" });
    expect(select).toHaveClass("sm:hidden");
    expect(screen.getByRole("option", { name: "お気に入り (1件)" })).toBeInTheDocument();

    fireEvent.change(select, { target: { value: "following" } });

    expect(screen.getByText("はるかさん")).toBeInTheDocument();
    expect(screen.queryByText("あきらさん")).not.toBeInTheDocument();
    expect(screen.getByRole("tablist", { name: "つながりを絞り込む" }).parentElement).toHaveClass("hidden", "sm:block");
  });

  it("briefly explains follow, favorite, and block behavior", () => {
    render(<ConnectionList favorites={[]} following={[]} candidates={[]} blockedUsers={[]} />);

    expect(screen.getByText("フォローすると、次のイベントへ招待しやすくなります。")).toBeInTheDocument();
    expect(screen.getByText("お気に入りは、フォロー中の人を見つけやすくする目印です。")).toBeInTheDocument();
    expect(screen.getByText("ブロックすると、お互いのフォローとお気に入りが外れます。")).toBeInTheDocument();
  });

  it("keeps favorite disabled until the person is followed", () => {
    render(<ConnectionList favorites={[]} following={[]} candidates={[candidate]} blockedUsers={[]} />);
    fireEvent.click(screen.getByRole("tab", { name: "一緒に参加 1件" }));

    expect(screen.getByRole("button", { name: "お気に入りにする" })).toBeDisabled();
  });

  it("allows an existing favorite to be removed even after an unfollow", () => {
    render(
      <ConnectionList
        favorites={[{ ...favorite, isFollowing: false }]}
        following={[]}
        candidates={[]}
        blockedUsers={[]}
      />
    );

    expect(screen.getByRole("button", { name: "お気に入りを外す" })).toBeEnabled();
  });

  it("describes shared participation without implying that every event is in the past", () => {
    render(<ConnectionList favorites={[]} following={[]} candidates={[candidate]} />);

    fireEvent.click(screen.getByRole("tab", { name: "一緒に参加 1件" }));
    expect(screen.getByText("共通のイベント 3件")).toBeInTheDocument();
    expect(screen.queryByText("最近一緒だった人")).not.toBeInTheDocument();
    expect(screen.queryByText("一緒だったイベント 3件")).not.toBeInTheDocument();
  });

  it("shows blocked users and lets the user unblock them", async () => {
    render(<ConnectionList favorites={[]} following={[]} candidates={[]} blockedUsers={[blockedUser]} />);

    fireEvent.click(screen.getByRole("tab", { name: "ブロック中 1件" }));
    expect(screen.getByText("なぎささん")).toBeInTheDocument();
    expect(screen.getByText("解除しても、以前のフォローやお気に入りは戻りません。")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "なぎささんのブロックを解除" }));

    await waitFor(() => expect(unblockUserAction).toHaveBeenCalledWith(blockedUser.userId));
  });

  it("switches the mobile connection group from one dropdown", () => {
    render(
      <ConnectionList favorites={[favorite]} mutualFollows={[]} following={[following]} candidates={[candidate]} blockedUsers={[blockedUser]} />
    );

    const select = screen.getByRole("combobox", { name: "表示するつながり" });
    expect(select).toHaveClass("sm:hidden");
    expect(screen.getByRole("option", { name: "お気に入り (1件)" })).toBeInTheDocument();

    fireEvent.change(select, { target: { value: "following" } });
    expect(screen.getByText("はるかさん")).toBeInTheDocument();
    expect(screen.queryByText("あきらさん")).not.toBeInTheDocument();
    expect(screen.getByRole("tablist", { name: "つながりを絞り込む" }).parentElement).toHaveClass("hidden", "sm:block");
  });

  it("passes unfollow errors through unstable_rethrow so framework redirects aren't swallowed", async () => {
    const redirectError = new Error("NEXT_REDIRECT;push;/login;replace;307;");
    unfollowUserAction.mockRejectedValueOnce(redirectError);
    render(<ConnectionList favorites={[]} following={[following]} candidates={[]} blockedUsers={[]} />);

    fireEvent.click(screen.getByRole("button", { name: "フォローを解除" }));

    await waitFor(() => expect(unstable_rethrow).toHaveBeenCalledWith(redirectError));
  });

  it("passes unblock errors through unstable_rethrow so framework redirects aren't swallowed", async () => {
    const redirectError = new Error("NEXT_REDIRECT;push;/login;replace;307;");
    unblockUserAction.mockRejectedValueOnce(redirectError);
    render(<ConnectionList favorites={[]} following={[]} candidates={[]} blockedUsers={[blockedUser]} />);

    fireEvent.click(screen.getByRole("tab", { name: "ブロック中 1件" }));
    fireEvent.click(screen.getByRole("button", { name: "なぎささんのブロックを解除" }));

    await waitFor(() => expect(unstable_rethrow).toHaveBeenCalledWith(redirectError));
  });
});

import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { unblockUserAction, unfollowUserAction, loadMoreConnectionsAction } = vi.hoisted(() => ({
  unblockUserAction: vi.fn().mockResolvedValue(undefined),
  unfollowUserAction: vi.fn(),
  loadMoreConnectionsAction: vi.fn()
}));

vi.mock("@/lib/actions/account/connections", () => ({
  blockUserAction: vi.fn(),
  followUserAction: vi.fn(),
  toggleFavoriteAction: vi.fn(),
  unfollowUserAction,
  unblockUserAction,
  loadMoreConnectionsAction
}));

vi.mock("next/navigation", () => ({
  unstable_rethrow: vi.fn()
}));

import { unstable_rethrow } from "next/navigation";

import { ConnectionList, type ConnectionTabData } from "@/components/account/connection-list";
import type { BlockedUser, ConnectionCandidate } from "@/lib/domain/account/connections";

const favorite: ConnectionCandidate = {
  userId: "11111111-1111-4111-8111-111111111111",
  displayName: "あきらさん",
  sharedEventCount: 3,
  latestSharedAt: "2026-07-01T10:00:00.000Z",
  isFollowing: true,
  isFollowedBy: true,
  isFavorite: true
};

const following: ConnectionCandidate = {
  ...favorite,
  userId: "22222222-2222-4222-8222-222222222222",
  displayName: "はるかさん",
  isFollowing: true,
  isFollowedBy: false,
  isFavorite: false
};

const candidate: ConnectionCandidate = {
  ...favorite,
  userId: "33333333-3333-4333-8333-333333333333",
  displayName: "みなとさん",
  isFollowing: false,
  isFollowedBy: false,
  isFavorite: false
};

const blockedUser: BlockedUser = {
  userId: "44444444-4444-4444-8444-444444444444",
  displayName: "なぎささん"
};

function tabData<T>(items: T[], overrides: Partial<ConnectionTabData<T>> = {}): ConnectionTabData<T> {
  return { items, totalCount: items.length, nextCursor: null, ...overrides };
}

const empty = tabData<ConnectionCandidate>([]);
const emptyBlocked = tabData<BlockedUser>([]);

describe("ConnectionList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows filters with counts and only the selected group", () => {
    render(
      <ConnectionList
        favorites={tabData([favorite])}
        mutualFollows={empty}
        following={tabData([following])}
        candidates={tabData([candidate])}
        blockedUsers={tabData([blockedUser])}
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
        favorites={tabData([favorite])}
        mutualFollows={empty}
        following={tabData([following])}
        candidates={tabData([candidate])}
        blockedUsers={tabData([blockedUser])}
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
    render(<ConnectionList favorites={empty} following={empty} candidates={empty} blockedUsers={emptyBlocked} />);

    expect(screen.getByText("フォローすると、次のイベントへ招待しやすくなります。")).toBeInTheDocument();
    expect(screen.getByText("お気に入りは、フォロー中の人を見つけやすくする目印です。")).toBeInTheDocument();
    expect(screen.getByText("ブロックすると、お互いのフォローとお気に入りが外れます。")).toBeInTheDocument();
  });

  it("keeps favorite disabled until the person is followed", () => {
    render(<ConnectionList favorites={empty} following={empty} candidates={tabData([candidate])} blockedUsers={emptyBlocked} />);
    fireEvent.click(screen.getByRole("tab", { name: "一緒に参加 1件" }));

    expect(screen.getByRole("button", { name: "お気に入りにする" })).toBeDisabled();
  });

  it("allows an existing favorite to be removed even after an unfollow", () => {
    render(
      <ConnectionList
        favorites={tabData([{ ...favorite, isFollowing: false }])}
        following={empty}
        candidates={empty}
        blockedUsers={emptyBlocked}
      />
    );

    expect(screen.getByRole("button", { name: "お気に入りを外す" })).toBeEnabled();
  });

  it("describes shared participation without implying that every event is in the past", () => {
    render(<ConnectionList favorites={empty} following={empty} candidates={tabData([candidate])} />);

    fireEvent.click(screen.getByRole("tab", { name: "一緒に参加 1件" }));
    expect(screen.getByText("共通のイベント 3件")).toBeInTheDocument();
    expect(screen.queryByText("最近一緒だった人")).not.toBeInTheDocument();
    expect(screen.queryByText("一緒だったイベント 3件")).not.toBeInTheDocument();
  });

  it("shows blocked users and lets the user unblock them", async () => {
    render(<ConnectionList favorites={empty} following={empty} candidates={empty} blockedUsers={tabData([blockedUser])} />);

    fireEvent.click(screen.getByRole("tab", { name: "ブロック中 1件" }));
    expect(screen.getByText("なぎささん")).toBeInTheDocument();
    expect(screen.getByText("解除しても、以前のフォローやお気に入りは戻りません。")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "なぎささんのブロックを解除" }));

    await waitFor(() => expect(unblockUserAction).toHaveBeenCalledWith(blockedUser.userId));
  });

  it("passes unfollow errors through unstable_rethrow so framework redirects aren't swallowed", async () => {
    const redirectError = new Error("NEXT_REDIRECT;push;/login;replace;307;");
    unfollowUserAction.mockRejectedValueOnce(redirectError);
    render(<ConnectionList favorites={empty} following={tabData([following])} candidates={empty} blockedUsers={emptyBlocked} />);

    fireEvent.click(screen.getByRole("button", { name: "フォローを解除" }));

    await waitFor(() => expect(unstable_rethrow).toHaveBeenCalledWith(redirectError));
  });

  it("passes unblock errors through unstable_rethrow so framework redirects aren't swallowed", async () => {
    const redirectError = new Error("NEXT_REDIRECT;push;/login;replace;307;");
    unblockUserAction.mockRejectedValueOnce(redirectError);
    render(<ConnectionList favorites={empty} following={empty} candidates={empty} blockedUsers={tabData([blockedUser])} />);

    fireEvent.click(screen.getByRole("tab", { name: "ブロック中 1件" }));
    fireEvent.click(screen.getByRole("button", { name: "なぎささんのブロックを解除" }));

    await waitFor(() => expect(unstable_rethrow).toHaveBeenCalledWith(redirectError));
  });

  it("shows a load more button only when a next cursor exists, and appends the loaded page", async () => {
    const nextCursor = { at: candidate.latestSharedAt, userId: candidate.userId };
    loadMoreConnectionsAction.mockResolvedValueOnce({
      items: [{ ...candidate, userId: "55555555-5555-4555-8555-555555555555", displayName: "つづきさん" }],
      nextCursor: null
    });

    render(
      <ConnectionList
        favorites={empty}
        following={empty}
        candidates={tabData([candidate], { totalCount: 2, nextCursor })}
        blockedUsers={emptyBlocked}
      />
    );

    fireEvent.click(screen.getByRole("tab", { name: "一緒に参加 2件" }));
    expect(screen.getByRole("button", { name: "もっと見る" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "もっと見る" }));

    await waitFor(() => expect(loadMoreConnectionsAction).toHaveBeenCalledWith("shared", nextCursor));
    await waitFor(() => expect(screen.getByText("つづきさん")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "もっと見る" })).not.toBeInTheDocument();
  });

  it("shows an error and keeps the button when loading more fails", async () => {
    const nextCursor = { at: candidate.latestSharedAt, userId: candidate.userId };
    loadMoreConnectionsAction.mockRejectedValueOnce(new Error("続きを読み込めませんでした。"));

    render(
      <ConnectionList
        favorites={empty}
        following={empty}
        candidates={tabData([candidate], { totalCount: 2, nextCursor })}
        blockedUsers={emptyBlocked}
      />
    );

    fireEvent.click(screen.getByRole("tab", { name: "一緒に参加 2件" }));
    fireEvent.click(screen.getByRole("button", { name: "もっと見る" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("続きを読み込めませんでした。"));
    await waitFor(() => expect(screen.getByRole("button", { name: "もっと見る" })).toBeInTheDocument());
  });
});

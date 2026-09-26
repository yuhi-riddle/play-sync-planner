import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  unblockUserAction,
  unfollowUserAction,
  loadMoreConnectionsAction,
  loadActiveSharedEventsAction,
  setPersonConnectionGroupsAction,
  createConnectionGroupAction
} = vi.hoisted(() => ({
  unblockUserAction: vi.fn().mockResolvedValue(undefined),
  unfollowUserAction: vi.fn(),
  loadMoreConnectionsAction: vi.fn(),
  loadActiveSharedEventsAction: vi.fn(),
  setPersonConnectionGroupsAction: vi.fn(),
  createConnectionGroupAction: vi.fn()
}));

vi.mock("@/lib/actions/account/connections", () => ({
  blockUserAction: vi.fn(),
  followUserAction: vi.fn(),
  unfollowUserAction,
  unblockUserAction,
  loadMoreConnectionsAction,
  loadActiveSharedEventsAction
}));

vi.mock("@/lib/actions/account/connection-groups", () => ({
  setPersonConnectionGroupsAction,
  createConnectionGroupAction
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
  activeSharedEventCount: 2,
  latestSharedAt: "2026-07-01T10:00:00.000Z",
  isFollowing: true,
  isFollowedBy: true,
  isFavorite: true
};

const following: ConnectionCandidate = {
  ...favorite,
  userId: "22222222-2222-4222-8222-222222222222",
  displayName: "はるかさん",
  activeSharedEventCount: 0,
  isFollowing: true,
  isFollowedBy: false,
  isFavorite: false
};

const candidate: ConnectionCandidate = {
  ...favorite,
  userId: "33333333-3333-4333-8333-333333333333",
  displayName: "みなとさん",
  activeSharedEventCount: 0,
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
        mutualFollows={tabData([favorite])}
        following={tabData([following])}
        candidates={tabData([candidate])}
        blockedUsers={tabData([blockedUser])}
        groups={[]}
        groupIdsByMember={{}}
      />
    );

    expect(screen.getByRole("tab", { name: "一緒に参加 1件" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "フォロー中 1件" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "相互フォロー 1件" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "ブロック中 1件" })).toBeInTheDocument();
    expect(screen.getByText("みなとさん")).toBeInTheDocument();
    expect(screen.queryByText("はるかさん")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "フォロー中 1件" }));

    expect(screen.getByText("はるかさん")).toBeInTheDocument();
    expect(screen.queryByText("みなとさん")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ブロック" })).toBeInTheDocument();
  });

  it("switches the mobile connection group from one dropdown", () => {
    render(
      <ConnectionList
        mutualFollows={tabData([favorite])}
        following={tabData([following])}
        candidates={tabData([candidate])}
        blockedUsers={tabData([blockedUser])}
        groups={[]}
        groupIdsByMember={{}}
      />
    );

    const select = screen.getByRole("combobox", { name: "表示するつながり" });
    expect(select).toHaveClass("sm:hidden");
    expect(screen.getByRole("option", { name: "一緒に参加 (1件)" })).toBeInTheDocument();

    fireEvent.change(select, { target: { value: "following" } });

    expect(screen.getByText("はるかさん")).toBeInTheDocument();
    expect(screen.queryByText("みなとさん")).not.toBeInTheDocument();
    expect(screen.getByRole("tablist", { name: "つながりを絞り込む" }).parentElement).toHaveClass("hidden", "sm:block");
  });

  it("describes shared participation without implying that every event is in the past", () => {
    render(<ConnectionList following={empty} candidates={tabData([candidate])} groups={[]} groupIdsByMember={{}} />);

    fireEvent.click(screen.getByRole("tab", { name: "一緒に参加 1件" }));
    expect(screen.getByText("共通のイベント 3件")).toBeInTheDocument();
    expect(screen.queryByText("最近一緒だった人")).not.toBeInTheDocument();
    expect(screen.queryByText("一緒だったイベント 3件")).not.toBeInTheDocument();
  });

  it("shows blocked users and lets the user unblock them", async () => {
    render(<ConnectionList following={empty} candidates={empty} blockedUsers={tabData([blockedUser])} groups={[]} groupIdsByMember={{}} />);

    fireEvent.click(screen.getByRole("tab", { name: "ブロック中 1件" }));
    expect(screen.getByText("なぎささん")).toBeInTheDocument();
    expect(screen.getByText("解除しても、以前のフォローやグループは戻りません。")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "なぎささんのブロックを解除" }));

    await waitFor(() => expect(unblockUserAction).toHaveBeenCalledWith(blockedUser.userId));
  });

  it("passes unfollow errors through unstable_rethrow so framework redirects aren't swallowed", async () => {
    const redirectError = new Error("NEXT_REDIRECT;push;/login;replace;307;");
    unfollowUserAction.mockRejectedValueOnce(redirectError);
    render(<ConnectionList following={tabData([following])} candidates={empty} blockedUsers={emptyBlocked} groups={[]} groupIdsByMember={{}} />);

    fireEvent.click(screen.getByRole("button", { name: "フォローを解除" }));

    await waitFor(() => expect(unstable_rethrow).toHaveBeenCalledWith(redirectError));
  });

  it("passes unblock errors through unstable_rethrow so framework redirects aren't swallowed", async () => {
    const redirectError = new Error("NEXT_REDIRECT;push;/login;replace;307;");
    unblockUserAction.mockRejectedValueOnce(redirectError);
    render(<ConnectionList following={empty} candidates={empty} blockedUsers={tabData([blockedUser])} groups={[]} groupIdsByMember={{}} />);

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
        following={empty}
        candidates={tabData([candidate], { totalCount: 2, nextCursor })}
        blockedUsers={emptyBlocked}
        groups={[]}
        groupIdsByMember={{}}
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
        following={empty}
        candidates={tabData([candidate], { totalCount: 2, nextCursor })}
        blockedUsers={emptyBlocked}
        groups={[]}
        groupIdsByMember={{}}
      />
    );

    fireEvent.click(screen.getByRole("tab", { name: "一緒に参加 2件" }));
    fireEvent.click(screen.getByRole("button", { name: "もっと見る" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("続きを読み込めませんでした。"));
    await waitFor(() => expect(screen.getByRole("button", { name: "もっと見る" })).toBeInTheDocument());
  });

  describe("進行中の共通イベント", () => {
    it("activeSharedEventCountが0より大きいときだけボタンを出す", () => {
      render(
        <ConnectionList
          following={{ items: [following], totalCount: 1, nextCursor: null }}
          candidates={{ items: [favorite], totalCount: 1, nextCursor: null }}
          groups={[]}
          groupIdsByMember={{}}
        />
      );

      expect(screen.getByRole("button", { name: "進行中 2件" })).toBeInTheDocument();
    });

    it("押すとloadActiveSharedEventsActionを呼び、結果をモーダルに表示する", async () => {
      loadActiveSharedEventsAction.mockResolvedValue([
        { eventId: "event-1", title: "夏の集まり", displayState: "event_waiting" }
      ]);

      render(
        <ConnectionList
          following={{ items: [], totalCount: 0, nextCursor: null }}
          candidates={{ items: [favorite], totalCount: 1, nextCursor: null }}
          groups={[]}
          groupIdsByMember={{}}
        />
      );

      fireEvent.click(screen.getByRole("button", { name: "進行中 2件" }));

      await waitFor(() => {
        expect(loadActiveSharedEventsAction).toHaveBeenCalledWith(favorite.userId);
      });
      await waitFor(() => {
        expect(screen.getByRole("link", { name: /夏の集まり/ })).toBeInTheDocument();
      });
    });
  });

  describe("お気に入りの撤去とグループ", () => {
    const groups = [
      { id: "g1", name: "謎解き仲間", color: "nazotoki" as const, memberCount: 1, memberNames: ["あきらさん"], activeEventCount: 0 },
      { id: "g2", name: "大学の友達", color: "boardgame" as const, memberCount: 0, memberNames: [], activeEventCount: 0 }
    ];

    it("タブは 一緒に参加／フォロー中／相互フォロー／ブロック中 の順で、お気に入りは出さない", () => {
      render(
        <ConnectionList
          mutualFollows={tabData([favorite])}
          following={tabData([following])}
          candidates={tabData([candidate])}
          blockedUsers={emptyBlocked}
          groups={groups}
          groupIdsByMember={{}}
        />
      );
      expect(screen.getAllByRole("tab").map((tab) => tab.textContent?.replace(/\d+件?/g, "").trim())).toEqual([
        "一緒に参加",
        "フォロー中",
        "相互フォロー",
        "ブロック中"
      ]);
      expect(screen.queryByText(/お気に入り/)).not.toBeInTheDocument();
      expect(screen.queryByText("つながりの使い分け")).not.toBeInTheDocument();
    });

    it("人の行に所属グループを出し、「グループに入れる」で選んで保存できる", async () => {
      setPersonConnectionGroupsAction.mockResolvedValue({ status: "success" });
      render(
        <ConnectionList
          following={empty}
          candidates={tabData([candidate])}
          groups={groups}
          groupIdsByMember={{ [candidate.userId]: ["g1"] }}
        />
      );

      expect(screen.getByText("謎解き仲間")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "グループに入れる" }));
      const dialog = screen.getByRole("group", { name: `${candidate.displayName}を入れるグループ` });
      expect(within(dialog).getByRole("checkbox", { name: "謎解き仲間" })).toBeChecked();
      fireEvent.click(within(dialog).getByRole("checkbox", { name: "大学の友達" }));
      fireEvent.click(within(dialog).getByRole("button", { name: "保存する" }));

      await waitFor(() =>
        expect(setPersonConnectionGroupsAction).toHaveBeenCalledWith(candidate.userId, ["g1", "g2"])
      );
    });

    it("パネルの中で新しいグループを作って、その人を入れられる", async () => {
      createConnectionGroupAction.mockResolvedValue({ status: "success", groupId: "g9" });
      render(<ConnectionList following={empty} candidates={tabData([candidate])} groups={[]} groupIdsByMember={{}} />);
      fireEvent.click(screen.getByRole("button", { name: "グループに入れる" }));
      fireEvent.change(screen.getByLabelText("新しいグループを作って入れる"), { target: { value: "謎解き仲間" } });
      fireEvent.click(screen.getByRole("button", { name: "作って入れる" }));
      await waitFor(() =>
        expect(createConnectionGroupAction).toHaveBeenCalledWith({
          name: "謎解き仲間",
          color: "nazotoki",
          memberIds: [candidate.userId]
        })
      );
    });

    it("30人に達したグループは、まだ入っていない人には選べない", () => {
      render(
        <ConnectionList
          following={empty}
          candidates={tabData([candidate])}
          groups={[{ ...groups[1], memberCount: 30 }]}
          groupIdsByMember={{}}
        />
      );
      fireEvent.click(screen.getByRole("button", { name: "グループに入れる" }));
      expect(screen.getByRole("checkbox", { name: "大学の友達" })).toBeDisabled();
      expect(screen.getByText("30人まで")).toBeInTheDocument();
    });

    it("ブロックの確認に、グループからも外れることを書く", () => {
      render(<ConnectionList following={empty} candidates={tabData([candidate])} groups={[]} groupIdsByMember={{}} />);
      fireEvent.click(screen.getByRole("button", { name: "ブロック" }));
      expect(screen.getByText("お互いのフォローが解除され、グループからも外れます。")).toBeInTheDocument();
    });
  });
});

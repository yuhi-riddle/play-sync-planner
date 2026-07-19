import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/actions/connections", () => ({
  blockUserAction: vi.fn(),
  followUserAction: vi.fn(),
  toggleFavoriteAction: vi.fn(),
  unfollowUserAction: vi.fn(),
  unblockUserAction: vi.fn()
}));

import { ConnectionList } from "@/components/connection-list";

const favorite = {
  userId: "11111111-1111-4111-8111-111111111111",
  displayName: "お気に入りの人",
  sharedEventCount: 3,
  latestSharedAt: "2026-07-01T10:00:00.000Z",
  isFollowing: true,
  isFollowedBy: true,
  isFavorite: true
};

const mutual = {
  ...favorite,
  userId: "22222222-2222-4222-8222-222222222222",
  displayName: "相互フォローの人",
  isFavorite: false
};

const shared = {
  ...favorite,
  userId: "33333333-3333-4333-8333-333333333333",
  displayName: "共有イベントの人",
  isFollowing: false,
  isFollowedBy: false,
  isFavorite: false
};

function response(items: typeof favorite[], nextCursor: string | null = null) {
  return { ok: true, json: vi.fn().mockResolvedValue({ items, nextCursor }) } as unknown as Response;
}

describe("ConnectionList", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("loads an unfetched category only when first selected and explains mutual chat", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response([mutual]));
    vi.stubGlobal("fetch", fetchMock);
    render(<ConnectionList initialCategory="favorites" initialItems={[favorite]} counts={{ favorites: 1, mutual: 1 }} />);

    expect(screen.getByText("お気に入りの人")).toBeInTheDocument();
    expect(screen.getByText(/相互フォローになると、1対1のチャット/)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("tab", { name: /相互フォロー/ }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/connections?category=mutual"));
    expect(await screen.findByText("相互フォローの人")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: /お気に入り/ }));
    fireEvent.click(screen.getByRole("tab", { name: /相互フォロー/ }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("uses the cursor for more, appends without duplicates, and keeps categories independent", async () => {
    const nextCursor = "next-cursor";
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response([mutual], nextCursor))
      .mockResolvedValueOnce(response([mutual, shared]));
    vi.stubGlobal("fetch", fetchMock);
    render(<ConnectionList initialCategory="favorites" initialItems={[favorite]} counts={{ favorites: 1, mutual: 2 }} />);

    fireEvent.click(screen.getByRole("tab", { name: /相互フォロー/ }));
    await screen.findByText("相互フォローの人");
    fireEvent.click(screen.getByRole("button", { name: "さらに20件表示" }));

    await waitFor(() => expect(fetchMock).toHaveBeenLastCalledWith("/api/connections?category=mutual&cursor=next-cursor"));
    expect(await screen.findByText("共有イベントの人")).toBeInTheDocument();
    expect(screen.getAllByText("相互フォローの人")).toHaveLength(1);

    fireEvent.click(screen.getByRole("tab", { name: /お気に入り/ }));
    expect(screen.getByText("お気に入りの人")).toBeInTheDocument();
    expect(screen.queryByText("共有イベントの人")).not.toBeInTheDocument();
  });

  it("preserves items after a failed request and prevents a duplicate in-flight request", async () => {
    let rejectFetch: (reason?: unknown) => void = () => undefined;
    const fetchMock = vi.fn().mockImplementation(() => new Promise<Response>((_, reject) => { rejectFetch = reject; }));
    vi.stubGlobal("fetch", fetchMock);
    render(<ConnectionList initialCategory="favorites" initialItems={[favorite]} counts={{ favorites: 1, mutual: 1 }} />);

    const mutualTab = screen.getByRole("tab", { name: /相互フォロー/ });
    fireEvent.click(mutualTab);
    fireEvent.click(mutualTab);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    rejectFetch(new Error("network"));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: /お気に入り/ }));
    expect(screen.getByText("お気に入りの人")).toBeInTheDocument();
  });
});

import { describe, expect, it } from "vitest";

import {
  isMutualFollow,
  mapConnectionCandidateRow,
  mapConnectionCounts,
  mapConnectionPage,
  sortInviteCandidates,
  toBlockedUser,
  type ConnectionCandidate
} from "@/lib/domain/account/connections";

const baseCandidate: ConnectionCandidate = {
  userId: "base",
  displayName: "Base",
  sharedEventCount: 1,
  latestSharedAt: "2026-07-01T00:00:00.000Z",
  isFollowing: false,
  isFollowedBy: false,
  isFavorite: false
};

describe("sortInviteCandidates", () => {
  it("prioritizes favorites, mutual follows, follows, then the latest shared event", () => {
    const candidates: ConnectionCandidate[] = [
      { ...baseCandidate, userId: "older", latestSharedAt: "2026-07-05T00:00:00.000Z" },
      { ...baseCandidate, userId: "recent", latestSharedAt: "2026-07-10T00:00:00.000Z" },
      { ...baseCandidate, userId: "following", isFollowing: true },
      { ...baseCandidate, userId: "mutual", isFollowing: true, isFollowedBy: true },
      { ...baseCandidate, userId: "favorite", isFavorite: true }
    ];

    expect(sortInviteCandidates(candidates).map((candidate) => candidate.userId)).toEqual([
      "favorite",
      "mutual",
      "following",
      "recent",
      "older"
    ]);
  });

  it("breaks ties by user ID without mutating the original list", () => {
    const candidates: ConnectionCandidate[] = [
      { ...baseCandidate, userId: "zeta" },
      { ...baseCandidate, userId: "alpha" }
    ];

    expect(sortInviteCandidates(candidates).map((candidate) => candidate.userId)).toEqual(["alpha", "zeta"]);
    expect(candidates.map((candidate) => candidate.userId)).toEqual(["zeta", "alpha"]);
  });
});

describe("isMutualFollow", () => {
  it("returns true only when both users follow each other", () => {
    expect(isMutualFollow({ ...baseCandidate, isFollowing: true, isFollowedBy: true })).toBe(true);
    expect(isMutualFollow({ ...baseCandidate, isFollowing: true })).toBe(false);
  });
});

describe("toBlockedUser", () => {
  it("keeps only the fields the blocked list needs", () => {
    expect(toBlockedUser({ ...baseCandidate, userId: "blocked", displayName: "ブロック済みさん" })).toEqual({
      userId: "blocked",
      displayName: "ブロック済みさん"
    });
  });
});

describe("mapConnectionCandidateRow", () => {
  it("converts an RPC row into a ConnectionCandidate, coercing the bigint count", () => {
    expect(
      mapConnectionCandidateRow({
        user_id: "row-user",
        display_name: "行のユーザー",
        shared_event_count: "3",
        latest_shared_at: "2026-07-01T00:00:00.000Z",
        is_following: true,
        is_followed_by: false,
        is_favorite: false,
        cursor_at: "2026-07-01T00:00:00.000Z",
        cursor_user_id: "row-user"
      })
    ).toEqual({
      userId: "row-user",
      displayName: "行のユーザー",
      sharedEventCount: 3,
      latestSharedAt: "2026-07-01T00:00:00.000Z",
      isFollowing: true,
      isFollowedBy: false,
      isFavorite: false
    });
  });

  it("falls back to an empty string when latest_shared_at is null", () => {
    expect(
      mapConnectionCandidateRow({
        user_id: "row-user",
        display_name: "行のユーザー",
        shared_event_count: 0,
        latest_shared_at: null,
        is_following: false,
        is_followed_by: false,
        is_favorite: false,
        cursor_at: "2026-07-01T00:00:00.000Z",
        cursor_user_id: "row-user"
      }).latestSharedAt
    ).toBe("");
  });
});

describe("mapConnectionPage", () => {
  const row = (userId: string) => ({
    user_id: userId,
    display_name: userId,
    shared_event_count: 1,
    latest_shared_at: "2026-07-01T00:00:00.000Z",
    is_following: false,
    is_followed_by: false,
    is_favorite: false,
    cursor_at: "2026-07-01T00:00:00.000Z",
    cursor_user_id: userId
  });

  it("returns no next cursor when fewer than a full page comes back", () => {
    const page = mapConnectionPage([row("a"), row("b")]);
    expect(page.items).toHaveLength(2);
    expect(page.nextCursor).toBeNull();
  });

  it("returns a next cursor from the last row when a full page (20) comes back", () => {
    const rows = Array.from({ length: 20 }, (_, index) => row(`user-${index}`));
    const page = mapConnectionPage(rows);
    expect(page.nextCursor).toEqual({ at: "2026-07-01T00:00:00.000Z", userId: "user-19" });
  });
});

describe("mapConnectionCounts", () => {
  it("fills every category with 0 and coerces bigint counts that were returned", () => {
    expect(
      mapConnectionCounts([
        { category: "favorites", item_count: "2" },
        { category: "blocked", item_count: 1 }
      ])
    ).toEqual({ favorites: 2, mutual: 0, following: 0, shared: 0, blocked: 1 });
  });

  it("ignores unknown categories instead of throwing", () => {
    expect(mapConnectionCounts([{ category: "unexpected", item_count: 5 }])).toEqual({
      favorites: 0,
      mutual: 0,
      following: 0,
      shared: 0,
      blocked: 0
    });
  });
});

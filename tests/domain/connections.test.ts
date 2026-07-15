import { describe, expect, it } from "vitest";

import {
  buildInviteCandidates,
  canInviteCandidate,
  isMutualFollow,
  resolveInviteProfileNames,
  sortInviteCandidates,
  type ConnectionCandidate
} from "@/lib/domain/connections";

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

describe("buildInviteCandidates", () => {
  it("includes followed and favorite users even without a shared event", () => {
    const candidates = buildInviteCandidates({
      currentUserId: "self",
      sharedMembers: [
        { userId: "shared", displayName: "以前の表示名", sharedAt: "2026-06-01T00:00:00.000Z" }
      ],
      existingMemberIds: [],
      followingUserIds: ["followed"],
      followedByUserIds: ["followed"],
      favoriteUserIds: ["favorite"],
      blockedUserIds: [],
      profileNames: new Map([
        ["shared", "共有イベントの人"],
        ["followed", "フォロー中の人"]
      ]),
      fallbackNames: new Map([["favorite", "お気に入りの人"]])
    });

    expect(candidates).toEqual([
      {
        userId: "favorite",
        displayName: "お気に入りの人",
        sharedEventCount: 0,
        latestSharedAt: "",
        isFollowing: false,
        isFollowedBy: false,
        isFavorite: true
      },
      {
        userId: "followed",
        displayName: "フォロー中の人",
        sharedEventCount: 0,
        latestSharedAt: "",
        isFollowing: true,
        isFollowedBy: true,
        isFavorite: false
      },
      {
        userId: "shared",
        displayName: "共有イベントの人",
        sharedEventCount: 1,
        latestSharedAt: "2026-06-01T00:00:00.000Z",
        isFollowing: false,
        isFollowedBy: false,
        isFavorite: false
      }
    ]);
  });

  it("excludes the current user, joined members, and blocked users", () => {
    const candidates = buildInviteCandidates({
      currentUserId: "self",
      sharedMembers: [],
      existingMemberIds: ["joined"],
      followingUserIds: ["self", "joined", "blocked", "allowed"],
      followedByUserIds: [],
      favoriteUserIds: [],
      blockedUserIds: ["blocked"],
      profileNames: new Map(),
      fallbackNames: new Map([["allowed", "招待できる人"]])
    });

    expect(candidates.map((candidate) => candidate.userId)).toEqual(["allowed"]);
  });
});

describe("invite candidate profile fallback", () => {
  it("continues without profile names when migration 019 is not applied", () => {
    expect(
      resolveInviteProfileNames(null, {
        code: "PGRST205",
        message: "Could not find the table 'public.profiles' in the schema cache"
      })
    ).toEqual(new Map());
  });

  it("keeps unexpected profile errors visible", () => {
    expect(() => resolveInviteProfileNames(null, { code: "42501", message: "permission denied" })).toThrow(
      "招待候補のプロフィールを読み込めませんでした"
    );
  });
});

describe("canInviteCandidate", () => {
  it("allows a shared participant, followed user, or favorite unless blocked", () => {
    expect(canInviteCandidate({ hasSharedEvent: true, isFollowing: false, isFavorite: false, isBlocked: false })).toBe(true);
    expect(canInviteCandidate({ hasSharedEvent: false, isFollowing: true, isFavorite: false, isBlocked: false })).toBe(true);
    expect(canInviteCandidate({ hasSharedEvent: false, isFollowing: false, isFavorite: true, isBlocked: false })).toBe(true);
    expect(canInviteCandidate({ hasSharedEvent: true, isFollowing: true, isFavorite: true, isBlocked: true })).toBe(false);
    expect(canInviteCandidate({ hasSharedEvent: false, isFollowing: false, isFavorite: false, isBlocked: false })).toBe(false);
  });
});

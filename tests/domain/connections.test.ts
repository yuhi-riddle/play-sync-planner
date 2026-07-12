import { describe, expect, it } from "vitest";

import { isMutualFollow, sortInviteCandidates, type ConnectionCandidate } from "@/lib/domain/connections";

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

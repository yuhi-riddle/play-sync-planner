export type ConnectionCandidate = {
  userId: string;
  displayName: string;
  sharedEventCount: number;
  latestSharedAt: string;
  isFollowing: boolean;
  isFollowedBy: boolean;
  isFavorite: boolean;
};

export function isMutualFollow(candidate: ConnectionCandidate): boolean {
  return candidate.isFollowing && candidate.isFollowedBy;
}

function latestSharedAtTimestamp(value: string): number {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? Number.NEGATIVE_INFINITY : timestamp;
}

export function sortInviteCandidates(candidates: ConnectionCandidate[]): ConnectionCandidate[] {
  return [...candidates].sort((a, b) => {
    const favoriteDifference = Number(b.isFavorite) - Number(a.isFavorite);
    if (favoriteDifference !== 0) return favoriteDifference;

    const mutualFollowDifference = Number(isMutualFollow(b)) - Number(isMutualFollow(a));
    if (mutualFollowDifference !== 0) return mutualFollowDifference;

    const followingDifference = Number(b.isFollowing) - Number(a.isFollowing);
    if (followingDifference !== 0) return followingDifference;

    const latestSharedAtDifference = latestSharedAtTimestamp(b.latestSharedAt) - latestSharedAtTimestamp(a.latestSharedAt);
    if (latestSharedAtDifference !== 0) return latestSharedAtDifference;

    return a.userId.localeCompare(b.userId);
  });
}

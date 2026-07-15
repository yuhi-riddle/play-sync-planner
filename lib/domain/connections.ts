import { isProfileSchemaUnavailable } from "@/lib/domain/profile";

export type ConnectionCandidate = {
  userId: string;
  displayName: string;
  sharedEventCount: number;
  latestSharedAt: string;
  isFollowing: boolean;
  isFollowedBy: boolean;
  isFavorite: boolean;
};

type SharedInviteCandidate = {
  userId: string;
  displayName: string;
  sharedAt: string;
};

type BuildInviteCandidatesInput = {
  currentUserId: string;
  sharedMembers: SharedInviteCandidate[];
  existingMemberIds: Iterable<string>;
  followingUserIds: Iterable<string>;
  followedByUserIds: Iterable<string>;
  favoriteUserIds: Iterable<string>;
  blockedUserIds: Iterable<string>;
  profileNames: ReadonlyMap<string, string>;
  fallbackNames: ReadonlyMap<string, string>;
};

type ProfileNameRow = {
  user_id: string;
  nickname: string;
};

type ProfileErrorLike = {
  code?: string | null;
  message?: string | null;
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

export function buildInviteCandidates(input: BuildInviteCandidatesInput): ConnectionCandidate[] {
  const existingMemberIds = new Set(input.existingMemberIds);
  const followingUserIds = new Set(input.followingUserIds);
  const followedByUserIds = new Set(input.followedByUserIds);
  const favoriteUserIds = new Set(input.favoriteUserIds);
  const blockedUserIds = new Set(input.blockedUserIds);
  const candidateIds = new Set([
    ...input.sharedMembers.map((member) => member.userId),
    ...followingUserIds,
    ...favoriteUserIds
  ]);
  const people = new Map<string, ConnectionCandidate>();

  for (const member of input.sharedMembers) {
    if (!candidateIds.has(member.userId)) continue;

    const existing = people.get(member.userId);
    if (!existing) {
      people.set(member.userId, {
        userId: member.userId,
        displayName: member.displayName,
        sharedEventCount: 1,
        latestSharedAt: member.sharedAt,
        isFollowing: followingUserIds.has(member.userId),
        isFollowedBy: followedByUserIds.has(member.userId),
        isFavorite: favoriteUserIds.has(member.userId)
      });
      continue;
    }

    existing.sharedEventCount += 1;
    if (member.sharedAt > existing.latestSharedAt) {
      existing.latestSharedAt = member.sharedAt;
      existing.displayName = member.displayName;
    }
  }

  for (const userId of candidateIds) {
    if (userId === input.currentUserId || existingMemberIds.has(userId) || blockedUserIds.has(userId)) {
      people.delete(userId);
      continue;
    }

    const existing = people.get(userId);
    const displayName = input.profileNames.get(userId) ?? existing?.displayName ?? input.fallbackNames.get(userId) ?? "Madoiユーザー";
    if (existing) {
      existing.displayName = displayName;
      continue;
    }

    people.set(userId, {
      userId,
      displayName,
      sharedEventCount: 0,
      latestSharedAt: "",
      isFollowing: followingUserIds.has(userId),
      isFollowedBy: followedByUserIds.has(userId),
      isFavorite: favoriteUserIds.has(userId)
    });
  }

  return sortInviteCandidates([...people.values()]);
}

export function resolveInviteProfileNames(
  rows: ProfileNameRow[] | null | undefined,
  error: ProfileErrorLike | null | undefined
): Map<string, string> {
  if (error && !isProfileSchemaUnavailable(error)) {
    throw new Error("招待候補のプロフィールを読み込めませんでした");
  }

  return new Map((rows ?? []).map((profile) => [profile.user_id, profile.nickname]));
}

export function canInviteCandidate({
  hasSharedEvent,
  isFollowing,
  isFavorite,
  isBlocked
}: {
  hasSharedEvent: boolean;
  isFollowing: boolean;
  isFavorite: boolean;
  isBlocked: boolean;
}) {
  return !isBlocked && (hasSharedEvent || isFollowing || isFavorite);
}

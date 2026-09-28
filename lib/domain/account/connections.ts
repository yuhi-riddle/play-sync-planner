import type { EventDisplayState } from "@/lib/domain/event/event-filter";

export type ConnectionCandidate = {
  userId: string;
  displayName: string;
  sharedEventCount: number;
  activeSharedEventCount: number;
  latestSharedAt: string;
  isFollowing: boolean;
  isFollowedBy: boolean;
};

export type ConnectionCategory = "mutual" | "following" | "shared" | "blocked";

export type ConnectionCursor = { at: string; userId: string } | null;

export type ConnectionPage = {
  items: ConnectionCandidate[];
  nextCursor: ConnectionCursor;
};

const connectionPageSize = 20;

type ConnectionRpcRow = {
  user_id: string;
  display_name: string;
  shared_event_count: number | string;
  active_shared_event_count?: number | string;
  latest_shared_at: string | null;
  is_following: boolean;
  is_followed_by: boolean;
  cursor_at: string;
  cursor_user_id: string;
};

export function mapConnectionCandidateRow(row: ConnectionRpcRow): ConnectionCandidate {
  return {
    userId: row.user_id,
    displayName: row.display_name,
    sharedEventCount: Number(row.shared_event_count),
    activeSharedEventCount: Number(row.active_shared_event_count ?? 0),
    latestSharedAt: row.latest_shared_at ?? "",
    isFollowing: row.is_following,
    isFollowedBy: row.is_followed_by
  };
}

/**
 * list_connections は常に最大20件で打ち切る（migration 034参照）ので、
 * ちょうど20件返ってきたときだけ「まだ続きがあるかもしれない」とみなす。
 */
export function mapConnectionPage(rows: ConnectionRpcRow[]): ConnectionPage {
  const items = rows.map(mapConnectionCandidateRow);
  const lastRow = rows.at(-1);
  const nextCursor: ConnectionCursor =
    rows.length === connectionPageSize && lastRow ? { at: lastRow.cursor_at, userId: lastRow.cursor_user_id } : null;

  return { items, nextCursor };
}

export function mapConnectionCounts(
  rows: { category: string; item_count: number | string }[]
): Record<ConnectionCategory, number> {
  const counts: Record<ConnectionCategory, number> = {
    mutual: 0,
    following: 0,
    shared: 0,
    blocked: 0
  };

  for (const row of rows) {
    if (row.category in counts) {
      counts[row.category as ConnectionCategory] = Number(row.item_count);
    }
  }

  return counts;
}

export function toBlockedUser(candidate: ConnectionCandidate): BlockedUser {
  return { userId: candidate.userId, displayName: candidate.displayName };
}

export type BlockedUser = {
  userId: string;
  displayName: string;
};

export function isMutualFollow(candidate: ConnectionCandidate): boolean {
  return candidate.isFollowing && candidate.isFollowedBy;
}

export type ActiveSharedEvent = {
  eventId: string;
  title: string;
  displayState: EventDisplayState;
};

type ActiveSharedEventRpcRow = {
  event_id: string;
  title: string;
  display_state: string;
};

export function mapActiveSharedEvent(row: ActiveSharedEventRpcRow): ActiveSharedEvent {
  return {
    eventId: row.event_id,
    title: row.title,
    displayState: row.display_state as EventDisplayState
  };
}

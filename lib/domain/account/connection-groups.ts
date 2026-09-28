import type { EventDisplayState } from "@/lib/domain/event/event-filter";
import type { ConnectionCandidate } from "@/lib/domain/account/connections";

/** 並びの1番目が既定。キーはカテゴリ定数（lib/shared/constants.ts）と同じ綴り。 */
export const connectionGroupColors = [
  "nazotoki",
  "boardgame",
  "travel",
  "live",
  "drinking",
  "snowboard",
  "movie_stage",
  "honey"
] as const;

export type ConnectionGroupColor = (typeof connectionGroupColors)[number];

export const defaultConnectionGroupColor: ConnectionGroupColor = "nazotoki";

export const connectionGroupLimits = { groups: 20, members: 30, nameLength: 20 } as const;

/** 色の選択肢の読み上げと、色を見分けにくい人向けのラベル。 */
export const connectionGroupColorLabels: Record<ConnectionGroupColor, string> = {
  nazotoki: "すみれ",
  boardgame: "みどり",
  travel: "あお",
  live: "ふじ",
  drinking: "もも",
  snowboard: "みずいろ",
  movie_stage: "そら",
  honey: "こがね"
};

/** Tailwind が拾えるよう、クラス名は文字列のまま書く。 */
export const connectionGroupDotClass: Record<ConnectionGroupColor, string> = {
  nazotoki: "bg-category-nazotoki",
  boardgame: "bg-category-boardgame",
  travel: "bg-category-travel",
  live: "bg-category-live",
  drinking: "bg-category-drinking",
  snowboard: "bg-category-snowboard",
  movie_stage: "bg-category-movie-stage",
  honey: "bg-honey"
};

export function isConnectionGroupColor(value: string): value is ConnectionGroupColor {
  return (connectionGroupColors as readonly string[]).includes(value);
}

export function normalizeConnectionGroupName(
  raw: string
): { ok: true; name: string } | { ok: false; message: string } {
  const name = raw.trim();
  if (name.length === 0) return { ok: false, message: "グループ名を入力してください" };
  if ([...name].length > connectionGroupLimits.nameLength) {
    return { ok: false, message: `グループ名は${connectionGroupLimits.nameLength}文字までです` };
  }
  return { ok: true, name };
}

export type ConnectionGroup = {
  id: string;
  name: string;
  color: ConnectionGroupColor;
  memberCount: number;
  /** 先頭5人まで。 */
  memberNames: string[];
  activeEventCount: number;
};

export type ConnectionGroupMember = {
  userId: string;
  displayName: string;
  sharedEventCount: number;
  isFollowing: boolean;
};

type ConnectionGroupRpcRow = {
  group_id: string;
  name: string;
  color: string;
  member_count: number | string;
  member_names: string[] | null;
  active_event_count: number | string;
  created_at: string;
};

type ConnectionGroupMemberRpcRow = {
  user_id: string;
  display_name: string;
  shared_event_count: number | string;
  is_following: boolean;
};

export function mapConnectionGroupRow(row: ConnectionGroupRpcRow): ConnectionGroup {
  return {
    id: row.group_id,
    name: row.name,
    color: isConnectionGroupColor(row.color) ? row.color : defaultConnectionGroupColor,
    memberCount: Number(row.member_count),
    memberNames: row.member_names ?? [],
    activeEventCount: Number(row.active_event_count)
  };
}

export function mapConnectionGroupMemberRow(row: ConnectionGroupMemberRpcRow): ConnectionGroupMember {
  return {
    userId: row.user_id,
    displayName: row.display_name,
    sharedEventCount: Number(row.shared_event_count),
    isFollowing: row.is_following
  };
}

export function buildGroupIdsByMember(rows: { group_id: string; member_user_id: string }[]): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const row of rows) {
    (result[row.member_user_id] ??= []).push(row.group_id);
  }
  return result;
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return uuidPattern.test(value);
}

export type ConnectionGroupEvent = {
  eventId: string;
  title: string;
  displayState: EventDisplayState;
  isActive: boolean;
  /** このイベントに参加しているグループのメンバーの人数。 */
  memberCount: number;
  /** グループの人数（ブロック関係・退会した人を除く）。 */
  groupMemberCount: number;
};

type ConnectionGroupEventRpcRow = {
  event_id: string;
  title: string;
  display_state: string;
  is_active: boolean;
  member_count: number | string;
  group_member_count: number | string;
};

export function mapConnectionGroupEventRow(row: ConnectionGroupEventRpcRow): ConnectionGroupEvent {
  return {
    eventId: row.event_id,
    title: row.title,
    displayState: row.display_state as EventDisplayState,
    isActive: row.is_active,
    memberCount: Number(row.member_count),
    groupMemberCount: Number(row.group_member_count)
  };
}

export type EventInviteGroup = {
  id: string;
  name: string;
  color: ConnectionGroupColor;
  /** グループの人数（ブロック関係・退会した人を除く）。 */
  memberCount: number;
  /** そのイベントにいま招待できるメンバー。 */
  invitees: ConnectionCandidate[];
};

type EventGroupInviteeRpcRow = {
  group_id: string;
  group_name: string;
  group_color: string;
  group_member_count: number | string;
  user_id: string | null;
  display_name: string | null;
  shared_event_count: number | string | null;
  is_following: boolean | null;
};

export function buildEventInviteGroups(rows: EventGroupInviteeRpcRow[]): EventInviteGroup[] {
  const groups: EventInviteGroup[] = [];
  const byId = new Map<string, EventInviteGroup>();

  for (const row of rows) {
    let group = byId.get(row.group_id);
    if (!group) {
      group = {
        id: row.group_id,
        name: row.group_name,
        color: isConnectionGroupColor(row.group_color) ? row.group_color : defaultConnectionGroupColor,
        memberCount: Number(row.group_member_count),
        invitees: []
      };
      byId.set(row.group_id, group);
      groups.push(group);
    }

    if (row.user_id) {
      group.invitees.push({
        userId: row.user_id,
        displayName: row.display_name ?? "Madoiユーザー",
        sharedEventCount: Number(row.shared_event_count ?? 0),
        activeSharedEventCount: 0,
        latestSharedAt: "",
        isFollowing: Boolean(row.is_following),
        isFollowedBy: false,
        isFavorite: false
      });
    }
  }

  return groups;
}

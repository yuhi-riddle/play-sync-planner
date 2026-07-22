import type { ReceivedEventInvitation } from "@/components/received-event-invitations";
import type { ConnectionCandidate } from "@/lib/domain/connections";
import {
  connectionCategorySchema,
  encodeConnectionCursor,
  type ConnectionCategory
} from "@/lib/validation/request";
import { timed } from "@/lib/server/timing";

const pageSize = 20;

type RpcResult = { data: unknown; error: unknown | null };
export type ConnectionsPageRpcClient = {
  rpc: (name: string, args?: Record<string, unknown>) => Promise<RpcResult>;
};

type ConnectionRow = {
  user_id: string;
  display_name: string;
  shared_event_count: number | string;
  latest_shared_at: string;
  is_following: boolean;
  is_followed_by: boolean;
  is_favorite: boolean;
  cursor_at: string;
  cursor_user_id: string;
};
type ConnectionCountRow = { category: string; item_count: number | string };
type InvitationRow = {
  invitation_id: string;
  event_title: string;
  organizer_name: string;
  created_at: string;
};

function toCandidate(row: ConnectionRow): ConnectionCandidate {
  return {
    userId: row.user_id,
    displayName: row.display_name,
    sharedEventCount: Number(row.shared_event_count),
    latestSharedAt: row.latest_shared_at,
    isFollowing: row.is_following,
    isFollowedBy: row.is_followed_by,
    isFavorite: row.is_favorite
  };
}

export function loadConnectionsPageData(client: ConnectionsPageRpcClient, category: ConnectionCategory) {
  return timed("connections.load", () => loadConnectionsPageDataUntimed(client, category));
}

async function loadConnectionsPageDataUntimed(client: ConnectionsPageRpcClient, category: ConnectionCategory) {
  const [countsResult, invitationsResult, connectionsResult] = await Promise.all([
    client.rpc("get_connection_counts"),
    client.rpc("list_received_event_invitations", { p_limit: pageSize }),
    client.rpc("list_connections", {
      p_category: category,
      p_cursor_at: null,
      p_cursor_user_id: null,
      p_limit: pageSize
    })
  ]);

  const counts = Object.fromEntries(
    ((countsResult.error ? [] : countsResult.data ?? []) as ConnectionCountRow[])
      .filter((row) => connectionCategorySchema.safeParse(row.category).success)
      .map((row) => [row.category, Number(row.item_count)])
  ) as Partial<Record<ConnectionCategory, number>>;
  const invitations: ReceivedEventInvitation[] = invitationsResult.error
    ? []
    : ((invitationsResult.data ?? []) as InvitationRow[]).map((invitation) => ({
      id: invitation.invitation_id,
      eventTitle: invitation.event_title,
      organizerName: invitation.organizer_name,
      createdAt: invitation.created_at
    }));
  const rows = connectionsResult.error ? [] : ((connectionsResult.data ?? []) as ConnectionRow[]);
  const lastRow = rows.length === pageSize ? rows.at(-1) : undefined;

  return {
    counts,
    invitations,
    items: rows.map(toCandidate),
    nextCursor: lastRow ? encodeConnectionCursor({ cursorAt: lastRow.cursor_at, cursorUserId: lastRow.cursor_user_id }) : null,
    connectionError: connectionsResult.error ? "つながりを読み込めませんでした。もう一度お試しください。" : null
  };
}

import { redirect } from "next/navigation";

import { ConnectionList } from "@/components/connection-list";
import { ReceivedEventInvitations, type ReceivedEventInvitation } from "@/components/received-event-invitations";
import { SetupPanel } from "@/components/state-panels";
import { PageHeader } from "@/components/ui";
import type { ConnectionCandidate } from "@/lib/domain/connections";
import { createSupabaseServerClient, hasSupabaseEnv } from "@/lib/supabase/server";
import { connectionCategorySchema, type ConnectionCategory } from "@/lib/validation/request";

export const dynamic = "force-dynamic";

const pageSize = 20;

type SearchParams = { category?: string | string[] };
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

function selectedCategory(searchParams: SearchParams): ConnectionCategory {
  const value = typeof searchParams.category === "string" ? searchParams.category : null;
  const parsed = connectionCategorySchema.safeParse(value);
  return parsed.success ? parsed.data : "favorites";
}

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

export default async function ConnectionsPage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  if (!hasSupabaseEnv()) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Connections" title="つながり" />
        <SetupPanel />
      </div>
    );
  }

  const [params, supabase] = await Promise.all([searchParams ?? Promise.resolve({}), createSupabaseServerClient()]);
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=%2Fconnections");

  const category = selectedCategory(params);
  const [countsResult, invitationsResult, connectionsResult] = await Promise.all([
    supabase.rpc("get_connection_counts"),
    supabase.rpc("list_received_event_invitations", { p_limit: 20 }),
    supabase.rpc("list_connections", {
      p_category: category,
      p_cursor_at: null,
      p_cursor_user_id: null,
      p_limit: 20
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
  const initialNextCursor = lastRow
    ? Buffer.from(JSON.stringify({ cursorAt: lastRow.cursor_at, cursorUserId: lastRow.cursor_user_id })).toString("base64url")
    : null;

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Connections" title="つながり" description="一緒にイベントへ参加した人を、次の予定へ招待できます。" />
      <ReceivedEventInvitations invitations={invitations} />
      <ConnectionList
        initialCategory={category}
        initialItems={rows.map(toCandidate)}
        initialNextCursor={initialNextCursor}
        initialError={connectionsResult.error ? "つながりを読み込めませんでした。もう一度お試しください。" : null}
        counts={counts}
      />
    </div>
  );
}

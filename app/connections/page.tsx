import { redirect } from "next/navigation";

import { ConnectionList } from "@/components/account/connection-list";
import { ReceivedEventInvitations, type ReceivedEventInvitation } from "@/components/event/received-event-invitations";
import { SetupPanel } from "@/components/ui/state-panels";
import { PageHeader } from "@/components/ui";
import { mapConnectionCounts, mapConnectionPage, toBlockedUser, type ConnectionPage } from "@/lib/domain/account/connections";
import { createSupabaseAdminClient, createSupabaseServerClient, getCurrentUserId, hasSupabaseEnv } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ConnectionsPage() {
  if (!hasSupabaseEnv()) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Connections" title="つながり" />
        <SetupPanel />
      </div>
    );
  }

  const userId = await getCurrentUserId();

  if (!userId) {
    redirect("/login?next=%2Fconnections");
  }

  const [overview, invitations] = await Promise.all([loadConnectionsOverview(), loadReceivedEventInvitations(userId)]);

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Connections" title="つながり" description="一緒にイベントへ参加した人を、次の予定へ招待できます。" />
      <ReceivedEventInvitations invitations={invitations} />
      <ConnectionList
        favorites={{ ...overview.favorites, totalCount: overview.counts.favorites }}
        mutualFollows={{ ...overview.mutual, totalCount: overview.counts.mutual }}
        following={{ ...overview.following, totalCount: overview.counts.following }}
        candidates={{ ...overview.shared, totalCount: overview.counts.shared }}
        blockedUsers={{
          items: overview.blocked.items.map(toBlockedUser),
          nextCursor: overview.blocked.nextCursor,
          totalCount: overview.counts.blocked
        }}
      />
    </div>
  );
}

async function loadConnectionsOverview(): Promise<{
  counts: ReturnType<typeof mapConnectionCounts>;
  favorites: ConnectionPage;
  mutual: ConnectionPage;
  following: ConnectionPage;
  shared: ConnectionPage;
  blocked: ConnectionPage;
}> {
  const supabase = await createSupabaseServerClient();
  const firstPage = { p_cursor_at: null, p_cursor_user_id: null, p_limit: 20 };
  const [countsResult, favoritesResult, mutualResult, followingResult, sharedResult, blockedResult] = await Promise.all([
    supabase.rpc("get_connection_counts"),
    supabase.rpc("list_connections", { p_category: "favorites", ...firstPage }),
    supabase.rpc("list_connections", { p_category: "mutual", ...firstPage }),
    supabase.rpc("list_connections", { p_category: "following", ...firstPage }),
    supabase.rpc("list_connections", { p_category: "shared", ...firstPage }),
    supabase.rpc("list_connections", { p_category: "blocked", ...firstPage })
  ]);

  if (
    countsResult.error ||
    favoritesResult.error ||
    mutualResult.error ||
    followingResult.error ||
    sharedResult.error ||
    blockedResult.error
  ) {
    throw new Error("つながりを読み込めませんでした。");
  }

  return {
    counts: mapConnectionCounts(countsResult.data ?? []),
    favorites: mapConnectionPage(favoritesResult.data ?? []),
    mutual: mapConnectionPage(mutualResult.data ?? []),
    following: mapConnectionPage(followingResult.data ?? []),
    shared: mapConnectionPage(sharedResult.data ?? []),
    blocked: mapConnectionPage(blockedResult.data ?? [])
  };
}

async function loadReceivedEventInvitations(currentUserId: string): Promise<ReceivedEventInvitation[]> {
  const admin = createSupabaseAdminClient();
  const { data: invitations, error: invitationsError } = await admin
    .from("event_user_invitations")
    .select("id, event_id, created_at")
    .eq("invitee_user_id", currentUserId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (invitationsError || !invitations?.length) return [];

  const eventIds = invitations.map((invitation) => invitation.event_id);
  const [eventsResult, organizersResult] = await Promise.all([
    admin.from("events").select("id, title").in("id", eventIds),
    admin.from("event_members").select("event_id, display_name").in("event_id", eventIds).eq("role", "organizer").eq("status", "joined")
  ]);

  if (eventsResult.error || organizersResult.error) {
    throw new Error("届いた招待を読み込めませんでした");
  }

  const eventTitles = new Map((eventsResult.data ?? []).map((event) => [event.id, event.title]));
  const organizerNames = new Map((organizersResult.data ?? []).map((organizer) => [organizer.event_id, organizer.display_name]));

  return invitations.map((invitation) => ({
    id: invitation.id,
    eventTitle: eventTitles.get(invitation.event_id) ?? "イベント",
    organizerName: organizerNames.get(invitation.event_id) ?? "主催者",
    createdAt: invitation.created_at
  }));
}

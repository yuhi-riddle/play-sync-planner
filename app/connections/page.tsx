import { redirect } from "next/navigation";

import { ConnectionList } from "@/components/account/connection-list";
import { ConnectionGroupsSection } from "@/components/account/connection-groups-section";
import { ReceivedEventInvitations, type ReceivedEventInvitation } from "@/components/event/received-event-invitations";
import { SetupPanel } from "@/components/ui/state-panels";
import { PageHeader } from "@/components/ui";
import { mapConnectionCounts, mapConnectionPage, toBlockedUser, type ConnectionPage } from "@/lib/domain/account/connections";
import { buildGroupIdsByMember, mapConnectionGroupRow } from "@/lib/domain/account/connection-groups";
import { createSupabaseServerClient, getCurrentUserId, hasSupabaseEnv } from "@/lib/supabase/server";

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

  const supabase = await createSupabaseServerClient();
  const [overview, invitations, groupData] = await Promise.all([
    loadConnectionsOverview(supabase),
    loadReceivedEventInvitations(supabase),
    loadConnectionGroups(supabase)
  ]);

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Connections" title="つながり" description="よく遊ぶ仲間をグループにまとめて、次のイベントにまとめて誘えます。" />
      <ReceivedEventInvitations invitations={invitations} />
      <div className="grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)] lg:items-start">
        <ConnectionGroupsSection groups={groupData.groups} />
        <section aria-labelledby="connection-people-heading" className="grid gap-3">
          <h2 id="connection-people-heading" className="text-xl font-semibold text-ink">人</h2>
          <ConnectionList
            mutualFollows={{ ...overview.mutual, totalCount: overview.counts.mutual }}
            following={{ ...overview.following, totalCount: overview.counts.following }}
            candidates={{ ...overview.shared, totalCount: overview.counts.shared }}
            blockedUsers={{
              items: overview.blocked.items.map(toBlockedUser),
              nextCursor: overview.blocked.nextCursor,
              totalCount: overview.counts.blocked
            }}
            groups={groupData.groups}
            groupIdsByMember={groupData.groupIdsByMember}
          />
        </section>
      </div>
    </div>
  );
}

async function loadConnectionsOverview(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>): Promise<{
  counts: ReturnType<typeof mapConnectionCounts>;
  mutual: ConnectionPage;
  following: ConnectionPage;
  shared: ConnectionPage;
  blocked: ConnectionPage;
}> {
  const firstPage = { p_cursor_at: null, p_cursor_user_id: null, p_limit: 20 };
  const [countsResult, mutualResult, followingResult, sharedResult, blockedResult] = await Promise.all([
    supabase.rpc("get_connection_counts"),
    supabase.rpc("list_connections", { p_category: "mutual", ...firstPage }),
    supabase.rpc("list_connections", { p_category: "following", ...firstPage }),
    supabase.rpc("list_connections", { p_category: "shared", ...firstPage }),
    supabase.rpc("list_connections", { p_category: "blocked", ...firstPage })
  ]);

  if (
    countsResult.error ||
    mutualResult.error ||
    followingResult.error ||
    sharedResult.error ||
    blockedResult.error
  ) {
    throw new Error("つながりを読み込めませんでした。");
  }

  return {
    counts: mapConnectionCounts(countsResult.data ?? []),
    mutual: mapConnectionPage(mutualResult.data ?? []),
    following: mapConnectionPage(followingResult.data ?? []),
    shared: mapConnectionPage(sharedResult.data ?? []),
    blocked: mapConnectionPage(blockedResult.data ?? [])
  };
}

async function loadConnectionGroups(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>) {
  const [groupsResult, membershipsResult] = await Promise.all([
    supabase.rpc("list_connection_groups"),
    supabase.rpc("list_connection_group_memberships")
  ]);

  if (groupsResult.error || membershipsResult.error) {
    throw new Error("グループを読み込めませんでした。");
  }

  return {
    groups: (groupsResult.data ?? []).map(mapConnectionGroupRow),
    groupIdsByMember: buildGroupIdsByMember(membershipsResult.data ?? [])
  };
}

type ReceivedEventInvitationRpcRow = {
  invitation_id: string;
  event_title: string;
  organizer_name: string;
  created_at: string;
};

async function loadReceivedEventInvitations(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>
): Promise<ReceivedEventInvitation[]> {
  const { data, error } = await supabase.rpc("list_received_event_invitations", { p_limit: 20 });

  if (error) {
    throw new Error("届いた招待を読み込めませんでした");
  }

  return ((data ?? []) as ReceivedEventInvitationRpcRow[]).map((invitation) => ({
    id: invitation.invitation_id,
    eventTitle: invitation.event_title,
    organizerName: invitation.organizer_name,
    createdAt: invitation.created_at
  }));
}

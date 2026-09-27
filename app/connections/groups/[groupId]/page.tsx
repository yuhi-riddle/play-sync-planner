import { notFound, redirect } from "next/navigation";
import React from "react";

import { ConnectionGroupDetail } from "@/components/account/connection-group-detail";
import { ConnectionGroupEvents } from "@/components/account/connection-group-events";
import {
  isUuid,
  mapConnectionGroupEventRow,
  mapConnectionGroupMemberRow,
  mapConnectionGroupRow
} from "@/lib/domain/account/connection-groups";
import { createSupabaseServerClient, getCurrentUserId } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ConnectionGroupPage({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  if (!isUuid(groupId)) notFound();

  const userId = await getCurrentUserId();
  if (!userId) {
    redirect(`/login?next=${encodeURIComponent(`/connections/groups/${groupId}`)}`);
  }

  const supabase = await createSupabaseServerClient();
  const [groupResult, membersResult, eventsResult] = await Promise.all([
    supabase.rpc("get_connection_group", { p_group_id: groupId }),
    supabase.rpc("list_connection_group_members", { p_group_id: groupId }),
    supabase.rpc("list_connection_group_events", { p_group_id: groupId })
  ]);

  if (groupResult.error || membersResult.error || eventsResult.error) {
    throw new Error("グループを読み込めませんでした。");
  }

  const row = groupResult.data?.[0];
  if (!row) notFound();

  const group = mapConnectionGroupRow({ ...row, member_names: [], active_event_count: 0 });
  const members = (membersResult.data ?? []).map(mapConnectionGroupMemberRow);
  const events = (eventsResult.data ?? []).map(mapConnectionGroupEventRow);

  return (
    <div className="grid gap-8">
      <ConnectionGroupDetail group={group} members={members} />
      <ConnectionGroupEvents events={events} />
    </div>
  );
}

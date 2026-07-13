import { redirect } from "next/navigation";

import { ConnectionList } from "@/components/connection-list";
import { ReceivedEventInvitations, type ReceivedEventInvitation } from "@/components/received-event-invitations";
import { SetupPanel } from "@/components/state-panels";
import { PageHeader } from "@/components/ui";
import { sortInviteCandidates, type ConnectionCandidate } from "@/lib/domain/connections";
import { createSupabaseAdminClient, createSupabaseServerClient, hasSupabaseEnv } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type EventMemberRow = {
  event_id: string;
  user_id: string;
  display_name: string;
  created_at: string;
};

export default async function ConnectionsPage() {
  if (!hasSupabaseEnv()) {
    return (
      <div className="space-y-6">
        <PageHeader title="つながり" />
        <SetupPanel />
      </div>
    );
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=%2Fconnections");
  }

  const [candidates, invitations] = await Promise.all([loadConnectionCandidates(user.id), loadReceivedEventInvitations(user.id)]);
  const favorites = candidates.filter((candidate) => candidate.isFavorite);
  const mutualFollows = candidates.filter((candidate) => !candidate.isFavorite && candidate.isFollowing && candidate.isFollowedBy);
  const following = candidates.filter((candidate) => !candidate.isFavorite && candidate.isFollowing && !candidate.isFollowedBy);
  const recent = candidates.filter((candidate) => !candidate.isFavorite && !candidate.isFollowing);

  return (
    <div className="space-y-6">
      <PageHeader title="つながり" description="一緒にイベントへ参加した人を、次の予定へ招待できます。" />
      <ReceivedEventInvitations invitations={invitations} />
      <ConnectionList favorites={favorites} mutualFollows={mutualFollows} following={following} candidates={recent} />
    </div>
  );
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

async function loadConnectionCandidates(currentUserId: string): Promise<ConnectionCandidate[]> {
  const admin = createSupabaseAdminClient();
  const { data: currentMemberships, error: currentMembershipsError } = await admin
    .from("event_members")
    .select("event_id")
    .eq("user_id", currentUserId)
    .eq("status", "joined");

  if (currentMembershipsError || !currentMemberships?.length) {
    return [];
  }

  const eventIds = currentMemberships.map((membership) => membership.event_id);
  const [membersResult, followingResult, followedByResult, favoritesResult, blocksResult] = await Promise.all([
    admin.from("event_members").select("event_id, user_id, display_name, created_at").in("event_id", eventIds).eq("status", "joined"),
    admin.from("user_connections").select("followed_user_id").eq("follower_user_id", currentUserId),
    admin.from("user_connections").select("follower_user_id").eq("followed_user_id", currentUserId),
    admin.from("user_favorites").select("favorite_user_id").eq("user_id", currentUserId),
    admin
      .from("user_blocks")
      .select("blocker_user_id, blocked_user_id")
      .or(`blocker_user_id.eq.${currentUserId},blocked_user_id.eq.${currentUserId}`)
  ]);

  if (membersResult.error || followingResult.error || followedByResult.error || favoritesResult.error || blocksResult.error) {
    throw new Error("つながりを読み込めませんでした。");
  }

  const blockedUserIds = new Set(
    (blocksResult.data ?? []).map((block) => (block.blocker_user_id === currentUserId ? block.blocked_user_id : block.blocker_user_id))
  );
  const followingUserIds = new Set((followingResult.data ?? []).map((connection) => connection.followed_user_id));
  const followedByUserIds = new Set((followedByResult.data ?? []).map((connection) => connection.follower_user_id));
  const favoriteUserIds = new Set((favoritesResult.data ?? []).map((favorite) => favorite.favorite_user_id));
  const people = new Map<string, ConnectionCandidate>();

  for (const member of (membersResult.data ?? []) as EventMemberRow[]) {
    if (member.user_id === currentUserId || blockedUserIds.has(member.user_id)) {
      continue;
    }

    const existing = people.get(member.user_id);
    if (!existing) {
      people.set(member.user_id, {
        userId: member.user_id,
        displayName: member.display_name,
        sharedEventCount: 1,
        latestSharedAt: member.created_at,
        isFollowing: followingUserIds.has(member.user_id),
        isFollowedBy: followedByUserIds.has(member.user_id),
        isFavorite: favoriteUserIds.has(member.user_id)
      });
      continue;
    }

    existing.sharedEventCount += 1;
    if (member.created_at > existing.latestSharedAt) {
      existing.latestSharedAt = member.created_at;
      existing.displayName = member.display_name;
    }
  }

  return sortInviteCandidates([...people.values()]);
}

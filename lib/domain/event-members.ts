export type EventInviteStatus = "open" | "closed" | "revoked";

export type EventMember = {
  eventId: string;
  userId: string;
  displayName: string;
  role: "organizer" | "member";
  status: "joined" | "removed";
};

export function canJoinWithInvite(status: EventInviteStatus) {
  return status === "open";
}

export function canStartPlanFromMembers(members: EventMember[]) {
  return members.some((member) => member.role === "organizer" && member.status === "joined");
}

export function buildEventInviteUrl(siteUrl: string, token: string) {
  return new URL(`/invites/${token}`, siteUrl).toString();
}

export function snapshotEventMembersForPlan(members: EventMember[], planId: string) {
  return members
    .filter((member) => member.status === "joined")
    .map((member) => ({
      plan_id: planId,
      user_id: member.userId,
      display_name: member.displayName,
      participant_type: "registered" as const,
      status: "invited" as const,
      is_organizer: member.role === "organizer"
    }));
}

export const buildPlanParticipantsFromMembers = snapshotEventMembersForPlan;

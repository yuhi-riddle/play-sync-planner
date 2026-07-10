import { describe, expect, it } from "vitest";

import { buildPlanParticipantsFromMembers, type EventMember } from "@/lib/domain/event-members";

describe("plan member snapshot", () => {
  it("creates registered plan participants from joined event members", () => {
    const members: EventMember[] = [
      { eventId: "event-1", userId: "owner", displayName: "Owner", role: "organizer", status: "joined" },
      { eventId: "event-1", userId: "member-1", displayName: "Member", role: "member", status: "joined" },
      { eventId: "event-1", userId: "removed", displayName: "Removed", role: "member", status: "removed" }
    ];

    expect(buildPlanParticipantsFromMembers(members, "plan-1")).toEqual([
      expect.objectContaining({ user_id: "owner", is_organizer: true, participant_type: "registered" }),
      expect.objectContaining({ user_id: "member-1", is_organizer: false, participant_type: "registered" })
    ]);
  });
});

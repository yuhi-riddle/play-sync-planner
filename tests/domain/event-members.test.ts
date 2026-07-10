import { describe, expect, it } from "vitest";

import {
  canJoinWithInvite,
  canStartPlanFromMembers,
  snapshotEventMembersForPlan,
  type EventMember
} from "@/lib/domain/event-members";

const members: EventMember[] = [
  {
    eventId: "event-1",
    userId: "owner-1",
    displayName: "主催者",
    role: "organizer",
    status: "joined"
  },
  {
    eventId: "event-1",
    userId: "member-1",
    displayName: "参加者",
    role: "member",
    status: "joined"
  },
  {
    eventId: "event-1",
    userId: "removed-1",
    displayName: "外れた人",
    role: "member",
    status: "removed"
  }
];

describe("event members", () => {
  it("allows only open invite links to accept new members", () => {
    expect(canJoinWithInvite("open")).toBe(true);
    expect(canJoinWithInvite("closed")).toBe(false);
    expect(canJoinWithInvite("revoked")).toBe(false);
  });

  it("allows plan creation when a joined organizer is present", () => {
    expect(canStartPlanFromMembers(members)).toBe(true);
    expect(canStartPlanFromMembers(members.filter((member) => member.role !== "organizer"))).toBe(false);
  });

  it("copies joined event members into registered plan participants", () => {
    expect(snapshotEventMembersForPlan(members, "plan-1")).toEqual([
      {
        plan_id: "plan-1",
        user_id: "owner-1",
        display_name: "主催者",
        participant_type: "registered",
        status: "invited",
        is_organizer: true
      },
      {
        plan_id: "plan-1",
        user_id: "member-1",
        display_name: "参加者",
        participant_type: "registered",
        status: "invited",
        is_organizer: false
      }
    ]);
  });
});

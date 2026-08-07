import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { EventMemberInviteCard } from "@/components/event/event-member-invite-card";

describe("invite flow", () => {
  it("makes the open participation state visible to the organizer", () => {
    render(
      <EventMemberInviteCard
        memberCount={1}
        inviteUrl="https://madoi.example/invites/a"
        status="open"
        closeInviteAction={vi.fn()}
        reissueInviteAction={vi.fn()}
      />
    );

    expect(screen.getByText("参加受付中")).toBeInTheDocument();
  });
});

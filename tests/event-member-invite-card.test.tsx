import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { EventMemberInviteCard } from "@/components/event-member-invite-card";

describe("EventMemberInviteCard", () => {
  it("shows the joined member count and lets the organizer close participation", () => {
    render(
      <EventMemberInviteCard
        memberCount={3}
        inviteUrl="https://madoi.example/invites/a"
        status="open"
        closeInviteAction={vi.fn()}
        reissueInviteAction={vi.fn()}
      />
    );

    expect(screen.getByText("参加済み 3人")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "参加受付を終了して日程調整へ進む" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "リンクをコピー" })).toBeEnabled();
  });
});

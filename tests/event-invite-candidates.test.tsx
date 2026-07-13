import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { EventInviteCandidates } from "@/components/event-invite-candidates";

const favorite = {
  userId: "11111111-1111-4111-8111-111111111111",
  displayName: "Aさん",
  sharedEventCount: 3,
  latestSharedAt: "2026-07-01T10:00:00.000Z",
  isFollowing: true,
  isFollowedBy: true,
  isFavorite: true
};

const recent = {
  ...favorite,
  userId: "22222222-2222-4222-8222-222222222222",
  displayName: "Bさん",
  isFollowing: false,
  isFollowedBy: false,
  isFavorite: false
};

describe("EventInviteCandidates", () => {
  it("lets the organizer select people and sends only their ids", async () => {
    const action = vi.fn().mockResolvedValue(undefined);
    render(<EventInviteCandidates candidates={[favorite, recent]} action={action} />);

    const invitation = screen.getAllByRole("checkbox")[0];
    expect(invitation).toHaveAccessibleName("Aさんを招待する");

    fireEvent.click(invitation);
    fireEvent.click(screen.getByRole("button", { name: "Madoiで招待を送る" }));

    await waitFor(() => expect(action).toHaveBeenCalledWith([favorite.userId]));
    expect(screen.getByText("招待を送りました")).toBeInTheDocument();
  });
});

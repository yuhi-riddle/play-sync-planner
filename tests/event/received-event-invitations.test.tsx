import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const { respondToEventUserInvitationAction } = vi.hoisted(() => ({
  respondToEventUserInvitationAction: vi.fn()
}));

vi.mock("@/lib/actions/account/connections", () => ({
  respondToEventUserInvitationAction
}));

vi.mock("next/navigation", () => ({
  unstable_rethrow: vi.fn()
}));

import { unstable_rethrow } from "next/navigation";

import { ReceivedEventInvitations } from "@/components/event/received-event-invitations";

const invitation = {
  id: "11111111-1111-4111-8111-111111111111",
  eventTitle: "夏の予定合わせ",
  organizerName: "あきら",
  createdAt: "2026-07-13T01:23:00.000Z"
};

describe("ReceivedEventInvitations", () => {
  it("shows pending invitations with the event, organizer, and creation date", () => {
    render(<ReceivedEventInvitations invitations={[invitation]} />);

    expect(screen.getByRole("heading", { name: "届いた招待" })).toBeInTheDocument();
    expect(screen.getByText("夏の予定合わせ")).toBeInTheDocument();
    expect(screen.getByText("主催者: あきら")).toBeInTheDocument();
    expect(screen.getByText("2026/7/13")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "参加する" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "今回は見送る" })).toBeEnabled();
  });

  it("accepts an invitation and shows the result inline", async () => {
    respondToEventUserInvitationAction.mockResolvedValue({ status: "success" });
    render(<ReceivedEventInvitations invitations={[invitation]} />);

    fireEvent.click(screen.getByRole("button", { name: "参加する" }));

    await waitFor(() => expect(respondToEventUserInvitationAction).toHaveBeenCalledWith(invitation.id, "accepted"));
    expect(screen.getByRole("status")).toHaveTextContent("参加しました");
  });

  it("shows an inline error when declining fails", async () => {
    respondToEventUserInvitationAction.mockResolvedValue({
      status: "error",
      message: "招待を更新できませんでした"
    });
    render(<ReceivedEventInvitations invitations={[invitation]} />);

    fireEvent.click(screen.getByRole("button", { name: "今回は見送る" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("招待を更新できませんでした");
  });

  it("passes caught errors through unstable_rethrow so framework redirects aren't swallowed", async () => {
    const redirectError = new Error("NEXT_REDIRECT;push;/login;replace;307;");
    respondToEventUserInvitationAction.mockRejectedValueOnce(redirectError);
    render(<ReceivedEventInvitations invitations={[invitation]} />);

    fireEvent.click(screen.getByRole("button", { name: "参加する" }));

    await waitFor(() => expect(unstable_rethrow).toHaveBeenCalledWith(redirectError));
  });
});

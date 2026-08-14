import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  unstable_rethrow: vi.fn()
}));

import { unstable_rethrow } from "next/navigation";

import { EventInviteCandidates } from "@/components/event/event-invite-candidates";

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

const followedOnly = {
  ...recent,
  userId: "33333333-3333-4333-8333-333333333333",
  displayName: "Cさん",
  sharedEventCount: 0,
  latestSharedAt: "",
  isFollowing: true
};

describe("EventInviteCandidates", () => {
  it("lets the organizer select people and sends only their ids", async () => {
    const action = vi.fn().mockResolvedValue({ status: "success" });
    render(<EventInviteCandidates candidates={[favorite, recent]} nextCursor={null} action={action} loadMoreAction={vi.fn()} />);

    const invitation = screen.getAllByRole("checkbox")[0];
    expect(invitation).toHaveAccessibleName("Aさんを招待する");

    fireEvent.click(invitation);
    fireEvent.click(screen.getByRole("button", { name: "Madoiで招待を送る" }));

    await waitFor(() => expect(action).toHaveBeenCalledWith([favorite.userId]));
    expect(screen.getByText("招待を送りました")).toBeInTheDocument();
  });

  it("explains that followed users without shared events are invite candidates", () => {
    render(<EventInviteCandidates candidates={[followedOnly]} nextCursor={null} action={vi.fn()} loadMoreAction={vi.fn()} />);

    expect(screen.getByText("一緒に参加した人や、フォロー中・お気に入りの人から選べます。")).toBeInTheDocument();
    expect(screen.getByText("フォロー中")).toBeInTheDocument();
  });

  it("passes caught errors through unstable_rethrow so framework redirects aren't swallowed", async () => {
    const redirectError = new Error("NEXT_REDIRECT;push;/login;replace;307;");
    const action = vi.fn().mockRejectedValue(redirectError);
    render(<EventInviteCandidates candidates={[favorite]} nextCursor={null} action={action} loadMoreAction={vi.fn()} />);

    fireEvent.click(screen.getAllByRole("checkbox")[0]);
    fireEvent.click(screen.getByRole("button", { name: "Madoiで招待を送る" }));

    await waitFor(() => expect(unstable_rethrow).toHaveBeenCalledWith(redirectError));
  });

  it("shows a load more button only when a next cursor exists, and appends the loaded page", async () => {
    const nextCursor = { at: favorite.latestSharedAt, userId: favorite.userId };
    const loadMoreAction = vi.fn().mockResolvedValue({
      items: [{ ...recent, userId: "44444444-4444-4444-8444-444444444444", displayName: "Dさん" }],
      nextCursor: null
    });

    render(<EventInviteCandidates candidates={[favorite]} nextCursor={nextCursor} action={vi.fn()} loadMoreAction={loadMoreAction} />);

    expect(screen.getByRole("button", { name: "もっと見る" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "もっと見る" }));

    await waitFor(() => expect(loadMoreAction).toHaveBeenCalledWith(nextCursor));
    await waitFor(() => expect(screen.getByText("Dさん")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "もっと見る" })).not.toBeInTheDocument();
  });

  it("shows an error and keeps the button when loading more fails", async () => {
    const nextCursor = { at: favorite.latestSharedAt, userId: favorite.userId };
    const loadMoreAction = vi.fn().mockRejectedValue(new Error("続きを読み込めませんでした。"));

    render(<EventInviteCandidates candidates={[favorite]} nextCursor={nextCursor} action={vi.fn()} loadMoreAction={loadMoreAction} />);

    fireEvent.click(screen.getByRole("button", { name: "もっと見る" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("続きを読み込めませんでした。"));
    expect(screen.getByRole("button", { name: "もっと見る" })).toBeInTheDocument();
  });
});

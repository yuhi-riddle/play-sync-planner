import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
  activeSharedEventCount: 0,
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
    fireEvent.click(screen.getByRole("button", { name: "1人に招待を送る" }));

    await waitFor(() => expect(action).toHaveBeenCalledWith([favorite.userId]));
    expect(screen.getByText("招待を送りました")).toBeInTheDocument();
  });

  it("explains that followed users without shared events are invite candidates", () => {
    render(<EventInviteCandidates candidates={[followedOnly]} nextCursor={null} action={vi.fn()} loadMoreAction={vi.fn()} />);

    expect(screen.getByText("一緒に参加した人や、フォロー中の人から選べます。")).toBeInTheDocument();
    expect(screen.getByText("フォロー中")).toBeInTheDocument();
  });

  it("お気に入りの人も「フォロー中」と表示し、お気に入りの文言を出さない", () => {
    const followedFavorite = { ...followedOnly, isFavorite: true };
    render(
      <EventInviteCandidates candidates={[followedFavorite]} nextCursor={null} action={vi.fn()} loadMoreAction={vi.fn()} />
    );

    expect(screen.getByText("フォロー中")).toBeInTheDocument();
    expect(screen.queryByText(/お気に入り/)).not.toBeInTheDocument();
  });

  it("passes caught errors through unstable_rethrow so framework redirects aren't swallowed", async () => {
    const redirectError = new Error("NEXT_REDIRECT;push;/login;replace;307;");
    const action = vi.fn().mockRejectedValue(redirectError);
    render(<EventInviteCandidates candidates={[favorite]} nextCursor={null} action={action} loadMoreAction={vi.fn()} />);

    fireEvent.click(screen.getAllByRole("checkbox")[0]);
    fireEvent.click(screen.getByRole("button", { name: "1人に招待を送る" }));

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
    await waitFor(() => expect(screen.getByRole("button", { name: "もっと見る" })).toBeInTheDocument());
  });
});

describe("グループでまとめて選ぶ", () => {
  const unloaded = { ...recent, userId: "55555555-5555-4555-8555-555555555555", displayName: "Eさん" };
  const groups = [
    { id: "g1", name: "謎解き仲間", color: "nazotoki" as const, memberCount: 2, invitees: [favorite, unloaded] },
    { id: "g2", name: "大学の友達", color: "boardgame" as const, memberCount: 3, invitees: [] }
  ];

  it("グループを作っていなければボタンの行を出さない", () => {
    render(<EventInviteCandidates candidates={[favorite]} nextCursor={null} action={vi.fn()} loadMoreAction={vi.fn()} />);
    expect(screen.queryByRole("group", { name: "グループでまとめて選ぶ" })).not.toBeInTheDocument();
  });

  it("ボタンに招待できる人数を出し、0人のグループは押せない", () => {
    render(
      <EventInviteCandidates candidates={[favorite, recent]} nextCursor={null} action={vi.fn()} loadMoreAction={vi.fn()} groups={groups} />
    );
    const row = screen.getByRole("group", { name: "グループでまとめて選ぶ" });
    expect(within(row).getByRole("button", { name: /謎解き仲間 2人/ })).toBeEnabled();
    const full = within(row).getByRole("button", { name: /大学の友達/ });
    expect(full).toBeDisabled();
    expect(full).toHaveTextContent("全員参加済み・招待済み");
  });

  it("押すと、まだ読み込んでいない人も含めてチェックし、選んだ人を先頭に出す", async () => {
    const action = vi.fn().mockResolvedValue({ status: "success" });
    render(
      <EventInviteCandidates candidates={[recent, favorite]} nextCursor={null} action={action} loadMoreAction={vi.fn()} groups={groups} />
    );

    fireEvent.click(screen.getByRole("button", { name: /謎解き仲間 2人/ }));

    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes[0]).toHaveAccessibleName("Aさんを招待する");
    expect(checkboxes[0]).toBeChecked();
    expect(checkboxes[1]).toHaveAccessibleName("Eさんを招待する");
    expect(checkboxes[1]).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Bさんを招待する" })).not.toBeChecked();

    fireEvent.click(screen.getByRole("button", { name: "2人に招待を送る" }));
    await waitFor(() => expect(action).toHaveBeenCalledWith([favorite.userId, unloaded.userId]));
  });

  it("送ったあとは、その人たちをグループの招待できる人から外す", async () => {
    const action = vi.fn().mockResolvedValue({ status: "success" });
    render(
      <EventInviteCandidates candidates={[favorite]} nextCursor={null} action={action} loadMoreAction={vi.fn()} groups={groups} />
    );

    fireEvent.click(screen.getByRole("button", { name: /謎解き仲間 2人/ }));
    fireEvent.click(screen.getByRole("button", { name: "2人に招待を送る" }));

    await waitFor(() => expect(screen.getByText("招待を送りました")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /謎解き仲間/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Madoiで招待を送る" })).toBeInTheDocument();
  });
});

describe("一度に招待できる人数", () => {
  it("31人以上を選ぶと理由を出し、送るボタンを押せない", () => {
    const many = Array.from({ length: 31 }, (_, index) => ({
      ...recent,
      userId: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      displayName: `メンバー${index}`
    }));
    const groups = [
      { id: "g1", name: "前半", color: "nazotoki" as const, memberCount: 20, invitees: many.slice(0, 20) },
      { id: "g2", name: "後半", color: "boardgame" as const, memberCount: 11, invitees: many.slice(20) }
    ];
    const action = vi.fn();
    render(<EventInviteCandidates candidates={[]} nextCursor={null} action={action} loadMoreAction={vi.fn()} groups={groups} />);

    fireEvent.click(screen.getByRole("button", { name: /前半 20人/ }));
    fireEvent.click(screen.getByRole("button", { name: /後半 11人/ }));

    expect(screen.getByText("一度に招待できるのは30人までです（いま31人）")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "31人に招待を送る" })).toBeDisabled();
    expect(action).not.toHaveBeenCalled();
  });
});

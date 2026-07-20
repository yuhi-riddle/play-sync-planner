import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EventInviteCandidates } from "@/components/event-invite-candidates";

const eventId = "11111111-1111-4111-8111-111111111111";
const favorite = {
  userId: "22222222-2222-4222-8222-222222222222",
  displayName: "Aさん",
  sharedEventCount: 3,
  latestSharedAt: "2026-07-01T10:00:00.000Z",
  isFollowing: true,
  isFollowedBy: true,
  isFavorite: true
};
const recent = {
  ...favorite,
  userId: "33333333-3333-4333-8333-333333333333",
  displayName: "Bさん",
  isFollowing: false,
  isFollowedBy: false,
  isFavorite: false
};

function page(items: typeof favorite[], nextCursor: string | null = null) {
  return { ok: true, json: vi.fn().mockResolvedValue({ items, nextCursor }) } as unknown as Response;
}

describe("EventInviteCandidates", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not fetch candidates until the owner asks to choose invitees", async () => {
    const fetchMock = vi.fn().mockResolvedValue(page([favorite]));
    vi.stubGlobal("fetch", fetchMock);

    render(<EventInviteCandidates eventId={eventId} action={vi.fn()} />);

    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "招待する人を選ぶ" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(`/api/events/${eventId}/invite-candidates`, expect.objectContaining({ signal: expect.anything() })));
    expect(await screen.findByText("Aさん")).toBeInTheDocument();
  });

  it("limits the query to 100 characters and waits 300ms before searching", async () => {
    const fetchMock = vi.fn().mockResolvedValue(page([favorite]));
    vi.stubGlobal("fetch", fetchMock);
    vi.useFakeTimers();

    render(<EventInviteCandidates eventId={eventId} action={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "招待する人を選ぶ" }));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const longQuery = "a".repeat(101);
    fireEvent.change(screen.getByRole("searchbox", { name: "候補を検索" }), { target: { value: longQuery } });
    expect(screen.getByRole("searchbox", { name: "候補を検索" })).toHaveValue("a".repeat(100));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(299);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });

    expect(fetchMock).toHaveBeenLastCalledWith(`/api/events/${eventId}/invite-candidates?q=${"a".repeat(100)}`, expect.objectContaining({ signal: expect.anything() }));
  });

  it("aborts a stale search immediately and aborts the active request on unmount", async () => {
    const signals: AbortSignal[] = [];
    const fetchMock = vi.fn().mockImplementation((_: string, init: RequestInit) => {
      signals.push(init.signal as AbortSignal);
      return new Promise<Response>(() => undefined);
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.useFakeTimers();

    const view = render(<EventInviteCandidates eventId={eventId} action={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "招待する人を選ぶ" }));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getByRole("searchbox", { name: "候補を検索" }), { target: { value: "new" } });
    expect(signals[0].aborted).toBe(true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    view.unmount();
    expect(signals[1].aborted).toBe(true);
  });

  it("uses the cursor, preserves candidates after a failed load-more, and retries without duplicates", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(page([favorite], "next-cursor"))
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce(page([favorite, recent]));
    vi.stubGlobal("fetch", fetchMock);

    render(<EventInviteCandidates eventId={eventId} action={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "招待する人を選ぶ" }));
    await screen.findByText("Aさん");

    fireEvent.click(screen.getByRole("button", { name: "さらに20人を表示" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("Aさん")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "再試行" }));
    await screen.findByText("Bさん");
    expect(fetchMock).toHaveBeenLastCalledWith(`/api/events/${eventId}/invite-candidates?cursor=next-cursor`, expect.objectContaining({ signal: expect.anything() }));
    expect(screen.getAllByText("Aさん")).toHaveLength(1);
  });

  it("lets the organizer invite selected people and removes successful invitees from the candidate list", async () => {
    const fetchMock = vi.fn().mockResolvedValue(page([favorite, recent]));
    const action = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("fetch", fetchMock);

    render(<EventInviteCandidates eventId={eventId} action={action} />);
    fireEvent.click(screen.getByRole("button", { name: "招待する人を選ぶ" }));
    await screen.findByText("Aさん");

    fireEvent.click(screen.getByRole("checkbox", { name: "Aさんを選択" }));
    fireEvent.click(screen.getByRole("button", { name: "Madoiで招待を送る" }));

    await waitFor(() => expect(action).toHaveBeenCalledWith([favorite.userId]));
    expect(screen.queryByText("Aさん")).not.toBeInTheDocument();
    expect(screen.getByText("招待を送りました")).toBeInTheDocument();
  });
});

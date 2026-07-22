import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { EventChat } from "@/components/event-chat";

const message = {
  id: "message-1",
  authorName: "あきら",
  body: "今日は18時でいい？",
  createdAt: "2026-07-13T09:00:00.000Z",
  isOwn: false
};

const eventId = "11111111-1111-4111-8111-111111111111";

function page(items: typeof message[], nextCursor: string | null = null) {
  return { ok: true, json: vi.fn().mockResolvedValue({ items, nextCursor }) } as unknown as Response;
}

describe("EventChat", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("shows messages and lets a joined member post", () => {
    render(<EventChat eventId={eventId} messages={[message]} action={vi.fn()} canPost />);

    expect(screen.getByText("今日は18時でいい？")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "投稿" })).toBeEnabled();
  });

  it("shows a natural message when posting is unavailable", () => {
    render(<EventChat eventId={eventId} messages={[]} action={vi.fn()} canPost={false} unavailableReason="イベントが中止されたため、投稿できません。" />);

    expect(screen.getByText("イベントが中止されたため、投稿できません。")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "投稿" })).not.toBeInTheDocument();
  });

  it("announces submit errors politely", async () => {
    const action = vi.fn().mockRejectedValue(new Error("メッセージを入力してください"));
    render(<EventChat eventId={eventId} messages={[]} action={action} canPost />);

    fireEvent.click(screen.getByRole("button", { name: "投稿" }));

    await waitFor(() => expect(screen.getByText("メッセージを入力してください")).toHaveAttribute("aria-live", "polite"));
  });

  it("requests the exact cursor URL and appends unique older messages in chronological order", async () => {
    const latest = { ...message, id: "message-3", body: "latest", createdAt: "2026-07-13T11:00:00.000Z" };
    const middle = { ...message, id: "message-2", body: "middle", createdAt: "2026-07-13T10:00:00.000Z" };
    const oldest = { ...message, id: "message-1", body: "oldest", createdAt: "2026-07-13T09:00:00.000Z" };
    const fetchMock = vi.fn().mockResolvedValue(page([oldest, middle, latest]));
    vi.stubGlobal("fetch", fetchMock);

    render(<EventChat eventId={eventId} messages={[middle, latest]} nextCursor="older-cursor" action={vi.fn()} canPost />);
    fireEvent.click(screen.getByRole("button", { name: "以前のメッセージを表示" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(`/api/events/${eventId}/messages?cursor=older-cursor`, expect.objectContaining({ signal: expect.anything() })));
    await screen.findByText("oldest");

    const text = screen.getByRole("list", { name: "チャットメッセージ" }).textContent ?? "";
    expect(text.indexOf("oldest")).toBeLessThan(text.indexOf("middle"));
    expect(text.indexOf("middle")).toBeLessThan(text.indexOf("latest"));
    expect(screen.getAllByText("latest")).toHaveLength(1);
  });

  it("preserves loaded messages after load-more fails and retries the same cursor", async () => {
    const older = { ...message, id: "message-0", body: "older", createdAt: "2026-07-13T08:00:00.000Z" };
    const fetchMock = vi.fn().mockRejectedValueOnce(new Error("network")).mockResolvedValueOnce(page([older]));
    vi.stubGlobal("fetch", fetchMock);

    render(<EventChat eventId={eventId} messages={[message]} nextCursor="retry-cursor" action={vi.fn()} canPost />);
    fireEvent.click(screen.getByRole("button", { name: "以前のメッセージを表示" }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByText(message.body)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "再試行" }));
    await screen.findByText("older");
    expect(fetchMock).toHaveBeenLastCalledWith(`/api/events/${eventId}/messages?cursor=retry-cursor`, expect.objectContaining({ signal: expect.anything() }));
  });

  it("aborts obsolete paging requests on refresh and unmount", async () => {
    const signals: AbortSignal[] = [];
    const fetchMock = vi.fn().mockImplementation((_: string, init: RequestInit) => {
      signals.push(init.signal as AbortSignal);
      return new Promise<Response>(() => undefined);
    });
    vi.stubGlobal("fetch", fetchMock);
    const view = render(<EventChat eventId={eventId} messages={[message]} nextCursor="cursor-one" action={vi.fn()} canPost />);

    fireEvent.click(screen.getByRole("button", { name: "以前のメッセージを表示" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    view.rerender(<EventChat eventId={eventId} messages={[{ ...message, id: "message-2", body: "fresh", createdAt: "2026-07-13T10:00:00.000Z" }]} nextCursor="cursor-two" action={vi.fn()} canPost />);
    await waitFor(() => expect(signals[0].aborted).toBe(true));

    fireEvent.click(screen.getByRole("button", { name: "以前のメッセージを表示" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    view.unmount();
    expect(signals[1].aborted).toBe(true);
  });

  it("merges fresh server messages so a newly posted message remains visible after refresh", () => {
    const view = render(<EventChat eventId={eventId} messages={[message]} action={vi.fn()} canPost />);

    view.rerender(<EventChat eventId={eventId} messages={[message, { ...message, id: "message-new", body: "newly posted", isOwn: true, createdAt: "2026-07-13T10:00:00.000Z" }]} action={vi.fn()} canPost />);

    expect(screen.getByText("newly posted")).toBeInTheDocument();
    expect(screen.getByText(message.body)).toBeInTheDocument();
  });

  it("restores posting after an authorized retry recovers a failed membership check", async () => {
    const fetchMock = vi.fn().mockResolvedValue(page([]));
    vi.stubGlobal("fetch", fetchMock);

    render(
      <EventChat
        eventId={eventId}
        messages={[]}
        initialError="membership lookup failed"
        action={vi.fn()}
        canPost={false}
        canRecoverPostingPermission
      />
    );

    expect(screen.queryByRole("textbox", { name: "メッセージ" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "再試行" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(`/api/events/${eventId}/messages`, expect.objectContaining({ signal: expect.anything() })));
    expect(await screen.findByRole("textbox", { name: "メッセージ" })).toBeInTheDocument();
  });

  it("keeps a nonparticipant unable to post after a successful page request", async () => {
    const fetchMock = vi.fn().mockResolvedValue(page([]));
    vi.stubGlobal("fetch", fetchMock);

    render(<EventChat eventId={eventId} messages={[]} initialError="load failed" action={vi.fn()} canPost={false} />);
    fireEvent.click(screen.getByRole("button", { name: "再試行" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("textbox", { name: "メッセージ" })).not.toBeInTheDocument();
  });

  it("replaces messages instead of merging them when the event changes", () => {
    const view = render(<EventChat eventId={eventId} messages={[message]} action={vi.fn()} canPost />);

    view.rerender(
      <EventChat
        eventId="22222222-2222-4222-8222-222222222222"
        messages={[{ ...message, id: "message-2", body: "other event", createdAt: "2026-07-14T09:00:00.000Z" }]}
        action={vi.fn()}
        canPost={false}
      />
    );

    expect(screen.getByText("other event")).toBeInTheDocument();
    expect(screen.queryByText(message.body)).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "メッセージ" })).not.toBeInTheDocument();
  });
});

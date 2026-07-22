import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const { safeLog } = vi.hoisted(() => ({ safeLog: vi.fn() }));
vi.mock("@/lib/server/safe-log", () => ({ safeLog }));

import ConnectionsLoading from "@/app/connections/loading";
import { loadConnectionsPageData } from "@/lib/connections/page-data";

type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void };

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  return { promise: new Promise((done) => { resolve = done; }), resolve };
}

const row = {
  user_id: "11111111-1111-4111-8111-111111111111",
  display_name: "相手",
  shared_event_count: 2,
  latest_shared_at: "2026-07-01T10:00:00.000Z",
  is_following: true,
  is_followed_by: true,
  is_favorite: false,
  cursor_at: "2026-07-01T10:00:00.000Z",
  cursor_user_id: "11111111-1111-4111-8111-111111111111"
};

describe("connections page data", () => {
  it("starts the three bounded RPCs before any one resolves", async () => {
    const counts = deferred<{ data: unknown; error: null }>();
    const invitations = deferred<{ data: unknown; error: null }>();
    const connections = deferred<{ data: unknown; error: null }>();
    const rpc = vi.fn()
      .mockReturnValueOnce(counts.promise)
      .mockReturnValueOnce(invitations.promise)
      .mockReturnValueOnce(connections.promise);

    const result = loadConnectionsPageData({ rpc }, "mutual");

    expect(rpc).toHaveBeenCalledTimes(3);
    expect(rpc).toHaveBeenNthCalledWith(1, "get_connection_counts");
    expect(rpc).toHaveBeenNthCalledWith(2, "list_received_event_invitations", { p_limit: 20 });
    expect(rpc).toHaveBeenNthCalledWith(3, "list_connections", {
      p_category: "mutual",
      p_cursor_at: null,
      p_cursor_user_id: null,
      p_limit: 20
    });

    counts.resolve({ data: [{ category: "mutual", item_count: 1 }], error: null });
    invitations.resolve({ data: [{ invitation_id: "invite", event_title: "会", organizer_name: "主催者", created_at: row.cursor_at }], error: null });
    connections.resolve({ data: [row], error: null });

    await expect(result).resolves.toMatchObject({
      counts: { mutual: 1 },
      invitations: [{ id: "invite", eventTitle: "会" }],
      items: [{ userId: row.user_id }]
    });
    expect(safeLog).toHaveBeenCalledWith({
      operation: "connections.load",
      durationMs: expect.any(Number)
    });
  });

  it("keeps successful sections when another bounded RPC fails", async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: null, error: { message: "counts failed" } })
      .mockResolvedValueOnce({ data: [{ invitation_id: "invite", event_title: "会", organizer_name: "主催者", created_at: row.cursor_at }], error: null })
      .mockResolvedValueOnce({ data: [row], error: null });

    await expect(loadConnectionsPageData({ rpc }, "favorites")).resolves.toMatchObject({
      counts: {},
      invitations: [{ id: "invite" }],
      items: [{ userId: row.user_id }],
      connectionError: null
    });
  });

  it("renders a compact loading boundary", () => {
    render(React.createElement(ConnectionsLoading));
    expect(screen.getByLabelText("つながりを読み込み中")).toHaveAttribute("aria-busy", "true");
    expect(document.querySelector(".animate-pulse")).toBeInTheDocument();
  });
});

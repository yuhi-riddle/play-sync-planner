import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { createSupabaseServerClient } = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn()
}));

vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient }));

import { GET } from "@/app/api/connections/route";

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

function request(path: string) {
  return new NextRequest(`http://localhost${path}`);
}

describe("GET /api/connections", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects invalid category and cursor before a database call", async () => {
    const categoryResponse = await GET(request("/api/connections?category=unknown"));
    const cursorResponse = await GET(request("/api/connections?category=mutual&cursor=eyJjdXJzb3JBdCI6MX0"));

    expect(categoryResponse.status).toBe(400);
    expect(cursorResponse.status).toBe(400);
    expect(categoryResponse.headers.get("Cache-Control")).toBe("private, no-store");
    expect(createSupabaseServerClient).not.toHaveBeenCalled();
  });

  it("returns 401 for an unauthenticated request without exposing internals", async () => {
    createSupabaseServerClient.mockResolvedValue({ auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) } });

    const response = await GET(request("/api/connections?category=mutual"));

    expect(response.status).toBe(401);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("maps a bounded RPC page and returns a deterministic cursor", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: Array.from({ length: 20 }, () => row), error: null });
    createSupabaseServerClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "actor" } } }) },
      rpc
    });

    const response = await GET(request("/api/connections?category=mutual"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(rpc).toHaveBeenCalledWith("list_connections", {
      p_category: "mutual",
      p_cursor_at: null,
      p_cursor_user_id: null,
      p_limit: 20
    });
    expect(body.items[0]).toMatchObject({ userId: row.user_id, sharedEventCount: 2 });
    expect(body.nextCursor).toBe(Buffer.from(JSON.stringify({ cursorAt: row.cursor_at, cursorUserId: row.cursor_user_id })).toString("base64url"));
  });

  it("returns a generalized error for a failed RPC", async () => {
    createSupabaseServerClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "actor" } } }) },
      rpc: vi.fn().mockResolvedValue({ data: null, error: { message: "secret database detail" } })
    });

    const response = await GET(request("/api/connections?category=mutual"));

    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain("secret database detail");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });
});

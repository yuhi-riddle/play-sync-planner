import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { createSupabaseServerClient } = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn()
}));

vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient }));

import { GET as getMessages } from "@/app/api/events/[eventId]/messages/route";
import { GET as getInviteCandidates } from "@/app/api/events/[eventId]/invite-candidates/route";

const eventId = "11111111-1111-4111-8111-111111111111";
const context = { params: Promise.resolve({ eventId }) };

function request(path: string) {
  return new NextRequest(`http://localhost${path}`);
}

function singleQuery(result: unknown) {
  const query = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(result),
    maybeSingle: vi.fn().mockResolvedValue(result)
  };
  return query;
}

describe("event detail API routes", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects invalid message ids and cursors before creating a client", async () => {
    const invalidId = await getMessages(request("/api/events/invalid/messages"), { params: Promise.resolve({ eventId: "invalid" }) });
    const invalidCursor = await getMessages(request(`/api/events/${eventId}/messages?cursor=eyJjcmVhdGVkQXQiOjF9`), context);

    expect(invalidId.status).toBe(400);
    expect(invalidCursor.status).toBe(400);
    expect(invalidId.headers.get("Cache-Control")).toBe("private, no-store");
    expect(createSupabaseServerClient).not.toHaveBeenCalled();
  });

  it("requires authentication and explicit membership before reading messages", async () => {
    createSupabaseServerClient.mockResolvedValue({ auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) } });
    const unauthenticated = await getMessages(request(`/api/events/${eventId}/messages`), context);
    expect(unauthenticated.status).toBe(401);
    expect(unauthenticated.headers.get("Cache-Control")).toBe("private, no-store");

    const eventQuery = singleQuery({ data: { id: eventId, owner_user_id: "other" }, error: null });
    const membershipQuery = singleQuery({ data: null, error: null });
    const from = vi.fn((table: string) => (table === "events" ? eventQuery : membershipQuery));
    createSupabaseServerClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "actor" } } }) },
      from
    });

    const forbidden = await getMessages(request(`/api/events/${eventId}/messages`), context);
    expect(forbidden.status).toBe(403);
    expect(from).toHaveBeenCalledWith("event_members");
    expect(from).not.toHaveBeenCalledWith("event_messages");
  });

  it("generalizes event authorization lookup failures without treating them as access denials", async () => {
    const eventQuery = singleQuery({ data: null, error: { message: "secret authorization detail" } });
    const rpc = vi.fn();
    createSupabaseServerClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "actor" } } }) },
      from: vi.fn(() => eventQuery),
      rpc
    });

    const messages = await getMessages(request(`/api/events/${eventId}/messages`), context);
    const candidates = await getInviteCandidates(request(`/api/events/${eventId}/invite-candidates`), context);

    expect(messages.status).toBe(500);
    expect(candidates.status).toBe(500);
    expect(JSON.stringify(await messages.json())).not.toContain("secret authorization detail");
    expect(JSON.stringify(await candidates.json())).not.toContain("secret authorization detail");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("returns a 50-message page with a deterministic cursor and no internal ids", async () => {
    const rows = Array.from({ length: 51 }, (_, index) => ({
      id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      author_user_id: index === 0 ? "actor" : "other",
      body: `message-${index + 1}`,
      created_at: new Date(Date.UTC(2026, 6, 13, 23 - index)).toISOString()
    }));
    const eventQuery = singleQuery({ data: { id: eventId, owner_user_id: "owner" }, error: null });
    const membershipQuery = singleQuery({ data: { user_id: "actor", display_name: "自分" }, error: null });
    const messagesQuery = singleQuery({ data: rows, error: null });
    const namesQuery = singleQuery({ data: [{ user_id: "actor", display_name: "自分" }], error: null });
    const from = vi
      .fn()
      .mockReturnValueOnce(eventQuery)
      .mockReturnValueOnce(membershipQuery)
      .mockReturnValueOnce(messagesQuery)
      .mockReturnValueOnce(namesQuery);
    createSupabaseServerClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "actor" } } }) },
      from
    });

    const response = await getMessages(request(`/api/events/${eventId}/messages`), context);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(messagesQuery.order).toHaveBeenNthCalledWith(1, "created_at", { ascending: false });
    expect(messagesQuery.order).toHaveBeenNthCalledWith(2, "id", { ascending: false });
    expect(messagesQuery.limit).toHaveBeenCalledWith(51);
    expect(body.items).toHaveLength(50);
    expect(body.items[0]).not.toHaveProperty("author_user_id");
    expect(body.items[0]).not.toHaveProperty("email");
    expect(body.nextCursor).toBe(Buffer.from(JSON.stringify({ createdAt: rows[49].created_at, id: rows[49].id })).toString("base64url"));
  });

  it("rejects invalid invite candidate input before the database and protects the owner guard", async () => {
    const invalidQuery = await getInviteCandidates(request(`/api/events/${eventId}/invite-candidates?q=${"a".repeat(101)}`), context);
    const invalidCursor = await getInviteCandidates(request(`/api/events/${eventId}/invite-candidates?cursor=eyJjdXJzb3JBdCI6MX0`), context);
    expect(invalidQuery.status).toBe(400);
    expect(invalidCursor.status).toBe(400);
    expect(createSupabaseServerClient).not.toHaveBeenCalled();

    const eventQuery = singleQuery({ data: null, error: null });
    const rpc = vi.fn();
    createSupabaseServerClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "not-owner" } } }) },
      from: vi.fn(() => eventQuery),
      rpc
    });
    const forbidden = await getInviteCandidates(request(`/api/events/${eventId}/invite-candidates`), context);
    expect(forbidden.status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("maps a 20-row candidate RPC page and generalizes RPC failures", async () => {
    const row = {
      user_id: "22222222-2222-4222-8222-222222222222",
      display_name: "候補者",
      shared_event_count: 2,
      latest_shared_at: "2026-07-01T10:00:00.000Z",
      is_following: true,
      is_followed_by: false,
      is_favorite: true,
      cursor_at: "2026-07-01T10:00:00.000Z",
      cursor_user_id: "22222222-2222-4222-8222-222222222222"
    };
    const eventQuery = singleQuery({ data: { id: eventId }, error: null });
    const rpc = vi.fn().mockResolvedValue({ data: Array.from({ length: 20 }, () => row), error: null });
    createSupabaseServerClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "owner" } } }) },
      from: vi.fn(() => eventQuery),
      rpc
    });

    const response = await getInviteCandidates(request(`/api/events/${eventId}/invite-candidates?q=候補`), context);
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(rpc).toHaveBeenCalledWith("list_event_invite_candidates", {
      p_event_id: eventId,
      p_query: "候補",
      p_cursor_at: null,
      p_cursor_user_id: null,
      p_limit: 20
    });
    expect(body.items[0]).toMatchObject({ userId: row.user_id, displayName: "候補者", sharedEventCount: 2 });
    expect(body.nextCursor).toBe(Buffer.from(JSON.stringify({ cursorAt: row.cursor_at, cursorUserId: row.cursor_user_id })).toString("base64url"));

    rpc.mockResolvedValueOnce({ data: [{ ...row, shared_event_count: 0, latest_shared_at: null }], error: null });
    const followingOnly = await getInviteCandidates(request(`/api/events/${eventId}/invite-candidates`), context);
    expect((await followingOnly.json()).items[0].latestSharedAt).toBe("");

    rpc.mockResolvedValueOnce({ data: null, error: { message: "secret database detail" } });
    const failed = await getInviteCandidates(request(`/api/events/${eventId}/invite-candidates`), context);
    expect(failed.status).toBe(500);
    expect(JSON.stringify(await failed.json())).not.toContain("secret database detail");
  });
});

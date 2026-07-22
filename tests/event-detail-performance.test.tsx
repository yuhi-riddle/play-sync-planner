import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { loadEventDetailData } from "@/lib/event-detail-data";

const eventPagePath = resolve(process.cwd(), "app/events/[eventId]/page.tsx");
const eventDataPath = resolve(process.cwd(), "lib/event-detail-data.ts");
const loadingPath = resolve(process.cwd(), "app/events/[eventId]/loading.tsx");
const eventId = "11111111-1111-4111-8111-111111111111";

function query(result: unknown) {
  const builder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(result),
    then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => Promise.resolve(result).then(resolve, reject)
  };
  return builder;
}

describe("event detail performance boundary", () => {
  it("keeps the initial overview free of admin access and eager invite candidates", () => {
    const source = readFileSync(eventPagePath, "utf8");

    expect(source).not.toContain("createSupabaseAdminClient");
    expect(source).not.toContain("loadInviteCandidates");
    expect(source).not.toContain('list_event_invite_candidates');
    expect(source).toMatch(/<EventChat\s+key=\{eventId\}/);
  });

  it("uses a 51-row chat query so the first page can return at most 50 messages", () => {
    const source = readFileSync(eventDataPath, "utf8");

    expect(source).toMatch(/from\("event_messages"\)[\s\S]{0,500}\.limit\(51\)/);
  });

  it("keeps the overview available when the independent initial chat query fails", async () => {
    const eventQuery = query({
      data: {
        id: eventId,
        owner_user_id: "owner",
        title: "夏ライブ",
        category: "other",
        status: "planning",
        location_name: null,
        url: null,
        memo: null
      },
      error: null
    });
    const membershipQuery = query({ data: { user_id: "member" }, error: null });
    const countQuery = query({ count: 2, error: null });
    const planQuery = query({ data: [], error: null });
    const messagesQuery = query({ data: null, error: { message: "database detail" } });
    let eventMemberCall = 0;
    const from = vi.fn((table: string) => {
      if (table === "events") return eventQuery;
      if (table === "event_members") return eventMemberCall++ === 0 ? membershipQuery : countQuery;
      if (table === "plans") return planQuery;
      return messagesQuery;
    });

    const result = await loadEventDetailData({ supabase: { from } as never, eventId, currentUserId: "member" });

    expect(result?.event.title).toBe("夏ライブ");
    expect(result?.chat.error).toBeTruthy();
    expect(messagesQuery.limit).toHaveBeenCalledWith(51);
  });

  it("keeps the overview available and exposes chat retry when membership lookup fails", async () => {
    const eventQuery = query({
      data: {
        id: eventId,
        owner_user_id: "owner",
        title: "夏ライブ",
        category: "other",
        status: "planning",
        location_name: null,
        url: null,
        memo: null
      },
      error: null
    });
    const membershipQuery = query({ data: null, error: { message: "database detail" } });
    const countQuery = query({ count: 2, error: null });
    const planQuery = query({ data: [], error: null });
    let eventMemberCall = 0;
    const from = vi.fn((table: string) => {
      if (table === "events") return eventQuery;
      if (table === "event_members") return eventMemberCall++ === 0 ? membershipQuery : countQuery;
      return planQuery;
    });

    const result = await loadEventDetailData({ supabase: { from } as never, eventId, currentUserId: "member" });

    expect(result?.event.title).toBe("夏ライブ");
    expect(result?.chat.error).toBeTruthy();
  });

  it("has a compact detail loading boundary", () => {
    expect(existsSync(loadingPath)).toBe(true);
  });
});

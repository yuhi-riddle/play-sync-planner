import { beforeEach, describe, expect, it, vi } from "vitest";

const { createSupabaseServerClient } = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn()
}));

vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient }));

import { getUnreadNotificationCount } from "@/lib/supabase/notification-count";

function mockNotificationQuery(result: { count: number | null; error: { message: string } | null }) {
  const query = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockResolvedValue(result)
  };
  const from = vi.fn().mockReturnValue(query);
  createSupabaseServerClient.mockResolvedValue({ from });
  return { from, query };
}

describe("getUnreadNotificationCount", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("counts the signed-in user's unread notifications without fetching rows", async () => {
    const { from, query } = mockNotificationQuery({ count: 3, error: null });

    await expect(getUnreadNotificationCount("user-1")).resolves.toBe(3);
    expect(from).toHaveBeenCalledWith("notifications");
    expect(query.select).toHaveBeenCalledWith("id", { count: "exact", head: true });
    expect(query.eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(query.is).toHaveBeenCalledWith("read_at", null);
  });

  it("returns 0 when the count comes back empty", async () => {
    mockNotificationQuery({ count: null, error: null });

    await expect(getUnreadNotificationCount("user-1")).resolves.toBe(0);
  });

  it("returns null when the query fails, so the badge is simply left out", async () => {
    mockNotificationQuery({ count: null, error: { message: "boom" } });

    await expect(getUnreadNotificationCount("user-1")).resolves.toBeNull();
  });
});

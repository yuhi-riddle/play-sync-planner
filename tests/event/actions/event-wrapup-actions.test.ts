import { beforeEach, describe, expect, it, vi } from "vitest";

const { createSupabaseServerClient, getCurrentActiveUser, redirect, revalidatePath } = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
  getCurrentActiveUser: vi.fn(),
  redirect: vi.fn(),
  revalidatePath: vi.fn()
}));

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient, getCurrentActiveUser }));

import {
  completeEventAction,
  reopenEventAction,
  snoozeEventWrapupAction
} from "@/lib/actions/event/events";

const userId = "11111111-1111-4111-8111-111111111111";
const eventId = "22222222-2222-4222-8222-222222222222";

type Update = { table: string; values: Record<string, unknown>; filters: Record<string, unknown> };

function client() {
  const updates: Update[] = [];
  const from = vi.fn((table: string) => {
    const record: Update = { table, values: {}, filters: {} };
    const builder: Record<string, unknown> = {};
    builder.update = vi.fn((values: Record<string, unknown>) => {
      record.values = values;
      updates.push(record);
      return builder;
    });
    builder.eq = vi.fn((column: string, value: unknown) => {
      record.filters[column] = value;
      return builder;
    });
    builder.is = vi.fn((column: string, value: unknown) => {
      record.filters[`${column}:is`] = value;
      return builder;
    });
    builder.then = (resolve: (v: { error: null }) => unknown) => Promise.resolve({ error: null }).then(resolve);
    return builder;
  });
  return { client: { from }, updates };
}

describe("event wrapup actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentActiveUser.mockResolvedValue({ id: userId });
  });

  it("completeEventAction は status=done, wrapup_auto_done=false に更新し owner で絞る", async () => {
    const { client: c, updates } = client();
    createSupabaseServerClient.mockResolvedValue(c);

    await completeEventAction(eventId);

    const eventUpdate = updates.find((u) => u.table === "events");
    expect(eventUpdate?.values).toEqual({ status: "done", wrapup_auto_done: false });
    expect(eventUpdate?.filters).toMatchObject({ id: eventId, owner_user_id: userId });
    expect(revalidatePath).toHaveBeenCalledWith("/events");
  });

  it("snoozeEventWrapupAction は wrapup_snoozed_until を約30日先にする", async () => {
    const { client: c, updates } = client();
    createSupabaseServerClient.mockResolvedValue(c);

    const before = Date.now();
    await snoozeEventWrapupAction(eventId);
    const eventUpdate = updates.find((u) => u.table === "events");
    const snoozedUntil = new Date(String(eventUpdate?.values.wrapup_snoozed_until)).getTime();
    expect(snoozedUntil).toBeGreaterThan(before + 29 * 24 * 60 * 60 * 1000);
    expect(snoozedUntil).toBeLessThan(before + 31 * 24 * 60 * 60 * 1000);
    expect(eventUpdate?.filters).toMatchObject({ id: eventId, owner_user_id: userId });
  });

  it("reopenEventAction は status=planning に戻し wrapup_auto_done=false, snooze を30日先に", async () => {
    const { client: c, updates } = client();
    createSupabaseServerClient.mockResolvedValue(c);

    await reopenEventAction(eventId);

    const eventUpdate = updates.find((u) => u.table === "events");
    expect(eventUpdate?.values.status).toBe("planning");
    expect(eventUpdate?.values.wrapup_auto_done).toBe(false);
    expect(eventUpdate?.values.wrapup_snoozed_until).toBeTruthy();
  });

  it("未読の wrapup_prompt 通知を既読化する", async () => {
    const { client: c, updates } = client();
    createSupabaseServerClient.mockResolvedValue(c);

    await completeEventAction(eventId);

    const notifUpdate = updates.find((u) => u.table === "notifications");
    expect(notifUpdate?.values).toHaveProperty("read_at");
    expect(notifUpdate?.filters).toMatchObject({ user_id: userId, kind: "wrapup_prompt" });
  });
});

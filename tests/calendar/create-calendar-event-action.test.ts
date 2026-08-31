import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentActiveUserId,
  createSupabaseServerClient,
  createSupabaseAdminClient,
  resolveGoogleCalendarAccessToken,
  insertCalendarEvent,
  redirect,
  revalidatePath
} = vi.hoisted(() => ({
  getCurrentActiveUserId: vi.fn(),
  createSupabaseServerClient: vi.fn(),
  createSupabaseAdminClient: vi.fn(),
  resolveGoogleCalendarAccessToken: vi.fn(),
  insertCalendarEvent: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
  revalidatePath: vi.fn()
}));

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("next/navigation", () => ({
  redirect,
  unstable_rethrow: (cause: unknown) => {
    if (cause instanceof Error && cause.message.startsWith("NEXT_REDIRECT")) throw cause;
  }
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient,
  createSupabaseAdminClient,
  getCurrentActiveUserId
}));
vi.mock("@/lib/google-calendar/access-token", () => ({ resolveGoogleCalendarAccessToken }));
vi.mock("@/lib/google-calendar/calendar-events", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/google-calendar/calendar-events")>();
  return { ...actual, insertCalendarEvent };
});

import { createGoogleCalendarEventForPlanAction } from "@/lib/actions/calendar/calendar";
import { CalendarEventDuplicateError } from "@/lib/google-calendar/calendar-events";

const userId = "11111111-1111-4111-8111-111111111111";
const planId = "22222222-2222-4222-8222-222222222222";

/** claimResult: sync_state を奪う update の返り値。null で「他が先に奪った」を表す。 */
function serverClient({ claimResult }: { claimResult: { id: string } | null }) {
  const planUpdates: Record<string, unknown>[] = [];
  const from = vi.fn((table: string) => {
    const builder: Record<string, unknown> = {};
    builder.select = vi.fn(() => builder);
    builder.eq = vi.fn(() => builder);
    builder.in = vi.fn(() => builder);
    builder.update = vi.fn((values: Record<string, unknown>) => {
      if (table === "plans") planUpdates.push(values);
      return builder;
    });
    builder.single = vi.fn(async () => {
      if (table === "plans") {
        return {
          data: {
            id: planId,
            title: "旅行",
            owner_user_id: userId,
            confirmed_start_at: "2026-07-01T01:00:00.000Z",
            confirmed_end_at: "2026-07-01T03:00:00.000Z",
            is_all_day: false,
            google_calendar_event_id: null,
            events: { title: "夏合宿", location_name: null },
            participants: []
          },
          error: null
        };
      }
      return { data: null, error: null };
    });
    builder.maybeSingle = vi.fn(async () => {
      if (table === "plans") return { data: claimResult, error: null };
      if (table === "calendar_integrations") return { data: { calendar_id: "primary" }, error: null };
      return { data: null, error: null };
    });
    return builder;
  });
  return { client: { from }, planUpdates };
}

describe("createGoogleCalendarEventForPlanAction: 冪等性", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentActiveUserId.mockResolvedValue(userId);
    resolveGoogleCalendarAccessToken.mockResolvedValue("token");
    createSupabaseAdminClient.mockReturnValue({ from: () => ({ select: () => ({ eq: () => ({ in: async () => ({ data: [] }) }) }) }) });
    insertCalendarEvent.mockResolvedValue({ id: "google-event-1" });
  });

  it("sync_state を奪えたら Google に固定 id で作成し、created にする", async () => {
    const { client, planUpdates } = serverClient({ claimResult: { id: planId } });
    createSupabaseServerClient.mockResolvedValue(client);

    await expect(createGoogleCalendarEventForPlanAction(planId)).rejects.toThrow("NEXT_REDIRECT:/plans/" + planId + "?calendar=created");

    expect(insertCalendarEvent).toHaveBeenCalledWith(
      expect.objectContaining({ event: expect.objectContaining({ externalId: `madoiplan${planId.replace(/-/g, "")}` }) })
    );
    expect(planUpdates).toContainEqual({ google_calendar_sync_state: "creating" });
    expect(planUpdates).toContainEqual({ google_calendar_event_id: "google-event-1", google_calendar_sync_state: "created" });
  });

  it("sync_state を奪えなければ Google を叩かず already-created へ", async () => {
    const { client } = serverClient({ claimResult: null });
    createSupabaseServerClient.mockResolvedValue(client);

    await expect(createGoogleCalendarEventForPlanAction(planId)).rejects.toThrow("calendar=already-created");
    expect(insertCalendarEvent).not.toHaveBeenCalled();
  });

  it("Google が 409（重複）を返したら二重作成せず created にそろえる", async () => {
    const { client, planUpdates } = serverClient({ claimResult: { id: planId } });
    createSupabaseServerClient.mockResolvedValue(client);
    insertCalendarEvent.mockRejectedValue(new CalendarEventDuplicateError());

    await expect(createGoogleCalendarEventForPlanAction(planId)).rejects.toThrow("calendar=already-created");
    expect(planUpdates).toContainEqual(
      expect.objectContaining({ google_calendar_sync_state: "created" })
    );
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const { redirect, revalidatePath, upsert, from, createSupabaseServerClient, getCurrentUser } = vi.hoisted(() => {
  const upsert = vi.fn().mockResolvedValue({ error: null });
  const from = vi.fn(() => ({ upsert }));
  return {
    redirect: vi.fn(),
    revalidatePath: vi.fn(),
    upsert,
    from,
    createSupabaseServerClient: vi.fn().mockResolvedValue({ from }),
    getCurrentUser: vi.fn().mockResolvedValue({ id: "user-1" })
  };
});

vi.mock("next/navigation", () => ({ redirect }));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient,
  getCurrentUser
}));

import { saveEventDraftAction } from "@/lib/actions/events";

function formDataOf(fields: Record<string, string>) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    formData.set(key, value);
  }
  return formData;
}

describe("saveEventDraftAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    upsert.mockResolvedValue({ error: null });
    createSupabaseServerClient.mockResolvedValue({ from });
    getCurrentUser.mockResolvedValue({ id: "user-1" });
  });

  it("saves a partially filled draft without requiring a title or category", async () => {
    await saveEventDraftAction(formDataOf({ category: "", title: "", url: "", location_name: "", memo: "" }));

    expect(upsert).toHaveBeenCalledWith(
      {
        owner_user_id: "user-1",
        payload: { category: null, title: null, url: null, location_name: null, memo: null }
      },
      { onConflict: "owner_user_id" }
    );
  });

  it("rejects a javascript: URL instead of saving it", async () => {
    await expect(
      saveEventDraftAction(formDataOf({ category: "", title: "", url: "javascript:alert(1)", location_name: "", memo: "" }))
    ).rejects.toThrow("URLは https://... の形式で入力してください");

    expect(upsert).not.toHaveBeenCalled();
  });
});

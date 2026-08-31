import { beforeEach, describe, expect, it, vi } from "vitest";

const { createSupabaseAdminClient } = vi.hoisted(() => ({ createSupabaseAdminClient: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({ createSupabaseAdminClient }));

import { markAccountWithdrawn } from "@/lib/auth/withdrawal-mark";
import { WITHDRAWAL_METADATA_KEY } from "@/lib/domain/account/withdrawal";

describe("markAccountWithdrawn", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("service roleでapp_metadataに退会日時を書く", async () => {
    const updateUserById = vi.fn().mockResolvedValue({ error: null });
    createSupabaseAdminClient.mockReturnValue({ auth: { admin: { updateUserById } } });

    await markAccountWithdrawn("user-1", "2026-08-30T00:00:00.000Z");

    expect(updateUserById).toHaveBeenCalledWith("user-1", {
      app_metadata: { [WITHDRAWAL_METADATA_KEY]: "2026-08-30T00:00:00.000Z" }
    });
  });

  it("更新に失敗したらエラーを投げる", async () => {
    const updateUserById = vi.fn().mockResolvedValue({ error: { message: "boom" } });
    createSupabaseAdminClient.mockReturnValue({ auth: { admin: { updateUserById } } });

    await expect(markAccountWithdrawn("user-1", "2026-08-30T00:00:00.000Z")).rejects.toThrow("boom");
  });
});

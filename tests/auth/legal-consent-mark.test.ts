import { beforeEach, describe, expect, it, vi } from "vitest";

const { createSupabaseAdminClient } = vi.hoisted(() => ({ createSupabaseAdminClient: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({ createSupabaseAdminClient }));

import { markLegalConsentAccepted } from "@/lib/auth/legal-consent-mark";
import { LEGAL_CONSENT_METADATA_KEY } from "@/lib/domain/legal-consent";

describe("markLegalConsentAccepted", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("service roleでapp_metadataに同意日時を書く", async () => {
    const updateUserById = vi.fn().mockResolvedValue({ error: null });
    createSupabaseAdminClient.mockReturnValue({ auth: { admin: { updateUserById } } });

    await markLegalConsentAccepted("user-1", "2026-07-10T00:00:00.000Z");

    expect(updateUserById).toHaveBeenCalledWith("user-1", {
      app_metadata: { [LEGAL_CONSENT_METADATA_KEY]: "2026-07-10T00:00:00.000Z" }
    });
  });

  it("更新に失敗したらエラーを投げる", async () => {
    const updateUserById = vi.fn().mockResolvedValue({ error: { message: "boom" } });
    createSupabaseAdminClient.mockReturnValue({ auth: { admin: { updateUserById } } });

    await expect(markLegalConsentAccepted("user-1", "2026-07-10T00:00:00.000Z")).rejects.toThrow("boom");
  });
});

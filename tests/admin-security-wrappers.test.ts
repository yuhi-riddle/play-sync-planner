import { beforeEach, describe, expect, it, vi } from "vitest";

const { createSupabaseAdminClient } = vi.hoisted(() => ({
  createSupabaseAdminClient: vi.fn()
}));

vi.mock("@/lib/supabase/server", () => ({ createSupabaseAdminClient }));

import { getEventCalendarIntegrations } from "@/lib/server/admin/google-token-store";
import { recordPublicSettlementPayment } from "@/lib/server/admin/public-settlement";

const token = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const linkId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const settlementId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const planId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const eventId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const ownerUserId = "ffffffff-ffff-4fff-8fff-ffffffffffff";

function linkLookup() {
  const chain = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({
      data: { id: linkId, plan_id: planId },
      error: null
    })
  };
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  return chain;
}

describe("bounded security admin wrappers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolves the public link then records payment through exactly one atomic RPC", async () => {
    const lookup = linkLookup();
    const from = vi.fn((table: string) => {
      if (table !== "share_links") {
        throw new Error(`unexpected non-atomic table access: ${table}`);
      }
      return lookup;
    });
    const rpc = vi.fn().mockResolvedValue({ data: planId, error: null });
    createSupabaseAdminClient.mockReturnValue({ from, rpc });

    await expect(recordPublicSettlementPayment({
      token,
      settlementId,
      amount: 500,
      paymentMethod: "cash",
      paymentUrl: null,
      memo: null
    })).resolves.toBe(planId);

    expect(from).toHaveBeenCalledTimes(1);
    expect(lookup.eq).toHaveBeenNthCalledWith(1, "token", token);
    expect(lookup.eq).toHaveBeenNthCalledWith(2, "purpose", "answer");
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("record_public_settlement_payment", {
      p_share_link_id: linkId,
      p_settlement_id: settlementId,
      p_amount: 500,
      p_payment_method: "cash",
      p_payment_url: null,
      p_memo: null
    });
  });

  it("reads calendar ciphertext only through the owner-bound service RPC", async () => {
    const rows = [{
      user_id: ownerUserId,
      calendar_id: "primary",
      encrypted_access_token: "ciphertext",
      encrypted_refresh_token: "refresh-ciphertext",
      token_expires_at: null
    }];
    const rpc = vi.fn().mockResolvedValue({ data: rows, error: null });
    const from = vi.fn(() => {
      throw new Error("calendar wrapper must not build arbitrary table queries");
    });
    createSupabaseAdminClient.mockReturnValue({ from, rpc });

    await expect(getEventCalendarIntegrations({ eventId, ownerUserId })).resolves.toEqual(rows);
    expect(from).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith("get_event_calendar_integrations", {
      p_event_id: eventId,
      p_owner_user_id: ownerUserId
    });
  });
});

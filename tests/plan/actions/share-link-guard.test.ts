import { beforeEach, describe, expect, it, vi } from "vitest";

const { createSupabaseAdminClient, createSupabaseServerClient, getCurrentUserId, revalidatePath } = vi.hoisted(() => ({
  createSupabaseAdminClient: vi.fn(),
  createSupabaseServerClient: vi.fn(),
  getCurrentUserId: vi.fn(),
  revalidatePath: vi.fn()
}));

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseAdminClient,
  createSupabaseServerClient,
  getCurrentUser: vi.fn().mockResolvedValue(null),
  getCurrentUserId
}));

import { submitAvailabilityAnswersAction } from "@/lib/actions/plan/answers";
import { recordPublicSettlementPaymentAction } from "@/lib/actions/settlement/settlements";

const revokedToken = "revoked-token";

/** share_links の1件だけを返す最小のクライアント。ログイン中の本人として読む。 */
function clientReturningLink(link: Record<string, unknown> | null) {
  const builder: Record<string, unknown> = {};
  const chain = (name: string) => {
    builder[name] = vi.fn(() => builder);
  };
  chain("select");
  chain("eq");
  chain("order");
  builder.single = vi.fn(async () => ({ data: link, error: link ? null : { message: "not found" } }));
  builder.maybeSingle = builder.single;

  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: viewerId } } }) },
    from: vi.fn(() => builder),
    // consume_authenticated_rate_limit は既定で許可（{ok:true}）を返す。
    rpc: vi.fn((functionName: string) =>
      functionName === "consume_authenticated_rate_limit"
        ? Promise.resolve({ data: { ok: true }, error: null })
        : Promise.resolve({ data: null, error: null })
    )
  };
}

function settlementPaymentFormData() {
  const formData = new FormData();
  formData.set("amount", "1000");
  return formData;
}

const viewerId = "user-viewer";

describe("無効化された共有リンク", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // ログイン済みで確かめる。未ログインだと手前のログイン確認で止まり、無効化の判定まで届かない。
    getCurrentUserId.mockResolvedValue(viewerId);
    createSupabaseAdminClient.mockReturnValue({ from: vi.fn(() => ({ upsert: vi.fn() })) });
  });

  it("日程回答を受け付けない", async () => {
    createSupabaseServerClient.mockResolvedValue(
      clientReturningLink({
        plan_id: "plan-1",
        status: "revoked",
        expires_at: null,
        plans: { id: "plan-1", title: "テスト", owner_user_id: "owner-1", answer_deadline_at: null, events: { title: "イベント" } }
      })
    );

    await expect(submitAvailabilityAnswersAction(revokedToken, new FormData())).rejects.toThrow(
      "この共有リンクは無効化されています"
    );
  });

  it("公開清算ページからの支払い記録を受け付けない", async () => {
    createSupabaseServerClient.mockResolvedValue(clientReturningLink({ plan_id: "plan-1", status: "revoked" }));

    await expect(
      recordPublicSettlementPaymentAction(revokedToken, "settlement-1", settlementPaymentFormData())
    ).rejects.toThrow("この共有リンクは無効化されています");
  });
});

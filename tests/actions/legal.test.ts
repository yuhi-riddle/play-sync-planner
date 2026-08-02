import { beforeEach, describe, expect, it, vi } from "vitest";

const { createSupabaseServerClient, getCurrentUser, markLegalConsentAccepted, redirect, revalidatePath } = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
  getCurrentUser: vi.fn(),
  markLegalConsentAccepted: vi.fn(),
  redirect: vi.fn(),
  revalidatePath: vi.fn()
}));

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/lib/auth/legal-consent-mark", () => ({ markLegalConsentAccepted }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient,
  getCurrentUser
}));

import { acceptLegalDocumentsAction } from "@/lib/actions/legal";

const userId = "11111111-1111-4111-8111-111111111111";

function legalFormData() {
  const formData = new FormData();
  formData.set("termsAccepted", "on");
  formData.set("privacyAccepted", "on");
  return formData;
}

describe("acceptLegalDocumentsAction: user_consents書き込みと同意印の順序", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUser.mockResolvedValue({ id: userId });
  });

  it("upsertが成功したあとに、書き込んだ同意日時と同じ文字列でmarkLegalConsentAcceptedを呼ぶ", async () => {
    const callOrder: string[] = [];
    const upsert = vi.fn().mockImplementation(async () => {
      callOrder.push("upsert");
      return { error: null };
    });
    createSupabaseServerClient.mockResolvedValue({ from: vi.fn(() => ({ upsert })) });
    markLegalConsentAccepted.mockImplementation(async () => {
      callOrder.push("mark");
    });

    await acceptLegalDocumentsAction(legalFormData());

    expect(upsert).toHaveBeenCalledTimes(1);
    const writtenAgreedAt = (upsert.mock.calls[0][0] as { agreed_at: string }).agreed_at;
    expect(typeof writtenAgreedAt).toBe("string");
    expect(markLegalConsentAccepted).toHaveBeenCalledWith(userId, writtenAgreedAt);

    // 正本(user_consents)を保存できたあとに印を書く順序でなければならない。
    // 逆順だと、記録が無いのにゲートだけ通る状態を作れてしまう。
    expect(callOrder).toEqual(["upsert", "mark"]);
  });

  it("upsertがエラーを返したらmarkLegalConsentAcceptedを呼ばない", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: { message: "db error" } });
    createSupabaseServerClient.mockResolvedValue({ from: vi.fn(() => ({ upsert })) });

    await expect(acceptLegalDocumentsAction(legalFormData())).rejects.toThrow("db error");

    expect(markLegalConsentAccepted).not.toHaveBeenCalled();
  });
});

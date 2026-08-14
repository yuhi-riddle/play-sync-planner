import { beforeEach, describe, expect, it, vi } from "vitest";

const { redirect, revalidatePath, rpc, createSupabaseServerClient, getCurrentUser } = vi.hoisted(() => {
  const rpc = vi.fn();
  return {
    redirect: vi.fn(),
    revalidatePath: vi.fn(),
    rpc,
    createSupabaseServerClient: vi.fn().mockResolvedValue({ rpc }),
    getCurrentUser: vi.fn().mockResolvedValue({ id: "user-1" })
  };
});

vi.mock("next/navigation", () => ({ redirect }));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient,
  getCurrentUser
}));

import { createEventMessageAction } from "@/lib/actions/event/event-messages";

const eventId = "11111111-1111-4111-8111-111111111111";

function formDataWithBody(body: string) {
  const formData = new FormData();
  formData.set("body", body);
  return formData;
}

describe("createEventMessageAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createSupabaseServerClient.mockResolvedValue({ rpc });
    getCurrentUser.mockResolvedValue({ id: "user-1" });
  });

  it("posts the trimmed body through the post_event_message RPC and revalidates on success", async () => {
    rpc.mockResolvedValue({ data: { ok: true, message_id: "msg-1" }, error: null });

    await createEventMessageAction(eventId, formDataWithBody("  こんにちは  "));

    expect(rpc).toHaveBeenCalledWith("post_event_message", { p_event_id: eventId, p_body: "こんにちは" });
    expect(revalidatePath).toHaveBeenCalledWith(`/events/${eventId}`);
  });

  it("rejects an empty body before ever calling the RPC", async () => {
    await expect(createEventMessageAction(eventId, formDataWithBody("   "))).rejects.toThrow(
      "メッセージを入力してください"
    );

    expect(rpc).not.toHaveBeenCalled();
  });

  it("throws a rate limit message when the RPC denies with rate_limited", async () => {
    rpc.mockResolvedValue({ data: { ok: false, error: "rate_limited", retry_after_seconds: 30 }, error: null });

    await expect(createEventMessageAction(eventId, formDataWithBody("hi"))).rejects.toThrow(
      "投稿が多すぎます。しばらく待ってから再度お試しください。"
    );
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("throws the not-a-member message when the RPC denies with forbidden", async () => {
    rpc.mockResolvedValue({ data: { ok: false, error: "forbidden" }, error: null });

    await expect(createEventMessageAction(eventId, formDataWithBody("hi"))).rejects.toThrow(
      "このチャットは参加者のみ利用できます"
    );
  });

  it("throws the cancelled-event message when the RPC denies with cancelled", async () => {
    rpc.mockResolvedValue({ data: { ok: false, error: "cancelled" }, error: null });

    await expect(createEventMessageAction(eventId, formDataWithBody("hi"))).rejects.toThrow(
      "イベントが中止されたため、投稿できません。"
    );
  });

  it("throws a generic message when the RPC call itself errors", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "boom" } });

    await expect(createEventMessageAction(eventId, formDataWithBody("hi"))).rejects.toThrow(
      "メッセージを投稿できませんでした"
    );
  });

  it("redirects to login when there is no current user", async () => {
    getCurrentUser.mockResolvedValue(null);
    redirect.mockImplementation(() => {
      throw new Error("NEXT_REDIRECT");
    });

    await expect(createEventMessageAction(eventId, formDataWithBody("hi"))).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith(`/login?next=${encodeURIComponent(`/events/${eventId}`)}`);
    expect(rpc).not.toHaveBeenCalled();
  });
});

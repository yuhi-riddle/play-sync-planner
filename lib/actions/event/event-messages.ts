"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { normalizeEventMessageBody } from "@/lib/domain/event/event-chat";
import { createSupabaseServerClient, getCurrentActiveUser } from "@/lib/supabase/server";

type PostEventMessageResult =
  | { ok: true; message_id: string }
  | {
      ok: false;
      error: "rate_limited" | "invalid_body" | "not_found" | "forbidden" | "cancelled";
      retry_after_seconds?: number;
    };

const postEventMessageErrorMessages: Record<Exclude<PostEventMessageResult, { ok: true }>["error"], string> = {
  rate_limited: "投稿が多すぎます。しばらく待ってから再度お試しください。",
  invalid_body: "メッセージを入力してください",
  not_found: "イベントを確認できませんでした",
  forbidden: "このチャットは参加者のみ利用できます",
  cancelled: "イベントが中止されたため、投稿できません。"
};

export async function createEventMessageAction(eventId: string, formData: FormData): Promise<void> {
  const user = await getCurrentActiveUser();
  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/events/${eventId}`)}`);
  }

  const body = normalizeEventMessageBody(String(formData.get("body") ?? ""));
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("post_event_message", {
    p_event_id: eventId,
    p_body: body
  });

  if (error) {
    throw new Error("メッセージを投稿できませんでした");
  }

  const result = data as PostEventMessageResult;
  if (!result.ok) {
    throw new Error(postEventMessageErrorMessages[result.error]);
  }

  revalidatePath(`/events/${eventId}`);
}

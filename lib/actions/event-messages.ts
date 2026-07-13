"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { normalizeEventMessageBody } from "@/lib/domain/event-chat";
import { createSupabaseAdminClient, createSupabaseServerClient, getCurrentUser } from "@/lib/supabase/server";

export async function createEventMessageAction(eventId: string, formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/events/${eventId}`)}`);
  }

  const body = normalizeEventMessageBody(String(formData.get("body") ?? ""));
  const admin = createSupabaseAdminClient();
  const [{ data: event, error: eventError }, { data: membership, error: membershipError }] = await Promise.all([
    admin.from("events").select("id, title, status").eq("id", eventId).maybeSingle(),
    admin
      .from("event_members")
      .select("user_id")
      .eq("event_id", eventId)
      .eq("user_id", user.id)
      .eq("status", "joined")
      .maybeSingle()
  ]);

  if (eventError || !event) {
    throw new Error("イベントを確認できませんでした");
  }

  if (!membershipError && !membership) {
    throw new Error("このチャットは参加者のみ利用できます");
  }

  if (membershipError) {
    throw new Error("参加状態を確認できませんでした");
  }

  if (event.status === "cancelled") {
    throw new Error("イベントが中止されたため、投稿できません。");
  }

  const supabase = await createSupabaseServerClient();
  const { error: insertError } = await supabase.from("event_messages").insert({
    event_id: eventId,
    author_user_id: user.id,
    body
  });

  if (insertError) {
    throw new Error("メッセージを投稿できませんでした");
  }

  const { data: recipients, error: recipientsError } = await admin
    .from("event_members")
    .select("user_id")
    .eq("event_id", eventId)
    .eq("status", "joined")
    .neq("user_id", user.id);

  if (recipientsError) {
    throw new Error("通知先を確認できませんでした");
  }

  if (recipients?.length) {
    const { error: notificationError } = await admin.from("notifications").upsert(
      recipients.map((recipient) => ({
        user_id: recipient.user_id,
        kind: "event_message",
        title: `${event.title} に新しいメッセージがあります`,
        body: "イベント参加者から新しいメッセージがあります。",
        href: `/events/${eventId}#chat`,
        dedupe_key: `event-message:${eventId}:${recipient.user_id}`,
        read_at: null
      })),
      { onConflict: "user_id,dedupe_key" }
    );

    if (notificationError) {
      console.error("イベントメッセージの通知を作成できませんでした", notificationError);
    }
  }

  revalidatePath(`/events/${eventId}`);
}

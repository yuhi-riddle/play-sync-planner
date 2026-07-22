"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { normalizeEventMessageBody } from "@/lib/domain/event-chat";
import {
  rateLimitErrorFromDatabase
} from "@/lib/server/rate-limit";
import {
  RequestGuardError,
  requireEventAccess
} from "@/lib/server/request-guards";

export async function createEventMessageAction(
  eventId: string,
  formData: FormData
): Promise<void> {
  let supabase: Awaited<ReturnType<typeof requireEventAccess>>["supabase"];
  try {
    ({ supabase } = await requireEventAccess(eventId, "joined"));
  } catch (error) {
    if (error instanceof RequestGuardError && error.status === 401) {
      redirect(`/login?next=${encodeURIComponent(`/events/${eventId}`)}`);
    }
    throw error;
  }

  const body = normalizeEventMessageBody(String(formData.get("body") ?? ""));
  const { error } = await supabase.rpc("post_event_message", {
    p_event_id: eventId,
    p_body: body
  });

  const rateLimitError = rateLimitErrorFromDatabase(error);
  if (rateLimitError) throw rateLimitError;
  if (error?.code === "42501") {
    throw new Error("このチャットは参加者だけが利用できます。");
  }
  if (error?.code === "55000") {
    throw new Error("中止されたイベントには投稿できません。");
  }
  if (error) {
    throw new Error("メッセージを投稿できませんでした。");
  }

  revalidatePath(`/events/${eventId}`);
}

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createSupabaseServerClient, getCurrentActiveUser } from "@/lib/supabase/server";

const MAX_TITLE_LENGTH = 100;

async function requireEventMember(eventId: string) {
  const user = await getCurrentActiveUser();
  if (!user) {
    redirect("/login");
  }

  const supabase = await createSupabaseServerClient();
  const { data: membership } = await supabase
    .from("event_members")
    .select("id")
    .eq("event_id", eventId)
    .eq("user_id", user.id)
    .eq("status", "joined")
    .maybeSingle();

  if (!membership) {
    throw new Error("このイベントの分担を編集する権限がありません。");
  }

  return { supabase, user };
}

function revalidateEvent(eventId: string) {
  revalidatePath(`/events/${eventId}`);
}

/** 未入力を null に寄せる。担当者なしを許すため。 */
function optionalUserId(formData: FormData) {
  const value = formData.get("assignee_user_id")?.toString().trim();
  return value ? value : null;
}

export async function createEventTaskAction(eventId: string, formData: FormData) {
  const { supabase, user } = await requireEventMember(eventId);

  const title = formData.get("title")?.toString().trim() ?? "";
  if (title.length === 0) {
    throw new Error("持ち物や役割の名前を入力してください。");
  }
  if (title.length > MAX_TITLE_LENGTH) {
    throw new Error(`名前は${MAX_TITLE_LENGTH}文字以内で入力してください。`);
  }

  const { data: last } = await supabase
    .from("event_tasks")
    .select("sort_order")
    .eq("event_id", eventId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase.from("event_tasks").insert({
    event_id: eventId,
    title,
    assignee_user_id: optionalUserId(formData),
    sort_order: (last?.sort_order ?? -1) + 1,
    created_by_user_id: user.id
  });

  if (error) {
    throw new Error(error.message);
  }

  revalidateEvent(eventId);
}

export async function toggleEventTaskDoneAction(eventId: string, taskId: string) {
  const { supabase } = await requireEventMember(eventId);

  const { data: task } = await supabase
    .from("event_tasks")
    .select("id, done_at")
    .eq("id", taskId)
    .eq("event_id", eventId)
    .maybeSingle();

  if (!task) {
    throw new Error("分担が見つかりません。");
  }

  const { error } = await supabase
    .from("event_tasks")
    .update({ done_at: task.done_at ? null : new Date().toISOString() })
    .eq("id", taskId)
    .eq("event_id", eventId);

  if (error) {
    throw new Error(error.message);
  }

  revalidateEvent(eventId);
}

export async function updateEventTaskAssigneeAction(eventId: string, taskId: string, formData: FormData) {
  const { supabase } = await requireEventMember(eventId);

  const { error } = await supabase
    .from("event_tasks")
    .update({ assignee_user_id: optionalUserId(formData) })
    .eq("id", taskId)
    .eq("event_id", eventId);

  if (error) {
    throw new Error(error.message);
  }

  revalidateEvent(eventId);
}

export async function deleteEventTaskAction(eventId: string, taskId: string) {
  const { supabase } = await requireEventMember(eventId);

  const { error } = await supabase.from("event_tasks").delete().eq("id", taskId).eq("event_id", eventId);

  if (error) {
    throw new Error(error.message);
  }

  revalidateEvent(eventId);
}

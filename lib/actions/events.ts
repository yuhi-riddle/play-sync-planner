"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { formDataToObject } from "@/lib/form-data";
import { getAfterEventCreatePath } from "@/lib/domain/event-flow";
import { getUserDisplayName } from "@/lib/domain/profile";
import { consumeAuthenticatedLimit } from "@/lib/server/rate-limit";
import { createSupabaseServerClient, getCurrentUser } from "@/lib/supabase/server";
import { eventSchema } from "@/lib/validators";

export async function createEventAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const values = eventSchema.parse(formDataToObject(formData));
  const supabase = await createSupabaseServerClient();
  await consumeAuthenticatedLimit("event_update");
  const { data, error } = await supabase
    .from("events")
    .insert({
      ...values,
      owner_user_id: user.id
    })
    .select("id")
    .single();

  if (error) {
    throw new Error("イベントを作成できませんでした。");
  }

  const [{ error: memberError }, { error: inviteError }] = await Promise.all([
    supabase.from("event_members").insert({
      event_id: data.id,
      user_id: user.id,
      display_name: getUserDisplayName(user, "主催者"),
      role: "organizer",
      status: "joined"
    }),
    supabase.from("event_invite_links").insert({
      event_id: data.id,
      token: crypto.randomUUID(),
      created_by_user_id: user.id,
      status: "open"
    })
  ]);

  if (memberError || inviteError) {
    await supabase.from("events").delete().eq("id", data.id);
    throw new Error("イベントの初期設定を保存できませんでした。");
  }

  await supabase.from("event_drafts").delete().eq("owner_user_id", user.id);

  revalidatePath("/");
  revalidatePath("/events");
  redirect(getAfterEventCreatePath(data.id));
}

export async function saveEventDraftAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const payload = {
    category: formData.get("category")?.toString() ?? "",
    title: formData.get("title")?.toString() ?? "",
    url: formData.get("url")?.toString() ?? "",
    location_name: formData.get("location_name")?.toString() ?? "",
    memo: formData.get("memo")?.toString() ?? ""
  };
  const supabase = await createSupabaseServerClient();
  await consumeAuthenticatedLimit("event_update");
  const { error } = await supabase.from("event_drafts").upsert({ owner_user_id: user.id, payload }, { onConflict: "owner_user_id" });

  if (error) {
    throw new Error("下書きを保存できませんでした。");
  }

  revalidatePath("/");
  revalidatePath("/events/new");
}

export async function discardEventDraftAction() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const supabase = await createSupabaseServerClient();
  await consumeAuthenticatedLimit("event_update");
  const { error } = await supabase.from("event_drafts").delete().eq("owner_user_id", user.id);
  if (error) {
    throw new Error("下書きを削除できませんでした。");
  }

  revalidatePath("/");
  revalidatePath("/events/new");
}

export async function cancelEventAction(eventId: string) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const supabase = await createSupabaseServerClient();
  await consumeAuthenticatedLimit("event_update");
  const { error } = await supabase.from("events").update({ status: "cancelled" }).eq("id", eventId).eq("owner_user_id", user.id);
  if (error) {
    throw new Error("イベントを中止できませんでした。");
  }

  await Promise.all([
    supabase.from("plans").update({ status: "cancelled" }).eq("event_id", eventId),
    supabase.from("event_invite_links").update({ status: "closed", closed_at: new Date().toISOString() }).eq("event_id", eventId).eq("status", "open")
  ]);

  revalidatePath("/");
  revalidatePath("/events");
  revalidatePath(`/events/${eventId}`);
  redirect("/events");
}

export async function updateEventAction(eventId: string, formData: FormData) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const values = eventSchema.parse(formDataToObject(formData));
  const supabase = await createSupabaseServerClient();
  await consumeAuthenticatedLimit("event_update");
  const { error } = await supabase.from("events").update(values).eq("id", eventId).eq("owner_user_id", user.id);

  if (error) {
    throw new Error("イベントを更新できませんでした。");
  }

  revalidatePath("/");
  revalidatePath("/events");
  revalidatePath(`/events/${eventId}`);
  redirect(`/events/${eventId}`);
}

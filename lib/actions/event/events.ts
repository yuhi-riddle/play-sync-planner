"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { formDataToObject } from "@/lib/shared/form-data";
import { buildDuplicatedEvent } from "@/lib/domain/event/event-duplication";
import { getAfterEventCreatePath } from "@/lib/domain/event/event-flow";
import { getUserDisplayName } from "@/lib/domain/account/profile";
import { createSupabaseServerClient, getCurrentActiveUser } from "@/lib/supabase/server";
import { eventDraftSchema, eventSchema } from "@/lib/shared/validators";

export async function createEventAction(formData: FormData) {
  const user = await getCurrentActiveUser();
  if (!user) {
    redirect("/login");
  }

  const values = eventSchema.parse(formDataToObject(formData));
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("events")
    .insert({
      ...values,
      owner_user_id: user.id
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(error.message);
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
    throw new Error(memberError?.message ?? inviteError?.message);
  }

  await supabase.from("event_drafts").delete().eq("owner_user_id", user.id);

  revalidatePath("/");
  revalidatePath("/events");
  redirect(getAfterEventCreatePath(data.id));
}

/**
 * 「このメンバーでもう一度」用の複製。
 * 参加していれば主催者でなくても複製でき、複製した人が新しいイベントの主催者になる。
 */
export async function duplicateEventAction(eventId: string) {
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
    throw new Error("このイベントを複製する権限がありません。");
  }

  const { data: source, error: sourceError } = await supabase
    .from("events")
    .select("category, title, url, location_name, address, memo")
    .eq("id", eventId)
    .single();

  if (sourceError || !source) {
    throw new Error("複製するイベントを読み込めませんでした。");
  }

  const { data: created, error: createError } = await supabase
    .from("events")
    .insert(buildDuplicatedEvent(source, user.id))
    .select("id")
    .single();

  if (createError || !created) {
    throw new Error(createError?.message ?? "イベントを複製できませんでした。");
  }

  const { data: members } = await supabase
    .from("event_members")
    .select("user_id, display_name")
    .eq("event_id", eventId)
    .eq("status", "joined");

  const duplicatedMembers = ((members ?? []) as { user_id: string; display_name: string }[]).map((member) => ({
    event_id: created.id,
    user_id: member.user_id,
    display_name: member.user_id === user.id ? getUserDisplayName(user, member.display_name) : member.display_name,
    // 元の主催者ではなく、複製した人が新しいイベントを進める。
    role: member.user_id === user.id ? "organizer" : "member",
    status: "joined"
  }));

  if (!duplicatedMembers.some((member) => member.user_id === user.id)) {
    duplicatedMembers.push({
      event_id: created.id,
      user_id: user.id,
      display_name: getUserDisplayName(user, "主催者"),
      role: "organizer",
      status: "joined"
    });
  }

  const [{ error: memberError }, { error: inviteError }] = await Promise.all([
    supabase.from("event_members").insert(duplicatedMembers),
    supabase.from("event_invite_links").insert({
      event_id: created.id,
      token: crypto.randomUUID(),
      created_by_user_id: user.id,
      status: "open"
    })
  ]);

  if (memberError || inviteError) {
    await supabase.from("events").delete().eq("id", created.id);
    throw new Error(memberError?.message ?? inviteError?.message);
  }

  revalidatePath("/");
  revalidatePath("/events");
  redirect(`/events/${created.id}/edit`);
}

export async function saveEventDraftAction(formData: FormData) {
  const user = await getCurrentActiveUser();
  if (!user) {
    redirect("/login");
  }

  const payload = eventDraftSchema.parse(formDataToObject(formData));
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("event_drafts").upsert({ owner_user_id: user.id, payload }, { onConflict: "owner_user_id" });

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/");
  revalidatePath("/events/new");
}

export async function discardEventDraftAction() {
  const user = await getCurrentActiveUser();
  if (!user) {
    redirect("/login");
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("event_drafts").delete().eq("owner_user_id", user.id);
  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/");
  revalidatePath("/events/new");
}

export async function cancelEventAction(eventId: string) {
  const user = await getCurrentActiveUser();
  if (!user) {
    redirect("/login");
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("events").update({ status: "cancelled" }).eq("id", eventId).eq("owner_user_id", user.id);
  if (error) {
    throw new Error(error.message);
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
  const user = await getCurrentActiveUser();
  if (!user) {
    redirect("/login");
  }

  const values = eventSchema.parse(formDataToObject(formData));
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("events").update(values).eq("id", eventId).eq("owner_user_id", user.id);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/");
  revalidatePath("/events");
  revalidatePath(`/events/${eventId}`);
  redirect(`/events/${eventId}`);
}

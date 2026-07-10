"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { formDataToObject } from "@/lib/form-data";
import { getAfterEventCreatePath } from "@/lib/domain/event-flow";
import { createSupabaseServerClient, getCurrentUser } from "@/lib/supabase/server";
import { eventSchema } from "@/lib/validators";

function getDisplayName(user: { email?: string | null; user_metadata?: Record<string, unknown> }) {
  const metadata = user.user_metadata ?? {};
  const fullName = metadata.full_name ?? metadata.name;

  if (typeof fullName === "string" && fullName.trim()) {
    return fullName.trim();
  }

  return user.email?.split("@")[0] ?? "主催者";
}

export async function createEventAction(formData: FormData) {
  const user = await getCurrentUser();
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
      display_name: getDisplayName(user),
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

  revalidatePath("/");
  revalidatePath("/events");
  redirect(getAfterEventCreatePath(data.id));
}

export async function updateEventAction(eventId: string, formData: FormData) {
  const user = await getCurrentUser();
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

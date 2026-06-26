"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { formDataToObject } from "@/lib/form-data";
import { getAfterEventCreatePath } from "@/lib/domain/event-flow";
import { createSupabaseServerClient, getCurrentUserId } from "@/lib/supabase/server";
import { eventSchema } from "@/lib/validators";

export async function createEventAction(formData: FormData) {
  const userId = await getCurrentUserId();
  if (!userId) {
    redirect("/login");
  }

  const values = eventSchema.parse(formDataToObject(formData));
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("events")
    .insert({
      ...values,
      owner_user_id: userId
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/");
  revalidatePath("/events");
  redirect(getAfterEventCreatePath(data.id));
}

export async function updateEventAction(eventId: string, formData: FormData) {
  const userId = await getCurrentUserId();
  if (!userId) {
    redirect("/login");
  }

  const values = eventSchema.parse(formDataToObject(formData));
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("events").update(values).eq("id", eventId).eq("owner_user_id", userId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/");
  revalidatePath("/events");
  revalidatePath(`/events/${eventId}`);
  redirect(`/events/${eventId}`);
}

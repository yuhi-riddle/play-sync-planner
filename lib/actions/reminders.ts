"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createSupabaseServerClient, getCurrentUserId } from "@/lib/supabase/server";

function namesFromFormData(value: FormDataEntryValue | null): string[] {
  if (typeof value !== "string") {
    return [];
  }

  return value
    .split(/\r?\n/)
    .map((name) => name.trim())
    .filter(Boolean);
}

export async function markReminderSentAction(planId: string, formData: FormData) {
  const userId = await getCurrentUserId();
  if (!userId) {
    redirect("/login");
  }

  const recipientNames = namesFromFormData(formData.get("recipient_names"));
  const reminderMessage = typeof formData.get("reminder_message") === "string" ? String(formData.get("reminder_message")) : null;
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.from("plan_reminder_logs").insert({
    plan_id: planId,
    actor_user_id: userId,
    recipient_names: recipientNames,
    reminder_message: reminderMessage
  });

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath(`/plans/${planId}`);
}

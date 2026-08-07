"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { buildConfirmedCalendarEvent } from "@/lib/domain/calendar/calendar-sync";
import { resolveGoogleCalendarAccessToken, type CalendarIntegrationRow } from "@/lib/google-calendar/access-token";
import { insertCalendarEvent } from "@/lib/google-calendar/calendar-events";
import { createSupabaseAdminClient, createSupabaseServerClient, getCurrentUserId } from "@/lib/supabase/server";

type PlanCalendarRow = {
  id: string;
  title: string | null;
  owner_user_id: string;
  confirmed_start_at: string | null;
  confirmed_end_at: string | null;
  is_all_day?: boolean | null;
  google_calendar_event_id: string | null;
  events: { title: string | null; location_name: string | null } | { title: string | null; location_name: string | null }[] | null;
  participants?: Array<{ user_id: string | null; status: string }>;
};

export async function createGoogleCalendarEventForPlanAction(planId: string) {
  const userId = await getCurrentUserId();
  if (!userId) {
    redirect("/login");
  }

  const supabase = await createSupabaseServerClient();
  const { data: plan, error: planError } = await supabase
    .from("plans")
    .select(
      "id, title, owner_user_id, confirmed_start_at, confirmed_end_at, is_all_day, google_calendar_event_id, events(title, location_name), participants(user_id, status)"
    )
    .eq("id", planId)
    .eq("owner_user_id", userId)
    .single();

  if (planError || !plan) {
    throw new Error("日程調整が見つかりません");
  }

  const planRow = plan as PlanCalendarRow;
  if (!planRow.confirmed_start_at) {
    throw new Error("日程が確定していません");
  }

  if (planRow.google_calendar_event_id) {
    redirect(`/plans/${planId}?calendar=already-created`);
  }

  const { data: integration } = await supabase
    .from("calendar_integrations")
    .select("calendar_id, encrypted_access_token, encrypted_refresh_token, token_expires_at")
    .eq("user_id", userId)
    .eq("provider", "google")
    .maybeSingle();

  if (!integration) {
    redirect("/settings?calendar=required");
  }

  const participantUserIds = [
    ...new Set((planRow.participants ?? []).filter((participant) => participant.status === "confirmed").flatMap((participant) => (participant.user_id ? [participant.user_id] : [])))
  ].filter((participantUserId) => participantUserId !== userId);

  const { data: attendeeIntegrations } =
    participantUserIds.length > 0
      ? await createSupabaseAdminClient().from("calendar_integrations").select("account_email").eq("provider", "google").in("user_id", participantUserIds)
      : { data: [] };
  const attendeeEmails = [...new Set((attendeeIntegrations ?? []).flatMap((integration) => (integration.account_email ? [integration.account_email] : [])))];
  const event = Array.isArray(planRow.events) ? planRow.events[0] : planRow.events;
  const accessToken = await resolveGoogleCalendarAccessToken({ supabase, userId, integration: integration as CalendarIntegrationRow });
  const inserted = await insertCalendarEvent({
    accessToken,
    calendarId: (integration as CalendarIntegrationRow).calendar_id ?? "primary",
    event: {
      ...buildConfirmedCalendarEvent({
        planTitle: planRow.title,
        eventTitle: event?.title,
        locationName: event?.location_name,
        startAt: planRow.confirmed_start_at,
        endAt: planRow.confirmed_end_at,
        isAllDay: Boolean(planRow.is_all_day)
      }),
      attendeeEmails
    }
  });

  await supabase
    .from("plans")
    .update({ google_calendar_event_id: inserted.id ?? "created" })
    .eq("id", planId)
    .eq("owner_user_id", userId);

  revalidatePath("/");
  revalidatePath(`/plans/${planId}`);
  redirect(`/plans/${planId}?calendar=created`);
}

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { buildConfirmationUpdates, pickRecommendedCandidate } from "@/lib/domain/confirmation";
import { buildConfirmedCalendarEvent } from "@/lib/domain/calendar-sync";
import { requireString } from "@/lib/form-data";
import { insertCalendarEvent } from "@/lib/google-calendar/calendar-events";
import { refreshGoogleCalendarAccessToken } from "@/lib/google-calendar/oauth";
import { decryptToken, encryptToken } from "@/lib/google-calendar/token-crypto";
import { createSupabaseServerClient, getCurrentUserId } from "@/lib/supabase/server";

type AnswerRow = {
  answer: "yes" | "maybe" | "no" | "unanswered";
  participants: { id: string } | { id: string }[] | null;
};

type CandidatePlan = {
  id: string;
  title: string | null;
  event_id: string;
  owner_user_id: string;
  events: { title: string | null; location_name: string | null } | { title: string | null; location_name: string | null }[] | null;
};

type CalendarIntegration = {
  calendar_id: string | null;
  encrypted_access_token: string | null;
  encrypted_refresh_token: string;
  token_expires_at: string | null;
};

function isExpired(value: string | null) {
  return !value || new Date(value).getTime() <= Date.now() + 60_000;
}

async function getCalendarAccessToken({
  supabase,
  userId,
  integration
}: {
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  userId: string;
  integration: CalendarIntegration;
}) {
  let accessToken = integration.encrypted_access_token ? decryptToken(integration.encrypted_access_token) : "";

  if (!accessToken || isExpired(integration.token_expires_at)) {
    const refreshToken = decryptToken(integration.encrypted_refresh_token);
    const refreshed = await refreshGoogleCalendarAccessToken({ refreshToken });
    accessToken = refreshed.access_token;
    await supabase
      .from("calendar_integrations")
      .update({
        encrypted_access_token: encryptToken(refreshed.access_token),
        token_expires_at: refreshed.expires_in ? new Date(Date.now() + refreshed.expires_in * 1000).toISOString() : null,
        scope: refreshed.scope
      })
      .eq("user_id", userId)
      .eq("provider", "google");
  }

  return accessToken;
}

export async function confirmPlanAction(planId: string, formData: FormData) {
  const userId = await getCurrentUserId();
  if (!userId) {
    redirect("/login");
  }

  const candidateDateId = requireString(formData.get("candidateDateId"), "候補日時を選んでください");
  const supabase = await createSupabaseServerClient();
  const { data: candidate, error: candidateError } = await supabase
    .from("candidate_dates")
    .select("id, start_at, end_at, is_all_day, plans(id, title, event_id, owner_user_id, events(title, location_name))")
    .eq("id", candidateDateId)
    .eq("plan_id", planId)
    .single();

  if (candidateError || !candidate) {
    throw new Error("候補日時が見つかりません");
  }

  const plan = (Array.isArray(candidate.plans) ? candidate.plans[0] : candidate.plans) as CandidatePlan;
  const event = Array.isArray(plan.events) ? plan.events[0] : plan.events;
  if (plan.owner_user_id !== userId) {
    throw new Error("主催者だけが日程を確定できます");
  }

  const { data: answers, error: answersError } = await supabase
    .from("availability_answers")
    .select("answer, participants(id)")
    .eq("candidate_date_id", candidateDateId);

  if (answersError) {
    throw new Error(answersError.message);
  }

  const updates = buildConfirmationUpdates(
    ((answers ?? []) as AnswerRow[]).flatMap((row) => {
      const participant = Array.isArray(row.participants) ? row.participants[0] : row.participants;
      return participant ? [{ participantId: participant.id, answer: row.answer }] : [];
    })
  );

  const { error: planError } = await supabase
    .from("plans")
    .update({
      status: "date_confirmed",
      confirmed_start_at: candidate.start_at,
      confirmed_end_at: candidate.end_at,
      is_all_day: candidate.is_all_day
    })
    .eq("id", planId)
    .eq("owner_user_id", userId);

  if (planError) {
    throw new Error(planError.message);
  }

  await Promise.all(
    updates.map((update) =>
      supabase.from("participants").update({ status: update.status }).eq("id", update.participantId)
    )
  );

  await supabase.from("events").update({ status: "confirmed" }).eq("id", plan.event_id).eq("owner_user_id", userId);

  let calendarResult: "added" | "failed" | null = null;
  const { data: integration } = await supabase
    .from("calendar_integrations")
    .select("calendar_id, encrypted_access_token, encrypted_refresh_token, token_expires_at")
    .eq("user_id", userId)
    .eq("provider", "google")
    .maybeSingle();

  if (integration) {
    try {
      const accessToken = await getCalendarAccessToken({
        supabase,
        userId,
        integration: integration as CalendarIntegration
      });
      await insertCalendarEvent({
        accessToken,
        calendarId: integration.calendar_id ?? "primary",
        event: buildConfirmedCalendarEvent({
          planTitle: plan.title,
          eventTitle: event?.title,
          locationName: event?.location_name,
          startAt: candidate.start_at,
          endAt: candidate.end_at,
          isAllDay: candidate.is_all_day
        })
      });
      calendarResult = "added";
    } catch {
      calendarResult = "failed";
    }
  }

  revalidatePath("/");
  revalidatePath(`/events/${plan.event_id}`);
  revalidatePath(`/plans/${planId}`);
  redirect(`/plans/${planId}${calendarResult ? `?calendar=${calendarResult}` : ""}`);
}

export { pickRecommendedCandidate };

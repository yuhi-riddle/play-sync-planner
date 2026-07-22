import {
  buildNotificationCandidate,
  buildPlanNotificationInputs,
  type PlanNotificationPlan
} from "@/lib/domain/site-notifications";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export class CronNotificationsError extends Error {
  constructor() {
    super("通知を作成できませんでした。");
    this.name = "CronNotificationsError";
  }
}

export async function createCronNotifications(now: Date): Promise<number> {
  const supabase = createSupabaseAdminClient();
  const { data: plans, error } = await supabase
    .from("plans")
    .select(
      "id, owner_user_id, title, status, settlement_status, answer_deadline_at, events(title), participants(display_name, status), plan_reminder_settings(reminder_offset_minutes, reminder_offsets_minutes), settlements(amount, status, from_participant_id, participants!settlements_from_participant_id_fkey(display_name), settlement_payments(amount, confirmed_at))"
    )
    .in("status", ["collecting_answers", "date_confirmed"])
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new CronNotificationsError();

  const candidates = ((plans ?? []) as PlanNotificationPlan[])
    .flatMap((plan) => buildPlanNotificationInputs(plan, now))
    .map(buildNotificationCandidate);
  if (candidates.length === 0) return 0;

  const { error: upsertError } = await supabase.from("notifications").upsert(
    candidates.map((candidate) => ({
      user_id: candidate.userId,
      kind: candidate.kind,
      title: candidate.title,
      body: candidate.body,
      href: candidate.href,
      dedupe_key: candidate.dedupeKey
    })),
    { onConflict: "user_id,dedupe_key", ignoreDuplicates: true }
  );
  if (upsertError) throw new CronNotificationsError();

  return candidates.length;
}

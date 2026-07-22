import {
  buildNotificationCandidate,
  buildPlanNotificationInputs,
  type PlanNotificationPlan
} from "@/lib/domain/site-notifications";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import type { WebVitalInput } from "@/lib/domain/web-vitals";

type RetentionOperation =
  | "purge_expired_security_data"
  | "purge_expired_web_vitals";

export class CronNotificationsError extends Error {
  constructor() {
    super("通知を作成できませんでした。");
    this.name = "CronNotificationsError";
  }
}

export class CronRetentionError extends Error {
  constructor(
    readonly operation: RetentionOperation,
    readonly databaseCode: string
  ) {
    super("保持期限を過ぎたデータを削除できませんでした。");
    this.name = "CronRetentionError";
  }
}

function requireSubjectHash(subjectHash: string) {
  if (!/^[0-9a-f]{64}$/i.test(subjectHash)) {
    throw new Error("Invalid performance measurement subject");
  }
  return `\\x${subjectHash.toLowerCase()}`;
}

export async function recordWebVital(
  input: WebVitalInput,
  subjectHash: string
): Promise<number> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.rpc("record_web_vital", {
    page_template: input.page,
    metric_name: input.name,
    metric_value: input.value,
    device_class: input.device,
    subject_hash: requireSubjectHash(subjectHash)
  });
  if (error) throw new Error("Performance measurement unavailable");

  const retryAfter = Number(data);
  if (!Number.isSafeInteger(retryAfter) || retryAfter < 0 || retryAfter > 60) {
    throw new Error("Invalid performance measurement result");
  }
  return retryAfter;
}

export async function purgeCronRetention(): Promise<void> {
  const supabase = createSupabaseAdminClient();
  const operations: RetentionOperation[] = [
    "purge_expired_security_data",
    "purge_expired_web_vitals"
  ];

  for (const operation of operations) {
    const { error } = await supabase.rpc(operation);
    if (error) {
      const databaseCode = /^[A-Z0-9]{5,10}$/.test(error.code ?? "")
        ? error.code
        : "database_error";
      throw new CronRetentionError(operation, databaseCode);
    }
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

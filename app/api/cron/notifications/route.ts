import { NextRequest, NextResponse } from "next/server";

import {
  buildNotificationCandidate,
  buildPlanNotificationInputs,
  type PlanNotificationPlan
} from "@/lib/domain/shared/site-notifications";
import {
  planEventWrapupSweep,
  type EventWrapupSweepEvent
} from "@/lib/domain/event/event-wrapup";
import { createSupabaseAdminClient, hasSupabaseAdminEnv } from "@/lib/supabase/server";

const PLAN_SELECT =
  "id, owner_user_id, title, status, settlement_status, answer_deadline_at, events(title), participants(display_name, status), plan_reminder_settings(reminder_offset_minutes, reminder_offsets_minutes), settlements(amount, status, from_participant_id, participants!settlements_from_participant_id_fkey(display_name), settlement_payments(amount, confirmed_at))";

// 1 リクエストで取り切れない件数になっても全件処理できるよう、id のキーセットで
// ページングする。以前は limit(200) で打ち切っていたため、対象が 200 件を超えると
// 古い予定に通知が作られなくなっていた。
const PAGE_SIZE = 200;
// 暴走時の保険。PAGE_SIZE * MAX_PAGES 件までで打ち切る。
const MAX_PAGES = 500;

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!hasSupabaseAdminEnv()) {
    return NextResponse.json({ error: "Supabase admin env is not configured" }, { status: 500 });
  }

  const now = new Date();
  const supabase = createSupabaseAdminClient();

  const plans: PlanNotificationPlan[] = [];
  let cursor: string | null = null;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    let query = supabase
      .from("plans")
      .select(PLAN_SELECT)
      .in("status", ["collecting_answers", "date_confirmed"])
      .order("id", { ascending: true })
      .limit(PAGE_SIZE);

    if (cursor) {
      query = query.gt("id", cursor);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = (data ?? []) as PlanNotificationPlan[];
    plans.push(...rows);

    if (rows.length < PAGE_SIZE) {
      break;
    }
    cursor = rows[rows.length - 1].id;
  }

  const candidates = plans
    .flatMap((plan) => buildPlanNotificationInputs(plan, now))
    .map(buildNotificationCandidate);

  if (candidates.length > 0) {
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

    if (upsertError) {
      return NextResponse.json({ error: upsertError.message }, { status: 500 });
    }
  }

  // --- イベントの自動完了（wrapup） ---
  const wrapupEvents: EventWrapupSweepEvent[] = [];
  {
    let cursor: string | null = null;
    for (let page = 0; page < MAX_PAGES; page += 1) {
      let query = supabase
        .from("events")
        .select(
          "id, title, owner_user_id, status, start_date, end_date, wrapup_snoozed_until, plans(status, settlement_status, confirmed_start_at, confirmed_end_at, is_all_day)"
        )
        .in("status", ["planning", "confirmed"])
        .order("id", { ascending: true })
        .limit(PAGE_SIZE);
      if (cursor) {
        query = query.gt("id", cursor);
      }
      const { data, error } = await query;
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      const rows = (data ?? []) as EventWrapupSweepEvent[];
      wrapupEvents.push(...rows);
      if (rows.length < PAGE_SIZE) {
        break;
      }
      cursor = rows[rows.length - 1].id;
    }
  }

  const autoDoneEnabled = process.env.EVENT_WRAPUP_AUTO_DONE === "on";
  const sweep = planEventWrapupSweep(wrapupEvents, now, {
    autoDoneEnabled,
    promptFloorIso: process.env.EVENT_WRAPUP_PROMPT_FLOOR ?? "2026-10-04"
  });

  const wrapupErrors: string[] = [];

  if (sweep.notifications.length > 0) {
    const { error } = await supabase.from("notifications").upsert(sweep.notifications, {
      onConflict: "user_id,dedupe_key",
      ignoreDuplicates: true
    });
    if (error) {
      wrapupErrors.push(`notifications: ${error.message}`);
    }
  }

  for (const eventId of sweep.autoComplete) {
    const { error } = await supabase
      .from("events")
      .update({ status: "done", wrapup_auto_done: true })
      .eq("id", eventId);
    if (error) {
      wrapupErrors.push(`event ${eventId}: ${error.message}`);
    }
  }

  for (const eventId of sweep.wouldAutoComplete) {
    console.log("[wrapup] would auto-complete", { eventId });
  }

  return NextResponse.json({
    created: candidates.length,
    plansScanned: plans.length,
    wrapup: {
      notified: sweep.notifications.filter((n) => n.kind === "wrapup_prompt").length,
      autoCompleted: sweep.autoComplete.length,
      wouldAutoComplete: sweep.wouldAutoComplete.length,
      eventsScanned: wrapupEvents.length,
      errors: wrapupErrors
    }
  });
}

function isAuthorized(request: NextRequest) {
  if (process.env.NODE_ENV !== "production") {
    return true;
  }

  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return false;
  }

  return request.headers.get("authorization") === `Bearer ${secret}`;
}

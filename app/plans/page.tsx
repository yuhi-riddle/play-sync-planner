import { CalendarPlus } from "lucide-react";

import { AdjustmentCalendarView } from "@/components/plan/adjustment-calendar-view";
import { ButtonLink, PageHeader } from "@/components/ui";
import { LoginPanel, SetupPanel } from "@/components/ui/state-panels";
import { defaultSelectedDateKey, type AdjustmentCandidate } from "@/lib/domain/plan/adjustment-calendar";
import { monthRangeInTokyo } from "@/lib/domain/plan/group-availability";
import {
  createSupabaseAdminClient,
  createSupabaseServerClient,
  getCurrentUserId,
  hasSupabaseAdminEnv,
  hasSupabaseEnv
} from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type CandidateDateRow = {
  id: string;
  start_at: string;
  end_at: string | null;
  is_all_day?: boolean | null;
  availability_answers?: Array<{ answer: "yes" | "maybe" | "no" | "unanswered" }>;
};

type PlanRow = {
  id: string;
  title: string | null;
  status: string;
  answer_deadline_at: string | null;
  events: { title: string | null } | { title: string | null }[] | null;
  candidate_dates?: CandidateDateRow[];
};

function parseMonth(value: string | undefined) {
  const match = /^(\d{4})-(\d{2})$/.exec(value ?? "");
  if (!match) {
    const today = new Date();
    return { year: today.getFullYear(), month: today.getMonth() + 1 };
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) {
    const today = new Date();
    return { year: today.getFullYear(), month: today.getMonth() + 1 };
  }

  return { year, month };
}

function monthParam(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function defaultSelectedDate(year: number, month: number) {
  return defaultSelectedDateKey(year, month, new Date());
}

function toCandidate(plan: PlanRow, candidate: CandidateDateRow): AdjustmentCandidate {
  const event = Array.isArray(plan.events) ? plan.events[0] : plan.events;
  const counts = (candidate.availability_answers ?? []).reduce(
    (result, answer) => {
      result[answer.answer] += 1;
      return result;
    },
    { yes: 0, maybe: 0, no: 0, unanswered: 0 }
  );

  return {
    id: candidate.id,
    planId: plan.id,
    eventTitle: event?.title ?? "イベント未設定",
    planTitle: plan.title,
    startAt: candidate.start_at,
    endAt: candidate.end_at,
    isAllDay: candidate.is_all_day,
    status: plan.status,
    ...counts
  };
}

export default async function PlansPage({
  searchParams
}: {
  searchParams?: Promise<{ month?: string; date?: string }>;
}) {
  const query = (await searchParams) ?? {};
  const { year, month } = parseMonth(query.month);
  const currentMonth = monthParam(year, month);
  const selectedDateKey = query.date ?? defaultSelectedDate(year, month);

  if (!hasSupabaseEnv()) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Calendar" title="カレンダー" />
        <SetupPanel />
      </div>
    );
  }

  const supabase = await createSupabaseServerClient();
  const userId = await getCurrentUserId();

  if (!userId) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Calendar" title="カレンダー" />
        <LoginPanel />
      </div>
    );
  }

  const { data: memberships } = await supabase
    .from("event_members")
    .select("event_id")
    .eq("user_id", userId)
    .eq("status", "joined");
  const joinedEventIds = [...new Set((memberships ?? []).map((membership) => membership.event_id))];
  const calendarClient = hasSupabaseAdminEnv() ? createSupabaseAdminClient() : supabase;
  const monthRange = monthRangeInTokyo(currentMonth);
  const plansResult = joinedEventIds.length
    ? await calendarClient
        .from("plans")
        .select(
          "id, title, status, answer_deadline_at, events(title), candidate_dates!inner(id, start_at, end_at, is_all_day, availability_answers(answer))"
        )
        .in("event_id", joinedEventIds)
        .in("status", ["draft", "collecting_answers", "date_confirmed"])
        .gte("candidate_dates.start_at", monthRange.start)
        .lt("candidate_dates.start_at", monthRange.end)
        .order("created_at", { ascending: false })
    : { data: [] };
  const plans = plansResult.data;

  const candidates = ((plans ?? []) as PlanRow[]).flatMap((plan) =>
    (plan.candidate_dates ?? []).map((candidate) => toCandidate(plan, candidate))
  );

  return (
    <div className="space-y-7">
      <PageHeader eyebrow="Calendar"
        title="カレンダー"
        description="自分のGoogleカレンダーと、Madoiで調整中の候補日時を月ごとに見比べます。"
        action={
          // モバイルでは右下の FAB が同じ導線なので出さない（FAB は sm:hidden）。
          <div className="hidden sm:block">
            <ButtonLink href="/events/new">
              <CalendarPlus aria-hidden="true" className="mr-2 h-4 w-4" />
              イベント作成
            </ButtonLink>
          </div>
        }
      />

      <AdjustmentCalendarView month={currentMonth} selectedDateKey={selectedDateKey} candidates={candidates} />
    </div>
  );
}

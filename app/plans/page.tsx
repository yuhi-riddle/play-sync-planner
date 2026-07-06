import { CalendarPlus } from "lucide-react";

import { AdjustmentCalendarView } from "@/components/adjustment-calendar-view";
import { ButtonLink, PageHeader } from "@/components/ui";
import { LoginPanel, SetupPanel } from "@/components/state-panels";
import { toDateKey, type AdjustmentCandidate } from "@/lib/domain/adjustment-calendar";
import { createSupabaseServerClient, hasSupabaseEnv } from "@/lib/supabase/server";

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
  const today = new Date();
  if (today.getFullYear() === year && today.getMonth() + 1 === month) {
    return toDateKey(today);
  }

  return `${year}-${String(month).padStart(2, "0")}-01`;
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
    eventTitle: event?.title ?? "予定未設定",
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
        <PageHeader title="調整カレンダー" />
        <SetupPanel />
      </div>
    );
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="space-y-6">
        <PageHeader title="調整カレンダー" />
        <LoginPanel />
      </div>
    );
  }

  const { data: plans } = await supabase
    .from("plans")
    .select("id, title, status, answer_deadline_at, events(title), candidate_dates(id, start_at, end_at, is_all_day, availability_answers(answer))")
    .eq("owner_user_id", user.id)
    .in("status", ["draft", "collecting_answers", "date_confirmed"])
    .order("created_at", { ascending: false });

  const candidates = ((plans ?? []) as PlanRow[]).flatMap((plan) =>
    (plan.candidate_dates ?? []).map((candidate) => toCandidate(plan, candidate))
  );

  return (
    <div className="space-y-7">
      <PageHeader
        title="調整カレンダー"
        description="同時進行の候補日時を月ごとに見比べます。重なりがある日は、下のタイムラインで優先順位を決めやすくしています。"
        action={
          <ButtonLink href="/events/new">
            <CalendarPlus aria-hidden="true" className="mr-2 h-4 w-4" />
            予定を作る
          </ButtonLink>
        }
      />

      <AdjustmentCalendarView month={currentMonth} selectedDateKey={selectedDateKey} candidates={candidates} />
    </div>
  );
}

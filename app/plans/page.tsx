import { CalendarPlus } from "lucide-react";

import { AdjustmentCalendarView } from "@/components/adjustment-calendar-view";
import { ButtonLink, PageHeader } from "@/components/ui";
import { LoginPanel, SetupPanel } from "@/components/state-panels";
import { type AdjustmentCandidate } from "@/lib/domain/adjustment-calendar";
import { createSupabaseServerClient, hasSupabaseEnv } from "@/lib/supabase/server";
import { calendarMonthSchema } from "@/lib/validation/request";

export const dynamic = "force-dynamic";

type CalendarItemRow = {
  candidate_id: string;
  plan_id: string;
  event_title: string | null;
  plan_title: string | null;
  start_at: string;
  end_at: string | null;
  is_all_day: boolean | null;
  status: string;
  yes_count: number | null;
  maybe_count: number | null;
  no_count: number | null;
  unanswered_count: number | null;
};

function todayInTokyo() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return { year: Number(value("year")), month: Number(value("month")), day: Number(value("day")) };
}

function parseMonth(value: string | undefined) {
  const parsed = calendarMonthSchema.safeParse(value);
  if (!parsed.success) return todayInTokyo();

  const [year, month] = parsed.data.split("-").map(Number);
  return { year, month, day: 1 };
}

function monthParam(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function defaultSelectedDate(year: number, month: number) {
  const today = todayInTokyo();
  if (today.year === year && today.month === month) {
    return `${today.year}-${String(today.month).padStart(2, "0")}-${String(today.day).padStart(2, "0")}`;
  }

  return `${year}-${String(month).padStart(2, "0")}-01`;
}

function toCandidate(row: CalendarItemRow): AdjustmentCandidate {
  return {
    id: row.candidate_id,
    planId: row.plan_id,
    eventTitle: row.event_title ?? "イベント未設定",
    planTitle: row.plan_title,
    startAt: row.start_at,
    endAt: row.end_at,
    isAllDay: row.is_all_day,
    status: row.status,
    yes: row.yes_count ?? 0,
    maybe: row.maybe_count ?? 0,
    no: row.no_count ?? 0,
    unanswered: row.unanswered_count ?? 0
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
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Calendar" title="カレンダー" />
        <LoginPanel />
      </div>
    );
  }

  const { data } = await supabase.rpc("list_calendar_items", { p_month: `${currentMonth}-01` });
  const candidates = ((data ?? []) as CalendarItemRow[]).map(toCandidate);

  return (
    <div className="space-y-7">
      <PageHeader eyebrow="Calendar"
        title="カレンダー"
        description="自分のGoogleカレンダーと、Madoiで調整中の候補日時を月ごとに見比べます。"
        action={
          <ButtonLink href="/events/new">
            <CalendarPlus aria-hidden="true" className="mr-2 h-4 w-4" />
            イベントを作る
          </ButtonLink>
        }
      />

      <AdjustmentCalendarView month={currentMonth} selectedDateKey={selectedDateKey} candidates={candidates} />
    </div>
  );
}

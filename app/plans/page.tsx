import Link from "next/link";
import { CalendarPlus, ChevronLeft, ChevronRight } from "lucide-react";

import { ButtonLink, Card, EmptyState, PageHeader } from "@/components/ui";
import { LoginPanel, SetupPanel } from "@/components/state-panels";
import { planStatusLabels } from "@/lib/constants";
import { buildAdjustmentCalendar, toDateKey, type AdjustmentCandidate } from "@/lib/domain/adjustment-calendar";
import { createSupabaseServerClient, hasSupabaseEnv } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type CandidateDateRow = {
  id: string;
  start_at: string;
  end_at: string | null;
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

function moveMonth(year: number, month: number, amount: number) {
  const date = new Date(year, month - 1 + amount, 1);
  return { year: date.getFullYear(), month: date.getMonth() + 1 };
}

function defaultSelectedDate(year: number, month: number) {
  const today = new Date();
  if (today.getFullYear() === year && today.getMonth() + 1 === month) {
    return toDateKey(today);
  }

  return `${year}-${String(month).padStart(2, "0")}-01`;
}

function formatMonthLabel(year: number, month: number) {
  return new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "long" }).format(new Date(year, month - 1, 1));
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("ja-JP", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
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
    status: plan.status,
    ...counts
  };
}

function buildSearchHref(dateKey: string) {
  return `/plans?month=${dateKey.slice(0, 7)}&date=${dateKey}`;
}

export default async function PlansPage({
  searchParams
}: {
  searchParams?: Promise<{ month?: string; date?: string }>;
}) {
  const query = (await searchParams) ?? {};
  const { year, month } = parseMonth(query.month);
  const selectedDateKey = query.date ?? defaultSelectedDate(year, month);
  const previous = moveMonth(year, month, -1);
  const next = moveMonth(year, month, 1);

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
    .select("id, title, status, answer_deadline_at, events(title), candidate_dates(id, start_at, end_at, availability_answers(answer))")
    .eq("owner_user_id", user.id)
    .in("status", ["draft", "collecting_answers", "date_confirmed"])
    .order("created_at", { ascending: false });

  const candidates = ((plans ?? []) as PlanRow[]).flatMap((plan) =>
    (plan.candidate_dates ?? []).map((candidate) => toCandidate(plan, candidate))
  );
  const calendar = buildAdjustmentCalendar({ year, month, selectedDateKey, candidates });

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

      <Card>
        <div className="flex items-center justify-between gap-3">
          <Link
            href={`/plans?month=${monthParam(previous.year, previous.month)}&date=${defaultSelectedDate(previous.year, previous.month)}`}
            scroll={false}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-ink/10 bg-white/75 text-ink transition-colors hover:border-moss hover:text-pine focus:outline-none focus:ring-2 focus:ring-clay"
            aria-label="前の月"
          >
            <ChevronLeft aria-hidden="true" className="h-5 w-5" />
          </Link>
          <h2 className="text-xl font-bold text-ink">{formatMonthLabel(year, month)}</h2>
          <Link
            href={`/plans?month=${monthParam(next.year, next.month)}&date=${defaultSelectedDate(next.year, next.month)}`}
            scroll={false}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-ink/10 bg-white/75 text-ink transition-colors hover:border-moss hover:text-pine focus:outline-none focus:ring-2 focus:ring-clay"
            aria-label="次の月"
          >
            <ChevronRight aria-hidden="true" className="h-5 w-5" />
          </Link>
        </div>

        <div className="mt-5 grid grid-cols-7 gap-1 text-center text-xs font-bold text-ink/50">
          {["日", "月", "火", "水", "木", "金", "土"].map((label) => (
            <div key={label} className="py-2">
              {label}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {calendar.weeks.flat().map((day) => (
            <Link
              key={day.dateKey}
              href={buildSearchHref(day.dateKey)}
              scroll={false}
              className={[
                "min-h-20 rounded-lg border p-2 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-clay",
                day.isSelected ? "border-pine bg-moss/18" : "border-white/70 bg-white/58 hover:border-moss/45",
                day.isCurrentMonth ? "text-ink" : "text-ink/32"
              ].join(" ")}
              aria-label={`${day.dateKey}の候補を表示`}
              aria-current={day.isSelected ? "date" : undefined}
            >
              <span className="text-sm font-bold">{day.day}</span>
              {day.candidateCount > 0 ? (
                <span className="mt-2 flex flex-wrap gap-1">
                  <span className="rounded-full bg-pine px-2 py-0.5 text-[11px] font-bold text-white">{day.candidateCount}</span>
                  {day.hasOverlap ? <span className="rounded-full bg-clay px-2 py-0.5 text-[11px] font-bold text-white">重</span> : null}
                  {day.hasConfirmed ? <span className="rounded-full bg-honey px-2 py-0.5 text-[11px] font-bold text-ink">確</span> : null}
                </span>
              ) : null}
            </Link>
          ))}
        </div>
      </Card>

      <Card>
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-moss">Timeline</p>
            <h2 className="mt-1 text-xl font-bold text-ink">{calendar.selectedDateKey}</h2>
          </div>
          <p className="text-sm text-ink/58">○ 行ける / △ 微妙 / × 行けない</p>
        </div>

        <div className="mt-5 space-y-3">
          {calendar.selectedCandidates.length > 0 ? (
            calendar.selectedCandidates.map((candidate) => (
              <Link
                key={candidate.id}
                href={`/plans/${candidate.planId}`}
                className="block rounded-lg border border-ink/8 bg-white/62 p-4 transition-colors hover:border-moss/45 focus:outline-none focus:ring-2 focus:ring-clay"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-sm font-bold text-pine">{formatTime(candidate.startAt)}</p>
                    <h3 className="mt-1 text-base font-bold text-ink">{candidate.eventTitle}</h3>
                    <p className="mt-1 text-sm text-ink/60">{candidate.planTitle ?? "日程調整"}</p>
                  </div>
                  <div className="text-sm font-semibold text-ink/68">
                    {planStatusLabels[candidate.status as keyof typeof planStatusLabels] ?? candidate.status}
                  </div>
                </div>
                <p className="mt-3 text-sm text-ink/64">
                  ○ {candidate.yes} / △ {candidate.maybe} / × {candidate.no} / 未回答 {candidate.unanswered}
                </p>
              </Link>
            ))
          ) : (
            <EmptyState>この日の候補はありません。</EmptyState>
          )}
        </div>
      </Card>
    </div>
  );
}

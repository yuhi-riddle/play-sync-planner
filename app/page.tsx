import Link from "next/link";
import { Bell, CalendarDays, CalendarPlus, ListChecks, Settings } from "lucide-react";

import { HomeMonthCalendar } from "@/components/home-month-calendar";
import { SettlementStatusBadge } from "@/components/settlement-status-badge";
import { ButtonLink, Card, EmptyState, PageHeader, SecondaryLink } from "@/components/ui";
import { LoginPanel, SetupPanel } from "@/components/state-panels";
import type { HomeCalendarItem } from "@/lib/domain/home-calendar";
import { getSettlementStatusView } from "@/lib/domain/settlement";
import { formatDateTimeRange } from "@/lib/format";
import { createSupabaseServerClient, hasSupabaseEnv } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type CandidateDateRow = {
  id: string;
  start_at: string;
  end_at: string | null;
  is_all_day?: boolean | null;
};

type PlanRow = {
  id: string;
  title: string | null;
  status: string;
  settlement_status: string | null;
  confirmed_start_at: string | null;
  confirmed_end_at: string | null;
  is_all_day?: boolean | null;
  answer_deadline_at: string | null;
  events: { title: string | null; location_name: string | null } | { title: string | null; location_name: string | null }[] | null;
  candidate_dates?: CandidateDateRow[];
};

type NotificationRow = {
  id: string;
  title: string;
  body: string;
  href: string;
  created_at: string;
};

const homeActions = [
  {
    href: "/events",
    title: "イベント一覧",
    description: "作成したイベントと調整中の日程を確認します。",
    icon: CalendarDays
  },
  {
    href: "/events/new",
    title: "イベント作成",
    description: "まずは名前とカテゴリだけ決めて始めます。",
    icon: CalendarPlus
  },
  {
    href: "/plans",
    title: "調整カレンダー",
    description: "候補日時の重なりを月表示で見ます。",
    icon: ListChecks
  },
  {
    href: "/settings",
    title: "設定",
    description: "Google Calendar連携やアカウントを確認します。",
    icon: Settings
  }
];

const homeStatusLabels: Record<string, string> = {
  draft: "下書き",
  collecting_answers: "回答受付中",
  date_confirmed: "日程確定",
  ticket_purchased: "チケット購入済み",
  settling: "清算中",
  settled: "清算済み",
  participated: "参加済み",
  cancelled: "中止",
  skipped: "見送り"
};

function parseMonth(value: string | undefined) {
  const match = /^(\d{4})-(\d{2})$/.exec(value ?? "");
  const today = new Date();

  if (!match) {
    return { year: today.getFullYear(), month: today.getMonth() + 1 };
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) {
    return { year: today.getFullYear(), month: today.getMonth() + 1 };
  }

  return { year, month };
}

function monthParam(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function toDateKey(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function defaultSelectedDate(year: number, month: number) {
  const today = new Date();
  if (today.getFullYear() === year && today.getMonth() + 1 === month) {
    return toDateKey(today);
  }

  return `${monthParam(year, month)}-01`;
}

function normalizeSelectedDate(value: string | undefined, year: number, month: number) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value ?? "")) {
    return value as string;
  }

  return defaultSelectedDate(year, month);
}

function eventOf(plan: PlanRow) {
  return Array.isArray(plan.events) ? plan.events[0] : plan.events;
}

function toCalendarItems(plans: PlanRow[]): HomeCalendarItem[] {
  return plans.flatMap((plan) => {
    const event = eventOf(plan);
    const eventTitle = event?.title?.trim() || "イベント未設定";
    const subtitle = plan.title?.trim() || "日程調整";
    const location = event?.location_name?.trim() || null;

    if (plan.status === "date_confirmed" && plan.confirmed_start_at) {
      const item: HomeCalendarItem = {
        id: `confirmed-${plan.id}`,
        kind: "confirmed",
        title: eventTitle,
        subtitle,
        location,
        startAt: plan.confirmed_start_at,
        endAt: plan.confirmed_end_at,
        isAllDay: plan.is_all_day,
        href: `/plans/${plan.id}`
      };

      return [item];
    }

    return (plan.candidate_dates ?? []).map<HomeCalendarItem>((candidate) => ({
      id: `candidate-${candidate.id}`,
      kind: "collecting",
      title: eventTitle,
      subtitle,
      location,
      startAt: candidate.start_at,
      endAt: candidate.end_at,
      isAllDay: candidate.is_all_day,
      href: `/plans/${plan.id}`
    }));
  });
}

export default async function HomePage({
  searchParams
}: {
  searchParams?: Promise<{ month?: string; date?: string }>;
}) {
  const query = (await searchParams) ?? {};
  const { year, month } = parseMonth(query.month);
  const currentMonth = monthParam(year, month);
  const selectedDateKey = normalizeSelectedDate(query.date, year, month);

  if (!hasSupabaseEnv()) {
    return (
      <div className="space-y-6">
        <PageHeader title="ホーム" description="日程調整中の予定や、確定した予定をまとめて確認します。" />
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
        <PageHeader title="ホーム" description="共有リンクの回答以外は、ログインして使います。" />
        <LoginPanel />
      </div>
    );
  }

  const { data: plans } = await supabase
    .from("plans")
    .select(
      "id, title, status, settlement_status, confirmed_start_at, confirmed_end_at, is_all_day, answer_deadline_at, events(title, location_name), candidate_dates(id, start_at, end_at, is_all_day)"
    )
    .eq("owner_user_id", user.id)
    .in("status", ["draft", "collecting_answers", "date_confirmed"])
    .order("created_at", { ascending: false })
    .limit(30);

  const { data: notifications } = await supabase
    .from("notifications")
    .select("id, title, body, href, created_at")
    .eq("user_id", user.id)
    .is("read_at", null)
    .order("created_at", { ascending: false })
    .limit(3);

  const planRows = (plans ?? []) as PlanRow[];
  const unreadNotifications = (notifications ?? []) as NotificationRow[];
  const collecting = planRows.filter((plan) => plan.status === "collecting_answers");
  const confirmed = planRows.filter((plan) => plan.status === "date_confirmed");
  const calendarItems = toCalendarItems(planRows);

  return (
    <div className="space-y-7">
      <PageHeader
        title="ホーム"
        description="調整中の日程、確定済みの予定、Google Calendarの予定を月で見ます。"
        action={
          <ButtonLink href="/events/new">
            <CalendarPlus aria-hidden="true" className="mr-2 h-4 w-4" />
            イベント作成
          </ButtonLink>
        }
      />

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="よく使う操作">
        {homeActions.map((action) => (
          <Link
            key={action.href}
            href={action.href}
            className="group rounded-lg border border-white/80 bg-cream/86 p-4 shadow-soft transition-colors hover:border-moss/45 hover:bg-white/76 focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2"
          >
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-mist/55 text-pine transition-colors group-hover:bg-skywash">
              <action.icon aria-hidden="true" className="h-4 w-4" />
            </span>
            <span className="mt-3 block text-base font-bold text-ink">{action.title}</span>
            <span className="mt-1 block text-sm leading-6 text-ink/60">{action.description}</span>
          </Link>
        ))}
      </section>

      {unreadNotifications.length > 0 ? (
        <Card>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="flex items-center gap-2 text-lg font-semibold text-ink">
                <Bell aria-hidden="true" className="h-5 w-5 text-pine" />
                対応が必要なこと
              </h2>
              <p className="mt-1 text-sm leading-6 text-ink/60">期限や清算まわりで、見ておきたいものがあります。</p>
            </div>
            <SecondaryLink href="/notifications">通知を開く</SecondaryLink>
          </div>
          <div className="mt-4 grid gap-3">
            {unreadNotifications.map((notification) => (
              <Link
                key={notification.id}
                href={safeInternalHref(notification.href)}
                className="rounded-lg border border-ink/8 bg-white/62 p-3 transition-colors hover:border-moss/45 focus:outline-none focus:ring-2 focus:ring-clay"
              >
                <span className="block text-sm font-bold text-ink">{notification.title}</span>
                <span className="mt-1 block text-sm leading-6 text-ink/62">{notification.body}</span>
              </Link>
            ))}
          </div>
        </Card>
      ) : null}

      <HomeMonthCalendar month={currentMonth} selectedDateKey={selectedDateKey} initialItems={calendarItems} />

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <h2 className="text-lg font-semibold text-ink">回答受付中</h2>
          <div className="mt-4 space-y-3">
            {collecting.length > 0 ? (
              collecting.slice(0, 5).map((plan) => {
                const event = eventOf(plan);
                return (
                  <SecondaryLink key={plan.id} href={`/plans/${plan.id}`}>
                    {(event?.title ?? "イベント未設定") + " / " + (plan.title ?? "日程調整")}
                  </SecondaryLink>
                );
              })
            ) : (
              <EmptyState>回答受付中の予定はありません。</EmptyState>
            )}
          </div>
        </Card>

        <Card>
          <h2 className="text-lg font-semibold text-ink">確定済み</h2>
          <div className="mt-4 space-y-3">
            {confirmed.length > 0 ? (
              confirmed.slice(0, 5).map((plan) => {
                const event = eventOf(plan);
                const settlementStatus = getSettlementStatusView(plan.settlement_status);
                return (
                  <Link
                    key={plan.id}
                    href={`/plans/${plan.id}`}
                    className="block rounded-lg border border-ink/8 bg-white/62 p-3 transition-colors hover:border-moss/45 focus:outline-none focus:ring-2 focus:ring-clay"
                  >
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-ink">{event?.title ?? "イベント未設定"}</span>
                      <SettlementStatusBadge label={settlementStatus.label} tone={settlementStatus.tone} />
                    </span>
                    <span className="mt-1 block text-sm text-ink/60">{formatDateTimeRange(plan.confirmed_start_at, plan.confirmed_end_at, Boolean(plan.is_all_day))}</span>
                  </Link>
                );
              })
            ) : (
              <EmptyState>確定済みの予定はありません。</EmptyState>
            )}
          </div>
        </Card>
      </div>

      <Card>
        <h2 className="text-lg font-semibold text-ink">最近の予定</h2>
        <div className="mt-4 grid gap-3">
          {planRows.length > 0 ? (
            planRows.slice(0, 8).map((plan) => {
              const settlementStatus = getSettlementStatusView(plan.settlement_status);
              return (
                <Link
                  key={plan.id}
                  href={`/plans/${plan.id}`}
                  className="rounded-lg border border-ink/8 bg-white/62 p-3 transition-colors hover:border-moss/45 focus:outline-none focus:ring-2 focus:ring-clay"
                >
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-ink">{plan.title ?? "日程調整"}</span>
                    <span className="rounded-full bg-white/78 px-3 py-1 text-xs font-bold text-ink/62">
                      {homeStatusLabels[plan.status] ?? plan.status}
                    </span>
                    {plan.status === "date_confirmed" ? <SettlementStatusBadge label={settlementStatus.label} tone={settlementStatus.tone} /> : null}
                  </span>
                </Link>
              );
            })
          ) : (
            <EmptyState>まだ予定がありません。</EmptyState>
          )}
        </div>
      </Card>
    </div>
  );
}

function safeInternalHref(value: string) {
  return value.startsWith("/") ? value : "/";
}

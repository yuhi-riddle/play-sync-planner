import Link from "next/link";
import { Bell, CalendarDays, CalendarPlus, ListChecks, Settings } from "lucide-react";

import { HomeSelectedDateAgenda } from "@/components/home-selected-date-agenda";
import { ButtonLink, Card, EmptyState, PageHeader, SecondaryLink } from "@/components/ui";
import { LoginPanel, SetupPanel } from "@/components/state-panels";
import { discardEventDraftAction } from "@/lib/actions/events";
import type { HomeCalendarItem } from "@/lib/domain/home-calendar";
import {
  countNotificationsByActionFilter,
  filterNotificationsByActionFilter,
  type NotificationActionFilter
} from "@/lib/domain/site-notifications";
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
  kind: string;
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
    title: "日程調整カレンダー",
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

const actionFilterOptions: Array<{ value: NotificationActionFilter; label: string }> = [
  { value: "all", label: "すべて" },
  { value: "deadline", label: "期限" },
  { value: "unanswered", label: "未回答" },
  { value: "settlement", label: "清算" },
  { value: "payment", label: "支払い" },
  { value: "confirmation", label: "受け取り確認" }
];

function toDateKey(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function normalizeBaseDate(value: string | undefined) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value ?? "")) {
    return value as string;
  }

  return toDateKey(new Date());
}

function normalizeActionFilter(value: string | undefined): NotificationActionFilter {
  return actionFilterOptions.some((option) => option.value === value) ? (value as NotificationActionFilter) : "all";
}

function homeFilterHref(date: string, filter: NotificationActionFilter) {
  const params = new URLSearchParams({ date });
  if (filter !== "all") {
    params.set("action", filter);
  }

  return `/?${params.toString()}`;
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
  searchParams?: Promise<{ date?: string; action?: string }>;
}) {
  const query = (await searchParams) ?? {};
  const baseDateKey = normalizeBaseDate(query.date);
  const activeActionFilter = normalizeActionFilter(query.action);

  if (!hasSupabaseEnv()) {
    return (
      <div className="space-y-6">
        <PageHeader title="ホーム" description="日程調整中のイベントや、日程が確定したイベントをまとめて確認します。" />
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
    .select("id, kind, title, body, href, created_at")
    .eq("user_id", user.id)
    .is("read_at", null)
    .order("created_at", { ascending: false })
    .limit(80);

  const { data: eventDraft } = await supabase.from("event_drafts").select("id, payload, updated_at").eq("owner_user_id", user.id).maybeSingle();

  const planRows = (plans ?? []) as PlanRow[];
  const unreadNotifications = (notifications ?? []) as NotificationRow[];
  const notificationCounts = countNotificationsByActionFilter(unreadNotifications);
  const filteredNotifications = filterNotificationsByActionFilter(unreadNotifications, activeActionFilter).slice(0, 5);
  const calendarItems = toCalendarItems(planRows);

  return (
    <div className="space-y-7">
      <PageHeader
        title="ホーム"
        description="選んだ日の予定と、対応が必要なことだけを確認します。"
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

      <Card>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold text-ink">
              <Bell aria-hidden="true" className="h-5 w-5 text-pine" />
              対応が必要なこと
            </h2>
            <p className="mt-1 text-sm leading-6 text-ink/60">期限、未回答、清算まわりを絞り込んで確認できます。</p>
          </div>
          <SecondaryLink href="/notifications">通知を開く</SecondaryLink>
        </div>

        <nav className="mt-4 flex flex-wrap gap-2" aria-label="対応が必要なことの絞り込み">
          {actionFilterOptions.map((option) => (
            <Link
              key={option.value}
              href={homeFilterHref(baseDateKey, option.value)}
              scroll={false}
              aria-current={activeActionFilter === option.value ? "page" : undefined}
              className={
                activeActionFilter === option.value
                  ? "inline-flex min-h-11 items-center justify-center rounded-full bg-ink px-4 py-2 text-sm font-bold text-white shadow-soft focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2"
                  : "inline-flex min-h-11 items-center justify-center rounded-full border border-ink/10 bg-white/78 px-4 py-2 text-sm font-bold text-ink/68 transition-colors hover:border-moss hover:text-pine focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2"
              }
            >
              {option.label} {notificationCounts[option.value]}
            </Link>
          ))}
        </nav>

        <div className="mt-4 grid gap-3">
          {eventDraft ? (
            <div className="rounded-lg border border-moss/24 bg-mist/24 p-4">
              <span className="block text-sm font-bold text-ink">イベント作成の下書き</span>
              <span className="mt-1 block text-sm leading-6 text-ink/62">入力途中のイベントがあります。続きから作成できます。</span>
              <div className="mt-3 flex flex-wrap gap-2">
                <ButtonLink href="/events/new">続きから入力</ButtonLink>
                <form action={discardEventDraftAction}>
                  <button type="submit" className="inline-flex min-h-11 items-center justify-center rounded-full border border-ink/10 bg-white/82 px-4 py-2 text-sm font-bold text-ink focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2">
                    下書きを破棄
                  </button>
                </form>
              </div>
            </div>
          ) : null}
          {filteredNotifications.length > 0 ? (
            filteredNotifications.map((notification) => (
              <Link
                key={notification.id}
                href={safeInternalHref(notification.href)}
                className="rounded-lg border border-ink/8 bg-white/62 p-3 transition-colors hover:border-moss/45 focus:outline-none focus:ring-2 focus:ring-clay"
              >
                <span className="block text-sm font-bold text-ink">{notification.title}</span>
                <span className="mt-1 block text-sm leading-6 text-ink/62">{notification.body}</span>
              </Link>
            ))
          ) : (
            <EmptyState>この条件で対応が必要なものはありません。</EmptyState>
          )}
        </div>
      </Card>

      <HomeSelectedDateAgenda selectedDateKey={baseDateKey} initialItems={calendarItems} />
    </div>
  );
}

function safeInternalHref(value: string) {
  return value.startsWith("/") ? value : "/";
}

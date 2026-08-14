import Link from "next/link";
import { Bell, CalendarPlus, Check } from "lucide-react";
import { clsx } from "clsx";

import { HomeNextConfirmedEventCard } from "@/components/home/home-next-confirmed-event-card";
import { HomeSelectedDateAgenda } from "@/components/home/home-selected-date-agenda";
import { WelcomeHero } from "@/components/home/welcome-hero";
import {
  Badge,
  ButtonLink,
  Card,
  EmptyState,
  PageHeader,
  SecondaryLink,
  SectionHeading,
  type BadgeTone
} from "@/components/ui";
import { SetupPanel } from "@/components/ui/state-panels";
import { discardEventDraftAction } from "@/lib/actions/event/events";
import { getEventDraftResumePath } from "@/lib/domain/event/event-flow";
import { findNextConfirmedItem, type HomeCalendarItem } from "@/lib/domain/home/home-calendar";
import {
  countNotificationsByActionFilter,
  filterNotificationsByActionFilter,
  resolveNotificationActionFilter,
  type NotificationActionFilter
} from "@/lib/domain/shared/site-notifications";
import { createSupabaseServerClient, getCurrentUser, hasSupabaseEnv } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type CalendarRpcRow = {
  candidate_id: string | null;
  plan_id: string;
  event_title: string | null;
  plan_title: string | null;
  location_name: string | null;
  start_at: string;
  end_at: string | null;
  is_all_day: boolean | null;
  status: string;
};

type NotificationRow = {
  id: string;
  kind: string;
  title: string;
  body: string;
  href: string;
  created_at: string;
};

const actionFilterOptions: Array<{ value: NotificationActionFilter; label: string }> = [
  { value: "all", label: "すべて" },
  { value: "deadline", label: "期限" },
  { value: "unanswered", label: "未回答" },
  { value: "settlement", label: "清算" },
  { value: "payment", label: "支払い" },
  { value: "confirmation", label: "受け取り確認" }
];

function tokyoDateKey(value: Date) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((entry) => entry.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function normalizeBaseDate(value: string | undefined, fallback: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value ?? "")) {
    const parsed = new Date(`${value}T00:00:00Z`);
    if (!Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value) {
      return value as string;
    }
  }

  return fallback;
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

function toCalendarItems(rows: CalendarRpcRow[]): HomeCalendarItem[] {
  return rows.map((row) => {
    const isConfirmed = row.status === "date_confirmed";

    return {
      id: isConfirmed ? `confirmed-${row.plan_id}` : `candidate-${row.candidate_id}`,
      kind: isConfirmed ? "confirmed" : "collecting",
      title: row.event_title?.trim() || "イベント未設定",
      subtitle: row.plan_title?.trim() || "日程調整",
      location: row.location_name?.trim() || null,
      startAt: row.start_at,
      endAt: row.end_at,
      isAllDay: row.is_all_day,
      href: `/plans/${row.plan_id}`
    };
  });
}

export default async function HomePage({
  searchParams
}: {
  searchParams?: Promise<{ date?: string; action?: string }>;
}) {
  const query = (await searchParams) ?? {};
  const todayDateKey = tokyoDateKey(new Date());
  const baseDateKey = normalizeBaseDate(query.date, todayDateKey);
  const requestedActionFilter = normalizeActionFilter(query.action);

  if (!hasSupabaseEnv()) {
    return (
      <div className="space-y-6">
        <PageHeader title="ホーム" description="日程調整中のイベントや、日程が確定したイベントをまとめて確認します。" />
        <SetupPanel />
      </div>
    );
  }

  const supabase = await createSupabaseServerClient();
  const user = await getCurrentUser();

  /*
   * 未ログインで最初に見る画面。以前は「共有リンクの回答以外はログインして使います」と
   * 出していたが、共有リンクもログインが要るようになったので、その但し書きは嘘になった。
   */
  if (!user) {
    return <WelcomeHero />;
  }

  // list_calendar_items は表示月＋前後バッファ分だけを返す（migration 034参照）。
  // 自分がオーナーのplanだけでなく、参加済み(joined)のイベントのplan全体が対象になる。
  const calendarPromise = supabase.rpc("list_calendar_items", { p_month: `${baseDateKey.slice(0, 7)}-01` });

  const notificationsPromise = supabase
    .from("notifications")
    .select("id, kind, title, body, href, created_at")
    .eq("user_id", user.id)
    .is("read_at", null)
    .order("created_at", { ascending: false })
    .limit(80);

  const eventDraftPromise = supabase
    .from("event_drafts")
    .select("id, payload, updated_at")
    .eq("owner_user_id", user.id)
    .maybeSingle();
  const profilePromise = supabase
    .from("profiles")
    .select("nickname")
    .eq("user_id", user.id)
    .maybeSingle();
  const [{ data: calendarRows, error: calendarError }, { data: notifications }, { data: eventDraft }, { data: profile }] =
    await Promise.all([calendarPromise, notificationsPromise, eventDraftPromise, profilePromise]);

  if (calendarError) {
    throw new Error("カレンダーを読み込めませんでした。");
  }

  const unreadNotifications = (notifications ?? []) as NotificationRow[];
  const notificationCounts = countNotificationsByActionFilter(unreadNotifications);
  const activeActionFilter = resolveNotificationActionFilter(requestedActionFilter, notificationCounts);
  const filteredNotifications = filterNotificationsByActionFilter(unreadNotifications, activeActionFilter).slice(0, 5);
  const calendarItems = toCalendarItems((calendarRows ?? []) as CalendarRpcRow[]);
  const nextConfirmedItem = findNextConfirmedItem(calendarItems, new Date());

  const actionCount = notificationCounts.all;

  // 0件のチップを並べても情報量がなく、空っぽ感を増幅するだけなので出さない
  const visibleFilterOptions = actionCount > 0 ? actionFilterOptions.filter((option) => notificationCounts[option.value] > 0) : [];

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Home"
        title="ホーム"
        description={
          actionCount > 0
            ? greetingTitle(profile?.nickname, user.email) + " いま手が必要なのは" + actionCount + "件です。"
            : greetingTitle(profile?.nickname, user.email) + " 対応が必要なことはありません。今日の予定を確認しましょう。"
        }
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

      <Card>
        <SectionHeading
          title="対応が必要なこと"
          description={actionCount > 0 ? "新しいものから並べています。" : undefined}
          icon={<Bell aria-hidden="true" className="h-5 w-5 text-moss" />}
          action={<SecondaryLink href="/notifications">通知を開く</SecondaryLink>}
        />

        {visibleFilterOptions.length > 0 ? (
          <nav className="mt-4 flex flex-wrap gap-2" aria-label="対応が必要なことの絞り込み">
            {visibleFilterOptions.map((option) => (
              <Link
                key={option.value}
                href={homeFilterHref(baseDateKey, option.value)}
                scroll={false}
                aria-current={activeActionFilter === option.value ? "page" : undefined}
                className={clsx(
                  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full px-4 py-2 text-body font-bold transition-colors focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2",
                  activeActionFilter === option.value
                    ? "bg-ink text-white shadow-soft"
                    : "border border-line-strong bg-surface text-muted hover:border-moss hover:text-pine"
                )}
              >
                {option.label}
                <span className="tabular-nums">{notificationCounts[option.value]}</span>
              </Link>
            ))}
          </nav>
        ) : null}

        <div className="mt-4 grid gap-3">
          {eventDraft ? (
            <div className="rounded-control border border-moss/24 bg-mist p-4">
              <span className="block text-body font-bold text-ink">イベント作成の下書き</span>
              <span className="mt-1 block text-body text-muted">入力途中のイベントがあります。続きから作成できます。</span>
              <div className="mt-3 flex flex-wrap gap-2">
                <ButtonLink href={getEventDraftResumePath()}>続きから入力</ButtonLink>
                <form action={discardEventDraftAction}>
                  <button
                    type="submit"
                    className="inline-flex min-h-11 items-center justify-center rounded-full border border-line-strong bg-surface px-4 py-2 text-body font-bold text-ink transition-colors hover:border-moss hover:text-pine focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2"
                  >
                    下書きを破棄
                  </button>
                </form>
              </div>
            </div>
          ) : null}
          {filteredNotifications.length > 0 ? (
            filteredNotifications.map((notification) => {
              const badge = notificationBadge(notification.kind);

              return (
                <Link
                  key={notification.id}
                  href={safeInternalHref(notification.href)}
                  className="rounded-control border border-line bg-sunken p-3 transition-colors hover:border-moss focus:outline-none focus:ring-2 focus:ring-clay"
                >
                  <span className="flex flex-wrap items-center gap-2">
                    {badge ? <Badge tone={badge.tone} dot>{badge.label}</Badge> : null}
                    <span className="text-body font-bold text-ink">{notification.title}</span>
                  </span>
                  <span className="mt-1 block text-body text-muted">{notification.body}</span>
                </Link>
              );
            })
          ) : (
            <EmptyState icon={<Check aria-hidden="true" className="h-4 w-4" />}>
              いま対応が必要なものはありません。
            </EmptyState>
          )}
        </div>
      </Card>

      {nextConfirmedItem ? <HomeNextConfirmedEventCard item={nextConfirmedItem} /> : null}

      <HomeSelectedDateAgenda selectedDateKey={baseDateKey} todayDateKey={todayDateKey} initialItems={calendarItems} />
    </div>
  );
}

function greetingTitle(nickname: string | null | undefined, email: string | undefined) {
  const name = nickname?.trim() || email?.split("@")[0]?.trim();
  return name ? `こんにちは、${name} さん` : "ホーム";
}

function notificationBadge(kind: string): { label: string; tone: BadgeTone } | null {
  switch (kind) {
    case "answer_deadline":
      return { label: "期限", tone: "warn" };
    case "unanswered":
      return { label: "未回答", tone: "info" };
    case "answer_received":
      return { label: "回答あり", tone: "accent" };
    case "settlement_needed":
      return { label: "清算", tone: "info" };
    case "payment_due":
      return { label: "支払い", tone: "warn" };
    case "confirmation_due":
      return { label: "受け取り確認", tone: "warn" };
    default:
      return null;
  }
}

function safeInternalHref(value: string) {
  return value.startsWith("/") ? value : "/";
}

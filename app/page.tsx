import { HomeCreateEventCta } from "@/components/home/home-create-event-cta";
import { HomeDraftResumeCard } from "@/components/home/home-draft-resume-card";
import { HomeNextConfirmedEventCard } from "@/components/home/home-next-confirmed-event-card";
import { HomePriorityNotificationCard } from "@/components/home/home-priority-notification-card";
import { HomeSelectedDateAgenda } from "@/components/home/home-selected-date-agenda";
import { WelcomeHero } from "@/components/home/welcome-hero";
import { PageHeader } from "@/components/ui";
import { SetupPanel } from "@/components/ui/state-panels";
import { discardEventDraftAction } from "@/lib/actions/event/events";
import { getEventDraftResumePath } from "@/lib/domain/event/event-flow";
import { findNextConfirmedItem, type HomeCalendarItem } from "@/lib/domain/home/home-calendar";
import { filterNotificationsByActionFilter, selectPriorityNotification } from "@/lib/domain/shared/site-notifications";
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
  searchParams?: Promise<{ date?: string }>;
}) {
  const query = (await searchParams) ?? {};
  const todayDateKey = tokyoDateKey(new Date());
  const baseDateKey = normalizeBaseDate(query.date, todayDateKey);

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
  const actionableNotifications = filterNotificationsByActionFilter(unreadNotifications, "all");
  const priorityNotification = selectPriorityNotification(actionableNotifications);
  const calendarItems = toCalendarItems((calendarRows ?? []) as CalendarRpcRow[]);
  const nextConfirmedItem = findNextConfirmedItem(calendarItems, new Date());

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-display text-ink">{greetingTitle(profile?.nickname, user.email)}</h1>
        <p className="mt-2 text-body text-muted">予定の共有も、やりとりも、Madoiひとつで、もっとかんたんに。</p>
      </div>

      <HomeCreateEventCta />

      {eventDraft ? (
        <HomeDraftResumeCard resumeHref={getEventDraftResumePath()} onDiscard={discardEventDraftAction} />
      ) : null}

      <HomePriorityNotificationCard
        count={actionableNotifications.length}
        title={priorityNotification?.title ?? ""}
        href="/notifications"
      />

      {nextConfirmedItem ? <HomeNextConfirmedEventCard item={nextConfirmedItem} /> : null}

      <HomeSelectedDateAgenda selectedDateKey={baseDateKey} todayDateKey={todayDateKey} initialItems={calendarItems} />
    </div>
  );
}

function greetingTitle(nickname: string | null | undefined, email: string | undefined) {
  const name = nickname?.trim() || email?.split("@")[0]?.trim();
  return name ? `こんにちは、${name} さん` : "ホーム";
}

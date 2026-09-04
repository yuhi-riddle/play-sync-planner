import { HomeCreateEventCta } from "@/components/home/home-create-event-cta";
import { HomeDraftResumeCard } from "@/components/home/home-draft-resume-card";
import { HomeNextUpcomingEventCard } from "@/components/home/home-next-upcoming-event-card";
import { HomePriorityNotificationCard } from "@/components/home/home-priority-notification-card";
import { HomeSelectedDateAgenda } from "@/components/home/home-selected-date-agenda";
import { WelcomeHero } from "@/components/home/welcome-hero";
import { PageHeader } from "@/components/ui";
import { SetupPanel } from "@/components/ui/state-panels";
import { discardEventDraftAction } from "@/lib/actions/event/events";
import { getEventDraftResumePath } from "@/lib/domain/event/event-flow";
import type { HomeCalendarItem } from "@/lib/domain/home/home-calendar";
import { jstStartOfToday, pickNextUpcoming } from "@/lib/domain/home/next-upcoming";
import { filterNotificationsByActionFilter, selectPriorityNotification } from "@/lib/domain/shared/site-notifications";
import {
  createSupabaseAdminClient,
  createSupabaseServerClient,
  getCurrentUser,
  hasSupabaseAdminEnv,
  hasSupabaseEnv
} from "@/lib/supabase/server";

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

type EventRef = { title: string | null; location_name: string | null };

type NextConfirmedRow = {
  id: string;
  title: string | null;
  is_all_day: boolean | null;
  confirmed_start_at: string | null;
  confirmed_end_at: string | null;
  events: EventRef | EventRef[] | null;
};

type NextCandidateRow = {
  id: string;
  start_at: string;
  end_at: string | null;
  is_all_day: boolean | null;
  plans: { id: string; title: string | null; events: EventRef | EventRef[] | null } | null;
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

function eventOf(events: EventRef | EventRef[] | null): EventRef | null {
  return Array.isArray(events) ? (events[0] ?? null) : events;
}

/**
 * ホームの「次の予定」用の1件。
 * list_calendar_items は当月＋翌週までしか返さないので、数ヶ月先の予定も拾えるよう
 * plans / candidate_dates を直接引く（app/plans/page.tsx と同じ admin client の作法）。
 */
function buildNextUpcomingItem(
  confirmedRows: NextConfirmedRow[],
  candidateRows: NextCandidateRow[],
  now: Date
): HomeCalendarItem | null {
  const items: HomeCalendarItem[] = [];

  const confirmed = confirmedRows[0];
  if (confirmed?.confirmed_start_at) {
    const event = eventOf(confirmed.events);
    items.push({
      id: `confirmed-${confirmed.id}`,
      kind: "confirmed",
      title: event?.title?.trim() || "イベント未設定",
      location: event?.location_name?.trim() || null,
      startAt: confirmed.confirmed_start_at,
      endAt: confirmed.confirmed_end_at,
      isAllDay: confirmed.is_all_day,
      href: `/plans/${confirmed.id}`
    });
  }

  const candidate = candidateRows[0];
  if (candidate?.plans) {
    const event = eventOf(candidate.plans.events);
    items.push({
      id: `candidate-${candidate.id}`,
      kind: "collecting",
      title: event?.title?.trim() || "イベント未設定",
      location: event?.location_name?.trim() || null,
      startAt: candidate.start_at,
      endAt: candidate.end_at,
      isAllDay: candidate.is_all_day,
      href: `/plans/${candidate.plans.id}`
    });
  }

  return pickNextUpcoming(items, now);
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

  // 「次の予定」は list_calendar_items の窓の外も見たいので plans を直接引く。
  const { data: memberships } = await supabase
    .from("event_members")
    .select("event_id")
    .eq("user_id", user.id)
    .eq("status", "joined");
  const joinedEventIds = [...new Set((memberships ?? []).map((row) => row.event_id))];
  const nextUpcomingClient = hasSupabaseAdminEnv() ? createSupabaseAdminClient() : supabase;
  const now = new Date();
  // 下限は現在時刻ではなく JST の当日 0 時。現在時刻にすると、当日 00:00 開始の終日予定などが
  // pickNextUpcoming（同じく JST 当日 0 時が下限）に渡る前にクエリで落ちてしまう。
  const upcomingSinceIso = jstStartOfToday(now).toISOString();

  const nextConfirmedPromise = joinedEventIds.length
    ? nextUpcomingClient
        .from("plans")
        .select("id, title, is_all_day, confirmed_start_at, confirmed_end_at, events(title, location_name)")
        .in("event_id", joinedEventIds)
        .eq("status", "date_confirmed")
        .gte("confirmed_start_at", upcomingSinceIso)
        .order("confirmed_start_at", { ascending: true })
        .limit(1)
    : Promise.resolve({ data: [] as NextConfirmedRow[] });

  const nextCandidatePromise = joinedEventIds.length
    ? nextUpcomingClient
        .from("candidate_dates")
        .select("id, start_at, end_at, is_all_day, plans!inner(id, title, event_id, status, events(title, location_name))")
        .in("plans.event_id", joinedEventIds)
        .in("plans.status", ["draft", "collecting_answers"])
        .gte("start_at", upcomingSinceIso)
        .order("start_at", { ascending: true })
        .limit(1)
    : Promise.resolve({ data: [] as NextCandidateRow[] });

  const [
    { data: calendarRows, error: calendarError },
    { data: notifications },
    { data: eventDraft },
    { data: profile },
    { data: nextConfirmedRows },
    { data: nextCandidateRows }
  ] = await Promise.all([
    calendarPromise,
    notificationsPromise,
    eventDraftPromise,
    profilePromise,
    nextConfirmedPromise,
    nextCandidatePromise
  ]);

  if (calendarError) {
    throw new Error("カレンダーを読み込めませんでした。");
  }

  const unreadNotifications = (notifications ?? []) as NotificationRow[];
  const actionableNotifications = filterNotificationsByActionFilter(unreadNotifications, "all");
  const priorityNotification = selectPriorityNotification(actionableNotifications);
  const calendarItems = toCalendarItems((calendarRows ?? []) as CalendarRpcRow[]);
  const nextUpcomingItem = buildNextUpcomingItem(
    (nextConfirmedRows ?? []) as NextConfirmedRow[],
    (nextCandidateRows ?? []) as unknown as NextCandidateRow[],
    now
  );

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

      {nextUpcomingItem ? <HomeNextUpcomingEventCard item={nextUpcomingItem} /> : null}

      <HomeSelectedDateAgenda selectedDateKey={baseDateKey} todayDateKey={todayDateKey} initialItems={calendarItems} />
    </div>
  );
}

function greetingTitle(nickname: string | null | undefined, email: string | undefined) {
  const name = nickname?.trim() || email?.split("@")[0]?.trim();
  return name ? `こんにちは、${name} さん` : "ホーム";
}

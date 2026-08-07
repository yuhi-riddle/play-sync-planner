import { headers } from "next/headers";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { clsx } from "clsx";

import { CalendarShareLink } from "@/components/calendar-share-link";
import { ReminderMessageCard } from "@/components/reminder-message-card";
import { SettlementStatusBadge } from "@/components/settlement-status-badge";
import { ShareLinkCard } from "@/components/share-link-card";
import {
  Badge,
  ButtonLink,
  Card,
  EmptyState,
  PageHeader,
  Progress,
  SecondaryLink,
  SectionHeading,
  Stat,
  type BadgeTone
} from "@/components/ui";
import { createGoogleCalendarEventForPlanAction } from "@/lib/actions/calendar";
import { extendPlanAnswerDeadlineAction, restartPlanAdjustmentAction } from "@/lib/actions/plans";
import { markReminderSentAction } from "@/lib/actions/reminders";
import { reissueShareLinkAction, revokeShareLinkAction } from "@/lib/actions/share-links";
import { planStatusLabels } from "@/lib/constants";
import {
  summarizeCandidateAnswers,
  summarizeParticipantProgress,
  type CandidateAnswerSummary
} from "@/lib/domain/confirmation";
import { buildGoogleCalendarShareUrl } from "@/lib/domain/calendar-sync";
import { ANSWER_DEADLINE_EXTENSION_DAYS, extendedAnswerDeadline } from "@/lib/domain/answer-deadline";
import { buildProgressSummaryLine } from "@/lib/domain/plans";
import { summarizeReminderLogs } from "@/lib/domain/reminder-log";
import { buildReminderMessage, pendingParticipants } from "@/lib/domain/reminder-message";
import { getSettlementStatusView } from "@/lib/domain/settlement";
import { formatDateTime, formatDateTimeRange } from "@/lib/format";
import { createSupabaseServerClient, getCurrentUserId } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type AnswerRow = {
  answer: "yes" | "maybe" | "no" | "unanswered";
};

type CandidateDateRow = {
  id: string;
  start_at: string;
  end_at: string | null;
  is_all_day?: boolean | null;
  availability_answers: AnswerRow[];
};

type ParticipantRow = {
  id: string;
  display_name: string;
  status: string;
};

type ReminderSettingRow = {
  reminder_offset_minutes: number | null;
  reminder_offsets_minutes?: number[] | null;
};

type ReminderLogRow = {
  sent_at: string;
};

const participantStatusLabels: Record<string, string> = {
  invited: "未回答",
  answered: "回答済み",
  confirmed: "参加確定",
  declined: "不参加",
  waitlisted: "保留",
  cancelled: "キャンセル"
};

const participantStatusTones: Record<string, BadgeTone> = {
  invited: "warn",
  answered: "accent",
  confirmed: "done",
  declined: "neutral",
  waitlisted: "info",
  cancelled: "neutral"
};

type DeadlineState = "none" | "open" | "soon" | "closed";

/**
 * 期限が過ぎたあとも警告色のままだと、直しようのない警告を出し続けることになる。
 * 超過後は neutral に落とし「受付終了」として扱う。
 */
function deadlineStateOf(answerDeadlineAt: string | null | undefined, now: Date): DeadlineState {
  if (!answerDeadlineAt) {
    return "none";
  }

  const remainingMs = new Date(answerDeadlineAt).getTime() - now.getTime();
  if (remainingMs <= 0) {
    return "closed";
  }

  return remainingMs <= 24 * 60 * 60 * 1000 ? "soon" : "open";
}

function reminderOffsetLabel(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return "設定しない";
  }

  if (value % 1440 === 0) {
    return `${value / 1440}日前`;
  }

  if (value % 60 === 0) {
    return `${value / 60}時間前`;
  }

  return `${value}分前`;
}

export default async function PlanDetailPage({
  params,
  searchParams
}: {
  params: Promise<{ planId: string }>;
  searchParams?: Promise<{ calendar?: string }>;
}) {
  const { planId } = await params;
  const currentUserId = await getCurrentUserId();
  const query = (await searchParams) ?? {};
  const supabase = await createSupabaseServerClient();
  const { data: plan } = await supabase
    .from("plans")
    .select(
      "*, events(id, title, location_name), participants(id, display_name, status), candidate_dates(id, start_at, end_at, is_all_day, availability_answers(answer)), share_links(token, expires_at, status), plan_reminder_settings(reminder_offset_minutes, reminder_offsets_minutes), plan_reminder_logs(sent_at)"
    )
    .eq("id", planId)
    .single();

  if (!plan) {
    notFound();
  }

  const requestHeaders = await headers();
  const host = requestHeaders.get("host") ?? "localhost:3000";
  const protocol = host.includes("localhost") ? "http" : "https";
  const shareToken = ((plan.share_links ?? []) as { token: string; status?: string | null }[]).find(
    (link) => (link.status ?? "open") === "open"
  )?.token;
  const shareUrl = shareToken ? `${protocol}://${host}/s/${shareToken}/answer` : null;
  const event = Array.isArray(plan.events) ? plan.events[0] : plan.events;
  const participants = ((plan.participants ?? []) as ParticipantRow[]).sort((a, b) =>
    a.display_name.localeCompare(b.display_name, "ja")
  );
  const participantProgress = summarizeParticipantProgress(participants);
  const pendingParticipantRows = pendingParticipants(participants);
  const pendingNames = pendingParticipantRows.map((participant) => participant.display_name);
  const reminderSetting = (Array.isArray(plan.plan_reminder_settings)
    ? plan.plan_reminder_settings[0]
    : plan.plan_reminder_settings) as ReminderSettingRow | null | undefined;
  const reminderOffsetMinutes = reminderSetting?.reminder_offset_minutes ?? null;
  const reminderOffsetsMinutes = reminderSetting?.reminder_offsets_minutes?.length
    ? reminderSetting.reminder_offsets_minutes
    : reminderOffsetMinutes === null
      ? []
      : [reminderOffsetMinutes];
  const reminderMessage = buildReminderMessage({
    eventTitle: event?.title,
    planTitle: plan.title,
    pendingNames,
    answerDeadlineAt: plan.answer_deadline_at,
    reminderOffsetMinutes,
    reminderOffsetsMinutes,
    shareUrl
  });
  const reminderLogSummary = summarizeReminderLogs((plan.plan_reminder_logs ?? []) as ReminderLogRow[]);
  const markReminderSent = markReminderSentAction.bind(null, plan.id);
  const candidateSummaries = summarizeCandidateAnswers(
    ((plan.candidate_dates ?? []) as CandidateDateRow[]).sort((a, b) => a.start_at.localeCompare(b.start_at)),
    participantProgress.total
  );
  const planStatus = planStatusLabels[plan.status as keyof typeof planStatusLabels] ?? String(plan.status);
  const isConfirmed = plan.status === "date_confirmed";
  const deadlineState = deadlineStateOf(plan.answer_deadline_at, new Date());
  const progressSummaryLine = buildProgressSummaryLine({
    total: participantProgress.total,
    pending: participantProgress.pending,
    deadlineState,
    answerDeadlineAt: plan.answer_deadline_at,
    isConfirmed
  });
  const settlementStatus = getSettlementStatusView(plan.settlement_status);
  const isPlanOwner = currentUserId === plan.owner_user_id;
  const restartPlanAdjustment = restartPlanAdjustmentAction.bind(null, plan.id);
  const extendAnswerDeadline = extendPlanAnswerDeadlineAction.bind(null, plan.id);
  // 期限切れで未確定のときだけ出す。まだ回答を集めている最中は、期限を触る動機がない。
  const canExtendDeadline = isPlanOwner && !isConfirmed && deadlineState === "closed";
  const deadlineExtensionOptions = canExtendDeadline
    ? ANSWER_DEADLINE_EXTENSION_DAYS.map((days) => ({
        days,
        // 押した結果がいつになるかを出す。日数だけだと、いまの期限からなのか
        // 今からなのかが読み手に分からない。
        deadlineAt: extendedAnswerDeadline(plan.answer_deadline_at, days, new Date())
      }))
    : [];
  // 共有リンクの無効化と再発行は主催者だけの操作。
  const revokeShareLink = isPlanOwner ? revokeShareLinkAction.bind(null, plan.id) : undefined;
  const reissueShareLink = isPlanOwner ? reissueShareLinkAction.bind(null, plan.id) : undefined;
  const { data: calendarIntegration } = isConfirmed
    ? await supabase.from("calendar_integrations").select("id").eq("user_id", plan.owner_user_id).eq("provider", "google").maybeSingle()
    : { data: null };
  const createCalendarEventAction = createGoogleCalendarEventForPlanAction.bind(null, plan.id);
  const calendarShareUrl =
    plan.confirmed_start_at && plan.confirmed_end_at
      ? buildGoogleCalendarShareUrl({
          title: [event?.title, plan.title].map((value) => value?.trim()).filter(Boolean).join(" - ") || "Madoiの日程調整",
          location: event?.location_name,
          start: plan.confirmed_start_at,
          end: plan.confirmed_end_at
        })
      : null;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Schedule"
        title={event?.title?.trim() || plan.title || "日程調整"}
        description={event?.title && plan.title ? `${plan.title} の候補日時と回答状況を確認します。` : "候補日時と回答状況を確認します。"}
        action={
          <div className="flex flex-wrap gap-3">
            {!isConfirmed && candidateSummaries.length > 0 ? <ButtonLink href={`/plans/${plan.id}/confirm`}>日程を確定</ButtonLink> : null}
            {isConfirmed ? <SecondaryLink href={`/plans/${plan.id}/timetable`}>当日の進行表へ</SecondaryLink> : null}
            {isConfirmed ? <SecondaryLink href={`/plans/${plan.id}/settlement`}>支払い・清算へ</SecondaryLink> : null}
            {calendarShareUrl ? <CalendarShareLink href={calendarShareUrl} /> : null}
          </div>
        }
      />

      {isConfirmed ? (
        <Card padding="p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-title text-ink">Google カレンダー</h2>
              <p className="mt-1 text-body text-muted">
                主催者の Google カレンダーに予定を作成します。連携済みの参加者がいれば、カレンダー招待も送ります。
              </p>
              {query.calendar === "created" ? <p className="mt-2 text-body font-bold text-pine">Google カレンダーに作成しました。</p> : null}
              {query.calendar === "already-created" ? (
                <p className="mt-2 text-body font-bold text-pine">Google カレンダーには作成済みです。</p>
              ) : null}
            </div>
            {plan.google_calendar_event_id ? (
              <Badge tone="done" dot>
                作成済み
              </Badge>
            ) : calendarIntegration ? (
              <form action={createCalendarEventAction}>
                <button
                  type="submit"
                  className="inline-flex min-h-11 w-full items-center justify-center rounded-full bg-ink px-4 py-2 text-body font-bold text-white shadow-soft transition-colors hover:bg-pine focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2 sm:w-auto"
                >
                  カレンダーに作成して招待
                </button>
              </form>
            ) : (
              <SecondaryLink href="/settings">Google カレンダーを連携</SecondaryLink>
            )}
          </div>
        </Card>
      ) : null}

      {canExtendDeadline ? (
        <Card padding="p-4">
          <h2 className="text-title text-ink">回答の受付が終わっています</h2>
          <p className="mt-2 text-body text-muted">
            {participantProgress.pending > 0
              ? `あと${participantProgress.pending}人が未回答です。期限を延ばすと、配った共有リンクからまた回答してもらえます。`
              : "期限を延ばすと、配った共有リンクからまた回答してもらえます。"}
          </p>
          <form action={extendAnswerDeadline} className="mt-4 grid gap-2">
            {deadlineExtensionOptions.map((option) => (
              <button
                key={option.days}
                type="submit"
                name="days"
                value={String(option.days)}
                className="flex min-h-11 w-full items-center justify-between gap-3 rounded-full border border-line-strong bg-surface px-4 py-2 text-body font-bold text-ink transition-colors hover:border-moss hover:text-pine focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2 sm:w-auto"
              >
                <span>{option.days === 7 ? "1週間" : `${option.days}日`}延ばす</span>
                <span className="text-caption font-normal text-muted">{formatDateTime(option.deadlineAt)}まで</span>
              </button>
            ))}
          </form>
        </Card>
      ) : null}

      {isConfirmed && isPlanOwner ? (
        <Card padding="p-4">
          <details>
            {/* 他の折りたたみと違って ▶ が出ていた。list-none を足して見た目をそろえる。 */}
            <summary className="cursor-pointer list-none text-body font-bold text-ink [&::-webkit-details-marker]:hidden">
              再調整を始める
            </summary>
            <p className="mt-3 text-body text-muted">
              確定済みの予定を回答受付中に戻します。参加者の回答は削除され、もう一度回答を集めます。
            </p>
            <form action={restartPlanAdjustment} className="mt-4">
              <button
                type="submit"
                className="inline-flex min-h-11 items-center justify-center rounded-full bg-clay-ink px-4 py-2 text-body font-bold text-white transition-colors hover:bg-clay focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2"
              >
                再調整を始める
              </button>
            </form>
          </details>
        </Card>
      ) : null}

      {/* この画面の主役は「誰が答えたか」。他の4項目はメタ情報に落として主従をはっきりさせる */}
      <Card>
        <div className="grid gap-6 lg:grid-cols-[minmax(190px,240px)_1fr] lg:items-center">
          <div>
            <Stat
              label="回答状況"
              value={`${participantProgress.responded}/${participantProgress.total}人`}
              emphasis="primary"
            />
            {/* 参加者0人のとき 0% のバーを出すと、壊れて見えるだけで何も伝わらない */}
            {participantProgress.total > 0 ? (
              <div className="mt-3">
                <Progress value={participantProgress.responded} max={participantProgress.total} label="回答状況" />
              </div>
            ) : null}
            <p className="mt-2 text-caption text-muted">{progressSummaryLine}</p>
          </div>

          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-px overflow-hidden rounded-control border border-line bg-line sm:grid-cols-4">
              <MetaCell label="候補" value={`${candidateSummaries.length}件`} />
              <MetaCell
                label="回答期限"
                value={plan.answer_deadline_at ? formatDateTime(plan.answer_deadline_at) : "未設定"}
                tone={deadlineState === "soon" ? "warn" : deadlineState === "closed" ? "muted" : undefined}
              />
              <MetaCell
                label="確定日時"
                value={formatDateTimeRange(plan.confirmed_start_at, plan.confirmed_end_at, Boolean(plan.is_all_day))}
                tone={isConfirmed ? undefined : "muted"}
              />
              <MetaCell label="清算" value={<SettlementStatusBadge label={settlementStatus.label} tone={settlementStatus.tone} />} />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/*
                期限切れなのに「回答受付中」を並べると矛盾して見える。
                締め切り済みのときは受付終了だけを出し、ステータスバッジは重ねない。
              */}
              {deadlineState === "closed" && !isConfirmed ? (
                <Badge tone="neutral">受付終了</Badge>
              ) : (
                <>
                  {!isConfirmed && deadlineState === "soon" ? (
                    <Badge tone="warn" dot>
                      期限が近い
                    </Badge>
                  ) : null}
                  <Badge tone={isConfirmed ? "done" : "info"} dot>
                    {planStatus}
                  </Badge>
                </>
              )}
              <span className="text-caption text-muted">リマインド: {reminderOffsetLabel(reminderOffsetMinutes)}</span>
            </div>
          </div>
        </div>
      </Card>

      <section className="grid items-start gap-5 lg:grid-cols-[1.45fr_0.9fr]">
        <Card>
          <SectionHeading
            title="候補ランキング"
            description="○が多く、×と未回答が少ない候補を上に並べています。"
            action={!isConfirmed ? <SecondaryLink href={`/plans/${plan.id}/edit`}>候補を編集</SecondaryLink> : undefined}
          />

          <div className="mt-5 grid gap-3">
            {candidateSummaries.length > 0 ? (
              candidateSummaries.map((candidate) => <CandidateCard key={candidate.id} candidate={candidate} />)
            ) : (
              <EmptyState>候補日時がまだありません。</EmptyState>
            )}
          </div>
        </Card>

        <div className="grid gap-5">
          {/* この画面で最も取られるアクションはリンクを配ること。確定後は役目を終えるので通常カードに戻す */}
          <Card className={isConfirmed ? undefined : "border-line-strong bg-gradient-to-b from-mist to-surface shadow-soft"}>
            {isConfirmed ? (
              <SectionHeading title="共有リンク" description="このリンクから回答内容を確認できます。" />
            ) : (
              <div>
                <p className="text-eyebrow uppercase text-pine">いま一番効くこと</p>
                <h2 className="mt-1 text-title text-ink">リンクを配る</h2>
                <p className="mt-1 text-caption text-muted">未ログインの人もそのまま回答できます。</p>
              </div>
            )}
            <div className="mt-4">
              <ShareLinkCard shareUrl={shareUrl} revokeAction={revokeShareLink} reissueAction={reissueShareLink} />
            </div>
          </Card>

          <Card>
            <SectionHeading
              title={pendingNames.length > 0 ? `未回答 ${pendingNames.length}人` : "未回答者"}
              description={pendingNames.length > 0 ? "まだ回答していない人に送る文面をコピーできます。" : undefined}
            />
            <div className="mt-4">
              <ReminderMessageCard
                pendingNames={pendingNames}
                message={reminderMessage}
                shareUrl={shareUrl}
                markSentAction={markReminderSent}
                latestSentAt={reminderLogSummary.latestSentAt}
                sentCount={reminderLogSummary.totalCount}
              />
            </div>
          </Card>

          <Card>
            <SectionHeading title={participants.length > 0 ? `参加者 ${participants.length}人` : "参加者"} />
            <div className="mt-4 grid gap-2">
              {participants.length > 0 ? (
                participants.map((participant) => (
                  <div
                    key={participant.id}
                    className="flex items-center justify-between gap-3 rounded-control border border-line bg-sunken px-3 py-2"
                  >
                    <span className="text-body font-medium text-ink">{participant.display_name}</span>
                    <Badge tone={participantStatusTones[participant.status] ?? "neutral"}>
                      {participantStatusLabels[participant.status] ?? participant.status}
                    </Badge>
                  </div>
                ))
              ) : (
                <EmptyState>共有リンクから回答すると、参加者として追加されます。</EmptyState>
              )}
            </div>
          </Card>
        </div>
      </section>

      <Card>
        <SectionHeading title="日程調整メモ" />
        <p className="mt-3 whitespace-pre-wrap text-body text-muted">{plan.memo?.trim() ? plan.memo : "メモはまだありません。"}</p>
        <div className="mt-5 flex flex-wrap gap-3">
          {event?.id ? <SecondaryLink href={`/events/${event.id}`}>イベント詳細へ</SecondaryLink> : null}
          <SecondaryLink href="/plans">日程調整カレンダーへ</SecondaryLink>
        </div>
      </Card>
    </div>
  );
}

function MetaCell({ label, value, tone }: { label: string; value: ReactNode; tone?: "warn" | "muted" }) {
  return (
    <div className="flex flex-col gap-1 bg-sunken px-3 py-2.5">
      <span className="text-eyebrow uppercase text-muted">{label}</span>
      <span
        className={clsx(
          "text-body font-bold tabular-nums",
          tone === "warn" && "text-clay-ink",
          tone === "muted" && "text-muted",
          !tone && "text-ink"
        )}
      >
        {value}
      </span>
    </div>
  );
}

function CandidateCard({ candidate }: { candidate: CandidateAnswerSummary }) {
  return (
    <article
      className={clsx(
        "rounded-control border p-4",
        // 1位だけ面を持ち上げる。全部同じ見た目だとランキングの意味が消える
        candidate.recommended ? "border-moss bg-surface shadow-raise" : "border-line bg-sunken"
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-ink px-2 text-caption font-bold tabular-nums text-white">
              {candidate.rank}
            </span>
            {candidate.recommended ? (
              <Badge tone="done" dot>
                おすすめ
              </Badge>
            ) : null}
            {candidate.hasPendingAnswers ? <Badge tone="warn">未回答あり</Badge> : null}
            <span className="text-caption tabular-nums text-muted">スコア {candidate.score}</span>
          </div>
          <h3 className="mt-3 text-title tabular-nums text-ink">
            {formatDateTimeRange(candidate.start_at, candidate.end_at, Boolean(candidate.is_all_day))}
          </h3>
          <p className="mt-1 text-caption tabular-nums text-muted">
            回答済み {candidate.answered}/{candidate.totalParticipants}人
          </p>
        </div>
        <div className="grid grid-cols-4 gap-2">
          <AnswerCount label="○" value={candidate.yes} tone="yes" />
          <AnswerCount label="△" value={candidate.maybe} tone="maybe" />
          <AnswerCount label="×" value={candidate.no} tone="no" />
          <AnswerCount label="未" value={candidate.unanswered} tone="pending" />
        </div>
      </div>
      {candidate.totalParticipants > 0 ? (
        <div className="mt-4">
          <Progress value={candidate.answered} max={candidate.totalParticipants} label="回答率" />
        </div>
      ) : null}
      {!candidate.recommended && candidate.hasPendingAnswers ? (
        <p className="mt-3 text-caption text-muted">未回答者がいるため、必要なら回答を待ってから確定してください。</p>
      ) : null}
    </article>
  );
}

const answerCountTones = {
  yes: "border-moss/40 bg-mist text-pine",
  maybe: "border-line bg-surface text-muted",
  no: "border-clay/35 bg-clay/10 text-clay-ink",
  pending: "border-line bg-surface text-muted"
} as const;

function AnswerCount({ label, value, tone }: { label: string; value: number; tone: keyof typeof answerCountTones }) {
  return (
    <div className={clsx("min-w-12 rounded-control border px-2 py-2 text-center", answerCountTones[tone])} aria-label={`${label} ${value}`}>
      <p className="text-caption font-bold">{label}</p>
      <p className="mt-0.5 text-body font-bold tabular-nums">{value}</p>
    </div>
  );
}

import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { ReminderMessageCard } from "@/components/reminder-message-card";
import { SettlementStatusBadge } from "@/components/settlement-status-badge";
import { ShareLinkCard } from "@/components/share-link-card";
import { ButtonLink, Card, EmptyState, PageHeader, SecondaryLink } from "@/components/ui";
import { markReminderSentAction } from "@/lib/actions/reminders";
import { planStatusLabels } from "@/lib/constants";
import {
  summarizeCandidateAnswers,
  summarizeParticipantProgress,
  type CandidateAnswerSummary
} from "@/lib/domain/confirmation";
import { summarizeReminderLogs } from "@/lib/domain/reminder-log";
import { buildReminderMessage, pendingParticipants } from "@/lib/domain/reminder-message";
import { getSettlementStatusView } from "@/lib/domain/settlement";
import { formatDateTime, formatDateTimeRange } from "@/lib/format";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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

function calendarNotice(status: string | undefined) {
  if (status === "added") {
    return {
      title: "Google Calendarに登録しました",
      body: "確定した日程を、連携中のGoogle Calendarへ予定として追加しました。"
    };
  }

  if (status === "failed") {
    return {
      title: "Google Calendarには登録できませんでした",
      body: "Madoi側の日程確定は完了しています。Google Calendar連携を確認して、必要なら手動で予定を追加してください。"
    };
  }

  return null;
}

export default async function PlanDetailPage({
  params,
  searchParams
}: {
  params: Promise<{ planId: string }>;
  searchParams?: Promise<{ calendar?: string }>;
}) {
  const { planId } = await params;
  const query = searchParams ? await searchParams : {};
  const supabase = await createSupabaseServerClient();
  const { data: plan } = await supabase
    .from("plans")
    .select(
      "*, events(id, title), participants(id, display_name, status), candidate_dates(id, start_at, end_at, is_all_day, availability_answers(answer)), share_links(token, expires_at), plan_reminder_settings(reminder_offset_minutes), plan_reminder_logs(sent_at)"
    )
    .eq("id", planId)
    .single();

  if (!plan) {
    notFound();
  }

  const requestHeaders = await headers();
  const host = requestHeaders.get("host") ?? "localhost:3000";
  const protocol = host.includes("localhost") ? "http" : "https";
  const shareToken = plan.share_links?.[0]?.token;
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
  const reminderMessage = buildReminderMessage({
    eventTitle: event?.title,
    planTitle: plan.title,
    pendingNames,
    answerDeadlineAt: plan.answer_deadline_at,
    reminderOffsetMinutes,
    shareUrl
  });
  const reminderLogSummary = summarizeReminderLogs((plan.plan_reminder_logs ?? []) as ReminderLogRow[]);
  const markReminderSent = markReminderSentAction.bind(null, plan.id);
  const candidateSummaries = summarizeCandidateAnswers(
    ((plan.candidate_dates ?? []) as CandidateDateRow[]).sort((a, b) => a.start_at.localeCompare(b.start_at)),
    participantProgress.total
  );
  const recommendedCandidate = candidateSummaries[0];
  const planStatus = planStatusLabels[plan.status as keyof typeof planStatusLabels] ?? String(plan.status);
  const settlementStatus = getSettlementStatusView(plan.settlement_status);
  const isConfirmed = plan.status === "date_confirmed";
  const notice = calendarNotice(query.calendar);

  return (
    <div className="space-y-6">
      <PageHeader
        title={plan.title ?? "日程調整"}
        description={event?.title ? `${event.title} の日程を調整しています。` : "候補日時と回答状況を確認します。"}
        action={
          <div className="flex flex-wrap gap-3">
            {!isConfirmed && candidateSummaries.length > 0 ? <ButtonLink href={`/plans/${plan.id}/confirm`}>日程を確定</ButtonLink> : null}
            {isConfirmed ? <SecondaryLink href={`/plans/${plan.id}/settlement`}>支払い・清算へ</SecondaryLink> : null}
          </div>
        }
      />

      {notice ? (
        <div className="rounded-lg border border-moss/20 bg-mist/32 p-4">
          <p className="font-bold text-ink">{notice.title}</p>
          <p className="mt-1 text-sm leading-6 text-ink/66">{notice.body}</p>
        </div>
      ) : null}

      <section className="grid gap-3 md:grid-cols-5">
        <SummaryTile label="回答状況" value={`${participantProgress.responded}/${participantProgress.total}人`} detail={`未回答 ${participantProgress.pending}人`} />
        <SummaryTile
          label="候補日時"
          value={`${candidateSummaries.length}件`}
          detail={recommendedCandidate ? `おすすめ: ${formatDateTimeRange(recommendedCandidate.start_at, recommendedCandidate.end_at, Boolean(recommendedCandidate.is_all_day))}` : "候補を追加できます"}
        />
        <SummaryTile label="回答期限" value={formatDateTime(plan.answer_deadline_at)} detail={`${planStatus} / リマインド: ${reminderOffsetLabel(reminderOffsetMinutes)}`} />
        <SummaryTile label="確定日時" value={formatDateTimeRange(plan.confirmed_start_at, plan.confirmed_end_at, Boolean(plan.is_all_day))} detail={isConfirmed ? "確定済み" : "未確定"} />
        <Card className="p-4">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-moss">清算</p>
          <div className="mt-2">
            <SettlementStatusBadge label={settlementStatus.label} tone={settlementStatus.tone} />
          </div>
          <p className="mt-2 text-xs leading-5 text-ink/58">{isConfirmed ? settlementStatus.detail : "日程確定後に使います"}</p>
        </Card>
      </section>

      <section className="grid gap-5 lg:grid-cols-[1.45fr_0.9fr]">
        <Card>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-ink">候補ランキング</h2>
              <p className="mt-1 text-sm leading-6 text-ink/60">○が多く、×と未回答が少ない候補を上に並べています。</p>
            </div>
            {!isConfirmed ? <SecondaryLink href={`/plans/${plan.id}/edit`}>候補を編集</SecondaryLink> : null}
          </div>

          <div className="mt-5 grid gap-3">
            {candidateSummaries.length > 0 ? (
              candidateSummaries.map((candidate) => <CandidateCard key={candidate.id} candidate={candidate} />)
            ) : (
              <EmptyState>候補日時がまだありません。</EmptyState>
            )}
          </div>
        </Card>

        <div className="grid gap-5">
          <Card>
            <h2 className="text-lg font-semibold text-ink">共有リンク</h2>
            <p className="mt-1 text-sm leading-6 text-ink/60">このリンクを送ると、未ログインの人も回答できます。</p>
            <div className="mt-4">
              <ShareLinkCard shareUrl={shareUrl} />
            </div>
          </Card>

          <Card>
            <h2 className="text-lg font-semibold text-ink">未回答者</h2>
            <p className="mt-1 text-sm leading-6 text-ink/60">まだ回答していない人に送る文面をコピーできます。</p>
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
            <h2 className="text-lg font-semibold text-ink">参加者</h2>
            <div className="mt-4 grid gap-2">
              {participants.length > 0 ? (
                participants.map((participant) => (
                  <div key={participant.id} className="flex items-center justify-between rounded-lg border border-ink/8 bg-white/58 px-3 py-2 text-sm">
                    <span className="font-medium text-ink">{participant.display_name}</span>
                    <span className="rounded-full bg-mist/45 px-3 py-1 text-xs font-bold text-pine">
                      {participantStatusLabels[participant.status] ?? participant.status}
                    </span>
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
        <h2 className="text-lg font-semibold text-ink">調整メモ</h2>
        <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-ink/70">{plan.memo?.trim() ? plan.memo : "メモはまだありません。"}</p>
        <div className="mt-5 flex flex-wrap gap-3">
          {event?.id ? <SecondaryLink href={`/events/${event.id}`}>予定詳細へ</SecondaryLink> : null}
          <SecondaryLink href="/plans">調整カレンダーへ</SecondaryLink>
        </div>
      </Card>
    </div>
  );
}

function SummaryTile({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-moss">{label}</p>
      <p className="mt-2 text-xl font-bold text-ink">{value}</p>
      <p className="mt-1 text-xs leading-5 text-ink/58">{detail}</p>
    </Card>
  );
}

function CandidateCard({ candidate }: { candidate: CandidateAnswerSummary }) {
  const answeredPercent = candidate.totalParticipants > 0 ? Math.round((candidate.answered / candidate.totalParticipants) * 100) : 0;

  return (
    <article className="rounded-lg border border-white/75 bg-white/62 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-ink px-3 py-1 text-xs font-bold text-white">{candidate.rank}位</span>
            {candidate.recommended ? <span className="rounded-full bg-honey/28 px-3 py-1 text-xs font-bold text-ink">おすすめ</span> : null}
            {candidate.hasPendingAnswers ? <span className="rounded-full bg-clay/12 px-3 py-1 text-xs font-bold text-clay">未回答あり</span> : null}
            <span className="rounded-full bg-mist/42 px-3 py-1 text-xs font-bold text-pine">スコア {candidate.score}</span>
          </div>
          <h3 className="mt-3 font-semibold text-ink">{formatDateTimeRange(candidate.start_at, candidate.end_at, Boolean(candidate.is_all_day))}</h3>
          <p className="mt-2 text-sm text-ink/60">
            回答済み {candidate.answered}/{candidate.totalParticipants}人
          </p>
        </div>
        <div className="grid grid-cols-4 gap-2 text-center text-xs font-bold">
          <AnswerCount label="○" value={candidate.yes} tone="text-pine" />
          <AnswerCount label="△" value={candidate.maybe} tone="text-moss" />
          <AnswerCount label="×" value={candidate.no} tone="text-clay" />
          <AnswerCount label="未" value={candidate.unanswered} tone="text-ink/55" />
        </div>
      </div>
      <div
        className="mt-4 h-2 overflow-hidden rounded-full bg-ink/8"
        aria-label={`回答率 ${answeredPercent}%`}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={candidate.totalParticipants}
        aria-valuenow={candidate.answered}
      >
        <div className="h-full rounded-full bg-moss" style={{ width: `${answeredPercent}%` }} />
      </div>
      {!candidate.recommended && candidate.hasPendingAnswers ? (
        <p className="mt-3 text-xs leading-5 text-ink/55">未回答者がいるため、必要なら回答を待ってから確定してください。</p>
      ) : null}
    </article>
  );
}

function AnswerCount({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="min-w-12 rounded-lg border border-ink/8 bg-cream/70 px-2 py-2" aria-label={`${label} ${value}`}>
      <p className={tone}>{label}</p>
      <p className="mt-1 text-ink">{value}</p>
    </div>
  );
}

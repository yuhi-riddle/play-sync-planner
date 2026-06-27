import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { ShareLinkCard } from "@/components/share-link-card";
import { ButtonLink, Card, EmptyState, PageHeader, SecondaryLink } from "@/components/ui";
import { planStatusLabels } from "@/lib/constants";
import { formatDateTime, formatDateTimeRange } from "@/lib/format";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type AnswerRow = {
  answer: "yes" | "maybe" | "no" | "unanswered";
  participants: { display_name: string } | { display_name: string }[] | null;
};

type CandidateDateRow = {
  id: string;
  start_at: string;
  end_at: string | null;
  availability_answers: AnswerRow[];
};

type ParticipantRow = {
  id: string;
  display_name: string;
  status: string;
};

function countAnswers(answers: AnswerRow[]) {
  return answers.reduce(
    (counts, answer) => {
      counts[answer.answer] += 1;
      return counts;
    },
    { yes: 0, maybe: 0, no: 0, unanswered: 0 }
  );
}

export default async function PlanDetailPage({ params }: { params: Promise<{ planId: string }> }) {
  const { planId } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: plan } = await supabase
    .from("plans")
    .select("*, events(id, title), participants(id, display_name, status), candidate_dates(id, start_at, end_at, availability_answers(answer, participants(display_name))), share_links(token)")
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

  return (
    <div className="space-y-6">
      <PageHeader
        title={plan.title ?? "参加予定"}
        description={event?.title ?? "予定未設定"}
        action={plan.status === "date_confirmed" ? undefined : <ButtonLink href={`/plans/${plan.id}/confirm`}>日程確定</ButtonLink>}
      />

      <Card>
        <dl className="grid gap-3 sm:grid-cols-2">
          <Info label="ステータス" value={planStatusLabels[plan.status as keyof typeof planStatusLabels]} />
          <Info label="回答期限" value={formatDateTime(plan.answer_deadline_at)} />
          <Info label="確定日時" value={formatDateTime(plan.confirmed_start_at)} />
          <Info label="メモ" value={plan.memo ?? "未設定"} />
        </dl>
        <div className="mt-5 flex flex-wrap gap-3">
          <SecondaryLink href={`/plans/${plan.id}/edit`}>調整内容を編集</SecondaryLink>
          {event?.id ? <SecondaryLink href={`/events/${event.id}`}>予定管理へ</SecondaryLink> : null}
        </div>
      </Card>

      <Card>
        <h2 className="text-lg font-semibold text-ink">共有リンク</h2>
        <div className="mt-3">
          <ShareLinkCard shareUrl={shareUrl} />
        </div>
      </Card>

      <section className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <h2 className="text-lg font-semibold text-ink">候補日</h2>
          <div className="mt-4 grid gap-3">
            {(plan.candidate_dates as CandidateDateRow[] | undefined)?.length ? (
              ((plan.candidate_dates ?? []) as CandidateDateRow[]).map((candidate) => {
                const counts = countAnswers((candidate.availability_answers ?? []) as AnswerRow[]);
                return (
                  <div key={candidate.id} className="rounded-lg border border-ink/8 bg-white/58 p-3">
                    <p className="font-semibold text-ink">{formatDateTimeRange(candidate.start_at, candidate.end_at)}</p>
                    <p className="mt-2 text-sm text-ink/60">
                      ○ {counts.yes} / △ {counts.maybe} / × {counts.no} / 未回答 {counts.unanswered}
                    </p>
                  </div>
                );
              })
            ) : (
              <EmptyState>候補日はありません。</EmptyState>
            )}
          </div>
        </Card>

        <Card>
          <h2 className="text-lg font-semibold text-ink">参加者</h2>
          <div className="mt-4 grid gap-2">
            {(plan.participants as ParticipantRow[] | undefined)?.length ? (
              ((plan.participants ?? []) as ParticipantRow[]).map((participant) => (
                <div key={participant.id} className="flex items-center justify-between rounded-lg border border-ink/8 bg-white/58 px-3 py-2 text-sm">
                  <span className="font-medium text-ink">{participant.display_name}</span>
                  <span className="text-ink/60">{participant.status}</span>
                </div>
              ))
            ) : (
              <EmptyState>参加者はいません。</EmptyState>
            )}
          </div>
        </Card>
      </section>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white/58 p-4">
      <dt className="text-xs font-bold uppercase tracking-[0.12em] text-ink/48">{label}</dt>
      <dd className="mt-2 break-words text-base font-semibold text-ink">{value}</dd>
    </div>
  );
}

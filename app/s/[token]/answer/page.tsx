import { redirect } from "next/navigation";

import { AnswerForm } from "@/components/plan/answer-form";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { SetupPanel } from "@/components/ui/state-panels";
import { canAnswerPlan } from "@/lib/domain/plan/availability";
import { findAnswerParticipant } from "@/lib/domain/plan/participant-identity";
import { buildPreviousAnswerMap, type PreviousAnswerRow } from "@/lib/domain/plan/previous-answers";
import { createSupabaseServerClient, hasSupabaseEnv } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/*
 * リンクが開けない理由は区別せずに1つの文言へ寄せる。トークンが存在するかどうかを
 * 答えてしまうと、当てずっぽうに叩いて生きているリンクを探せてしまう。
 */
function UnavailablePage() {
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Answer" title="日程回答" />
      <Card>
        <EmptyState>このリンクは開けません。参加者として招待されているか、主催者に確認してください。</EmptyState>
      </Card>
    </div>
  );
}

export default async function PublicAnswerPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!hasSupabaseEnv()) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Answer" title="日程回答" />
        <SetupPanel />
      </div>
    );
  }

  // middlewareでも止めているが、ここが最後の砦。共有リンクは入口でしかない。
  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/login?next=/s/${token}/answer`);
  }

  /*
   * ログイン中の本人としてDBを読む。service role をやめたので、参加者でなければ
   * RLSが1行も返さない。下の findAnswerParticipant と二重の守りになる。
   */
  const { data: link } = await supabase
    .from("share_links")
    .select(
      "token, expires_at, status, plans(id, title, answer_deadline_at, events(title), candidate_dates(id, start_at, end_at, is_all_day))"
    )
    .eq("token", token)
    .eq("purpose", "answer")
    .single();

  if (!link) {
    return <UnavailablePage />;
  }

  const plan = Array.isArray(link.plans) ? link.plans[0] : link.plans;
  const event = Array.isArray(plan.events) ? plan.events[0] : plan.events;
  const candidateDates = plan.candidate_dates ?? [];
  const revoked = link.status === "revoked";
  const answerable = canAnswerPlan(plan.answer_deadline_at, new Date()) && canAnswerPlan(link.expires_at, new Date());

  const { data: participantRows } = await supabase
    .from("participants")
    .select("id, display_name, user_id")
    .eq("plan_id", plan.id);

  const participant = findAnswerParticipant({
    participants: (participantRows ?? []).map((row) => ({
      id: row.id,
      displayName: row.display_name,
      userId: row.user_id
    })),
    userId: user.id
  });

  /*
   * 参加者でなければ候補日時も見せない。トークンが出回っても、
   * いつ集まるのかまでは読み取れないようにする。
   */
  if (!participant) {
    return <UnavailablePage />;
  }

  // 前回の回答。誰かは分かっているので、名前を聞かずに最初から入れておく。
  const { data: previousRows } = await supabase
    .from("availability_answers")
    .select("candidate_date_id, answer, comment")
    .eq("participant_id", participant.id);
  const initialAnswers = buildPreviousAnswerMap((previousRows ?? []) as PreviousAnswerRow[]);

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Answer" title="日程回答" description={`${event?.title ?? "イベント"} / ${plan.title ?? "日程調整"}`} />
      <Card>
        {revoked ? (
          <EmptyState>このリンクは無効化されています。主催者に新しいリンクを確認してください。</EmptyState>
        ) : !answerable ? (
          <EmptyState>回答期限を過ぎているため、回答できません。</EmptyState>
        ) : candidateDates.length > 0 ? (
          <AnswerForm
            token={token}
            candidateDates={candidateDates}
            participantName={participant.displayName}
            initialAnswers={initialAnswers}
          />
        ) : (
          <EmptyState>回答できる候補日時がまだありません。</EmptyState>
        )}
      </Card>
    </div>
  );
}
